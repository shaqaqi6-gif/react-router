/* =====================================================================
   Workflow.gs — دورة الاعتماد، الجداول الزمنية، التنبيهات والتصعيد
   V9.0.0 · شركة الدريس
   ===================================================================== */

function settingValue_(key, fallback) {
  try {
    const rows = sheetObjects_(getDb_().getSheetByName(APP.SHEETS.SETTINGS));
    const hit = rows.filter(function(r){ return String(r.KEY||'')===String(key); })[0];
    return hit && hit.VALUE !== '' ? hit.VALUE : fallback;
  } catch(e) { return fallback; }
}

function userByNo_(computerNo) {
  return findUserByComputerNo_(String(computerNo||''));
}

function resolveApproverForSupervisor_(computerNo, station) {
  /* V8.2.1: لا يجوز أن يكون المعتمِد هو منفّذ الزيارة نفسه.
     canApproveVisit_ ترفض اعتماد المرء لزيارته (وهذا صحيح رقابيًا)، فلو أُسندت الزيارة
     إلى صاحبها بقيت معلّقة إلى الأبد ولا تظهر في طابور أحد. */
  const self = String(computerNo||'');
  const u = userByNo_(computerNo);
  const own = u ? String(u.APPROVER_COMPUTER_NO||'') : '';
  if (own && own !== self) return own;
  const users = sheetObjects_(getDb_().getSheetByName(APP.SHEETS.USERS)).filter(function(x){return toBool_(x.ACTIVE)&&String(x.COMPUTER_NO||'')!==self;});
  const region = station ? String(station.region||station.REGION||'') : '';
  const branch = station ? String(station.branch||station.BRANCH||'') : '';
  // V9: المعتمِد مساعد إشراف — أقرب مساعد في السلسلة فوق المشرف، ثم أي مساعد في نطاق المحطة.
  const chainAsst = nearestAboveWithRole_(self,['APPROVAL_ASSISTANT']);
  if (chainAsst && chainAsst !== self) return chainAsst;
  const preferred = ['APPROVAL_ASSISTANT','SYSTEM_ADMIN'];
  for (let p=0;p<preferred.length;p++) {
    for (let i=0;i<users.length;i++) {
      const role=normalizeRoleId_(users[i].ROLE_ID||users[i].ROLE||'');
      if(role!==preferred[p]) continue;
      if(role==='SYSTEM_ADMIN') return String(users[i].COMPUTER_NO||'');
      const regs=csvArray_(users[i].REGIONS);
      const mode=normalizeScopeMode_(users[i].SCOPE_MODE,role);
      if(mode==='ALL' || !regs.length || regs.indexOf(region)!==-1 || regs.indexOf(branch)!==-1) return String(users[i].COMPUTER_NO||'');
    }
  }
  const manager = u ? String(u.MANAGER_COMPUTER_NO||'') : '';
  if (manager && manager !== self) return manager;
  // آخر ملاذ: مدير النظام المؤسس، ما لم يكن هو المنفّذ — عندها تُترك بلا إسناد
  // ليلتقطها أي صاحب صلاحية اعتماد ضمن النطاق.
  return APP.ADMIN.computerNo !== self ? APP.ADMIN.computerNo : '';
}

function managerForUser_(computerNo) {
  const u=userByNo_(computerNo);
  return u ? String(u.MANAGER_COMPUTER_NO||'') : '';
}

/* V9: الاعتماد لمساعد الإشراف وحده.
   - منفّذ الزيارة لا يعتمد زيارته.
   - المُسنَد إليه صراحةً (إسناد صحيح) يعتمد.
   - مساعد المشرف (APPROVER_COMPUTER_NO في سجل المشرف) يعتمد.
   - مسؤول الإشراف ومسؤول التشغيل ومدير العمليات لا يعتمدون — دورهم الاطلاع والتصعيد وإعادة الإسناد.
   - مدير النظام يحتفظ بالتجاوز التقني. */
function canApproveVisit_(session, visit) {
  if(!session || !visit) return false;
  const author=String(visit.COMPUTER_NO||'');
  if(session.computerNo===author) return false;
  if(session.roleId==='SYSTEM_ADMIN') return true;
  if(['OPERATIONS_MANAGER','OPERATIONS_DEPUTY','REGION_MANAGER','SUPERVISION_MANAGER'].indexOf(session.roleId)!==-1) return false;
  if(!hasPermission_(session,'VISIT_APPROVE')) return false;
  const assigned=String(visit.APPROVER_COMPUTER_NO||'');
  const selfAssigned=!!assigned&&assigned===author;
  if(assigned&&!selfAssigned) return assigned===session.computerNo;
  // V9: مساعد المشرف وحده يعتمد. ولو لم يُحدَّد للمشرف مساعد بعد (بيانات قديمة)،
  // لا تبقى الزيارة معلّقة: أي مساعد إشراف نطاقه يشمل الزيارة يستطيع اعتمادها.
  const asst=assistantOf_(author);
  if(asst) return asst===session.computerNo;
  return session.roleId==='APPROVAL_ASSISTANT'&&visitAllowed_(session,visit);
}

/* من يستطيع التصرّف في ملاحظة (التحقق/الإغلاق/الإعادة):
   مساعد المشرف دائمًا، ومن صُعِّدت إليه، ومن فوقه في السلسلة بدور يكافئ مستواها أو أعلى. */
function canActOnIssue_(session, issue){
  if(!session||!issue)return false;
  if(session.roleId==='SYSTEM_ADMIN')return true;
  const owner=String(issue.OWNER_COMPUTER_NO||issue.CREATED_BY||'');
  if(owner===session.computerNo)return false;
  if(assistantOf_(owner)===session.computerNo)return true;
  const level=Number(issue.ESCALATION_LEVEL||0);
  if(level<1)return false;
  if(String(issue.ESCALATED_TO||'')===session.computerNo)return true;
  const need={1:['SUPERVISION_MANAGER','REGION_MANAGER','OPERATIONS_DEPUTY','OPERATIONS_MANAGER'],2:['REGION_MANAGER','OPERATIONS_DEPUTY','OPERATIONS_MANAGER'],3:['OPERATIONS_DEPUTY','OPERATIONS_MANAGER']}[Math.min(3,level)];
  if(need.indexOf(session.roleId)===-1)return false;
  return seesAll_(session)||inTeam_(session,owner);
}

