/* =====================================================================
   Visits.gs — الزيارات، الاعتماد، GPS، الملاحظات، الخطط والمتابعة
   V8.2.0 · شركة الدريس
   ===================================================================== */

function getDashboard(token){
  const session=requireSession_(token), ss=getDb_();
  const visits=sheetObjects_(ss.getSheetByName(APP.SHEETS.VISITS));
  const issues=sheetObjects_(ss.getSheetByName(APP.SHEETS.ISSUES));
  const today=dateKey_(new Date()), month=today.slice(0,7);
  const mine=visits.filter(function(v){
    if(session.roleId==='SUPERVISOR')return String(v.COMPUTER_NO||'')===session.computerNo;
    return visitAllowed_(session,v);
  });
  const myIssues=issues.filter(function(x){
    if(session.roleId==='SUPERVISOR')return String(x.CREATED_BY||x.OWNER_COMPUTER_NO||'')===session.computerNo;
    return issueAllowed_(session,x);
  });
  return {
    todayVisits:mine.filter(function(v){return dateKeyFromValue_(v.DATE)===today;}).length,
    monthVisits:mine.filter(function(v){return dateKeyFromValue_(v.DATE).slice(0,7)===month;}).length,
    recordedFails:mine.reduce(function(a,v){return a+Number(v.FAIL_COUNT||0);},0),
    pendingApprovals:mine.filter(function(v){return String(v.APPROVAL_STATUS||'')==='PENDING';}).length,
    openIssues:myIssues.filter(function(x){return ['CLOSED','CANCELED'].indexOf(String(x.STATUS||''))===-1;}).length,
    overdueIssues:myIssues.filter(function(x){const d=dateKeyFromValue_(x.DUE_DATE);return d&&d<today&&['CLOSED','CANCELED','AWAITING_VERIFICATION'].indexOf(String(x.STATUS||''))===-1;}).length,
    recentVisits:mine.sort(function(a,b){return sortKeyFromValue_(b.COMPLETED_AT).localeCompare(sortKeyFromValue_(a.COMPLETED_AT));}).slice(0,12).map(function(v){return visitListObjectForSession_(v,session);})
  };
}

function searchStations(token, query){
  const session=requireSession_(token);requirePermission_(session,'STATION_VIEW');
  query=normalizeText_(query).toLowerCase();
  const rows=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.STATIONS)); const out=[];
  for(let i=0;i<rows.length;i++){
    if(!toBool_(rows[i].ACTIVE))continue;
    const s=stationObject_(rows[i]); if(!stationAllowed_(session,s))continue;
    const h=[s.stationNo,s.stationName,s.region,s.branch,s.city].join(' ').toLowerCase();
    if(query&&h.indexOf(query)===-1)continue; out.push(s); if(out.length>=80)break;
  }
  return out;
}

function getStation(token, stationNo){
  const session=requireSession_(token);requirePermission_(session,'STATION_VIEW');
  const s=findStation_(stationNo); if(!s||!s.active)throw new Error('المحطة غير موجودة أو غير فعالة.');
  if(!stationAllowed_(session,s))throw new Error('المحطة خارج نطاقك.'); return s;
}

function addManualStation(token,payload){
  // V8.1.4.7: إضافة محطة تغيّر بيانات مرجعية للنظام كله، لذلك تتطلب صلاحية إدارة المحطات لا صلاحية تنفيذ زيارة.
  const session=requireSession_(token);requirePermission_(session,'STATION_MANAGE'); payload=payload||{};
  if(session.roleId==='SUPERVISOR')throw new Error('لا يمكن للمشرف إضافة محطة يدويًا. تظهر لك فقط المحطات المعتمدة والمخصصة لك.');
  const no=limitText_(normalizeText_(payload.stationNo),40), name=limitText_(normalizeText_(payload.stationName),120); if(!no||!name)throw new Error('رقم المحطة واسمها مطلوبان.');
  let existing=findStation_(no); if(existing)return existing;
  const sh=getDb_().getSheetByName(APP.SHEETS.STATIONS);
  appendObject_(sh,{STATION_NO:no,STATION_NAME:name,REGION:limitText_(normalizeText_(payload.region),80),BRANCH:limitText_(normalizeText_(payload.branch),80),CITY:limitText_(normalizeText_(payload.city),80),GOOGLE_MAPS:limitText_(normalizeText_(payload.googleMaps),500),STATUS:'تعمل',SOURCE:'MANUAL',ACTIVE:true,CREATED_AT:new Date(),CREATED_BY:session.computerNo});
  memoClear_('stations'); return findStation_(no);
}

function getChecklist(token,visitType){
  const session=requireSession_(token);requirePermission_(session,'VISIT_CREATE'); visitType=normalizeText_(visitType).toUpperCase();
  if(!APP.VISIT_TYPES[visitType])throw new Error('نوع الزيارة غير صحيح.');
  return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.CHECKLIST)).filter(function(r){return String(r.VISIT_TYPE||'')===visitType&&toBool_(r.ACTIVE);}).map(function(r){return{
    itemId:String(r.ITEM_ID||''),category:String(r.CATEGORY||''),text:String(r.ITEM_TEXT||''),sortOrder:Number(r.SORT_ORDER||0),required:toBool_(r.REQUIRED),photoOnFail:toBool_(r.PHOTO_ON_FAIL),severity:String(r.SEVERITY||'MEDIUM'),remediationDays:Number(r.REMEDIATION_DAYS||7)
  };}).sort(function(a,b){return a.sortOrder-b.sortOrder;});
}

