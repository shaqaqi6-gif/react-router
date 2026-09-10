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

/* =========================================================
   V9.1: إسناد المحطات المباشر — بلا طلبات ولا اعتماد
   مساعد الإشراف يضع المحطات لمشرفيه مباشرة، وينتقل المشرف تلقائيًا تحت اسم
   المساعد الذي أسند له. مدير النظام ومدير العمليات يستطيعان الإسناد أيضًا
   مع اختيار المساعد عند الحاجة.
   ========================================================= */
const STATION_ASSIGN_ROLES_=Object.freeze(['APPROVAL_ASSISTANT','SYSTEM_ADMIN','OPERATIONS_MANAGER','OPERATIONS_DEPUTY']);
function requireStationAssigner_(s){
  if(STATION_ASSIGN_ROLES_.indexOf(s.roleId)===-1)throw new Error('إسناد المحطات لمساعد الإشراف أو مدير العمليات أو مدير النظام فقط.');
}
function getStationAssignmentPanel(token){
  const s=requireSession_(token);requireStationAssigner_(s);
  const users=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.USERS)).filter(function(u){return toBool_(u.ACTIVE);});
  const byNo={};users.forEach(function(u){byNo[String(u.COMPUTER_NO||'')]=u;});
  const supervisors=users.filter(function(u){return normalizeRoleId_(u.ROLE_ID||u.ROLE||'')==='SUPERVISOR';}).map(function(u){
    const no=String(u.COMPUTER_NO||''),asst=String(u.APPROVER_COMPUTER_NO||''),au=byNo[asst];
    const nos=csvArray_(u.STATION_NOS);
    const mine=asst===s.computerNo||!asst||s.roleId!=='APPROVAL_ASSISTANT';
    return{computerNo:no,name:String(u.NAME||''),phone:mine?String(u.PHONE||''):'',assistantComputerNo:asst,assistantName:au?String(au.NAME||''):'',
      isMine:asst===s.computerNo,unassigned:!asst,
      stations:nos.map(function(x){const st=findStation_(x);return{stationNo:x,stationName:st?st.stationName:('محطة '+x),region:st?st.region:''};})};
  }).sort(function(a,b){const ra=a.isMine?0:(a.unassigned?1:2),rb=b.isMine?0:(b.unassigned?1:2);if(ra!==rb)return ra-rb;return a.name.localeCompare(b.name,'ar');});
  const assistants=users.filter(function(u){return normalizeRoleId_(u.ROLE_ID||u.ROLE||'')==='APPROVAL_ASSISTANT';}).map(function(u){return{computerNo:String(u.COMPUTER_NO||''),name:String(u.NAME||'')};});
  // من يملك كل محطة الآن (لكشف التعارض قبل الحفظ)
  const owners={};supervisors.forEach(function(sp){sp.stations.forEach(function(st){owners[st.stationNo]=sp.computerNo;});});
  return {me:{computerNo:s.computerNo,name:s.name,roleId:s.roleId,isAssistant:s.roleId==='APPROVAL_ASSISTANT'},supervisors:supervisors,assistants:assistants,owners:owners};
}
/* يستبدل قائمة محطات المشرف كاملة بالقائمة المرسلة، ويجعله تحت المساعد المُسنِد.
   المحطة المسندة لمشرف آخر تُنقل منه (نقل مباشر) وتُسجَّل في سجل الإسناد. */