function dateAddDaysKey_(key, days) {
  const d=parseDateKey_(key); if(!d) return '';
  d.setDate(d.getDate()+Number(days||0)); return dateKey_(d);
}

function dateTimeAddHours_(d, hours) {
  const x=asDate_(d)||new Date(); return new Date(x.getTime()+Number(hours||0)*3600000);
}

function monthlyOccurrence_(anchor, monthOffset) {
  const a=parseDateKey_(anchor); if(!a) return '';
  const year=a.getFullYear(), month=a.getMonth()+Number(monthOffset||0), day=a.getDate();
  const last=new Date(year,month+1,0).getDate();
  return dateKey_(new Date(year,month,Math.min(day,last)));
}

function nextDueFromAnchor_(anchorDate, visitType, afterDate) {
  anchorDate=String(anchorDate||''); afterDate=String(afterDate||anchorDate);
  if(!parseDateKey_(anchorDate)) return '';
  if(visitType==='DAILY') {
    const step=Math.max(1,Number(settingValue_('DAILY_INTERVAL_DAYS','1'))||1);
    let c=anchorDate; while(c<=afterDate)c=dateAddDaysKey_(c,step); return c;
  }
  if(visitType==='BIWEEKLY') {
    const step=Math.max(1,Number(settingValue_('WEEKLY_INTERVAL_DAYS','7'))||7);
    let c=anchorDate; while(c<=afterDate)c=dateAddDaysKey_(c,step); return c;
  }
  if(visitType==='MONTHLY') {
    let m=1,c=monthlyOccurrence_(anchorDate,m);
    while(c && c<=afterDate && m<240){m++;c=monthlyOccurrence_(anchorDate,m);} return c;
  }
  return dateAddDaysKey_(afterDate,1);
}

function updatePlanAfterVisit_(computerNo, stationNo, visitType, visitDate, approverComputerNo) {
  const sh=getDb_().getSheetByName(APP.SHEETS.VISIT_PLANS);
  const rows=sh.getDataRange().getValues(); if(rows.length<=1)return;
  const idx=headerMap_(rows[0]);
  for(let r=1;r<rows.length;r++){
    if(String(rows[r][idx.COMPUTER_NO]||'')!==String(computerNo))continue;
    if(String(rows[r][idx.STATION_NO]||'')!==String(stationNo))continue;
    if(String(rows[r][idx.VISIT_TYPE]||'')!==String(visitType))continue;
    if(!toBool_(rows[r][idx.ACTIVE]))continue;
    let anchor=idx.ANCHOR_DATE!==undefined?dateKeyFromValue_(rows[r][idx.ANCHOR_DATE]):'';
    if(!anchor) anchor=visitDate;
    const next=nextDueFromAnchor_(anchor,visitType,visitDate);
    const patch={ANCHOR_DATE:anchor,LAST_VISIT_DATE:visitDate,NEXT_DUE_DATE:next};
    if(approverComputerNo)patch.APPROVER_COMPUTER_NO=approverComputerNo;
    patchRowByNumber_(sh,r+1,patch);
  }
}


/* =========================
   دوال الخطط المساعدة.
   ملاحظة V8.2: لم تعد بوابة أنواع الزيارة تعتمد على VISIT_PLANS إطلاقًا —
   صارت تُحسب من تاريخ أول زيارة فعلية للمحطة. هذه الدوال باقية لأنها
   تخدم شاشة الخطط والجدول الزمني ومراقب الزيارات المتأخرة.
   ========================= */
function activePlanFor_(computerNo, stationNo, visitType) {
  const today=dateKey_(new Date());
  const rows=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISIT_PLANS));
  return rows.filter(function(p){
    if(!toBool_(p.ACTIVE))return false;
    if(String(p.COMPUTER_NO||'')!==String(computerNo))return false;
    if(String(p.STATION_NO||'')!==String(stationNo))return false;
    if(String(p.VISIT_TYPE||'')!==String(visitType))return false;
    const start=dateKeyFromValue_(p.START_DATE), end=dateKeyFromValue_(p.END_DATE);
    if(start&&today<start)return false;
    if(end&&today>end)return false;
    return true;
  }).sort(function(a,b){return String(dateKeyFromValue_(a.START_DATE)||'').localeCompare(String(dateKeyFromValue_(b.START_DATE)||''));})[0]||null;
}

function latestVisitForPlan_(computerNo, stationNo, visitType) {
  const rows=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS)).filter(function(v){
    return String(v.COMPUTER_NO||'')===String(computerNo) &&
      String(v.STATION_NO||'')===String(stationNo) &&
      String(v.VISIT_TYPE||'')===String(visitType);
  });
  rows.sort(function(a,b){return sortKeyFromValue_(b.SUBMITTED_AT||b.COMPLETED_AT||b.DATE).localeCompare(sortKeyFromValue_(a.SUBMITTED_AT||a.COMPLETED_AT||a.DATE));});
  return rows[0]||null;
}

function planRequiresVisitNow_(plan, computerNo, stationNo, visitType, today) {
  if(!plan)return {required:false,dueDate:'',reason:''};
  const due=dateKeyFromValue_(plan.NEXT_DUE_DATE)||dateKeyFromValue_(plan.START_DATE);
  const latest=latestVisitForPlan_(computerNo,stationNo,visitType);
  const lastPlanVisit=dateKeyFromValue_(plan.LAST_VISIT_DATE);
  // إذا رُفضت آخر زيارة التي حركت الخطة، تعود نفس الزيارة إلزامية حتى يعيد المشرف تنفيذها.
  if(latest && String(latest.APPROVAL_STATUS||'')==='REJECTED' && lastPlanVisit && dateKeyFromValue_(latest.DATE)===lastPlanVisit){
    return {required:true,dueDate:lastPlanVisit,reason:'REJECTED'};
  }
  if(due && due<=today)return {required:true,dueDate:due,reason:due<today?'OVERDUE':'DUE_TODAY'};
  return {required:false,dueDate:due,reason:''};
}