function saveVisit(token,payload){
  const session=requireSession_(token);requirePermission_(session,'VISIT_CREATE'); payload=payload||{};
  const station=getStation(token,payload.stationNo), visitType=normalizeText_(payload.visitType).toUpperCase();
  if(!APP.VISIT_TYPES[visitType])throw new Error('نوع الزيارة غير صحيح.');
  // V8.1: تحقق سيرفري من أولوية الزيارات — لا يمكن تجاوز القفل من الواجهة.
  assertVisitTypeAllowed_(session,station.stationNo,visitType);
  const lat=Number(payload.gpsLat),lng=Number(payload.gpsLng),accuracy=Number(payload.gpsAccuracy||0);
  if(!isFinite(lat)||!isFinite(lng)||!lat||!lng)throw new Error('الموقع GPS إلزامي قبل حفظ الزيارة. فعّل الموقع وأعد المحاولة.');
  const th=gpsThresholds_(), maxAccuracy=th.maxAccuracy, matchM=th.match, reviewM=th.review;
  let distance='',gpsStatus='NO_STATION_COORDINATES';
  if(station.lat!==''&&station.lng!==''){
    distance=Math.round(gpsDistance_(lat,lng,Number(station.lat),Number(station.lng)));
    if(accuracy&&accuracy>maxAccuracy)gpsStatus='LOW_ACCURACY';
    else if(distance<=matchM)gpsStatus='MATCH';
    else if(distance<=reviewM)gpsStatus='REVIEW';
    else gpsStatus='MISMATCH';
  }
  const gpsReason=limitText_(normalizeText_(payload.gpsOverrideReason),500);
  // V8.1.4.6: المشرف لا يُطلب منه تبرير حالة GPS. الموقع إلزامي ويُراجع إدارياً بعد الإرسال.
  if((gpsStatus==='MISMATCH'||gpsStatus==='LOW_ACCURACY')&&!gpsReason&&session.roleId!=='SUPERVISOR'){
    throw new Error('موقع الزيارة يحتاج مراجعة. اكتب سبب المتابعة قبل الحفظ.');
  }

  const checklist=getChecklist(token,visitType), byId={}; checklist.forEach(function(x){byId[x.itemId]=x;});
  const results=Array.isArray(payload.results)?payload.results:[]; const seen={}, details=[], issueDrafts=[]; let pass=0,fail=0;
  results.forEach(function(r){
    const item=byId[String(r.itemId||'')]; if(!item)return; const result=String(r.result||'').toUpperCase(); if(['PASS','FAIL'].indexOf(result)===-1)return;
    // V8.1.4.7: أي تكرار لنفس البند من الواجهة يُتجاهل حتى لا تتضاعف النتيجة أو تتولّد ملاحظة مكررة.
    if(seen[item.itemId])return;
    const note=limitText_(normalizeText_(r.note),2000); if(result==='FAIL'&&!note)throw new Error('الملاحظة إلزامية للبند غير المطابق: '+item.text);
    seen[item.itemId]=true; if(result==='PASS')pass++;else fail++;
    details.push({ITEM_ID:item.itemId,CATEGORY:item.category,ITEM_TEXT:item.text,RESULT:result,NOTE:note,PHOTO_URL:'',CREATED_AT:new Date(),SEVERITY:item.severity});
    if(result==='FAIL')issueDrafts.push({item:item,note:note});
  });
  checklist.forEach(function(i){if(i.required&&!seen[i.itemId])throw new Error('أكمل جميع بنود قائمة التحقق.');});
  const total=pass+fail, score=total?round1_(pass/total*100):0, now=new Date(), visitId=makeVisitId_(session.computerNo), visitDate=dateKey_(now);
  const approver=resolveApproverForSupervisor_(session.computerNo,station), sla=Number(settingValue_('APPROVAL_SLA_HOURS','48')), approvalDue=dateTimeAddHours_(now,sla);
  const started=asDate_(payload.startedAt)||now, duration=Math.max(0,Math.round((now-started)/60000));
  // V8.1.4.7: كل كتابات الزيارة (الزيارة + البنود + الملاحظات + الخطط) داخل قفل واحد،
  // حتى لا تتداخل زيارتان متزامنتان وتكتبا على نفس الصف.
  withDbLock_(function(){
  const vsh=getDb_().getSheetByName(APP.SHEETS.VISITS);
  appendObject_(vsh,{VISIT_ID:visitId,DATE:visitDate,STARTED_AT:started,COMPLETED_AT:now,SUBMITTED_AT:now,COMPUTER_NO:session.computerNo,SUPERVISOR_NAME:session.name,STATION_NO:station.stationNo,STATION_NAME:station.stationName,VISIT_TYPE:visitType,SCORE:score,PASS_COUNT:pass,FAIL_COUNT:fail,NOTES_COUNT:fail,GPS_LAT:lat,GPS_LNG:lng,GPS_ACCURACY_M:accuracy||'',GPS_DISTANCE_M:distance,GPS_MATCH_STATUS:gpsStatus,GPS_OVERRIDE_REASON:gpsReason,MANUAL_STATION:station.manual,STATUS:'SUBMITTED',REGION:station.region,CITY:station.city,BRANCH:station.branch,DURATION_MINUTES:duration,APPROVAL_STATUS:'PENDING',APPROVER_COMPUTER_NO:approver,APPROVAL_DUE_AT:approvalDue,WORKFLOW_STATUS:'PENDING_APPROVAL'});
  const dsh=getDb_().getSheetByName(APP.SHEETS.DETAILS); details.forEach(function(d){d.VISIT_ID=visitId;}); appendObjects_(dsh,details);
  const ish=getDb_().getSheetByName(APP.SHEETS.ISSUES), issueRows=[];
  issueDrafts.forEach(function(x){issueRows.push({ISSUE_ID:makeIssueId_(station.stationNo),VISIT_ID:visitId,ITEM_ID:x.item.itemId,CATEGORY:x.item.category,ITEM_TEXT:x.item.text,STATION_NO:station.stationNo,STATION_NAME:station.stationName,REGION:station.region,CITY:station.city,BRANCH:station.branch,CREATED_AT:now,CREATED_BY:session.computerNo,STATUS:'PENDING_APPROVAL',SEVERITY:x.item.severity,NOTE:x.note,PHOTO_URL:'',OWNER_COMPUTER_NO:session.computerNo,DUE_DATE:'',LAST_UPDATED_AT:now,REPEAT_KEY:station.stationNo+'|'+x.item.itemId,DUE_DAYS:Math.max(1,Number(x.item.remediationDays||7)),ESCALATION_LEVEL:0});});
  appendObjects_(ish,issueRows);
  updatePlanAfterVisit_(session.computerNo,station.stationNo,visitType,visitDate,approver);
  // الشهرية تُرحّل الزيارة الأسبوعية فقط إذا كانت مستحقة/متأخرة في نفس الدورة.
  satisfyLowerPriorityPlans_(session.computerNo,station.stationNo,visitType,visitDate,visitId,approver);
  if(typeof markVisitUnlockUsed_==='function')markVisitUnlockUsed_(session.computerNo,station.stationNo,visitType,visitId,visitDate);
  });
  if(approver)notify_(approver,'VISIT_PENDING_APPROVAL','زيارة جديدة بانتظار الاعتماد','المشرف '+session.name+' أرسل زيارة '+APP.VISIT_TYPES[visitType]+' للمحطة '+station.stationName+' #'+station.stationNo+'.',visitId,session.computerNo);
  audit_(session.computerNo,'VISIT_SUBMITTED',visitId,'station='+station.stationNo+' score='+score+' gps='+gpsStatus+' distance='+distance);
  return {ok:true,visitId:visitId,stationName:station.stationName,stationNo:station.stationNo,visitType:visitType,score:score,passCount:pass,failCount:fail,approvalStatus:'PENDING',approverComputerNo:approver,gpsStatus:gpsStatus,gpsDistanceMeters:distance};
}

/* V8.1.4.7: مرفقات الأدلة — يُقبل صورة فقط، بحجم محدود، ومن مستخدم يملك الزيارة أو يعتمدها. */
const EVIDENCE_MAX_BYTES_=6*1024*1024;
const EVIDENCE_MIME_=Object.freeze({'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp'});
function decodeEvidenceImage_(dataUrl){
  const raw=String(dataUrl||'');
  const m=raw.match(/^data:([a-zA-Z0-9.+\/-]+);base64,([\s\S]+)$/);
  if(!m)throw new Error('صيغة الصورة غير صحيحة.');
  const mime=String(m[1]).toLowerCase();
  if(!EVIDENCE_MIME_[mime])throw new Error('يُسمح برفع الصور فقط (JPEG أو PNG أو WEBP).');
  const b64=String(m[2]).replace(/\s+/g,'');
  if(!/^[A-Za-z0-9+\/]+={0,2}$/.test(b64))throw new Error('الصورة غير صحيحة.');
  if(Math.floor(b64.length*3/4)>EVIDENCE_MAX_BYTES_)throw new Error('حجم الصورة كبير جدًا. الحد الأقصى 6 ميجابايت.');
  let bytes;
  try{bytes=Utilities.base64Decode(b64);}catch(e){throw new Error('تعذر قراءة الصورة.');}
  if(!bytes||!bytes.length)throw new Error('الصورة فارغة.');
  return {bytes:bytes,mime:mime,ext:EVIDENCE_MIME_[mime]};
}
function evidenceFileName_(fileName,fallback,ext){
  let name=sanitizeFileName_(normalizeText_(fileName)||fallback);
  name=name.replace(/\.[A-Za-z0-9]{1,5}$/,'');
  return (name||fallback)+'.'+ext;
}
function uploadEvidence(token,visitId,itemId,dataUrl,fileName){
  const session=requireSession_(token);
  visitId=limitText_(normalizeText_(visitId),80); itemId=limitText_(normalizeText_(itemId),80);
  const visit=findVisitObjectById_(visitId); if(!visit)throw new Error('الزيارة غير موجودة.');
  const isOwner=String(visit.COMPUTER_NO||'')===session.computerNo;
  if(isOwner){
    requirePermission_(session,'VISIT_CREATE');
    if(String(visit.APPROVAL_STATUS||'')!=='PENDING')throw new Error('لا يمكن تعديل مرفقات زيارة تم اتخاذ قرار بشأنها.');
  }else{
    // V8.1.4.7: أي مستخدم آخر يحتاج صلاحية اعتماد/إدارة ملاحظات + أن تكون الزيارة ضمن نطاقه.
    requirePermissionAny_(session,['VISIT_APPROVE','ISSUE_MANAGE']);
    if(!visitAllowed_(session,visit)&&!canApproveVisit_(session,visit))throw new Error('الزيارة خارج نطاقك.');
  }
  const img=decodeEvidenceImage_(dataUrl);
  const root=ensureEvidenceFolder_(), vf=getOrCreateChildFolder_(root,sanitizeFileName_(visitId));
  const file=vf.createFile(Utilities.newBlob(img.bytes,img.mime,evidenceFileName_(fileName,itemId||'evidence',img.ext))); const url=file.getUrl();
  const dsh=getDb_().getSheetByName(APP.SHEETS.DETAILS); updateRowsByKeys_(dsh,{VISIT_ID:visitId,ITEM_ID:itemId},{PHOTO_URL:url});
  const ish=getDb_().getSheetByName(APP.SHEETS.ISSUES); updateRowsByKeys_(ish,{VISIT_ID:visitId,ITEM_ID:itemId},{PHOTO_URL:url,LAST_UPDATED_AT:new Date()});
  audit_(session.computerNo,'EVIDENCE_UPLOADED',visitId,'item='+itemId);
  return {ok:true,url:url,fileId:file.getId()};
}