function assignStationsToSupervisor(token,supervisorComputerNo,stationNos,assistantComputerNo){
  const s=requireSession_(token);requireStationAssigner_(s);
  supervisorComputerNo=limitText_(normalizeText_(supervisorComputerNo),32);
  const su=findUserByComputerNo_(supervisorComputerNo);
  if(!su||!toBool_(su.ACTIVE)||normalizeRoleId_(su.ROLE_ID||su.ROLE||'')!=='SUPERVISOR')throw new Error('المشرف غير موجود أو غير نشط.');
  // V9.6 أمان: مساعد الإشراف يسند لمشرفيه أو لمشرف بلا مساعد فقط؛ نقل مشرف من مساعد آخر لمدير العمليات/مدير النظام
  const curAsst=String(su.APPROVER_COMPUTER_NO||'');
  if(s.roleId==='APPROVAL_ASSISTANT'&&curAsst&&curAsst!==s.computerNo)throw new Error('هذا المشرف تحت مساعد إشراف آخر — نقله بينكما من مدير العمليات.');
  const wanted=[];const seen={};
  (Array.isArray(stationNos)?stationNos:csvArray_(stationNos)).forEach(function(x){
    const no=limitText_(normalizeText_(x),40);if(!no||seen[no])return;
    const st=findStation_(no);if(!st)throw new Error('المحطة '+no+' غير موجودة.');
    seen[no]=true;wanted.push(no);
  });
  if(wanted.length>200)throw new Error('الحد الأقصى 200 محطة للمشرف الواحد.');
  // المساعد الذي سيصبح المشرف تحته
  let asst='';
  if(s.roleId==='APPROVAL_ASSISTANT')asst=s.computerNo;
  else{
    asst=limitText_(normalizeText_(assistantComputerNo),32)||String(su.APPROVER_COMPUTER_NO||'');
    if(asst){const au=findUserByComputerNo_(asst);if(!au||!toBool_(au.ACTIVE)||normalizeRoleId_(au.ROLE_ID||au.ROLE||'')!=='APPROVAL_ASSISTANT')throw new Error('مساعد الإشراف المحدد غير موجود أو غير نشط.');}
  }
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const ss=getDb_(),ush=ss.getSheetByName(APP.SHEETS.USERS),now=new Date();
    const before=csvArray_(su.STATION_NOS);
    // انزع المحطات المنقولة من مشرفين آخرين
    const moved=[];
    sheetObjects_(ush).forEach(function(u){
      const no=String(u.COMPUTER_NO||'');if(no===supervisorComputerNo)return;
      if(normalizeRoleId_(u.ROLE_ID||u.ROLE||'')!=='SUPERVISOR')return;
      const cur=csvArray_(u.STATION_NOS),keep=cur.filter(function(x){return wanted.indexOf(x)===-1;});
      if(keep.length!==cur.length&&s.roleId==='APPROVAL_ASSISTANT'&&String(u.APPROVER_COMPUTER_NO||'')!==s.computerNo&&String(u.APPROVER_COMPUTER_NO||'')!=='')throw new Error('المحطة '+cur.filter(function(x){return wanted.indexOf(x)!==-1;})[0]+' مسندة لمشرف تحت مساعد آخر — نقلها من مدير العمليات.');
      if(keep.length!==cur.length){updateRowsByKeys_(ush,{COMPUTER_NO:no},{STATION_NOS:keep.join(','),UPDATED_AT:now});moved.push({from:no,stations:cur.filter(function(x){return wanted.indexOf(x)!==-1;})});clearSupervisorStationMemo_(no);}
    });
    const patch={STATION_NOS:wanted.join(','),SCOPE_MODE:'STATIONS',UPDATED_AT:now};
    if(asst)patch.APPROVER_COMPUTER_NO=asst;
    updateRowsByKeys_(ush,{COMPUTER_NO:supervisorComputerNo},patch);
    clearSupervisorStationMemo_(supervisorComputerNo);
    // سجل الإسناد: صف معتمد لكل محطة أُضيفت (للتتبع فقط)
    const ash=ss.getSheetByName(APP.SHEETS.STATION_ASSIGNMENTS);
    if(ash){wanted.filter(function(x){return before.indexOf(x)===-1;}).forEach(function(x){
      appendObject_(ash,{ASSIGNMENT_ID:'ASG-'+Utilities.getUuid().slice(0,8),SUPERVISOR_COMPUTER_NO:supervisorComputerNo,STATION_NO:x,REQUESTED_BY:s.computerNo,REQUESTED_AT:now,STATUS:'APPROVED',APPROVED_BY:s.computerNo,APPROVED_AT:now,DECISION_COMMENT:'إسناد مباشر'});
    });}
    invalidateSheet_(APP.SHEETS.USERS);Object.keys(MEMO_).forEach(function(k){if(k.indexOf('TEAM_')===0)delete MEMO_[k];});
    audit_(s.computerNo,'STATION_ASSIGN_DIRECT',supervisorComputerNo,'stations='+wanted.join(',')+(asst?(' assistant='+asst):'')+(moved.length?(' moved='+JSON.stringify(moved)):''));
    const added=wanted.filter(function(x){return before.indexOf(x)===-1;}),removed=before.filter(function(x){return wanted.indexOf(x)===-1;});
    if(added.length||removed.length)notify_(supervisorComputerNo,'STATIONS_ASSIGNED','تحديث محطاتك','أصبحت محطاتك '+wanted.length+' محطة'+(added.length?(' — أُضيفت: '+added.join('، ')):'')+(removed.length?(' — أُزيلت: '+removed.join('، ')):'')+'.','',s.computerNo);
    moved.forEach(function(m){notify_(m.from,'STATIONS_ASSIGNED','نُقلت محطات من قائمتك','نُقلت المحطات '+m.stations.join('، ')+' إلى مشرف آخر.','',s.computerNo);});
    return {ok:true,stations:wanted,added:added,removed:removed,moved:moved,assistantComputerNo:asst};
  }finally{lock.releaseLock();}
}