/* =====================================================================
   V8.2 — قواعد فتح أنواع الزيارة (معتمدة ٢٠٢٦-٠٩-٠٩)

   المرساة (ANCHOR) = تاريخ أول زيارة لهذا المشرف في هذه المحطة، أيًّا كان نوعها.

   اليومية   : مفتوحة كل يوم بلا شرط ولا قفل.
   الأسبوعية : تُفتح بعد مرور ٧ أيام من المرساة، ثم مرة واحدة في كل دورة ٧ أيام.
   الشهرية   : تُفتح بعد مرور ٣٠ يومًا من المرساة، ثم مرة واحدة في كل دورة ٣٠ يومًا.
   الفتح الإداري: يفتح النوع فورًا لمشرف + محطة بعينها، وينتهي تلقائيًا بنهاية
                  الدورة الجارية لأن مفتاح الدورة CYCLE_KEY يتغيّر — بلا مهمة تنظيف.

   لا توجد زيارة «مفروضة» بعد اليوم: النوع المستحق يظهر كاقتراح لا كإجبار،
   واليومية لا تُقفل في أي حال.
   ===================================================================== */

function visitCycleDays_(visitType){
  if(visitType==='BIWEEKLY')return Math.max(1,Number(settingValue_('WEEKLY_UNLOCK_DAYS','7'))||7);
  if(visitType==='MONTHLY')return Math.max(1,Number(settingValue_('MONTHLY_UNLOCK_DAYS','30'))||30);
  return 1;
}

function daysBetweenKeys_(fromKey,toKey){
  const a=parseDateKey_(fromKey),b=parseDateKey_(toKey);
  return (a&&b)?Math.round((b-a)/86400000):0;
}

/* أول زيارة لهذا المشرف في هذه المحطة — تُحتسب أيًّا كانت حالة الاعتماد،
   لأن العلاقة بالمحطة بدأت فعليًا حتى لو رُفضت الزيارة لاحقًا. */
function visitAnchorDate_(computerNo, stationNo, visitRows){
  const rows=visitRows||sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS));
  let anchor='';
  for(let i=0;i<rows.length;i++){
    const v=rows[i];
    if(String(v.COMPUTER_NO||'')!==String(computerNo))continue;
    if(String(v.STATION_NO||'')!==String(stationNo))continue;
    const d=dateKeyFromValue_(v.DATE);
    if(!d)continue;
    if(!anchor||d<anchor)anchor=d;
  }
  return anchor;
}

function visitCycleInfo_(visitType, anchor, today){
  const span=visitCycleDays_(visitType);
  if(!anchor){
    return {index:0,span:span,start:'',end:'',opensOn:'',daysToOpen:span,eligible:false,key:visitType+'|0'};
  }
  const elapsed=Math.max(0,daysBetweenKeys_(anchor,today));
  const index=Math.floor(elapsed/span);
  return {
    index:index,span:span,
    start:dateAddDaysKey_(anchor,index*span),
    end:dateAddDaysKey_(anchor,(index+1)*span-1),
    opensOn:index>=1?dateAddDaysKey_(anchor,index*span):dateAddDaysKey_(anchor,span),
    daysToOpen:index>=1?0:Math.max(0,span-elapsed),
    eligible:index>=1,
    key:visitType+'|'+index
  };
}

/* هل نُفّذت زيارة من هذا النوع داخل الدورة الحالية؟ الزيارة المرفوضة لا تُغلق الدورة. */
function typeDoneInCycle_(computerNo, stationNo, visitType, cycle, visitRows){
  if(!cycle||!cycle.start)return null;
  const rows=visitRows||sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS));
  // V9: الشهرية المنجَزة داخل دورة الأسبوعية تُغلق تلك الدورة أيضًا.
  const accepts=visitType==='BIWEEKLY'?['BIWEEKLY','MONTHLY']:[String(visitType)];
  for(let i=0;i<rows.length;i++){
    const v=rows[i];
    if(String(v.COMPUTER_NO||'')!==String(computerNo))continue;
    if(String(v.STATION_NO||'')!==String(stationNo))continue;
    if(accepts.indexOf(String(v.VISIT_TYPE||''))===-1)continue;
    if(String(v.APPROVAL_STATUS||'')==='REJECTED')continue;
    const d=dateKeyFromValue_(v.DATE);
    if(d&&d>=cycle.start&&d<=cycle.end)return v;
  }
  return null;
}

function activeUnlockFor_(computerNo, stationNo, cycleKey, unlockRows){
  let rows=unlockRows;
  if(!rows){
    const sh=getDb_().getSheetByName(APP.SHEETS.VISIT_UNLOCKS);
    rows=sh?sheetObjects_(sh):[];
  }
  for(let i=0;i<rows.length;i++){
    const u=rows[i];
    if(!toBool_(u.ACTIVE))continue;
    if(String(u.COMPUTER_NO||'')!==String(computerNo))continue;
    if(String(u.STATION_NO||'')!==String(stationNo))continue;
    if(String(u.CYCLE_KEY||'')!==String(cycleKey))continue;
    return u;
  }
  return null;
}

function visitTypeStateFor_(computerNo, stationNo, visitType, anchor, today, visitRows, unlockRows){
  const cycle=visitCycleInfo_(visitType,anchor,today);
  const done=typeDoneInCycle_(computerNo,stationNo,visitType,cycle,visitRows);
  const unlock=activeUnlockFor_(computerNo,stationNo,cycle.key,unlockRows);
  const label=APP.VISIT_TYPES[visitType]||visitType;
  const open=!done&&(!!unlock||cycle.eligible);
  let blockedReason='';
  if(done){
    blockedReason='تم تنفيذ الزيارة '+label+' لهذه الدورة'+(cycle.end?(' التي تنتهي '+cycle.end):'')+'.';
  }else if(!cycle.eligible){
    blockedReason=anchor
      ? ('الزيارة '+label+' تُفتح بعد مرور '+cycle.span+' يومًا من أول زيارة لهذه المحطة ('+anchor+')'+(cycle.opensOn?(' — تُفتح في '+cycle.opensOn):'')+'.')
      : ('الزيارة '+label+' تُفتح بعد مرور '+cycle.span+' يومًا من أول زيارة لهذه المحطة. نفّذ الزيارة اليومية أولًا.');
  }
  return {
    visitType:visitType,label:label,open:open,
    unlocked:!!unlock,
    unlockId:unlock?String(unlock.UNLOCK_ID||''):'',
    doneVisitId:done?String(done.VISIT_ID||''):'',
    doneDate:done?dateKeyFromValue_(done.DATE):'',
    cycleKey:cycle.key,cycleIndex:cycle.index,cycleStart:cycle.start,cycleEnd:cycle.end,
    opensOn:cycle.opensOn,daysToOpen:cycle.daysToOpen,spanDays:cycle.span,
    blockedReason:blockedReason
  };
}