/* V8.2.1 — طابور الاعتماد يعرض كل زيارة معلّقة داخل نطاق المستخدم، لا ما يستطيع اعتماده فقط.
   كان يعرض ما يستطيع اعتماده وحده، فيظهر في لوحة القيادة رقم «بانتظار الاعتماد» ثم تفتح
   الصفحة فتجدها فارغة — أوضح مثال: زيارة نفّذها المستخدم نفسه، فهو لا يعتمد زيارته.
   الآن تظهر الزيارة ومعها سبب تعذّر القرار، فلا يتناقض الرقم مع الصفحة أبدًا. */
function getApprovalQueue(token,filters){
  const session=requireSession_(token);requirePermission_(session,'VISIT_APPROVE');filters=filters||{};
  const names={};
  sheetObjects_(getDb_().getSheetByName(APP.SHEETS.USERS)).forEach(function(u){
    names[String(u.COMPUTER_NO||'')]=String(u.NAME||'');
  });
  const nameOf=function(no){no=String(no||'');return no?(names[no]||no):'';};
  const rows=[];
  sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS)).forEach(function(v){
    if(String(v.APPROVAL_STATUS||'')!=='PENDING')return;
    if(filters.region&&String(v.REGION||'')!==String(filters.region))return;
    const mine=String(v.COMPUTER_NO||'')===session.computerNo;
    const canApprove=canApproveVisit_(session,v);
    let blockReason='';
    if(!canApprove){
      if(mine){
        blockReason='زيارة نفّذتها بنفسك — لا يمكنك اعتماد زيارتك. يعتمدها '+(nameOf(v.APPROVER_COMPUTER_NO)||'مساعد آخر')+'.';
      }else if(visitAllowed_(session,v)){
        const ap=nameOf(v.APPROVER_COMPUTER_NO);
        blockReason=ap?('بانتظار قرار '+ap+'.'):'بانتظار قرار مساعد آخر.';
      }else{
        return; // خارج النطاق تمامًا — لا تُعرض
      }
    }
    const o=visitListObjectForSession_(v,session);
    o.approverComputerNo=String(v.APPROVER_COMPUTER_NO||'');
    o.approverName=nameOf(v.APPROVER_COMPUTER_NO);
    o.approvalDueAt=formatDateTimeSafe_(v.APPROVAL_DUE_AT);
    o.waitHours=Math.max(0,Math.round((new Date()-(asDate_(v.SUBMITTED_AT)||asDate_(v.COMPLETED_AT)||new Date()))/3600000));
    o.gpsStatus=String(v.GPS_MATCH_STATUS||'');
    if(canViewVisitGpsDetails_(session))o.gpsDistanceMeters=v.GPS_DISTANCE_M===''?'':Number(v.GPS_DISTANCE_M);
    o.canApprove=canApprove;
    o.isMine=mine;
    o.blockReason=blockReason;
    rows.push(o);
  });
  // ما يحتاج قرارك أولًا، ثم الأطول انتظارًا
  return rows.sort(function(a,b){
    if(a.canApprove!==b.canApprove)return a.canApprove?-1:1;
    return b.waitHours-a.waitHours;
  }).slice(0,500);
}

function approveVisit(token,visitId,approved,comment){
  const session=requireSession_(token);requirePermission_(session,'VISIT_APPROVE');
  visitId=limitText_(normalizeText_(visitId),80);
  const v=findVisitObjectById_(visitId); if(!v)throw new Error('الزيارة غير موجودة.');
  if(String(v.APPROVAL_STATUS||'')!=='PENDING')throw new Error('تم اتخاذ قرار على هذه الزيارة مسبقًا.');
  if(!canApproveVisit_(session,v))throw new Error('هذه الزيارة ليست ضمن اعتماداتك.'); comment=limitText_(normalizeText_(comment),1000);
  if(!approved&&!comment)throw new Error('سبب الرفض إلزامي.');
  // V8.1.4.7: أي حالة موقع تحتاج مراجعة (غير مطابق أو دقة منخفضة) تُلزم المعتمِد بكتابة تعليق.
  if(approved&&['MISMATCH','LOW_ACCURACY'].indexOf(String(v.GPS_MATCH_STATUS||''))!==-1&&!comment)throw new Error('موقع الزيارة يحتاج مراجعة. اكتب تعليق الاعتماد قبل المتابعة.');
  return withDbLock_(function(){
  // إعادة قراءة الحالة داخل القفل حتى لا يعتمد شخصان نفس الزيارة في وقت واحد.
  invalidateSheet_(APP.SHEETS.VISITS);
  const fresh=findVisitObjectById_(visitId);
  if(!fresh||String(fresh.APPROVAL_STATUS||'')!=='PENDING')throw new Error('تم اتخاذ قرار على هذه الزيارة مسبقًا.');
  const now=new Date(), vsh=getDb_().getSheetByName(APP.SHEETS.VISITS), ish=getDb_().getSheetByName(APP.SHEETS.ISSUES), issues=sheetObjects_(ish).filter(function(x){return String(x.VISIT_ID||'')===visitId;});
  if(approved){
    updateRowsByKeys_(vsh,{VISIT_ID:visitId},{APPROVAL_STATUS:'APPROVED',APPROVED_BY:session.computerNo,APPROVED_AT:now,APPROVAL_COMMENT:comment,WORKFLOW_STATUS:issues.length?'FOLLOW_UP':'CLOSED'});
    issues.forEach(function(x){const days=Math.max(1,Number(x.DUE_DAYS||settingValue_('ISSUE_DEFAULT_REMEDIATION_DAYS','7'))),due=dateAddDaysKey_(dateKey_(now),days);updateRowsByKeys_(ish,{ISSUE_ID:String(x.ISSUE_ID||'')},{STATUS:'OPEN',APPROVED_AT:now,DUE_DATE:due,DUE_DAYS:days,LAST_UPDATED_AT:now});});
    let body='تم اعتماد زيارتك '+visitId+'.'; if(issues.length)body+=' لديك '+issues.length+' ملاحظة تبدأ مهلة معالجتها من تاريخ الاعتماد.';
    notify_(String(v.COMPUTER_NO||''),'VISIT_APPROVED','تم اعتماد الزيارة',body,visitId,session.computerNo);
  }else{
    updateRowsByKeys_(vsh,{VISIT_ID:visitId},{APPROVAL_STATUS:'REJECTED',APPROVED_BY:session.computerNo,APPROVED_AT:now,APPROVAL_COMMENT:comment,WORKFLOW_STATUS:'REJECTED'});
    issues.forEach(function(x){updateRowsByKeys_(ish,{ISSUE_ID:String(x.ISSUE_ID||'')},{STATUS:'CANCELED',LAST_UPDATED_AT:now});});
    notify_(String(v.COMPUTER_NO||''),'VISIT_REJECTED','تم رفض الزيارة','الزيارة '+visitId+' رُفضت. السبب: '+comment,visitId,session.computerNo);
  }
  audit_(session.computerNo,approved?'VISIT_APPROVED':'VISIT_REJECTED',visitId,comment); return {ok:true,status:approved?'APPROVED':'REJECTED'};
  });
}

function getMyVisits(token,limit){
  const session=requireSession_(token); limit=Math.max(1,Math.min(100,Number(limit||30)));
  return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS)).filter(function(v){return String(v.COMPUTER_NO||'')===session.computerNo;}).sort(function(a,b){return sortKeyFromValue_(b.COMPLETED_AT).localeCompare(sortKeyFromValue_(a.COMPLETED_AT));}).slice(0,limit).map(function(v){return visitListObjectForSession_(v,session);});
}

function adminListVisits(token,filters){
  const session=requireSession_(token); filters=filters||{};
  if(session.roleId==='SUPERVISOR')return getMyVisits(token,100);
  requirePermissionAny_(session,['VISIT_VIEW_ALL','VISIT_VIEW_SCOPE','VISIT_APPROVE']);
  return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS)).filter(function(v){
    if(!visitAllowed_(session,v)&&!canApproveVisit_(session,v))return false;
    const d=dateKeyFromValue_(v.DATE); if(filters.startDate&&d<filters.startDate)return false;if(filters.endDate&&d>filters.endDate)return false;
    if(filters.supervisor&&String(v.COMPUTER_NO||'')!==String(filters.supervisor))return false;if(filters.stationNo&&String(v.STATION_NO||'')!==String(filters.stationNo))return false;if(filters.approvalStatus&&String(v.APPROVAL_STATUS||'')!==String(filters.approvalStatus))return false;return true;
  }).sort(function(a,b){return sortKeyFromValue_(b.COMPLETED_AT).localeCompare(sortKeyFromValue_(a.COMPLETED_AT));}).slice(0,500).map(function(v){return visitListObjectForSession_(v,session);});
}

