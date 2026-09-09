/* =====================================================================
   Supervisors.gs — لوحة أداء المشرفين للمدير/المساعد/مدير المنطقة
   V9.0.0 · شركة الدريس
   ===================================================================== */

/* V9: المشرف مرئي لمن هو في فريقه (الهيكل الذي يحدده مدير النظام)، ولمن يرى الكل. */
function supervisorVisibleTo_(session,u){
  if(!u||normalizeRoleId_(u.ROLE_ID||u.ROLE||'')!=='SUPERVISOR')return false;
  if(seesAll_(session))return true;
  const no=String(u.COMPUTER_NO||'');
  if(String(u.APPROVER_COMPUTER_NO||'')===session.computerNo||String(u.MANAGER_COMPUTER_NO||'')===session.computerNo)return true;
  if(usesTeamScope_(session)){
    if(teamOf_(session.computerNo).size)return inTeam_(session,no);
    return false; // الهيكل لم يُضبط بعد لهذا المستخدم → لا يرى أحدًا حتى يضبطه مدير النظام
  }
  if(hasPermission_(session,'DASHBOARD_VIEW_ALL')||hasPermission_(session,'VISIT_VIEW_ALL'))return true;
  const regs=csvArray_(u.REGIONS); if(!regs.length&&scopeIsOpen_(session))return true;
  return regs.some(function(r){return session.regions.indexOf(r)!==-1;});
}

function getSupervisors(token,filters){
  const session=requireSession_(token);requirePermissionAny_(session,['DASHBOARD_VIEW_ALL','DASHBOARD_VIEW_SCOPE','VISIT_VIEW_ALL','VISIT_VIEW_SCOPE','VISIT_APPROVE']);filters=filters||{};
  const onlyNo=normalizeText_(filters.computerNo);
  const ss=getDb_(),users=sheetObjects_(ss.getSheetByName(APP.SHEETS.USERS)).filter(function(u){
    if(onlyNo&&String(u.COMPUTER_NO||'')!==onlyNo)return false;
    if(!filters.includeInactive&&!toBool_(u.ACTIVE))return false;
    return supervisorVisibleTo_(session,u);
  });
  const visits=sheetObjects_(ss.getSheetByName(APP.SHEETS.VISITS)),issues=sheetObjects_(ss.getSheetByName(APP.SHEETS.ISSUES)),plans=sheetObjects_(ss.getSheetByName(APP.SHEETS.VISIT_PLANS)).filter(function(p){return toBool_(p.ACTIVE);});
  // V8.1.4.7: تجميع السجلات حسب رقم المشرف مرة واحدة بدل إعادة مسح كل الزيارات والملاحظات لكل مشرف.
  const visitsByNo={},issuesByNo={},plansByNo={};
  visits.forEach(function(v){const k=String(v.COMPUTER_NO||'');(visitsByNo[k]||(visitsByNo[k]=[])).push(v);});
  issues.forEach(function(x){const k=String(x.CREATED_BY||x.OWNER_COMPUTER_NO||'');(issuesByNo[k]||(issuesByNo[k]=[])).push(x);});
  plans.forEach(function(p){const k=String(p.COMPUTER_NO||'');(plansByNo[k]||(plansByNo[k]=[])).push(p);});
  const start=filters.startDate||dateKey_(new Date(new Date().getFullYear(),new Date().getMonth(),1)),end=filters.endDate||dateKey_(new Date()),today=dateKey_(new Date());
  return users.map(function(u){
    const no=String(u.COMPUTER_NO||''),uv=(visitsByNo[no]||[]).filter(function(v){return dateInRange_(dateKeyFromValue_(v.DATE),start,end);}),ui=issuesByNo[no]||[],up=plansByNo[no]||[];
    const assigned={};up.forEach(function(p){assigned[String(p.STATION_NO||'')]=true;});csvArray_(u.STATION_NOS).forEach(function(x){assigned[x]=true;});
    let required=0;up.forEach(function(p){required+=requiredOccurrences_(p,start,end).length;});
    const approved=uv.filter(function(v){return String(v.APPROVAL_STATUS||'')==='APPROVED';}).length,pending=uv.filter(function(v){return String(v.APPROVAL_STATUS||'')==='PENDING';}).length,rejected=uv.filter(function(v){return String(v.APPROVAL_STATUS||'')==='REJECTED';}).length;
    const scores=uv.map(function(v){return Number(v.SCORE||0);}),avg=scores.length?round1_(scores.reduce(function(a,b){return a+b;},0)/scores.length):0;
    const open=ui.filter(function(x){return ['CLOSED','CANCELED'].indexOf(String(x.STATUS||''))===-1;}).length,closed=ui.filter(function(x){return String(x.STATUS||'')==='CLOSED';}).length,overdue=ui.filter(function(x){const d=dateKeyFromValue_(x.DUE_DATE);return d&&d<today&&['CLOSED','CANCELED','AWAITING_VERIFICATION'].indexOf(String(x.STATUS||''))===-1;}).length;
    const dueVerify=ui.filter(function(x){return String(x.STATUS||'')==='AWAITING_VERIFICATION';}).length;
    const missed=up.filter(function(p){const d=dateKeyFromValue_(p.NEXT_DUE_DATE)||dateKeyFromValue_(p.START_DATE);return d&&d<today;}).length;
    const gpsRows=uv.filter(function(v){return String(v.GPS_MATCH_STATUS||'')!=='';}),gpsMatch=gpsRows.length?round1_(gpsRows.filter(function(v){return String(v.GPS_MATCH_STATUS||'')==='MATCH';}).length/gpsRows.length*100):0;
    // V8.1.4.7: المقارنة بمفتاح التاريخ بتوقيت الرياض بدل الطوابع الزمنية الخام (كانت تُحسب أحياناً يوماً ناقصاً).
    const inTimeIssues=ui.filter(function(x){if(String(x.STATUS||'')!=='CLOSED')return false;const due=dateKeyFromValue_(x.DUE_DATE),closedAt=dateKeyFromValue_(x.CLOSED_AT);return !!due&&!!closedAt&&closedAt<=due;}).length;
    const asstNo=String(u.APPROVER_COMPUTER_NO||''), asstU=asstNo?findUserByComputerNo_(asstNo):null;
    return{computerNo:no,name:String(u.NAME||''),phone:String(u.PHONE||''),regions:csvArray_(u.REGIONS),approverComputerNo:asstNo,assistantName:asstU?String(asstU.NAME||asstNo):(asstNo||'بلا مساعد'),assignedStations:Object.keys(assigned).length,requiredVisits:required,visits:uv.length,approvedVisits:approved,pendingVisits:pending,rejectedVisits:rejected,missedVisits:missed,scheduleCompliance:required?round1_(Math.min(uv.length,required)/required*100):(uv.length?100:0),avgScore:avg,issuesTotal:ui.length,openIssues:open,closedIssues:closed,overdueIssues:overdue,awaitingVerification:dueVerify,issueClosureRate:ui.length?round1_(closed/ui.length*100):100,issuesClosedInTime:inTimeIssues,gpsMatchRate:gpsMatch};
  }).sort(function(a,b){return b.missedVisits-a.missedVisits||b.overdueIssues-a.overdueIssues||a.name.localeCompare(b.name,'ar');});
}