/* V9 — قفل الأولوية (قرار ٢٠٢٦-٠٩-٠٩ الثاني، يلغي إلغاء القفل في V8.2.0):
   اليومية هي الأصل. إذا استحقت الشهرية فهي الوحيدة المسموحة حتى تُنجَز، وإلا إذا استحقت
   الأسبوعية فهي الوحيدة، وإلا اليومية وحدها. بعد إنجاز الدورية تُفتح اليومية فورًا.
   إنجاز الشهرية يُغلق دورة الأسبوعية الجارية أيضًا. الفتح الإداري يُستحِق النوع مبكرًا. */
function visitGateForRows_(computerNo, stationNo, visitRows, unlockRows){
  const today=dateKey_(new Date());
  const anchor=visitAnchorDate_(computerNo,stationNo,visitRows);
  const weekly=visitTypeStateFor_(computerNo,stationNo,'BIWEEKLY',anchor,today,visitRows,unlockRows);
  const monthly=visitTypeStateFor_(computerNo,stationNo,'MONTHLY',anchor,today,visitRows,unlockRows);

  let required='';
  if(monthly.open)required='MONTHLY';
  else if(weekly.open)required='BIWEEKLY';
  const allowed=required?[required]:['DAILY'];
  const label=required?(APP.VISIT_TYPES[required]||required):'';
  const reqState=required==='MONTHLY'?monthly:(required==='BIWEEKLY'?weekly:null);
  const message=required
    ? ('حان وقت الزيارة '+label+' لهذه المحطة. أكملها أولًا وستُفتح اليومية تلقائيًا بعد إرسالها.'+(reqState&&reqState.unlocked?' (فُتحت بقرار إداري)':''))
    : 'الزيارة اليومية متاحة. لا توجد زيارة دورية مستحقة الآن.';

  // أسباب إغلاق ما ليس مسموحًا الآن
  if(required){
    if(required==='MONTHLY'){weekly.blockedReason='الشهرية مستحقة الآن وتغطي الأسبوعية — أكمل الشهرية أولًا.';}
    if(!allowed.length||allowed.indexOf('DAILY')===-1){}
  }
  const dailyBlocked=required?('اليومية مقفلة حتى إكمال الزيارة '+label+' المستحقة.'):'';
  if(!required){
    if(!weekly.blockedReason)weekly.blockedReason='الأسبوعية غير مستحقة الآن'+(weekly.opensOn?(' — تُستحق في '+weekly.opensOn):'')+'.';
    if(!monthly.blockedReason)monthly.blockedReason='الشهرية غير مستحقة الآن'+(monthly.opensOn?(' — تُستحق في '+monthly.opensOn):'')+'.';
  }

  return {
    anchorDate:anchor,
    allowedVisitTypes:allowed,
    requiredVisitType:required,
    requiredVisitLabel:label,
    forced:!!required,
    dailyAllowed:!required,
    dailyBlockedReason:dailyBlocked,
    dueDate:reqState?reqState.cycleEnd:'',
    reason:required?(reqState&&reqState.unlocked?'UNLOCKED':'DUE'):'',
    message:message,
    /* حقول V8.2 المتوافقة */
    suggestedVisitType:required,suggestedVisitLabel:label,suggestion:message,
    weekly:weekly,monthly:monthly,states:{DAILY:{visitType:'DAILY',label:APP.VISIT_TYPES.DAILY,open:!required,blockedReason:dailyBlocked},BIWEEKLY:weekly,MONTHLY:monthly}
  };
}

function visitGateFor_(computerNo, stationNo) {
  const ss=getDb_();
  const unlockSh=ss.getSheetByName(APP.SHEETS.VISIT_UNLOCKS);
  return visitGateForRows_(
    computerNo,stationNo,
    sheetObjects_(ss.getSheetByName(APP.SHEETS.VISITS)),
    unlockSh?sheetObjects_(unlockSh):[]
  );
}

function getVisitGate(token, stationNo) {
  const session=requireSession_(token); requirePermission_(session,'VISIT_CREATE');
  const station=findStation_(stationNo);
  if(!station||!station.active)throw new Error('المحطة غير موجودة أو غير فعالة.');
  if(!stationAllowed_(session,station))throw new Error('المحطة خارج نطاقك.');
  const gate=visitGateFor_(session.computerNo,station.stationNo);
  // V9: طلبات الزيارة المفتوحة لهذه المحطة لهذا المشرف
  gate.requests=(typeof openVisitRequestsFor_==='function')?openVisitRequestsFor_(session.computerNo,station.stationNo):[];
  return gate;
}

function assertVisitTypeAllowed_(session, stationNo, visitType) {
  visitType=String(visitType||'');
  const gate=visitGateFor_(session.computerNo,stationNo);
  if(gate.allowedVisitTypes.indexOf(visitType)!==-1)return gate;
  const state=gate.states[visitType];
  throw new Error(state&&state.blockedReason?state.blockedReason:(gate.message||'هذا النوع من الزيارات غير متاح لهذه المحطة الآن.'));
}

/* يُستدعى بعد حفظ الزيارة: يسجّل استهلاك الفتح الإداري للتدقيق.
   الفتح لا يُلغى هنا — ينتهي تلقائيًا لأن الدورة صارت منفَّذة. */
function markVisitUnlockUsed_(computerNo, stationNo, visitType, visitId, visitDate){
  try{
    if(visitType!=='BIWEEKLY'&&visitType!=='MONTHLY')return 0;
    const sh=getDb_().getSheetByName(APP.SHEETS.VISIT_UNLOCKS);
    if(!sh)return 0;
    const anchor=visitAnchorDate_(computerNo,stationNo);
    const cycle=visitCycleInfo_(visitType,anchor,visitDate||dateKey_(new Date()));
    const u=activeUnlockFor_(computerNo,stationNo,cycle.key);
    if(!u||String(u.CONSUMED_AT||''))return 0;
    return updateRowsByKeys_(sh,{UNLOCK_ID:String(u.UNLOCK_ID||'')},{CONSUMED_AT:new Date(),CONSUMED_BY_VISIT_ID:String(visitId||'')});
  }catch(e){return 0;}
}