function canViewVisitGpsDetails_(session){
  return !!session && (session.roleId==='SYSTEM_ADMIN' || session.roleId==='OPERATIONS_MANAGER');
}
function visitListObjectForSession_(v,session){
  const o=visitListObject_(v);
  if(!canViewVisitGpsDetails_(session)){
    o.gpsDistanceMeters='';o.gpsAccuracy='';o.gpsLat='';o.gpsLng='';
  }
  return o;
}

function visitGpsSnapshot_(v){
  const lat=(v.GPS_LAT===''||v.GPS_LAT==null)?'':Number(v.GPS_LAT), lng=(v.GPS_LNG===''||v.GPS_LNG==null)?'':Number(v.GPS_LNG);
  const accuracy=(v.GPS_ACCURACY_M===''||v.GPS_ACCURACY_M==null)?'':Number(v.GPS_ACCURACY_M);
  let distance=(v.GPS_DISTANCE_M===''||v.GPS_DISTANCE_M==null)?'':Number(v.GPS_DISTANCE_M);
  let status=String(v.GPS_MATCH_STATUS||'');
  const station=findStation_(String(v.STATION_NO||''));
  if(lat===''||lng===''||!isFinite(lat)||!isFinite(lng)){
    return {lat:'',lng:'',accuracy:accuracy,distance:'',status:'NOT_RECORDED',stationLat:station&&station.lat!==''?Number(station.lat):'',stationLng:station&&station.lng!==''?Number(station.lng):''};
  }
  if(station&&station.lat!==''&&station.lng!==''){
    if(distance===''||!isFinite(distance))distance=Math.round(gpsDistance_(lat,lng,Number(station.lat),Number(station.lng)));
    if(!status){
      const th=gpsThresholds_(), maxAccuracy=th.maxAccuracy, matchM=th.match, reviewM=th.review;
      if(accuracy!==''&&accuracy>maxAccuracy)status='LOW_ACCURACY';
      else if(distance<=matchM)status='MATCH';
      else if(distance<=reviewM)status='REVIEW';
      else status='MISMATCH';
    }
  }else if(!status){
    status='NO_STATION_COORDINATES';
  }
  return {lat:lat,lng:lng,accuracy:accuracy,distance:distance,status:status||'NOT_RECORDED',stationLat:station&&station.lat!==''?Number(station.lat):'',stationLng:station&&station.lng!==''?Number(station.lng):''};
}

function visitListObject_(v){
  const gps=visitGpsSnapshot_(v);
  return{visitId:String(v.VISIT_ID||''),date:dateKeyFromValue_(v.DATE),computerNo:String(v.COMPUTER_NO||''),supervisor:String(v.SUPERVISOR_NAME||''),stationNo:String(v.STATION_NO||''),stationName:String(v.STATION_NAME||''),region:String(v.REGION||''),branch:String(v.BRANCH||''),visitType:String(v.VISIT_TYPE||''),score:Number(v.SCORE||0),passCount:Number(v.PASS_COUNT||0),failCount:Number(v.FAIL_COUNT||0),durationMinutes:Number(v.DURATION_MINUTES||0),approvalStatus:String(v.APPROVAL_STATUS||'PENDING'),workflowStatus:String(v.WORKFLOW_STATUS||''),gpsStatus:gps.status,gpsDistanceMeters:gps.distance,gpsAccuracy:gps.accuracy,gpsLat:gps.lat,gpsLng:gps.lng};
}

function findVisitObjectById_(visitId){return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS)).filter(function(v){return String(v.VISIT_ID||'')===String(visitId);})[0]||null;}

function getVisitDetail(token,visitId){
  const session=requireSession_(token), v=findVisitObjectById_(visitId); if(!v)throw new Error('الزيارة غير موجودة.');
  if(session.roleId==='SUPERVISOR') { if(String(v.COMPUTER_NO||'')!==session.computerNo)throw new Error('يمكنك مشاهدة زياراتك فقط.'); }
  else if(!visitAllowed_(session,v)&&!canApproveVisit_(session,v))throw new Error('الزيارة خارج نطاقك.');
  const allDetails=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.DETAILS));
  const details=allDetails.filter(function(d){return String(d.VISIT_ID||'')===visitId;});
  const issues=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.ISSUES)).filter(function(x){return String(x.VISIT_ID||'')===visitId;}), im={};issues.forEach(function(x){im[String(x.ITEM_ID||'')]=x;});
  const allVisits=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS));
  const prevCandidates=allVisits.filter(function(x){return String(x.VISIT_ID||'')!==visitId&&String(x.COMPUTER_NO||'')===String(v.COMPUTER_NO||'')&&String(x.STATION_NO||'')===String(v.STATION_NO||'')&&String(x.VISIT_TYPE||'')===String(v.VISIT_TYPE||'')&&sortKeyFromValue_(x.COMPLETED_AT)<sortKeyFromValue_(v.COMPLETED_AT);}).sort(function(a,b){return sortKeyFromValue_(b.COMPLETED_AT).localeCompare(sortKeyFromValue_(a.COMPLETED_AT));});
  let previous=null;if(prevCandidates.length){const pv=prevCandidates[0],pdet=allDetails.filter(function(d){return String(d.VISIT_ID||'')===String(pv.VISIT_ID||'');}),pf={};pdet.filter(function(d){return String(d.RESULT||'')==='FAIL';}).forEach(function(d){pf[String(d.ITEM_ID||'')]=true;});const curFail=details.filter(function(d){return String(d.RESULT||'')==='FAIL';}).map(function(d){return String(d.ITEM_ID||'');});previous={visitId:String(pv.VISIT_ID||''),date:dateKeyFromValue_(pv.DATE),supervisor:String(pv.SUPERVISOR_NAME||''),score:Number(pv.SCORE||0),repeatedFailIds:curFail.filter(function(id){return pf[id];}),newFailCount:curFail.filter(function(id){return !pf[id];}).length,fixedCount:Object.keys(pf).filter(function(id){return curFail.indexOf(id)===-1;}).length};}
  const history=allVisits.filter(function(x){if(String(x.STATION_NO||'')!==String(v.STATION_NO||''))return false;if(session.roleId==='SUPERVISOR'&&String(x.COMPUTER_NO||'')!==session.computerNo)return false;return true;}).sort(function(a,b){return sortKeyFromValue_(b.COMPLETED_AT).localeCompare(sortKeyFromValue_(a.COMPLETED_AT));}).slice(0,10).map(function(x){return visitListObjectForSession_(x,session);});
  const gps=visitGpsSnapshot_(v), canViewGpsDetails=canViewVisitGpsDetails_(session);
  return {visitId:visitId,date:dateKeyFromValue_(v.DATE),startedAt:formatDateTimeSafe_(v.STARTED_AT),completedAt:formatDateTimeSafe_(v.COMPLETED_AT),computerNo:String(v.COMPUTER_NO||''),supervisor:String(v.SUPERVISOR_NAME||''),stationNo:String(v.STATION_NO||''),stationName:String(v.STATION_NAME||''),region:String(v.REGION||''),city:String(v.CITY||''),branch:String(v.BRANCH||''),visitType:String(v.VISIT_TYPE||''),visitTypeLabel:APP.VISIT_TYPES[String(v.VISIT_TYPE||'')]||String(v.VISIT_TYPE||''),score:Number(v.SCORE||0),passCount:Number(v.PASS_COUNT||0),failCount:Number(v.FAIL_COUNT||0),durationMinutes:Number(v.DURATION_MINUTES||0),approvalStatus:String(v.APPROVAL_STATUS||'PENDING'),approvedBy:String(v.APPROVED_BY||''),approvedAt:formatDateTimeSafe_(v.APPROVED_AT),approvalComment:String(v.APPROVAL_COMMENT||''),approverComputerNo:String(v.APPROVER_COMPUTER_NO||''),workflowStatus:String(v.WORKFLOW_STATUS||''),canViewGpsDetails:canViewGpsDetails,gpsLat:canViewGpsDetails?gps.lat:'',gpsLng:canViewGpsDetails?gps.lng:'',gpsAccuracy:canViewGpsDetails?gps.accuracy:'',gpsDistanceMeters:canViewGpsDetails?gps.distance:'',gpsMatchStatus:gps.status,gpsOverrideReason:canViewGpsDetails?String(v.GPS_OVERRIDE_REASON||''):'',stationLat:canViewGpsDetails?gps.stationLat:'',stationLng:canViewGpsDetails?gps.stationLng:'',canApprove:canApproveVisit_(session,v),previous:previous,stationHistory:history,items:details.map(function(d){const x=im[String(d.ITEM_ID||'')]||{};return{itemId:String(d.ITEM_ID||''),category:String(d.CATEGORY||''),text:String(d.ITEM_TEXT||''),result:String(d.RESULT||''),note:String(d.NOTE||''),severity:String(d.SEVERITY||''),photoUrl:String(d.PHOTO_URL||''),photoFileId:driveFileId_(d.PHOTO_URL),issueId:String(x.ISSUE_ID||''),issueStatus:String(x.STATUS||''),issueDue:dateKeyFromValue_(x.DUE_DATE),remediationNote:String(x.REMEDIATION_NOTE||''),remediationPhotoUrl:String(x.REMEDIATION_PHOTO_URL||'')};})};
}