function getSupervisorDetail(token,computerNo,filters){
  const session=requireSession_(token);const user=userByNo_(computerNo);if(!supervisorVisibleTo_(session,user))throw new Error('المشرف خارج نطاقك.');filters=filters||{};
  // V8.1.4.7: نحسب مؤشرات هذا المشرف وحده بدل حساب كل المشرفين ثم تصفية واحد،
  // ونشمل الحسابات الموقوفة حتى لا تعود المؤشرات فارغة عند فتح ملف مشرف غير فعال.
  const metrics=getSupervisors(token,Object.assign({},filters,{computerNo:String(computerNo),includeInactive:true}))[0]||null;
  const allVisits=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISITS));
  const myVisits=allVisits.filter(function(v){return String(v.COMPUTER_NO||'')===String(computerNo);});
  const visits=myVisits.slice().sort(function(a,b){return sortKeyFromValue_(b.COMPLETED_AT).localeCompare(sortKeyFromValue_(a.COMPLETED_AT));}).slice(0,60).map(function(v){return visitListObjectForSession_(v,session);});
  const issues=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.ISSUES)).filter(function(x){return String(x.CREATED_BY||x.OWNER_COMPUTER_NO||'')===String(computerNo);}).sort(function(a,b){return sortKeyFromValue_(b.CREATED_AT).localeCompare(sortKeyFromValue_(a.CREATED_AT));}).slice(0,100).map(issueObject_);
  const plans=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.VISIT_PLANS)).filter(function(p){return toBool_(p.ACTIVE)&&String(p.COMPUTER_NO||'')===String(computerNo);}).map(function(p){const st=findStation_(p.STATION_NO)||{};return{planId:String(p.PLAN_ID||''),stationNo:String(p.STATION_NO||''),stationName:st.stationName||('محطة '+p.STATION_NO),visitType:String(p.VISIT_TYPE||''),anchorDate:dateKeyFromValue_(p.ANCHOR_DATE),lastVisitDate:dateKeyFromValue_(p.LAST_VISIT_DATE),nextDueDate:dateKeyFromValue_(p.NEXT_DUE_DATE)||dateKeyFromValue_(p.START_DATE)};});
  /* V8.2: حالة أنواع الزيارة لكل محطة مسندة للمشرف — تُحسب مرة واحدة من نفس البيانات المحمّلة،
     ليعرض المدير في نافذة واحدة ما هو مفتوح وما هو مغلق ومتى يُفتح، ويفتح ما يلزم. */
  const stationSet={};
  csvArray_(user.STATION_NOS).forEach(function(no){stationSet[String(no)]=true;});
  plans.forEach(function(p){if(p.stationNo)stationSet[String(p.stationNo)]=true;});
  const unlockSh=getDb_().getSheetByName(APP.SHEETS.VISIT_UNLOCKS);
  const unlockRows=unlockSh?sheetObjects_(unlockSh):[];
  const canManageUnlocks=hasPermission_(session,'VISIT_PLAN_MANAGE');
  const stationGates=Object.keys(stationSet).sort().map(function(no){
    const st=findStation_(no)||{};
    const gate=(typeof visitGateForRows_==='function')?visitGateForRows_(String(computerNo),no,myVisits,unlockRows):null;
    return{
      stationNo:no,
      stationName:st.stationName||('محطة '+no),
      region:st.region||'',
      inScope:!st.stationNo||stationAllowed_(session,st),
      anchorDate:gate?gate.anchorDate:'',
      allowedVisitTypes:gate?gate.allowedVisitTypes:['DAILY'],
      weekly:gate?gate.weekly:null,
      monthly:gate?gate.monthly:null
    };
  });
  return{
    profile:{computerNo:String(user.COMPUTER_NO||''),name:String(user.NAME||''),phone:String(user.PHONE||''),regions:csvArray_(user.REGIONS),approverComputerNo:String(user.APPROVER_COMPUTER_NO||'')},
    metrics:metrics,visits:visits,issues:issues,plans:plans,
    stationGates:stationGates,canManageUnlocks:canManageUnlocks
  };
}