/* الشهرية تغطي الزيارة الأسبوعية إذا كانت مستحقة/متأخرة في نفس اليوم.
   لا نرحّل الزيارة الأسبوعية المستقبلية غير المستحقة. */
function satisfyLowerPriorityPlans_(computerNo, stationNo, completedType, visitDate, visitId, approverComputerNo) {
  if(String(completedType)!=='MONTHLY')return 0;
  const sh=getDb_().getSheetByName(APP.SHEETS.VISIT_PLANS), rows=sh.getDataRange().getValues();
  if(rows.length<=1)return 0;
  const idx=headerMap_(rows[0]); let count=0;
  for(let r=1;r<rows.length;r++){
    if(String(rows[r][idx.COMPUTER_NO]||'')!==String(computerNo))continue;
    if(String(rows[r][idx.STATION_NO]||'')!==String(stationNo))continue;
    if(String(rows[r][idx.VISIT_TYPE]||'')!=='BIWEEKLY')continue;
    if(!toBool_(rows[r][idx.ACTIVE]))continue;
    const end=idx.END_DATE!==undefined?dateKeyFromValue_(rows[r][idx.END_DATE]):''; if(end&&visitDate>end)continue;
    const due=(idx.NEXT_DUE_DATE!==undefined?dateKeyFromValue_(rows[r][idx.NEXT_DUE_DATE]):'')||dateKeyFromValue_(rows[r][idx.START_DATE]);
    if(!due||due>visitDate)continue;
    let anchor=idx.ANCHOR_DATE!==undefined?dateKeyFromValue_(rows[r][idx.ANCHOR_DATE]):'';
    if(!anchor)anchor=visitDate;
    const patch={ANCHOR_DATE:anchor,LAST_VISIT_DATE:visitDate,NEXT_DUE_DATE:nextDueFromAnchor_(anchor,'BIWEEKLY',visitDate)};
    if(idx.LAST_SATISFIED_BY_TYPE!==undefined)patch.LAST_SATISFIED_BY_TYPE='MONTHLY';
    if(idx.LAST_SATISFIED_BY_VISIT_ID!==undefined)patch.LAST_SATISFIED_BY_VISIT_ID=String(visitId||'');
    if(approverComputerNo)patch.APPROVER_COMPUTER_NO=approverComputerNo;
    patchRowByNumber_(sh,r+1,patch); count++;
  }
  return count;
}

/* =====================================================================
   V9 — سلّم التصعيد: العدّ من انتهاء مهلة المعالجة
   ١٤ يومًا → مسؤول الإشراف · +١٤ → مسؤول تشغيل المنطقة · +٧ → مدير العمليات (النهاية)
   ===================================================================== */
const ESCALATION_ROLES_=Object.freeze({1:['SUPERVISION_MANAGER'],2:['REGION_MANAGER'],3:['OPERATIONS_MANAGER','OPERATIONS_DEPUTY']});
const ESCALATION_LABEL_=Object.freeze({1:'مسؤول الإشراف',2:'مسؤول تشغيل المنطقة',3:'مدير العمليات'});
function escalationThresholds_(){
  const l1=Math.max(1,Number(settingValue_('ESCALATION_L1_DAYS','14'))||14);
  const l2=l1+Math.max(1,Number(settingValue_('ESCALATION_L2_DAYS','14'))||14);
  const l3=l2+Math.max(1,Number(settingValue_('ESCALATION_L3_DAYS','7'))||7);
  return {1:l1,2:l2,3:l3};
}
function escalationTargetFor_(ownerNo,level){
  return nearestAboveWithRole_(ownerNo,ESCALATION_ROLES_[level]||[]);
}
function escalateIssues_(ss,now,today){
  const sh=ss.getSheetByName(APP.SHEETS.ISSUES), data=sh.getDataRange().getValues();
  if(data.length<=1)return 0;
  const idx=headerMap_(data[0].map(String));
  if(idx.ESCALATION_LEVEL===undefined||idx.DUE_DATE===undefined)return 0;
  const th=escalationThresholds_();
  let count=0;
  for(let r=1;r<data.length;r++){
    const row=data[r], status=String(row[idx.STATUS]||'');
    if(['CLOSED','CANCELED','PENDING_APPROVAL'].indexOf(status)!==-1)continue;
    const due=dateKeyFromValue_(row[idx.DUE_DATE]);
    if(!due||due>=today)continue;
    const over=daysBetweenKeys_(due,today);
    const target=over>=th[3]?3:(over>=th[2]?2:(over>=th[1]?1:0));
    const current=Number(row[idx.ESCALATION_LEVEL]||0);
    if(target<=current)continue;
    const owner=String(row[idx.OWNER_COMPUTER_NO]||row[idx.CREATED_BY]||'');
    const to=escalationTargetFor_(owner,target);
    const issueId=String(row[idx.ISSUE_ID]||''), station=String(row[idx.STATION_NAME]||row[idx.STATION_NO]||''), item=String(row[idx.ITEM_TEXT]||'');
    const patch={ESCALATION_LEVEL:target,LAST_UPDATED_AT:now};
    if(idx.ESCALATED_TO!==undefined)patch.ESCALATED_TO=to;
    if(idx.ESCALATED_AT!==undefined)patch.ESCALATED_AT=now;
    Object.keys(patch).forEach(function(k){if(idx[k]!==undefined)sh.getRange(r+1,idx[k]+1).setValue(patch[k]);});
    const lbl=ESCALATION_LABEL_[target];
    if(to)notify_(to,'ISSUE_ESCALATED','ملاحظة مصعَّدة إليك — '+lbl,'الملاحظة «'+item+'» في '+station+' تجاوزت مهلتها بـ'+over+' يومًا ولم تُغلق. صُعِّدت إليك للإجراء'+(target===3?' — وهذه المحطة الأخيرة في سلّم التصعيد.':'.'),issueId,'SYSTEM');
    if(owner)notify_(owner,'ISSUE_ESCALATED_INFO','صُعِّدت ملاحظتك إلى '+lbl,'الملاحظة «'+item+'» في '+station+' صُعِّدت إلى '+lbl+' لتجاوز المهلة.',issueId,'SYSTEM');
    const asst=assistantOf_(owner);if(asst&&asst!==to)notify_(asst,'ISSUE_ESCALATED_INFO','ملاحظة لدى مشرفك صُعِّدت إلى '+lbl,'الملاحظة «'+item+'» في '+station+' لدى المشرف '+owner+' صُعِّدت إلى '+lbl+'.',issueId,'SYSTEM');
    try{appendObject_(ss.getSheetByName(APP.SHEETS.ISSUE_UPDATES),{UPDATE_ID:'UPD-'+Utilities.getUuid(),ISSUE_ID:issueId,TIMESTAMP:now,COMPUTER_NO:'SYSTEM',ACTION:'ESCALATED_L'+target,COMMENT:'تصعيد تلقائي إلى '+lbl+(to?(' ('+to+')'):' (لم يُعثر على مستخدم بهذا الدور)'),STATUS_FROM:status,STATUS_TO:status});}catch(e){}
    count++;
  }
  if(count)invalidateSheet_(sh);
  return count;
}