function driveFileId_(url){const s=String(url||'');const m=s.match(/[-\w]{20,}/);return m?m[0]:'';}
/* V8.1.4.7 — ثغرة مغلقة: كانت الدالة تُرجع أي ملف في درايف برقم معرّفه لأي مستخدم مسجّل دخول.
   الآن لا تُقرأ إلا الصور المرتبطة فعلياً ببند زيارة أو ملاحظة يملك المستخدم حق رؤيتها. */
function getEvidenceImage(token,fileId){
  const s=requireSession_(token);
  fileId=limitText_(normalizeText_(fileId),120);
  if(!fileId)throw new Error('الصورة غير موجودة.');
  const ss=getDb_();
  let visitId='',issue=null;
  const det=sheetObjects_(ss.getSheetByName(APP.SHEETS.DETAILS)).filter(function(d){return driveFileId_(d.PHOTO_URL)===fileId;})[0]||null;
  if(det)visitId=String(det.VISIT_ID||'');
  else{
    issue=sheetObjects_(ss.getSheetByName(APP.SHEETS.ISSUES)).filter(function(x){
      return driveFileId_(x.PHOTO_URL)===fileId||driveFileId_(x.REMEDIATION_PHOTO_URL)===fileId;
    })[0]||null;
    if(issue)visitId=String(issue.VISIT_ID||'');
  }
  if(!det&&!issue)throw new Error('الصورة غير موجودة أو غير مرتبطة بزيارة.');
  const v=visitId?findVisitObjectById_(visitId):null;
  if(s.roleId==='SUPERVISOR'){
    const ownVisit=v&&String(v.COMPUTER_NO||'')===s.computerNo;
    const ownIssue=issue&&String(issue.OWNER_COMPUTER_NO||issue.CREATED_BY||'')===s.computerNo;
    if(!ownVisit&&!ownIssue)throw new Error('الصورة خارج صلاحيتك.');
  }else if(v){
    if(!visitAllowed_(s,v)&&!canApproveVisit_(s,v))throw new Error('الصورة خارج نطاقك.');
  }else if(issue){
    if(!issueAllowed_(s,issue))throw new Error('الصورة خارج نطاقك.');
  }
  let f;
  try{f=DriveApp.getFileById(fileId);}catch(e){throw new Error('تعذر فتح الصورة.');}
  const blob=f.getBlob(),type=String(blob.getContentType()||'');
  if(type.indexOf('image/')!==0)throw new Error('الملف المرفق ليس صورة.');
  return{dataUrl:'data:'+type+';base64,'+Utilities.base64Encode(blob.getBytes()),name:f.getName()};
}
function gpsDistance_(lat1,lon1,lat2,lon2){const R=6371000,toRad=function(x){return x*Math.PI/180;};const a=toRad(lat1),b=toRad(lat2),dlat=toRad(lat2-lat1),dlon=toRad(lon2-lon1);const h=Math.sin(dlat/2)**2+Math.cos(a)*Math.cos(b)*Math.sin(dlon/2)**2;return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}

function notify_(computerNo,type,title,body,reference,createdBy){if(!computerNo)return;appendObject_(getDb_().getSheetByName(APP.SHEETS.NOTIFICATIONS),{NOTIFICATION_ID:'NTF-'+Utilities.getUuid(),COMPUTER_NO:String(computerNo),TYPE:String(type||''),TITLE:String(title||''),BODY:String(body||''),REFERENCE:String(reference||''),READ:false,CREATED_AT:new Date(),CREATED_BY:String(createdBy||'SYSTEM')});}
function getMyNotifications(token,includeRead){const s=requireSession_(token);return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.NOTIFICATIONS)).filter(function(n){return String(n.COMPUTER_NO||'')===s.computerNo&&(includeRead||!toBool_(n.READ));}).sort(function(a,b){return sortKeyFromValue_(b.CREATED_AT).localeCompare(sortKeyFromValue_(a.CREATED_AT));}).slice(0,50).map(function(n){return{id:String(n.NOTIFICATION_ID||''),type:String(n.TYPE||''),title:String(n.TITLE||''),body:String(n.BODY||''),reference:String(n.REFERENCE||''),read:toBool_(n.READ),createdAt:formatDateTimeSafe_(n.CREATED_AT)};});}
function markNotificationRead(token,id){const s=requireSession_(token);updateRowsByKeys_(getDb_().getSheetByName(APP.SHEETS.NOTIFICATIONS),{NOTIFICATION_ID:id,COMPUTER_NO:s.computerNo},{READ:true});return{ok:true};}

function getMyIssues(token,filters){const s=requireSession_(token);filters=filters||{};return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.ISSUES)).filter(function(x){const own=String(x.OWNER_COMPUTER_NO||x.CREATED_BY||'')===s.computerNo;if(!own){
  // V8.1.4.7: صلاحية إدارة الملاحظات لا تعني تجاوز النطاق — لا تظهر إلا ملاحظات داخل نطاق المستخدم.
  if(!hasPermission_(s,'ISSUE_MANAGE'))return false;
  if(!issueAllowed_(s,x))return false;
}if(filters.status&&String(x.STATUS||'')!==filters.status)return false;return true;}).sort(function(a,b){return String(a.DUE_DATE||'').localeCompare(String(b.DUE_DATE||''));}).map(issueObject_);}
function issueObject_(x){const due=dateKeyFromValue_(x.DUE_DATE),today=dateKey_(new Date());return{issueId:String(x.ISSUE_ID||''),visitId:String(x.VISIT_ID||''),itemId:String(x.ITEM_ID||''),category:String(x.CATEGORY||''),itemText:String(x.ITEM_TEXT||''),stationNo:String(x.STATION_NO||''),stationName:String(x.STATION_NAME||''),region:String(x.REGION||''),createdAt:formatDateTimeSafe_(x.CREATED_AT),createdBy:String(x.CREATED_BY||''),ownerComputerNo:String(x.OWNER_COMPUTER_NO||''),status:String(x.STATUS||''),severity:String(x.SEVERITY||''),note:String(x.NOTE||''),photoUrl:String(x.PHOTO_URL||''),dueDate:due,ageDays:ageDays_(x.CREATED_AT),overdue:!!due&&due<today&&['CLOSED','CANCELED','AWAITING_VERIFICATION'].indexOf(String(x.STATUS||''))===-1,remediationSubmittedAt:formatDateTimeSafe_(x.REMEDIATION_SUBMITTED_AT),remediationNote:String(x.REMEDIATION_NOTE||''),remediationPhotoUrl:String(x.REMEDIATION_PHOTO_URL||''),returnReason:String(x.RETURN_REASON||'')};}