/* =========================================================
   V9.2: الهيكل الإداري — شجرة واضحة بلا تخمين
   مدير النظام (ومدير العمليات) يرى كل المستخدمين في مستوياتهم، ويحدد
   «مَن فوق مَن» من قائمة منسدلة، ويرى التحذيرات: مشرف بلا مساعد، مساعد
   بلا مسؤول، مشرف بلا محطات… المشرف يُربط بمساعده تلقائيًا عند إسناد
   المحطات، فلا يحتاج ضبطًا يدويًا.
   ========================================================= */
const ORG_ROLES_=Object.freeze(['OPERATIONS_MANAGER','OPERATIONS_DEPUTY','REGION_MANAGER','SUPERVISION_MANAGER','APPROVAL_ASSISTANT','SUPERVISOR']);
const ORG_PARENT_ROLE_=Object.freeze({SUPERVISOR:['APPROVAL_ASSISTANT'],APPROVAL_ASSISTANT:['SUPERVISION_MANAGER','REGION_MANAGER','OPERATIONS_MANAGER'],SUPERVISION_MANAGER:['REGION_MANAGER','OPERATIONS_MANAGER'],REGION_MANAGER:['OPERATIONS_MANAGER','OPERATIONS_DEPUTY'],OPERATIONS_DEPUTY:['OPERATIONS_MANAGER'],OPERATIONS_MANAGER:[]});
function requireOrgEditor_(s){if(['SYSTEM_ADMIN','OPERATIONS_MANAGER'].indexOf(s.roleId)===-1)throw new Error('الهيكل الإداري لمدير النظام ومدير العمليات فقط.');}
function getOrgStructure(token){
  const s=requireSession_(token);requireOrgEditor_(s);
  const users=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.USERS)).filter(function(u){return toBool_(u.ACTIVE);});
  const byNo={};users.forEach(function(u){byNo[String(u.COMPUTER_NO||'')]=u;});
  const nodes=users.map(function(u){
    const rid=normalizeRoleId_(u.ROLE_ID||u.ROLE||''),no=String(u.COMPUTER_NO||''),parent=parentOfUser_(u),pu=byNo[parent];
    return{computerNo:no,name:String(u.NAME||''),roleId:rid,roleName:getRoleName_(rid),parent:parent,parentName:pu?String(pu.NAME||''):'',
      parentRole:pu?normalizeRoleId_(pu.ROLE_ID||pu.ROLE||''):'',stationCount:rid==='SUPERVISOR'?csvArray_(u.STATION_NOS).length:0,phone:String(u.PHONE||'')};
  });
  const warnings=[];
  nodes.forEach(function(n){
    if(n.roleId==='SYSTEM_ADMIN')return;
    const want=ORG_PARENT_ROLE_[n.roleId];
    if(!want)return;
    if(want.length&&!n.parent)warnings.push({computerNo:n.computerNo,name:n.name,roleId:n.roleId,kind:'NO_PARENT',text:(n.roleId==='SUPERVISOR'?'مشرف بلا مساعد إشراف — أسند له محطات من صفحة «إسناد المحطات» وسيُربط تلقائيًا':'بلا رئيس مباشر — اختر من فوقه من القائمة')});
    else if(n.parent&&!byNo[n.parent])warnings.push({computerNo:n.computerNo,name:n.name,roleId:n.roleId,kind:'PARENT_MISSING',text:'الرئيس المحدد ('+n.parent+') غير موجود أو غير نشط'});
    else if(n.parent&&want.indexOf(n.parentRole)===-1)warnings.push({computerNo:n.computerNo,name:n.name,roleId:n.roleId,kind:'PARENT_ROLE',text:'الرئيس المحدد دوره «'+getRoleName_(n.parentRole)+'» وليس من المستويات المتوقعة'});
    if(n.roleId==='SUPERVISOR'&&!n.stationCount)warnings.push({computerNo:n.computerNo,name:n.name,roleId:n.roleId,kind:'NO_STATIONS',text:'مشرف بلا محطات'});
    if(n.roleId==='APPROVAL_ASSISTANT'&&!nodes.some(function(x){return x.roleId==='SUPERVISOR'&&x.parent===n.computerNo;}))warnings.push({computerNo:n.computerNo,name:n.name,roleId:n.roleId,kind:'NO_TEAM',text:'مساعد إشراف بلا مشرفين'});
  });
  const counts={};ORG_ROLES_.forEach(function(r){counts[r]=nodes.filter(function(n){return n.roleId===r;}).length;});
  return {me:{computerNo:s.computerNo,roleId:s.roleId},nodes:nodes,warnings:warnings,counts:counts,roles:ORG_ROLES_.map(function(r){return{roleId:r,name:getRoleName_(r)};}),parentRoles:ORG_PARENT_ROLE_};
}
function setUserParent(token,computerNo,parentComputerNo){
  const s=requireSession_(token);requireOrgEditor_(s);
  computerNo=limitText_(normalizeText_(computerNo),32);parentComputerNo=limitText_(normalizeText_(parentComputerNo),32);
  const u=findUserByComputerNo_(computerNo);if(!u||!toBool_(u.ACTIVE))throw new Error('المستخدم غير موجود أو غير نشط.');
  const rid=normalizeRoleId_(u.ROLE_ID||u.ROLE||'');
  if(rid==='SYSTEM_ADMIN')throw new Error('مدير النظام لا يُربط بأحد.');
  if(computerNo===parentComputerNo)throw new Error('لا يمكن ربط المستخدم بنفسه.');
  if(parentComputerNo){
    const p=findUserByComputerNo_(parentComputerNo);if(!p||!toBool_(p.ACTIVE))throw new Error('الرئيس المحدد غير موجود أو غير نشط.');
    const prid=normalizeRoleId_(p.ROLE_ID||p.ROLE||'');
    if((ORG_PARENT_ROLE_[rid]||[]).indexOf(prid)===-1)throw new Error('لا يمكن ربط «'+getRoleName_(rid)+'» بـ«'+getRoleName_(prid)+'».');
    // منع الحلقات: الرئيس لا يكون من تحت هذا المستخدم
    let cur=parentComputerNo,guard=0;while(cur&&guard++<20){if(cur===computerNo)throw new Error('هذا الربط يُنشئ حلقة في الهيكل.');const cu=findUserByComputerNo_(cur);cur=cu?parentOfUser_(cu):'';}
  }
  const sh=getDb_().getSheetByName(APP.SHEETS.USERS),now=new Date();
  const patch=rid==='SUPERVISOR'?{APPROVER_COMPUTER_NO:parentComputerNo,UPDATED_AT:now}:{MANAGER_COMPUTER_NO:parentComputerNo,UPDATED_AT:now};
  updateRowsByKeys_(sh,{COMPUTER_NO:computerNo},patch);
  invalidateSheet_(APP.SHEETS.USERS);Object.keys(MEMO_).forEach(function(k){if(k.indexOf('TEAM_')===0)delete MEMO_[k];});
  audit_(s.computerNo,'ORG_SET_PARENT',computerNo,'parent='+parentComputerNo);
  return {ok:true};
}