/* تأخر الزيارة اليومية ١٥ يومًا لمحطة مسندة: تنبيه المشرف ومساعده ومدير العمليات — مرة لكل فترة تأخر. */
function alertLateDailyVisits_(ss,today){
  const limit=Math.max(1,Number(settingValue_('DAILY_LATE_DAYS','15'))||15);
  const users=sheetObjects_(ss.getSheetByName(APP.SHEETS.USERS)).filter(function(u){return toBool_(u.ACTIVE)&&normalizeRoleId_(u.ROLE_ID||u.ROLE||'')==='SUPERVISOR';});
  const lastDaily={},firstAny={};
  sheetObjects_(ss.getSheetByName(APP.SHEETS.VISITS)).forEach(function(v){
    if(String(v.APPROVAL_STATUS||'')==='REJECTED')return;
    const k=String(v.COMPUTER_NO||'')+'|'+String(v.STATION_NO||''), d=dateKeyFromValue_(v.DATE);
    if(!d)return;
    if(!firstAny[k]||d<firstAny[k])firstAny[k]=d;
    if(String(v.VISIT_TYPE||'')==='DAILY'&&(!lastDaily[k]||d>lastDaily[k]))lastDaily[k]=d;
  });
  const sent={};
  sheetObjects_(ss.getSheetByName(APP.SHEETS.NOTIFICATIONS)).forEach(function(n){if(String(n.TYPE||'')==='DAILY_LATE')sent[String(n.REFERENCE||'')]=true;});
  const ops=nearestAboveWithRole_('',['OPERATIONS_MANAGER','OPERATIONS_DEPUTY']);
  let count=0;
  users.forEach(function(u){
    const no=String(u.COMPUTER_NO||'');
    csvArray_(u.STATION_NOS).forEach(function(st){
      const k=no+'|'+st, last=lastDaily[k]||'', base=last||firstAny[k]||'';
      if(!base)return; // لم يزر المحطة قط — لا مرجع زمني بعد
      const gap=daysBetweenKeys_(base,today);
      if(gap<limit)return;
      const ref='DAILY_LATE|'+no+'|'+st+'|'+(last||'none');
      if(sent[ref])return;
      const station=findStation_(st), name=station?station.stationName:('محطة '+st);
      const body='المحطة '+name+' #'+st+' لم تُسجَّل لها زيارة يومية منذ '+gap+' يومًا'+(last?(' (آخر يومية '+last+')'):'')+'.';
      notify_(no,'DAILY_LATE','تأخر الزيارة اليومية',body,ref,'SYSTEM');
      const asst=assistantOf_(no);if(asst)notify_(asst,'DAILY_LATE','مشرفك تأخر في الزيارة اليومية','المشرف '+String(u.NAME||no)+': '+body,ref,'SYSTEM');
      if(ops&&ops!==asst)notify_(ops,'DAILY_LATE','تأخر زيارة يومية','المشرف '+String(u.NAME||no)+': '+body,ref,'SYSTEM');
      sent[ref]=true;count++;
    });
  });
  return count;
}

function ensureWorkflowTrigger_(){
  try{
    const found=ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='runWorkflowMonitor';});
    if(!found)ScriptApp.newTrigger('runWorkflowMonitor').timeBased().everyHours(1).create();
  }catch(e){Logger.log('Workflow trigger: '+e.message);}
}

function installWorkflowTrigger(){
  requireEditorRun_();
  ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='runWorkflowMonitor')ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('runWorkflowMonitor').timeBased().everyHours(1).create();
  return {ok:true,message:'تم تثبيت مراقب الزيارات والملاحظات كل ساعة.'};
}