function getIssueContext(token,issueId){
  const s=requireSession_(token),ss=getDb_();
  const x=sheetObjects_(ss.getSheetByName(APP.SHEETS.ISSUES)).filter(function(r){return String(r.ISSUE_ID||'')===String(issueId);})[0];
  if(!x)throw new Error('الملاحظة غير موجودة.');
  const own=String(x.OWNER_COMPUTER_NO||x.CREATED_BY||'')===s.computerNo;
  if(s.roleId==='SUPERVISOR'){
    if(!own)throw new Error('هذه الملاحظة ليست ضمن مسؤوليتك.');
  }else{
    requirePermissionAny_(s,['ISSUE_VIEW_ALL','ISSUE_VIEW_SCOPE','ISSUE_MANAGE','ISSUE_CLOSE','VISIT_APPROVE']);
    if(!issueAllowed_(s,x))throw new Error('الملاحظة خارج نطاقك.');
  }
  const v=findVisitObjectById_(String(x.VISIT_ID||'')), station=findStation_(String(x.STATION_NO||''))||{};
  const all=sheetObjects_(ss.getSheetByName(APP.SHEETS.VISITS)).filter(function(r){
    if(String(r.STATION_NO||'')!==String(x.STATION_NO||''))return false;
    if(s.roleId==='SUPERVISOR'&&String(r.COMPUTER_NO||'')!==s.computerNo)return false;
    if(s.roleId!=='SUPERVISOR'&&!visitAllowed_(s,r)&&!canApproveVisit_(s,r))return false;
    return true;
  }).sort(function(a,b){return sortKeyFromValue_(b.COMPLETED_AT).localeCompare(sortKeyFromValue_(a.COMPLETED_AT));});
  const last=all[0]||null, gps=v?visitGpsSnapshot_(v):{lat:'',lng:'',accuracy:'',distance:'',status:'NOT_RECORDED'}, canViewGps=canViewVisitGpsDetails_(s);
  return{
    issue:issueObject_(x),
    visit:v?{visitId:String(v.VISIT_ID||''),date:dateKeyFromValue_(v.DATE),startedAt:formatDateTimeSafe_(v.STARTED_AT),completedAt:formatDateTimeSafe_(v.COMPLETED_AT),computerNo:String(v.COMPUTER_NO||''),supervisor:String(v.SUPERVISOR_NAME||''),visitType:String(v.VISIT_TYPE||''),visitTypeLabel:APP.VISIT_TYPES[String(v.VISIT_TYPE||'')]||String(v.VISIT_TYPE||''),score:Number(v.SCORE||0),approvalStatus:String(v.APPROVAL_STATUS||'PENDING'),workflowStatus:String(v.WORKFLOW_STATUS||''),gpsStatus:gps.status,gpsDistanceMeters:canViewGps?gps.distance:'',gpsAccuracy:canViewGps?gps.accuracy:'',gpsLat:canViewGps?gps.lat:'',gpsLng:canViewGps?gps.lng:''}:null,
    station:{stationNo:String(x.STATION_NO||''),stationName:String(x.STATION_NAME||station.stationName||''),region:String(x.REGION||station.region||''),city:String(x.CITY||station.city||''),totalVisits:all.length,lastVisitDate:last?dateKeyFromValue_(last.DATE):'',lastVisitAt:last?formatDateTimeSafe_(last.COMPLETED_AT):'',lastSupervisor:last?String(last.SUPERVISOR_NAME||''):'',lastSupervisorComputerNo:last?String(last.COMPUTER_NO||''):'',lastVisitId:last?String(last.VISIT_ID||''):''},
    recentVisits:all.slice(0,10).map(function(r){return visitListObjectForSession_(r,s);})
  };
}

function submitIssueResolution(token,issueId,payload){const s=requireSession_(token);payload=payload||{};const ish=getDb_().getSheetByName(APP.SHEETS.ISSUES), rows=sheetObjects_(ish),x=rows.filter(function(r){return String(r.ISSUE_ID||'')===String(issueId);})[0];if(!x)throw new Error('الملاحظة غير موجودة.');const own=String(x.OWNER_COMPUTER_NO||x.CREATED_BY||'')===s.computerNo;if(!own&&!hasPermission_(s,'ISSUE_MANAGE'))throw new Error('هذه الملاحظة ليست ضمن مسؤوليتك.');if(['OPEN','IN_PROGRESS','OVERDUE','RETURNED'].indexOf(String(x.STATUS||''))===-1)throw new Error('الملاحظة ليست في حالة تسمح بإرسال معالجة.');const note=limitText_(normalizeText_(payload.note),2000);if(!note)throw new Error('اكتب ما تم عمله لمعالجة الملاحظة.');let photo='';if(payload.photoData){photo=saveIssueResolutionPhoto_(issueId,payload.photoData,payload.fileName||'resolution.jpg');}const now=new Date();updateRowsByKeys_(ish,{ISSUE_ID:issueId},{STATUS:'AWAITING_VERIFICATION',REMEDIATION_SUBMITTED_AT:now,REMEDIATION_NOTE:note,REMEDIATION_PHOTO_URL:photo,LAST_UPDATED_AT:now,RETURN_REASON:''});appendObject_(getDb_().getSheetByName(APP.SHEETS.ISSUE_UPDATES),{UPDATE_ID:'UPD-'+Utilities.getUuid(),ISSUE_ID:issueId,TIMESTAMP:now,COMPUTER_NO:s.computerNo,ACTION:'RESOLUTION_SUBMITTED',COMMENT:note,PHOTO_URL:photo,STATUS_FROM:String(x.STATUS||''),STATUS_TO:'AWAITING_VERIFICATION'});const v=findVisitObjectById_(String(x.VISIT_ID||'')),ap=v?String(v.APPROVER_COMPUTER_NO||''):resolveApproverForSupervisor_(s.computerNo,findStation_(x.STATION_NO));if(ap)notify_(ap,'ISSUE_AWAITING_VERIFICATION','معالجة ملاحظة بانتظار التحقق','المشرف '+s.name+' أرسل معالجة للملاحظة '+issueId+' في '+String(x.STATION_NAME||x.STATION_NO||'')+'.',issueId,s.computerNo);refreshVisitWorkflow_(String(x.VISIT_ID||''));return{ok:true,status:'AWAITING_VERIFICATION'};}
function saveIssueResolutionPhoto_(issueId,dataUrl,fileName){
  const img=decodeEvidenceImage_(dataUrl);
  const root=ensureEvidenceFolder_(),folder=getOrCreateChildFolder_(root,'Issue-Resolutions');
  return folder.createFile(Utilities.newBlob(img.bytes,img.mime,evidenceFileName_(issueId+'-'+normalizeText_(fileName),issueId||'resolution',img.ext))).getUrl();
}

function verifyIssueResolution(token,issueId,approved,comment){const s=requireSession_(token);requirePermissionAny_(s,['ISSUE_CLOSE','VISIT_APPROVE']);const ish=getDb_().getSheetByName(APP.SHEETS.ISSUES),x=sheetObjects_(ish).filter(function(r){return String(r.ISSUE_ID||'')===String(issueId);})[0];if(!x)throw new Error('الملاحظة غير موجودة.');if(String(x.STATUS||'')!=='AWAITING_VERIFICATION')throw new Error('الملاحظة ليست بانتظار التحقق.');const v=findVisitObjectById_(String(x.VISIT_ID||''));if(s.roleId!=='SYSTEM_ADMIN'){
  // V8.1.4.7: لو الزيارة محذوفة أو غير موجودة نتحقق من نطاق الملاحظة نفسها بدل تمرير العملية.
  if(v){if(!canApproveVisit_(s,v))throw new Error('هذه الملاحظة ليست ضمن اعتماداتك.');}
  else if(!issueAllowed_(s,x))throw new Error('هذه الملاحظة ليست ضمن نطاقك.');
}comment=limitText_(normalizeText_(comment),1000);if(!approved&&!comment)throw new Error('اكتب سبب إعادة الملاحظة للمشرف.');const now=new Date();if(approved){updateRowsByKeys_(ish,{ISSUE_ID:issueId},{STATUS:'CLOSED',CLOSED_AT:now,CLOSED_BY:s.computerNo,VERIFIED_AT:now,VERIFIED_BY:s.computerNo,LAST_UPDATED_AT:now,RETURN_REASON:''});}else{updateRowsByKeys_(ish,{ISSUE_ID:issueId},{STATUS:'RETURNED',RETURN_REASON:comment,LAST_UPDATED_AT:now});notify_(String(x.OWNER_COMPUTER_NO||x.CREATED_BY||''),'ISSUE_RETURNED','الملاحظة تحتاج معالجة إضافية','الملاحظة '+issueId+' أُعيدت لك. السبب: '+comment,issueId,s.computerNo);}appendObject_(getDb_().getSheetByName(APP.SHEETS.ISSUE_UPDATES),{UPDATE_ID:'UPD-'+Utilities.getUuid(),ISSUE_ID:issueId,TIMESTAMP:now,COMPUTER_NO:s.computerNo,ACTION:approved?'VERIFIED_CLOSED':'VERIFICATION_RETURNED',COMMENT:comment,STATUS_FROM:'AWAITING_VERIFICATION',STATUS_TO:approved?'CLOSED':'RETURNED'});refreshVisitWorkflow_(String(x.VISIT_ID||''));return{ok:true,status:approved?'CLOSED':'RETURNED'};}

function refreshVisitWorkflow_(visitId){const issues=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.ISSUES)).filter(function(x){return String(x.VISIT_ID||'')===String(visitId)&&String(x.STATUS||'')!=='CANCELED';});let status='CLOSED';if(issues.some(function(x){return String(x.STATUS||'')==='AWAITING_VERIFICATION';}))status='AWAITING_VERIFICATION';else if(issues.some(function(x){return String(x.STATUS||'')!=='CLOSED';}))status='FOLLOW_UP';updateRowsByKeys_(getDb_().getSheetByName(APP.SHEETS.VISITS),{VISIT_ID:visitId},{WORKFLOW_STATUS:status});if(status==='CLOSED'){const v=findVisitObjectById_(visitId);if(v)notify_(String(v.COMPUTER_NO||''),'VISIT_CLOSED','تم إغلاق الزيارة','تم إغلاق جميع ملاحظات الزيارة '+visitId+'.',visitId,'SYSTEM');}}

const ISSUE_STATUSES_=Object.freeze(['PENDING_APPROVAL','OPEN','IN_PROGRESS','OVERDUE','AWAITING_VERIFICATION','RETURNED','RESOLVED','CLOSED','CANCELED']);
function adminListIssues(token,filters){const s=requireSession_(token);filters=filters||{};requirePermissionAny_(s,['ISSUE_VIEW_ALL','ISSUE_VIEW_SCOPE','ISSUE_MANAGE','ISSUE_CLOSE']);return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.ISSUES)).filter(function(x){if(!issueAllowed_(s,x))return false;if(filters.status&&String(x.STATUS||'')!==filters.status)return false;if(filters.stationNo&&String(x.STATION_NO||'')!==filters.stationNo)return false;if(filters.supervisor&&String(x.CREATED_BY||'')!==filters.supervisor)return false;return true;}).sort(function(a,b){return sortKeyFromValue_(b.CREATED_AT).localeCompare(sortKeyFromValue_(a.CREATED_AT));}).slice(0,500).map(issueObject_);}
function adminUpdateIssue(token,issueId,payload){const s=requireSession_(token);requirePermission_(s,'ISSUE_MANAGE');payload=payload||{};const ish=getDb_().getSheetByName(APP.SHEETS.ISSUES),x=sheetObjects_(ish).filter(function(r){return String(r.ISSUE_ID||'')===String(issueId);})[0];if(!x)throw new Error('الملاحظة غير موجودة.');if(!issueAllowed_(s,x))throw new Error('الملاحظة خارج نطاقك.');const st=normalizeText_(payload.status||x.STATUS).toUpperCase(),owner=limitText_(normalizeText_(payload.ownerComputerNo||x.OWNER_COMPUTER_NO),32),comment=limitText_(normalizeText_(payload.comment),1000);
// V8.1.4.7: لا تُكتب حالة خارج دورة حياة الملاحظة، ولا يُسند العمل لمستخدم غير موجود أو موقوف.
if(ISSUE_STATUSES_.indexOf(st)===-1)throw new Error('حالة الملاحظة غير معروفة.');
if(owner&&owner!==String(x.OWNER_COMPUTER_NO||'')){const ou=findUserByComputerNo_(owner);if(!ou||!toBool_(ou.ACTIVE))throw new Error('المستخدم المسؤول غير موجود أو غير فعال.');}
updateRowsByKeys_(ish,{ISSUE_ID:issueId},{STATUS:st,OWNER_COMPUTER_NO:owner,LAST_UPDATED_AT:new Date()});if(comment)appendObject_(getDb_().getSheetByName(APP.SHEETS.ISSUE_UPDATES),{UPDATE_ID:'UPD-'+Utilities.getUuid(),ISSUE_ID:issueId,TIMESTAMP:new Date(),COMPUTER_NO:s.computerNo,ACTION:'ADMIN_UPDATE',COMMENT:comment,STATUS_FROM:String(x.STATUS||''),STATUS_TO:st});refreshVisitWorkflow_(String(x.VISIT_ID||''));return{ok:true};}

/* =====================================================================
   V8.2 — الفتح الإداري لنوع الزيارة (مشرف + محطة، ينتهي بنهاية الدورة)
   ===================================================================== */
const UNLOCKABLE_VISIT_TYPES_=Object.freeze(['BIWEEKLY','MONTHLY']);

function unlocksSheet_(){
  const sh=getDb_().getSheetByName(APP.SHEETS.VISIT_UNLOCKS);
  if(!sh)throw new Error('شيت VISIT_UNLOCKS غير موجود. شغّل upgradeSystemV4() من المحرر أولًا.');
  return sh;
}

function assertCanManageUnlocks_(session,station){
  requirePermission_(session,'VISIT_PLAN_MANAGE');
  if(session.roleId==='SYSTEM_ADMIN')return;
  if(station&&!stationAllowed_(session,station))throw new Error('المحطة خارج نطاقك.');
}

function adminUnlockVisitType(token,payload){
  const s=requireSession_(token); payload=payload||{};
  const computerNo=limitText_(normalizeText_(payload.computerNo),32);
  const stationNo=limitText_(normalizeText_(payload.stationNo),40);
  const visitType=normalizeText_(payload.visitType).toUpperCase();
  const reason=limitText_(normalizeText_(payload.reason),500);
  if(UNLOCKABLE_VISIT_TYPES_.indexOf(visitType)===-1)throw new Error('يمكن فتح الزيارة الأسبوعية أو الشهرية فقط. اليومية مفتوحة دائمًا.');
  const user=findUserByComputerNo_(computerNo);
  if(!user||!toBool_(user.ACTIVE))throw new Error('المشرف غير موجود أو غير فعال.');
  const station=findStation_(stationNo);
  if(!station||!station.active)throw new Error('المحطة غير موجودة أو غير فعالة.');
  assertCanManageUnlocks_(s,station);

  const gate=visitGateFor_(computerNo,stationNo), state=gate.states[visitType];
  if(state.doneVisitId)throw new Error('تم تنفيذ الزيارة '+state.label+' لهذه الدورة بالفعل ('+state.doneDate+'). الدورة القادمة تبدأ '+dateAddDaysKey_(state.cycleEnd,1)+'.');
  if(state.unlocked)return {ok:true,already:true,unlockId:state.unlockId,message:'الزيارة '+state.label+' مفتوحة أصلًا لهذه الدورة.'};
  if(state.open)return {ok:true,already:true,unlockId:'',message:'الزيارة '+state.label+' متاحة أصلًا لهذا المشرف في هذه المحطة.'};

  const sh=unlocksSheet_(), id='UNL-'+Utilities.getUuid().slice(0,10);
  appendObject_(sh,{
    UNLOCK_ID:id,COMPUTER_NO:computerNo,STATION_NO:stationNo,VISIT_TYPE:visitType,
    CYCLE_KEY:state.cycleKey,ANCHOR_DATE:gate.anchorDate,CYCLE_START:state.cycleStart,CYCLE_END:state.cycleEnd,
    REASON:reason,ACTIVE:true,CREATED_AT:new Date(),CREATED_BY:s.computerNo
  });
  notify_(computerNo,'VISIT_TYPE_UNLOCKED','تم فتح زيارة لك','فُتحت لك الزيارة '+state.label+' في المحطة '+station.stationName+' #'+station.stationNo+(state.cycleEnd?(' حتى '+state.cycleEnd):'')+'.',id,s.computerNo);
  audit_(s.computerNo,'VISIT_TYPE_UNLOCKED',id,computerNo+' '+stationNo+' '+visitType+' cycle='+state.cycleKey);
  return {ok:true,unlockId:id,visitType:visitType,cycleKey:state.cycleKey,cycleEnd:state.cycleEnd,
    message:'تم فتح الزيارة '+state.label+' لهذا المشرف في هذه المحطة'+(state.cycleEnd?(' حتى نهاية الدورة في '+state.cycleEnd):'')+'.'};
}

function adminRevokeVisitUnlock(token,unlockId){
  const s=requireSession_(token);
  unlockId=limitText_(normalizeText_(unlockId),80);
  const sh=unlocksSheet_();
  const row=sheetObjects_(sh).filter(function(u){return String(u.UNLOCK_ID||'')===unlockId;})[0];
  if(!row)throw new Error('سجل الفتح غير موجود.');
  assertCanManageUnlocks_(s,findStation_(String(row.STATION_NO||'')));
  if(!toBool_(row.ACTIVE))return {ok:true,already:true,message:'الفتح ملغى مسبقًا.'};
  updateRowsByKeys_(sh,{UNLOCK_ID:unlockId},{ACTIVE:false,REVOKED_AT:new Date(),REVOKED_BY:s.computerNo});
  audit_(s.computerNo,'VISIT_TYPE_UNLOCK_REVOKED',unlockId,String(row.COMPUTER_NO||'')+' '+String(row.STATION_NO||'')+' '+String(row.VISIT_TYPE||''));
  return {ok:true,message:'تم إلغاء الفتح.'};
}