function runWorkflowMonitor(){
  const ss=getDb_(), now=new Date(), today=dateKey_(now);
  const visitsSh=ss.getSheetByName(APP.SHEETS.VISITS), issuesSh=ss.getSheetByName(APP.SHEETS.ISSUES), plansSh=ss.getSheetByName(APP.SHEETS.VISIT_PLANS);
  const visits=visitsSh.getDataRange().getValues(), vi=headerMap_(visits[0]||[]);
  const issues=issuesSh.getDataRange().getValues(), ii=headerMap_(issues[0]||[]);
  const plans=plansSh.getDataRange().getValues(), pi=headerMap_(plans[0]||[]);
  let approvalAlerts=0,issueAlerts=0,missedAlerts=0;

  for(let r=1;r<visits.length;r++){
    if(String(visits[r][vi.APPROVAL_STATUS]||'')!=='PENDING')continue;
    const due=asDate_(visits[r][vi.APPROVAL_DUE_AT]); if(!due||due>now)continue;
    const last=asDate_(visits[r][vi.APPROVAL_REMINDER_AT]); if(last && now-last<86400000)continue;
    const approver=String(visits[r][vi.APPROVER_COMPUTER_NO]||'');
    if(approver){
      notify_(approver,'APPROVAL_OVERDUE','زيارة تنتظر اعتمادك','زيارة '+String(visits[r][vi.VISIT_ID]||'')+' للمحطة '+String(visits[r][vi.STATION_NAME]||visits[r][vi.STATION_NO]||'')+' تجاوزت مهلة الاعتماد.',String(visits[r][vi.VISIT_ID]||''),'SYSTEM');
      const manager=managerForUser_(approver); if(manager)notify_(manager,'APPROVAL_ESCALATION','تأخر اعتماد زيارة','يوجد اعتماد متأخر لدى '+approver+' للزيارة '+String(visits[r][vi.VISIT_ID]||''),String(visits[r][vi.VISIT_ID]||''),'SYSTEM');
    }
    if(vi.APPROVAL_REMINDER_AT!==undefined)visitsSh.getRange(r+1,vi.APPROVAL_REMINDER_AT+1).setValue(now);
    approvalAlerts++;
  }

  for(let r=1;r<issues.length;r++){
    const status=String(issues[r][ii.STATUS]||'');
    if(['CLOSED','CANCELED','PENDING_APPROVAL'].indexOf(status)!==-1)continue;
    const due=dateKeyFromValue_(issues[r][ii.DUE_DATE]); if(!due||due>=today)continue;
    const last=asDate_(issues[r][ii.OVERDUE_NOTIFIED_AT]); if(last && now-last<86400000)continue;
    const owner=String(issues[r][ii.OWNER_COMPUTER_NO]||issues[r][ii.CREATED_BY]||'');
    const visitId=String(issues[r][ii.VISIT_ID]||''), station=String(issues[r][ii.STATION_NAME]||issues[r][ii.STATION_NO]||'');
    if(status==='AWAITING_VERIFICATION'){
      const v=findVisitObjectById_(visitId); const ap=v?String(v.APPROVER_COMPUTER_NO||''):'';
      if(ap)notify_(ap,'ISSUE_VERIFY_OVERDUE','معالجة تنتظر التحقق','المشرف رفع معالجة للملاحظة '+String(issues[r][ii.ISSUE_ID]||'')+' في '+station+' وتحتاج تحققك.',String(issues[r][ii.ISSUE_ID]||''),'SYSTEM');
    }else{
      if(ii.STATUS!==undefined)issuesSh.getRange(r+1,ii.STATUS+1).setValue('OVERDUE');
      if(owner)notify_(owner,'ISSUE_OVERDUE','ملاحظة تجاوزت المهلة','الزيارة '+visitId+' بتاريخ '+(function(){const vv=findVisitObjectById_(visitId);return vv?dateKeyFromValue_(vv.DATE):'';})()+' — '+station+' — الملاحظة: '+String(issues[r][ii.ITEM_TEXT]||'')+' انتهت مهلة معالجتها.',String(issues[r][ii.ISSUE_ID]||''),'SYSTEM');
      const v=findVisitObjectById_(visitId); const ap=v?String(v.APPROVER_COMPUTER_NO||''):'';
      if(ap)notify_(ap,'ISSUE_OVERDUE_APPROVER','ملاحظة متأخرة لدى مشرف','الزيارة '+visitId+' — '+station+' — لم تُغلق الملاحظة ضمن المهلة.',String(issues[r][ii.ISSUE_ID]||''),'SYSTEM');
    }
    if(ii.OVERDUE_NOTIFIED_AT!==undefined)issuesSh.getRange(r+1,ii.OVERDUE_NOTIFIED_AT+1).setValue(now);
    issueAlerts++;
  }

  for(let r=1;r<plans.length;r++){
    if(!toBool_(plans[r][pi.ACTIVE]))continue;
    const end=pi.END_DATE!==undefined?dateKeyFromValue_(plans[r][pi.END_DATE]):''; if(end&&today>end)continue;
    const due=(pi.NEXT_DUE_DATE!==undefined?dateKeyFromValue_(plans[r][pi.NEXT_DUE_DATE]):'') || dateKeyFromValue_(plans[r][pi.START_DATE]);
    if(!due)continue;
    const grace=Number((pi.GRACE_DAYS!==undefined?plans[r][pi.GRACE_DAYS]:'')||settingValue_('PLAN_GRACE_DAYS','0'));
    const alertAfter=dateAddDaysKey_(due,grace);
    if(today<=alertAfter)continue;
    const key=due+'|'+String(plans[r][pi.VISIT_TYPE]||'');
    if(pi.LAST_MISSED_ALERT_KEY!==undefined && String(plans[r][pi.LAST_MISSED_ALERT_KEY]||'')===key)continue;
    const sup=String(plans[r][pi.COMPUTER_NO]||''), st=String(plans[r][pi.STATION_NO]||''), typ=String(plans[r][pi.VISIT_TYPE]||'');
    const station=findStation_(st); const ap=(pi.APPROVER_COMPUTER_NO!==undefined?String(plans[r][pi.APPROVER_COMPUTER_NO]||''):'') || resolveApproverForSupervisor_(sup,station);
    notify_(sup,'VISIT_MISSED','زيارة مقررة متأخرة','المحطة '+st+' — '+String(APP.VISIT_TYPES[typ]||typ)+' كانت مستحقة بتاريخ '+due+'.',String(plans[r][pi.PLAN_ID]||''),'SYSTEM');
    if(ap)notify_(ap,'SUPERVISOR_MISSED_VISIT','مشرف لم ينفذ زيارة مقررة','المشرف '+sup+' لم ينفذ زيارة '+String(APP.VISIT_TYPES[typ]||typ)+' للمحطة '+st+' المستحقة '+due+'.',String(plans[r][pi.PLAN_ID]||''),'SYSTEM');
    if(pi.LAST_MISSED_ALERT_KEY!==undefined)plansSh.getRange(r+1,pi.LAST_MISSED_ALERT_KEY+1).setValue(key);
    missedAlerts++;
  }
  // V9
  let escalations=0,dailyLate=0;
  try{escalations=escalateIssues_(ss,now,today);}catch(e){Logger.log('escalateIssues_: '+e.message);}
  try{dailyLate=alertLateDailyVisits_(ss,today);}catch(e){Logger.log('alertLateDailyVisits_: '+e.message);}
  invalidateAllSheetCache_();
  Logger.log(JSON.stringify({approvalAlerts:approvalAlerts,issueAlerts:issueAlerts,missedAlerts:missedAlerts,escalations:escalations,dailyLate:dailyLate}));
  return {ok:true,approvalAlerts:approvalAlerts,issueAlerts:issueAlerts,missedAlerts:missedAlerts,escalations:escalations,dailyLate:dailyLate};
}

function migrateWorkflowData_(){
  const ss=getDb_(), visitsSh=ss.getSheetByName(APP.SHEETS.VISITS), issuesSh=ss.getSheetByName(APP.SHEETS.ISSUES), plansSh=ss.getSheetByName(APP.SHEETS.VISIT_PLANS);
  const v=visitsSh.getDataRange().getValues(), vi=headerMap_(v[0]||[]), sla=Number(settingValue_('APPROVAL_SLA_HOURS','48'));
  for(let r=1;r<v.length;r++){
    const no=String(v[r][vi.COMPUTER_NO]||''), st=String(v[r][vi.STATION_NO]||''), ap=vi.APPROVER_COMPUTER_NO!==undefined?String(v[r][vi.APPROVER_COMPUTER_NO]||''):'';
    const patch={};
    // V8.2.1: يُصلح أيضًا الزيارات المسندة إلى منفّذها نفسه (كانت تبقى معلّقة بلا معتمِد).
    if(!ap||ap===no)patch.APPROVER_COMPUTER_NO=resolveApproverForSupervisor_(no,findStation_(st));
    if(vi.SUBMITTED_AT!==undefined&&!v[r][vi.SUBMITTED_AT])patch.SUBMITTED_AT=v[r][vi.COMPLETED_AT]||new Date();
    if(String(v[r][vi.APPROVAL_STATUS]||'PENDING')==='PENDING'&&vi.APPROVAL_DUE_AT!==undefined&&!v[r][vi.APPROVAL_DUE_AT])patch.APPROVAL_DUE_AT=dateTimeAddHours_(v[r][vi.COMPLETED_AT]||new Date(),sla);
    if(vi.WORKFLOW_STATUS!==undefined&&!v[r][vi.WORKFLOW_STATUS])patch.WORKFLOW_STATUS=String(v[r][vi.APPROVAL_STATUS]||'PENDING')==='APPROVED'?(Number(v[r][vi.FAIL_COUNT]||0)>0?'FOLLOW_UP':'CLOSED'):(String(v[r][vi.APPROVAL_STATUS]||'PENDING')==='REJECTED'?'REJECTED':'PENDING_APPROVAL');
    if(Object.keys(patch).length)patchRowByNumber_(visitsSh,r+1,patch);
  }
  const checklist=sheetObjects_(ss.getSheetByName(APP.SHEETS.CHECKLIST)), cm={};checklist.forEach(function(x){cm[String(x.ITEM_ID||'')]=x;});
  const issues=issuesSh.getDataRange().getValues(), ii=headerMap_(issues[0]||[]);
  for(let r=1;r<issues.length;r++){
    const patch={}, item=cm[String(issues[r][ii.ITEM_ID]||'')]||{},days=Math.max(1,Number((ii.DUE_DAYS!==undefined?issues[r][ii.DUE_DAYS]:'')||item.REMEDIATION_DAYS||settingValue_('ISSUE_DEFAULT_REMEDIATION_DAYS','7')));
    if(ii.DUE_DAYS!==undefined&&!issues[r][ii.DUE_DAYS])patch.DUE_DAYS=days;
    const visit=findVisitObjectById_(String(issues[r][ii.VISIT_ID]||''));
    if(visit&&String(visit.APPROVAL_STATUS||'')==='APPROVED'){
      if(String(issues[r][ii.STATUS]||'')==='PENDING_APPROVAL'||!String(issues[r][ii.STATUS]||''))patch.STATUS='OPEN';
      if(ii.APPROVED_AT!==undefined&&!issues[r][ii.APPROVED_AT])patch.APPROVED_AT=visit.APPROVED_AT||new Date();
      if(ii.DUE_DATE!==undefined&&!issues[r][ii.DUE_DATE])patch.DUE_DATE=dateAddDaysKey_(dateKeyFromValue_(visit.APPROVED_AT)||dateKey_(new Date()),days);
    }
    if(Object.keys(patch).length)patchRowByNumber_(issuesSh,r+1,patch);
  }
  const plans=plansSh.getDataRange().getValues(), pi=headerMap_(plans[0]||[]);
  for(let r=1;r<plans.length;r++){
    const patch={}, sup=String(plans[r][pi.COMPUTER_NO]||''), st=String(plans[r][pi.STATION_NO]||'');
    const planAp=pi.APPROVER_COMPUTER_NO!==undefined?String(plans[r][pi.APPROVER_COMPUTER_NO]||''):'';
    if(pi.APPROVER_COMPUTER_NO!==undefined&&(!planAp||planAp===sup))patch.APPROVER_COMPUTER_NO=resolveApproverForSupervisor_(sup,findStation_(st));
    if(pi.NEXT_DUE_DATE!==undefined&&!plans[r][pi.NEXT_DUE_DATE])patch.NEXT_DUE_DATE=dateKeyFromValue_(plans[r][pi.START_DATE]);
    if(pi.GRACE_DAYS!==undefined&&plans[r][pi.GRACE_DAYS]==='')patch.GRACE_DAYS=Number(settingValue_('PLAN_GRACE_DAYS','0'));
    // V8.1: تحويل دورة BIWEEKLY القديمة إلى أسبوعية (7 أيام) مع الحفاظ على مرساة أول زيارة.
    if(String(plans[r][pi.VISIT_TYPE]||'')==='BIWEEKLY' && pi.ANCHOR_DATE!==undefined){
      const anchor=dateKeyFromValue_(plans[r][pi.ANCHOR_DATE]);
      const last=pi.LAST_VISIT_DATE!==undefined?dateKeyFromValue_(plans[r][pi.LAST_VISIT_DATE]):'';
      if(anchor)patch.NEXT_DUE_DATE=nextDueFromAnchor_(anchor,'BIWEEKLY',last||anchor);
    }
    if(Object.keys(patch).length)patchRowByNumber_(plansSh,r+1,patch);
  }
  return {ok:true};
}