function adminListVisitUnlocks(token,computerNo){
  const s=requireSession_(token);
  requirePermission_(s,'VISIT_PLAN_MANAGE');
  computerNo=limitText_(normalizeText_(computerNo),32);
  const sh=getDb_().getSheetByName(APP.SHEETS.VISIT_UNLOCKS);
  if(!sh)return [];
  return sheetObjects_(sh).filter(function(u){
    if(computerNo&&String(u.COMPUTER_NO||'')!==computerNo)return false;
    const st=findStation_(String(u.STATION_NO||''));
    if(s.roleId!=='SYSTEM_ADMIN'&&st&&!stationAllowed_(s,st))return false;
    return true;
  }).sort(function(a,b){return sortKeyFromValue_(b.CREATED_AT).localeCompare(sortKeyFromValue_(a.CREATED_AT));}).slice(0,200).map(function(u){
    const st=findStation_(String(u.STATION_NO||''))||{};
    return{
      unlockId:String(u.UNLOCK_ID||''),computerNo:String(u.COMPUTER_NO||''),stationNo:String(u.STATION_NO||''),
      stationName:st.stationName||('محطة '+String(u.STATION_NO||'')),
      visitType:String(u.VISIT_TYPE||''),visitTypeLabel:APP.VISIT_TYPES[String(u.VISIT_TYPE||'')]||String(u.VISIT_TYPE||''),
      cycleKey:String(u.CYCLE_KEY||''),cycleStart:dateKeyFromValue_(u.CYCLE_START),cycleEnd:dateKeyFromValue_(u.CYCLE_END),
      reason:String(u.REASON||''),active:toBool_(u.ACTIVE),
      createdAt:formatDateTimeSafe_(u.CREATED_AT),createdBy:String(u.CREATED_BY||''),
      consumedAt:formatDateTimeSafe_(u.CONSUMED_AT),consumedByVisitId:String(u.CONSUMED_BY_VISIT_ID||''),
      revokedAt:formatDateTimeSafe_(u.REVOKED_AT),revokedBy:String(u.REVOKED_BY||'')
    };
  });
}

function getMySchedule(token){const s=requireSession_(token),today=dateKey_(new Date());const plans=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISIT_PLANS)).filter(function(p){return toBool_(p.ACTIVE)&&String(p.COMPUTER_NO||'')===s.computerNo;});return plans.map(function(p){const due=dateKeyFromValue_(p.NEXT_DUE_DATE)||dateKeyFromValue_(p.START_DATE),station=findStation_(p.STATION_NO)||{stationName:'محطة '+p.STATION_NO};let status='UPCOMING',days=0;if(due){const dd=parseDateKey_(due),tt=parseDateKey_(today);days=Math.round((dd-tt)/86400000);if(days<0)status='OVERDUE';else if(days===0)status='DUE_TODAY';else if(days<=3)status='DUE_SOON';}return{planId:String(p.PLAN_ID||''),stationNo:String(p.STATION_NO||''),stationName:station.stationName,visitType:String(p.VISIT_TYPE||''),startDate:dateKeyFromValue_(p.START_DATE),anchorDate:dateKeyFromValue_(p.ANCHOR_DATE),lastVisitDate:dateKeyFromValue_(p.LAST_VISIT_DATE),nextDueDate:due,status:status,daysToDue:days};}).sort(function(a,b){return String(a.nextDueDate||'9999').localeCompare(String(b.nextDueDate||'9999'));});}

function adminListVisitPlans(token){const s=requireSession_(token);requirePermission_(s,'VISIT_PLAN_MANAGE');return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISIT_PLANS)).filter(function(p){const station=findStation_(p.STATION_NO);return !station||stationAllowed_(s,station);}).map(function(p){return{planId:String(p.PLAN_ID||''),computerNo:String(p.COMPUTER_NO||''),stationNo:String(p.STATION_NO||''),visitType:String(p.VISIT_TYPE||''),startDate:dateKeyFromValue_(p.START_DATE),endDate:dateKeyFromValue_(p.END_DATE),active:toBool_(p.ACTIVE),approverComputerNo:String(p.APPROVER_COMPUTER_NO||''),anchorDate:dateKeyFromValue_(p.ANCHOR_DATE),lastVisitDate:dateKeyFromValue_(p.LAST_VISIT_DATE),nextDueDate:dateKeyFromValue_(p.NEXT_DUE_DATE),graceDays:Number(p.GRACE_DAYS||0),lastSatisfiedByType:String(p.LAST_SATISFIED_BY_TYPE||''),lastSatisfiedByVisitId:String(p.LAST_SATISFIED_BY_VISIT_ID||'')};});}
function adminSaveVisitPlan(token,payload){const s=requireSession_(token);requirePermission_(s,'VISIT_PLAN_MANAGE');payload=payload||{};const no=normalizeText_(payload.computerNo),stationNo=normalizeText_(payload.stationNo),typ=normalizeText_(payload.visitType).toUpperCase(),start=normalizeText_(payload.startDate||dateKey_(new Date()));if(!no||!stationNo||!APP.VISIT_TYPES[typ])throw new Error('المشرف والمحطة ونوع الزيارة مطلوبة.');const station=findStation_(stationNo);if(!station)throw new Error('المحطة غير موجودة.');const u=userByNo_(no);if(!u)throw new Error('المشرف غير موجود.');const sh=getDb_().getSheetByName(APP.SHEETS.VISIT_PLANS),id=normalizeText_(payload.planId||('PLAN-'+Utilities.getUuid().slice(0,10))), existing=sheetObjects_(sh).filter(function(p){return String(p.PLAN_ID||'')===id;})[0];const anchor=existing?dateKeyFromValue_(existing.ANCHOR_DATE):'',next=anchor?nextDueFromAnchor_(anchor,typ,dateKey_(new Date())):start,approver=normalizeText_(payload.approverComputerNo)||String(u.APPROVER_COMPUTER_NO||'')||resolveApproverForSupervisor_(no,station);const patch={COMPUTER_NO:no,STATION_NO:stationNo,VISIT_TYPE:typ,START_DATE:start,END_DATE:normalizeText_(payload.endDate),ACTIVE:payload.active!==false,APPROVER_COMPUTER_NO:approver,ANCHOR_DATE:anchor,NEXT_DUE_DATE:next,GRACE_DAYS:Number(payload.graceDays==null?settingValue_('PLAN_GRACE_DAYS','0'):payload.graceDays)};const count=updateRowsByKeys_(sh,{PLAN_ID:id},patch);if(!count){patch.PLAN_ID=id;patch.CREATED_AT=new Date();patch.CREATED_BY=s.computerNo;appendObject_(sh,patch);}audit_(s.computerNo,'VISIT_PLAN_SAVED',id,no+' '+stationNo+' '+typ);return{ok:true,planId:id};}

function requiredOccurrences_(plan,startDate,endDate){const out=[],typ=String(plan.VISIT_TYPE||''),anchor=dateKeyFromValue_(plan.ANCHOR_DATE)||dateKeyFromValue_(plan.START_DATE);if(!anchor)return out;let d=anchor,guard=0;while(d&&d<startDate&&guard++<10000)d=nextDueFromAnchor_(anchor,typ,d);while(d&&d<=endDate&&guard++<10000){out.push(d);d=nextDueFromAnchor_(anchor,typ,d);}return out;}
function calculatePlanMetrics_(plansAll,visitsAll,session,filters){const today=dateKey_(new Date()), start=filters.startDate||today,end=filters.endDate||today;let required=0,completed=0,overdue=0;const stations={};plansAll.forEach(function(p){if(!toBool_(p.ACTIVE))return;const st=findStation_(p.STATION_NO);if(st&&!stationAllowed_(session,st))return;if(filters.stationNo&&String(p.STATION_NO||'')!==filters.stationNo)return;if(filters.supervisor&&String(p.COMPUTER_NO||'')!==filters.supervisor)return;if(filters.visitType&&String(p.VISIT_TYPE||'')!==filters.visitType)return;const occ=requiredOccurrences_(p,start,end);required+=occ.length;stations[String(p.STATION_NO||'')]=true;const pv=visitsAll.filter(function(v){return String(v.COMPUTER_NO||'')===String(p.COMPUTER_NO||'')&&String(v.STATION_NO||'')===String(p.STATION_NO||'')&&String(v.VISIT_TYPE||'')===String(p.VISIT_TYPE||'')&&String(v.APPROVAL_STATUS||'')!=='REJECTED'&&dateInRange_(dateKeyFromValue_(v.DATE),start,end);});completed+=Math.min(occ.length,pv.length);const due=dateKeyFromValue_(p.NEXT_DUE_DATE)||dateKeyFromValue_(p.START_DATE);if(due&&due<today)overdue++;});return{required:required,completed:completed,overdue:overdue,coverageStations:Object.keys(stations).length,planCount:plansAll.length};}
