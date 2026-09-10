/* =====================================================================
   منصة الرقابة والزيارات الميدانية — Admin: لوحة القيادة، إدارة النظام، التقارير، التهيئة والترحيل
   V6.0 · شركة الدريس
   ===================================================================== */

/* =========================
   Executive dashboard
   ========================= */

function getAdminDashboard(token, filters) {
  const session = requireSession_(token);
  requirePermissionAny_(session, ['DASHBOARD_VIEW_ALL','DASHBOARD_VIEW_SCOPE']);
  filters = normalizeDashboardFilters_(filters || {});

  const ss = getDb_();
  const stationsAll = sheetObjects_(ss.getSheetByName(APP.SHEETS.STATIONS)).filter(function(r){ return toBool_(r.ACTIVE); });
  const usersAll = sheetObjects_(ss.getSheetByName(APP.SHEETS.USERS)).filter(function(r){ return toBool_(r.ACTIVE); });
  const visitsAll = sheetObjects_(ss.getSheetByName(APP.SHEETS.VISITS));
  const issuesAll = sheetObjects_(ss.getSheetByName(APP.SHEETS.ISSUES));
  const plansAll = sheetObjects_(ss.getSheetByName(APP.SHEETS.VISIT_PLANS)).filter(function(r){ return toBool_(r.ACTIVE); });

  const scopedStations = stationsAll.filter(function(r) {
    const s = stationObject_(r);
    return stationAllowed_(session, s) && filterStation_(s, filters);
  });
  const stationSet = {};
  scopedStations.forEach(function(s){ stationSet[String(s.STATION_NO || s.stationNo)] = true; });

  const visits = visitsAll.filter(function(v) {
    if (!visitAllowed_(session, v)) return false;
    if (!dateInRange_(dateKeyFromValue_(v.DATE), filters.startDate, filters.endDate)) return false;
    if (filters.region && String(v.REGION || '') !== filters.region) return false;
    if (filters.branch && String(v.BRANCH || '') !== filters.branch) return false;
    if (filters.supervisor && String(v.COMPUTER_NO || '') !== filters.supervisor) return false;
    if (filters.visitType && String(v.VISIT_TYPE || '') !== filters.visitType) return false;
    if (filters.stationNo && String(v.STATION_NO || '') !== filters.stationNo) return false;
    return true;
  });

  const issues = issuesAll.filter(function(x) {
    if (!issueAllowed_(session, x)) return false;
    const createdKey = dateKeyFromValue_(x.CREATED_AT);
    if (!dateInRange_(createdKey, filters.startDate, filters.endDate)) return false;
    if (filters.region && String(x.REGION || '') !== filters.region) return false;
    if (filters.branch && String(x.BRANCH || '') !== filters.branch) return false;
    if (filters.supervisor && String(x.CREATED_BY || '') !== filters.supervisor) return false;
    if (filters.stationNo && String(x.STATION_NO || '') !== filters.stationNo) return false;
    return true;
  });

  const users = usersAll.filter(function(u) {
    const roleId = normalizeRoleId_(u.ROLE_ID || u.ROLE || 'SUPERVISOR');
    return roleId === 'SUPERVISOR' && supervisorVisibleTo_(session,u);
  });

  // V8: الملاحظات المفتوحة قرار تشغيلي حالي؛ لا تختفي لمجرد أن تاريخ إنشائها قبل فلتر الفترة.
  const currentIssues = issuesAll.filter(function(x){
    if (!issueAllowed_(session, x)) return false;
    if (filters.region && String(x.REGION || '') !== filters.region) return false;
    if (filters.branch && String(x.BRANCH || '') !== filters.branch) return false;
    if (filters.supervisor && String(x.CREATED_BY || '') !== filters.supervisor) return false;
    if (filters.stationNo && String(x.STATION_NO || '') !== filters.stationNo) return false;
    return String(x.STATUS || '') !== 'CLOSED' && String(x.STATUS || '') !== 'CANCELED';
  });

  const totalVisits = visits.length;
  const avgScore = totalVisits ? round1_(visits.reduce(function(a,v){ return a + Number(v.SCORE || 0); },0) / totalVisits) : 0;
  const totalFails = visits.reduce(function(a,v){ return a + Number(v.FAIL_COUNT || 0); },0);
  const openIssues = currentIssues.length;
  const criticalOpen = currentIssues.filter(function(x){
    return String(x.STATUS || 'OPEN') !== 'CLOSED' && String(x.SEVERITY || '').toUpperCase() === 'CRITICAL';
  }).length;
  const resolvedIssues = issues.filter(function(x){ return String(x.STATUS || '') === 'CLOSED'; }).length;

  const planMetrics = calculatePlanMetrics_(plansAll, visitsAll, session, filters);
  const pendingApprovals = visits.filter(function(v){ return String(v.APPROVAL_STATUS||'PENDING')==='PENDING'; }).length;
  const awaitingVerification = currentIssues.filter(function(x){ return String(x.STATUS||'')==='AWAITING_VERIFICATION'; }).length;
  const overdueIssues = currentIssues.filter(function(x){
    if(['CLOSED','CANCELED'].indexOf(String(x.STATUS||''))!==-1) return false;
    const due=dateKeyFromValue_(x.DUE_DATE); return !!due && due < dateKey_(new Date());
  }).length;

  const byDay = {};
  visits.forEach(function(v) {
    const d = dateKeyFromValue_(v.DATE);
    if (!byDay[d]) byDay[d] = {date:d,visits:0,scoreSum:0,fails:0};
    byDay[d].visits++;
    byDay[d].scoreSum += Number(v.SCORE || 0);
    byDay[d].fails += Number(v.FAIL_COUNT || 0);
  });
  const trend = Object.keys(byDay).sort().map(function(k){
    const x = byDay[k];
    return {date:k,visits:x.visits,avgScore:x.visits ? round1_(x.scoreSum/x.visits) : 0,fails:x.fails};
  }).slice(-31);

  const cat = {};
  issues.forEach(function(x) {
    const k = String(x.CATEGORY || 'غير مصنف');
    if (!cat[k]) cat[k] = {category:k,total:0,open:0,critical:0};
    cat[k].total++;
    if (String(x.STATUS || 'OPEN') !== 'CLOSED') cat[k].open++;
    if (String(x.SEVERITY || '').toUpperCase() === 'CRITICAL') cat[k].critical++;
  });
  const topCategories = Object.keys(cat).map(function(k){return cat[k];})
    .sort(function(a,b){return b.total-a.total;}).slice(0,8);

  const regionMap = {};
  visits.forEach(function(v) {
    const k = String(v.REGION || 'غير محدد');
    if (!regionMap[k]) regionMap[k] = {region:k,visits:0,scoreSum:0,fails:0,stations:{}};
    regionMap[k].visits++;
    regionMap[k].scoreSum += Number(v.SCORE || 0);
    regionMap[k].fails += Number(v.FAIL_COUNT || 0);
    regionMap[k].stations[String(v.STATION_NO || '')] = true;
  });
  issues.forEach(function(x){
    const k = String(x.REGION || 'غير محدد');
    if (!regionMap[k]) regionMap[k] = {region:k,visits:0,scoreSum:0,fails:0,stations:{}};
    regionMap[k].issues = (regionMap[k].issues || 0) + 1;
    if (String(x.STATUS || 'OPEN') !== 'CLOSED') regionMap[k].openIssues = (regionMap[k].openIssues || 0) + 1;
  });
  const regions = Object.keys(regionMap).map(function(k){
    const x = regionMap[k];
    return {
      region:k, visits:x.visits, avgScore:x.visits ? round1_(x.scoreSum/x.visits) : 0,
      fails:x.fails, issues:x.issues||0, openIssues:x.openIssues||0,
      stationsVisited:Object.keys(x.stations).filter(Boolean).length
    };
  }).sort(function(a,b){ return b.visits-a.visits; });

  // V8.1.4.4: نبدأ من جميع حسابات المشرفين الفعالة، وليس من الزيارات فقط.
  // لذلك يظهر المشرف الجديد في "أداء المشرفين" حتى لو لم ينفذ أي زيارة بعد.
  const supervisorUsers = {};
  users.forEach(function(u){
    const no=String(u.COMPUTER_NO||'');
    if(!no)return;
    if(filters.supervisor && no!==filters.supervisor)return;
    if(filters.region || filters.branch){
      const regs=csvArray_(u.REGIONS), stNos=csvArray_(u.STATION_NOS);
      let match=!filters.region&&!filters.branch;
      if(filters.region && regs.indexOf(filters.region)!==-1)match=true;
      if(!match && stNos.length){
        match=stNos.some(function(no2){
          const st=findStation_(no2);if(!st)return false;
          if(filters.region && st.region!==filters.region)return false;
          if(filters.branch && st.branch!==filters.branch)return false;
          return true;
        });
      }
      if(!match)return;
    }
    supervisorUsers[no]=u;
  });

  const supMap = {};
  Object.keys(supervisorUsers).forEach(function(k){
    const u=supervisorUsers[k];
    supMap[k]={computerNo:k,name:String(u.NAME||k),visits:0,scoreSum:0,fails:0,stations:{},issues:0,openIssues:0};
  });
  visits.forEach(function(v) {
    const k = String(v.COMPUTER_NO || '');
    if (!k || !supervisorUsers[k]) return;
    const x=supMap[k];
    x.visits++;
    x.scoreSum += Number(v.SCORE || 0);
    x.fails += Number(v.FAIL_COUNT || 0);
    x.stations[String(v.STATION_NO||'')] = true;
  });
  issues.forEach(function(x){
    const k = String(x.CREATED_BY || '');
    if (!k || !supervisorUsers[k]) return;
    supMap[k].issues++;
    if (String(x.STATUS||'OPEN') !== 'CLOSED') supMap[k].openIssues++;
  });
  const supervisors = Object.keys(supMap).map(function(k){
    const x=supMap[k];
    return {
      computerNo:k,name:x.name,visits:x.visits,avgScore:x.visits?round1_(x.scoreSum/x.visits):0,
      fails:x.fails,issues:x.issues||0,openIssues:x.openIssues||0,
      stationsVisited:Object.keys(x.stations).filter(Boolean).length,
      isNew:x.visits===0
    };
  }).sort(function(a,b){
    // من عليه عمل يظهر أولاً، وبعده المشرفون الجدد حتى لا يختفوا من القائمة.
    return b.openIssues-a.openIssues || b.visits-a.visits || Number(b.isNew)-Number(a.isNew) || a.name.localeCompare(b.name,'ar');
  });

  const hotspotMap = {};
  issues.forEach(function(x){
    const k=String(x.STATION_NO||'');
    if(!k)return;
    if(!hotspotMap[k]) hotspotMap[k]={stationNo:k,stationName:String(x.STATION_NAME||''),region:String(x.REGION||''),total:0,open:0,critical:0};
    hotspotMap[k].total++;
    if(String(x.STATUS||'OPEN')!=='CLOSED')hotspotMap[k].open++;
    if(String(x.SEVERITY||'').toUpperCase()==='CRITICAL')hotspotMap[k].critical++;
  });
  const hotspots=Object.keys(hotspotMap).map(function(k){return hotspotMap[k];})
    .sort(function(a,b){return b.open-a.open || b.total-a.total;}).slice(0,12);

  const repeatMap = {};
  issues.forEach(function(x){
    const k=String(x.REPEAT_KEY || (String(x.STATION_NO||'')+'|'+String(x.ITEM_ID||'')));
    if(!k || k==='|')return;
    if(!repeatMap[k]) repeatMap[k]={key:k,stationNo:String(x.STATION_NO||''),stationName:String(x.STATION_NAME||''),itemText:String(x.ITEM_TEXT||''),count:0};
    repeatMap[k].count++;
  });
  const repeated=Object.keys(repeatMap).map(function(k){return repeatMap[k];})
    .filter(function(x){return x.count>1;}).sort(function(a,b){return b.count-a.count;}).slice(0,10);

  const aging = {d0_2:0,d3_7:0,d8_14:0,d15plus:0};
  const now = new Date();
  issues.forEach(function(x){
    if(String(x.STATUS||'OPEN')==='CLOSED')return;
    const d = asDate_(x.CREATED_AT);
    if(!d)return;
    const age=Math.max(0,Math.floor((now.getTime()-d.getTime())/86400000));
    if(age<=2)aging.d0_2++;
    else if(age<=7)aging.d3_7++;
    else if(age<=14)aging.d8_14++;
    else aging.d15plus++;
  });

  const filterOptions = {
    regions: uniqueSorted_(stationsAll.map(function(r){return String(r.REGION||'');}).filter(Boolean)),
    branches: uniqueSorted_(stationsAll.map(function(r){return String(r.BRANCH||'');}).filter(Boolean)),
    supervisors: users.map(function(u){return {computerNo:String(u.COMPUTER_NO||''),name:String(u.NAME||'')};})
      .filter(function(u){return u.computerNo;})
  };

  return {
    filters: filters,
    filterOptions: filterOptions,
    kpis: {
      activeStations: scopedStations.length,
      totalVisits: totalVisits,
      avgScore: avgScore,
      totalFails: totalFails,
      openIssues: openIssues,
      criticalOpen: criticalOpen,
      resolvedIssues: resolvedIssues,
      requiredVisits: planMetrics.required,
      completedPlannedVisits: planMetrics.completed,
      overdueVisits: planMetrics.overdue,
      planCoverageStations: planMetrics.coverageStations,
      pendingApprovals: pendingApprovals,
      awaitingVerification: awaitingVerification,
      overdueIssues: overdueIssues,
      missedVisits: planMetrics.overdue
    },
    trend: trend,
    topCategories: topCategories,
    regions: regions,
    supervisors: supervisors,
    hotspots: hotspots,
    repeated: repeated,
    aging: aging,
    hasVisitPlans: planMetrics.planCount > 0,
    generatedAt: formatDateTime_(new Date())
  };
}

/* =========================
   System administration
   ========================= */

function adminBootstrap(token) {
  const session = requireSession_(token);
  requirePermissionAny_(session, ['USER_MANAGE','ROLE_MANAGE','STATION_MANAGE','CHECKLIST_MANAGE','VISIT_PLAN_MANAGE','SETTINGS_MANAGE']);
  const ss = getDb_();
  const stations = sheetObjects_(ss.getSheetByName(APP.SHEETS.STATIONS)).filter(function(r){return toBool_(r.ACTIVE);});
  return {
    permissionCatalog: PERMISSIONS.map(function(p){return {key:p[0],label:p[1],group:p[2]};}),
    roles: (hasPermission_(session,'ROLE_MANAGE')||hasPermission_(session,'USER_MANAGE')||hasPermission_(session,'PERMISSION_MANAGE')||hasPermission_(session,'SETTINGS_MANAGE')) ? adminListRoles(token) : [],
    users: hasPermission_(session,'USER_MANAGE') ? adminListUsers(token) : sheetObjects_(ss.getSheetByName(APP.SHEETS.USERS)).filter(function(u){return toBool_(u.ACTIVE)&&normalizeRoleId_(u.ROLE_ID||u.ROLE||'')==='SUPERVISOR'&&supervisorVisibleTo_(session,u);}).map(function(u){return{computerNo:String(u.COMPUTER_NO||''),name:String(u.NAME||''),roleId:'SUPERVISOR',roleName:getRoleName_('SUPERVISOR'),regions:csvArray_(u.REGIONS),stationNos:csvArray_(u.STATION_NOS),scopeMode:normalizeScopeMode_(u.SCOPE_MODE,'SUPERVISOR'),active:true,approverComputerNo:String(u.APPROVER_COMPUTER_NO||''),managerComputerNo:String(u.MANAGER_COMPUTER_NO||'')};}),
    regions: uniqueSorted_(stations.map(function(r){return String(r.REGION||'');}).filter(Boolean)),
    branches: uniqueSorted_(stations.map(function(r){return String(r.BRANCH||'');}).filter(Boolean)),
    visitTypes: APP.VISIT_TYPES,
    roleDefaults: roleDefaults_(),
    fixedRoles: Object.keys(ROLE_MATRIX_).concat(['SYSTEM_ADMIN']),
    parentRoles: ORG_PARENT_ROLE_
  };
}

function adminListUsers(token) {
  const session = requireSession_(token);
  requirePermission_(session, 'USER_MANAGE');
  const ss = getDb_();
  const users = sheetObjects_(ss.getSheetByName(APP.SHEETS.USERS));
  const overrides = sheetObjects_(ss.getSheetByName(APP.SHEETS.USER_OVERRIDES));
  const oMap = {};
  overrides.forEach(function(o){
    const c=String(o.COMPUTER_NO||'');
    if(!oMap[c])oMap[c]={};
    oMap[c][String(o.PERMISSION_KEY||'')]=String(o.EFFECT||'INHERIT');
  });

  return users.map(function(u){
    const roleId=normalizeRoleId_(u.ROLE_ID||u.ROLE||'SUPERVISOR');
    return {
      computerNo:String(u.COMPUTER_NO||''),name:String(u.NAME||''),roleId:roleId,roleName:getRoleName_(roleId),
      regions:csvArray_(u.REGIONS),stationNos:csvArray_(u.STATION_NOS),
      scopeMode:normalizeScopeMode_(u.SCOPE_MODE,roleId),active:toBool_(u.ACTIVE),
      mustChangePassword:toBool_(u.MUST_CHANGE_PASSWORD),overrides:oMap[String(u.COMPUTER_NO||'')]||{},phone:String(u.PHONE||''),
      approverComputerNo:String(u.APPROVER_COMPUTER_NO||''),managerComputerNo:String(u.MANAGER_COMPUTER_NO||''),
      scopeOpen:scopeIsOpen_({roleId:roleId,scopeMode:normalizeScopeMode_(u.SCOPE_MODE,roleId),regions:csvArray_(u.REGIONS),stationNos:csvArray_(u.STATION_NOS)})
    };
  }).sort(function(a,b){return a.name.localeCompare(b.name,'ar');});
}

function adminSaveUser(token, payload) {
  const session = requireSession_(token);
  requirePermission_(session, 'USER_MANAGE');
  payload = payload || {};

  const computerNo = normalizeText_(payload.computerNo);
  const name = normalizeText_(payload.name);
  const roleId = normalizeRoleId_(payload.roleId || 'SUPERVISOR');
  const tempPassword = String(payload.tempPassword || '');
  const active = payload.active !== false;
  const has = function(k){ return Object.prototype.hasOwnProperty.call(payload,k) && payload[k]!==undefined && payload[k]!==null; };

  if(!computerNo || !name)throw new Error('رقم الكمبيوتر والاسم مطلوبان.');
  if(!/^\d{1,10}$/.test(computerNo))throw new Error('رقم الكمبيوتر أرقام فقط (حتى 10 خانات).');
  if(!findRole_(roleId))throw new Error('المنصب غير موجود.');
  if(computerNo===session.computerNo && (roleId!==session.roleId || !active))throw new Error('لا يمكنك تغيير منصبك أو إيقاف حسابك بنفسك.');

  const sh = getDb_().getSheetByName(APP.SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  const idx = headerMap_(data[0]);
  let rowIndex = -1;
  for(let r=1;r<data.length;r++){
    if(String(data[r][idx.COMPUTER_NO]||'')===computerNo){rowIndex=r+1;break;}
  }

  // V9.3: الحقول القديمة (النطاق/المناطق/المحطات) لا تُمسح إلا إن أُرسلت صراحة.
  const patch = {NAME:name,ROLE:roleId,ROLE_ID:roleId,ACTIVE:active,UPDATED_AT:new Date()};
  if(has('phone'))patch.PHONE=normalizePhone_(payload.phone);
  if(has('scopeMode'))patch.SCOPE_MODE=normalizeScopeMode_(payload.scopeMode, roleId);
  if(has('regions'))patch.REGIONS=Array.isArray(payload.regions)?payload.regions.join(','):normalizeText_(payload.regions);
  if(has('stationNos'))patch.STATION_NOS=Array.isArray(payload.stationNos)?payload.stationNos.join(','):normalizeText_(payload.stationNos);
  if(has('approverComputerNo'))patch.APPROVER_COMPUTER_NO=normalizeText_(payload.approverComputerNo);
  if(has('managerComputerNo'))patch.MANAGER_COMPUTER_NO=normalizeText_(payload.managerComputerNo);
  // الرئيس المباشر بحسب المستوى: للمشرف = مساعد الإشراف (APPROVER)، ولغيره = MANAGER
  if(has('parentComputerNo')){
    const parentNo=normalizeText_(payload.parentComputerNo);
    if(parentNo){
      if(parentNo===computerNo)throw new Error('لا يمكن ربط المستخدم بنفسه.');
      const p=findUserByComputerNo_(parentNo);if(!p||!toBool_(p.ACTIVE))throw new Error('الرئيس المباشر غير موجود أو غير نشط.');
      const prid=normalizeRoleId_(p.ROLE_ID||p.ROLE||''),want=ORG_PARENT_ROLE_[roleId]||[];
      if(want.length&&want.indexOf(prid)===-1)throw new Error('لا يمكن ربط «'+getRoleName_(roleId)+'» بـ«'+getRoleName_(prid)+'».');
    }
    if(roleId==='SUPERVISOR')patch.APPROVER_COMPUTER_NO=parentNo;else patch.MANAGER_COMPUTER_NO=parentNo;
  }
  if(roleId==='SUPERVISOR'&&!has('scopeMode')&&rowIndex<0)patch.SCOPE_MODE='STATIONS';
  if(roleId==='SYSTEM_ADMIN'&&!has('scopeMode'))patch.SCOPE_MODE='ALL';

  if(rowIndex>0){
    if(tempPassword){
      if(tempPassword.length<8)throw new Error('كلمة المرور المؤقتة يجب أن تكون 8 خانات على الأقل.');
      const salt=makeSalt_();
      patch.SALT=salt;patch.PASSWORD_HASH=hashPassword_(tempPassword,salt);patch.MUST_CHANGE_PASSWORD=true;
    }
    patchRowByNumber_(sh,rowIndex,patch);
    audit_(session.computerNo,'USER_UPDATED',computerNo,name);
  } else {
    if(tempPassword.length<8)throw new Error('كلمة المرور المؤقتة مطلوبة للمستخدم الجديد ويجب أن تكون 8 خانات على الأقل.');
    const salt=makeSalt_();
    appendObject_(sh,Object.assign({
      COMPUTER_NO:computerNo,PASSWORD_HASH:hashPassword_(tempPassword,salt),SALT:salt,
      REGIONS:'',STATION_NOS:'',SCOPE_MODE:roleId==='SYSTEM_ADMIN'?'ALL':(roleId==='SUPERVISOR'?'STATIONS':'REGIONS'),PHONE:'',
      APPROVER_COMPUTER_NO:'',MANAGER_COMPUTER_NO:'',MUST_CHANGE_PASSWORD:true,CREATED_AT:new Date()
    },patch));
    audit_(session.computerNo,'USER_CREATED',computerNo,name);
  }
  invalidateSheet_(APP.SHEETS.USERS);Object.keys(MEMO_).forEach(function(k){if(k.indexOf('TEAM_')===0)delete MEMO_[k];});

  if(!isFixedRole_(roleId) && payload.permissionOverrides && hasPermission_(session,'PERMISSION_MANAGE')){
    saveUserOverrides_(session,computerNo,payload.permissionOverrides);
  }
  return {ok:true};
}

function adminListRoles(token) {
  const session = requireSession_(token);
  requirePermissionAny_(session, ['ROLE_MANAGE','USER_MANAGE','PERMISSION_MANAGE','SETTINGS_MANAGE']);
  const ss = getDb_();
  const roles=sheetObjects_(ss.getSheetByName(APP.SHEETS.ROLES));
  const rp=sheetObjects_(ss.getSheetByName(APP.SHEETS.ROLE_PERMISSIONS));
  const map={};
  rp.forEach(function(x){
    const id=String(x.ROLE_ID||'');
    if(!map[id])map[id]={};
    map[id][String(x.PERMISSION_KEY||'')]=toBool_(x.ALLOWED);
  });
  return roles.filter(function(r){return toBool_(r.ACTIVE);}).map(function(r){
    const roleId=String(r.ROLE_ID||'');
    let rolePerms=map[roleId]||{};
    if(isFixedRole_(roleId)){
      const d=roleDefaults_()[roleId]||[];rolePerms={};PERMISSIONS.forEach(function(p){rolePerms[p[0]]=d.indexOf(p[0])!==-1;});
    }
    return {
      roleId:roleId,roleName:String(r.ROLE_NAME||''),description:String(r.DESCRIPTION||''),
      defaultScope:String(r.DEFAULT_SCOPE||'REGIONS'),isSystem:toBool_(r.IS_SYSTEM),active:toBool_(r.ACTIVE),fixed:isFixedRole_(roleId),
      permissions:rolePerms,
      allowedLabels:PERMISSIONS.filter(function(p){return !!rolePerms[p[0]];}).map(function(p){return p[1];})
    };
  }).sort(function(a,b){return a.roleName.localeCompare(b.roleName,'ar');});
}

function adminSaveRole(token, payload) {
  const session = requireSession_(token);
  requirePermission_(session, 'ROLE_MANAGE');
  payload=payload||{};
  const roleId=normalizeRoleId_(payload.roleId || ('ROLE_'+Utilities.getUuid().slice(0,8)));
  const roleName=normalizeText_(payload.roleName);
  const description=normalizeText_(payload.description);
  const defaultScope=normalizeScopeMode_(payload.defaultScope,'SUPERVISOR');
  if(!roleName)throw new Error('اسم الدور مطلوب.');

  const sh=getDb_().getSheetByName(APP.SHEETS.ROLES);
  const rows=sheetObjects_(sh);
  const existing=rows.filter(function(r){return String(r.ROLE_ID||'')===roleId;})[0];
  if(existing && toBool_(existing.IS_SYSTEM) && roleId==='SYSTEM_ADMIN' && payload.active===false){
    throw new Error('لا يمكن تعطيل دور مدير النظام.');
  }
  if(existing){
    updateRowsByKeys_(sh,{ROLE_ID:roleId},{ROLE_NAME:roleName,DESCRIPTION:description,DEFAULT_SCOPE:defaultScope,ACTIVE:payload.active!==false,UPDATED_AT:new Date()});
  }else{
    appendObject_(sh,{ROLE_ID:roleId,ROLE_NAME:roleName,DESCRIPTION:description,DEFAULT_SCOPE:defaultScope,IS_SYSTEM:false,ACTIVE:true,CREATED_AT:new Date(),UPDATED_AT:new Date()});
  }

  if(payload.permissions && hasPermission_(session,'PERMISSION_MANAGE')){
    if(isFixedRole_(roleId)){
      const d=roleDefaults_()[roleId]||[],fixed={};PERMISSIONS.forEach(function(p){fixed[p[0]]=d.indexOf(p[0])!==-1;});
      saveRolePermissions_(session,roleId,fixed);
    }else{
      saveRolePermissions_(session,roleId,payload.permissions);
    }
  }
  memoClear_('roles');
  audit_(session.computerNo,'ROLE_SAVED',roleId,roleName);
  return {ok:true,roleId:roleId};
}

function adminSearchStations(token, query) {
  const session = requireSession_(token);
  requirePermissionAny_(session,['STATION_VIEW','STATION_MANAGE']);
  query=normalizeText_(query).toLowerCase();
  const rows=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.STATIONS));
  const out=[];
  for(let i=0;i<rows.length;i++){
    const s=stationObject_(rows[i]);
    if(!toBool_(rows[i].ACTIVE))continue;
    if(!stationAllowed_(session,s))continue;
    const h=[s.stationNo,s.stationName,s.region,s.branch,s.city].join(' ').toLowerCase();
    if(query && h.indexOf(query)===-1)continue;
    out.push(s);
    if(out.length>=150)break;
  }
  return out;
}

function adminSaveStation(token,payload){
  const session=requireSession_(token);
  requirePermission_(session,'STATION_MANAGE');
  payload=payload||{};
  const stationNo=normalizeText_(payload.stationNo);
  const stationName=normalizeText_(payload.stationName);
  if(!stationNo||!stationName)throw new Error('رقم المحطة واسم المحطة مطلوبان.');
  const sh=getDb_().getSheetByName(APP.SHEETS.STATIONS);
  const patch={
    STATION_NAME:stationName,REGION:normalizeText_(payload.region),BRANCH:normalizeText_(payload.branch),
    CITY:normalizeText_(payload.city),LAT:payload.lat===''?'':Number(payload.lat),LNG:payload.lng===''?'':Number(payload.lng),
    GOOGLE_MAPS:normalizeText_(payload.googleMaps),STATUS:normalizeText_(payload.status||'تعمل'),
    ACTIVE:payload.active!==false
  };
  const count=updateRowsByKeys_(sh,{STATION_NO:stationNo},patch);
  if(!count){
    patch.STATION_NO=stationNo;patch.SOURCE='ADMIN';patch.CREATED_AT=new Date();patch.CREATED_BY=session.computerNo;
    appendObject_(sh,patch);
  }
  memoClear_('stations');
  audit_(session.computerNo,'STATION_SAVED',stationNo,stationName);
  return {ok:true};
}


function migrateSupervisorStationScope_(){
  const ss=getDb_(),usersSh=ss.getSheetByName(APP.SHEETS.USERS),plans=sheetObjects_(ss.getSheetByName(APP.SHEETS.VISIT_PLANS));
  const data=usersSh.getDataRange().getValues();if(data.length<=1)return{ok:true,updated:0};const idx=headerMap_(data[0]),bySup={};
  plans.forEach(function(p){if(!toBool_(p.ACTIVE))return;const no=String(p.COMPUTER_NO||''),st=String(p.STATION_NO||'');if(!no||!st)return;(bySup[no]||(bySup[no]={}))[st]=true;});
  let updated=0;
  for(let r=1;r<data.length;r++){
    const role=normalizeRoleId_(data[r][idx.ROLE_ID]||data[r][idx.ROLE]||'');if(role!=='SUPERVISOR')continue;
    const no=String(data[r][idx.COMPUTER_NO]||''),set={};csvArray_(data[r][idx.STATION_NOS]).forEach(function(st){set[st]=true;});Object.keys(bySup[no]||{}).forEach(function(st){set[st]=true;});
    const list=Object.keys(set).sort(function(a,b){return a.localeCompare(b,'ar');});
    patchRowByNumber_(usersSh,r+1,{STATION_NOS:list.join(','),SCOPE_MODE:'STATIONS',UPDATED_AT:new Date()});clearSupervisorStationMemo_(no);updated++;
  }
  return{ok:true,updated:updated};
}

/* V9.3: أُلغي سير طلبات إسناد المحطات (طلب/اعتماد). الإسناد الآن مباشر من مساعد الإشراف — انظر Supervisors.gs */

function adminListChecklist(token,visitType){
  const session=requireSession_(token);
  requirePermission_(session,'CHECKLIST_MANAGE');
  visitType=normalizeText_(visitType).toUpperCase();
  return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.CHECKLIST))
    .filter(function(r){return !visitType || String(r.VISIT_TYPE||'')===visitType;})
    .map(function(r){return {
      itemId:String(r.ITEM_ID||''),visitType:String(r.VISIT_TYPE||''),category:String(r.CATEGORY||''),
      text:String(r.ITEM_TEXT||''),sortOrder:Number(r.SORT_ORDER||0),required:toBool_(r.REQUIRED),
      photoOnFail:toBool_(r.PHOTO_ON_FAIL),active:toBool_(r.ACTIVE),sourceRef:String(r.SOURCE_REF||''),
      severity:String(r.SEVERITY||'MEDIUM'),remediationDays:Number(r.REMEDIATION_DAYS||7)
    };}).sort(function(a,b){return a.visitType.localeCompare(b.visitType)||a.sortOrder-b.sortOrder;});
}

function adminSaveChecklistItem(token,payload){
  const session=requireSession_(token);
  requirePermission_(session,'CHECKLIST_MANAGE');
  payload=payload||{};
  const visitType=normalizeText_(payload.visitType).toUpperCase();
  if(!APP.VISIT_TYPES[visitType])throw new Error('نوع الزيارة غير صحيح.');
  const itemId=normalizeText_(payload.itemId || (visitType.charAt(0)+'-'+Utilities.getUuid().slice(0,8)));
  const text=normalizeText_(payload.text);
  if(!text)throw new Error('نص البند مطلوب.');
  const patch={
    VISIT_TYPE:visitType,CATEGORY:normalizeText_(payload.category||'عام'),ITEM_TEXT:text,
    SORT_ORDER:Number(payload.sortOrder||0),REQUIRED:payload.required!==false,
    PHOTO_ON_FAIL:payload.photoOnFail!==false,ACTIVE:payload.active!==false,
    SOURCE_REF:normalizeText_(payload.sourceRef||'إضافة إدارية'),SEVERITY:normalizeText_(payload.severity||'MEDIUM').toUpperCase(),
    REMEDIATION_DAYS:Math.max(1,Number(payload.remediationDays||7))
  };
  const sh=getDb_().getSheetByName(APP.SHEETS.CHECKLIST);
  const count=updateRowsByKeys_(sh,{ITEM_ID:itemId},patch);
  if(!count){patch.ITEM_ID=itemId;appendObject_(sh,patch);}
  audit_(session.computerNo,'CHECKLIST_ITEM_SAVED',itemId,text);
  return {ok:true,itemId:itemId};
}

/* =========================
   Reports
   ========================= */

function exportDashboardReport(token,filters){
  const session=requireSession_(token);
  requirePermission_(session,'REPORT_EXPORT');
  const dash=getAdminDashboard(token,filters||{});
  const visits=adminListVisits(token,filters||{});
  const issues=adminListIssues(token,{
    region:(filters||{}).region||'',
    stationNo:(filters||{}).stationNo||''
  });

  const report=SpreadsheetApp.create('Aldrees Field Control Report '+dateKey_(new Date()));
  const s1=report.getSheets()[0];s1.setName('Summary');
  const summary=[
    ['تقرير الرقابة الميدانية - الدريس',''],
    ['تاريخ الإنشاء',dash.generatedAt],
    ['المحطات النشطة',dash.kpis.activeStations],
    ['الزيارات المنفذة',dash.kpis.totalVisits],
    ['متوسط الالتزام %',dash.kpis.avgScore],
    ['حالات عدم المطابقة',dash.kpis.totalFails],
    ['الملاحظات المفتوحة',dash.kpis.openIssues],
    ['الملاحظات الحرجة المفتوحة',dash.kpis.criticalOpen],
    ['الزيارات المطلوبة حسب الخطة',dash.kpis.requiredVisits],
    ['الزيارات المتأخرة حسب الخطة',dash.kpis.overdueVisits]
  ];
  s1.getRange(1,1,summary.length,2).setValues(summary);
  styleReportHeader_(s1.getRange(1,1,1,2));

  const s2=report.insertSheet('Visits');
  const vh=['VISIT_ID','DATE','COMPUTER_NO','SUPERVISOR','STATION_NO','STATION_NAME','REGION','BRANCH','VISIT_TYPE','SCORE','FAIL_COUNT','DURATION_MIN','APPROVAL'];
  s2.getRange(1,1,1,vh.length).setValues([vh]);styleReportHeader_(s2.getRange(1,1,1,vh.length));
  if(visits.length)s2.getRange(2,1,visits.length,vh.length).setValues(visits.map(function(v){return[
    v.visitId,v.date,v.computerNo,v.supervisor,v.stationNo,v.stationName,v.region,v.branch,v.visitType,v.score,v.failCount,v.durationMinutes,v.approvalStatus
  ];}));

  const s3=report.insertSheet('Issues');
  const ih=['ISSUE_ID','STATION_NO','STATION_NAME','REGION','CATEGORY','ITEM_TEXT','STATUS','SEVERITY','NOTE','AGE_DAYS','CREATED_BY'];
  s3.getRange(1,1,1,ih.length).setValues([ih]);styleReportHeader_(s3.getRange(1,1,1,ih.length));
  if(issues.length)s3.getRange(2,1,issues.length,ih.length).setValues(issues.map(function(x){return[
    x.issueId,x.stationNo,x.stationName,x.region,x.category,x.itemText,x.status,x.severity,x.note,x.ageDays,x.createdBy
  ];}));

  [s1,s2,s3].forEach(function(sh){sh.setFrozenRows(1);sh.autoResizeColumns(1,sh.getLastColumn());});
  audit_(session.computerNo,'REPORT_EXPORTED',report.getId(),report.getName());
  return {ok:true,url:report.getUrl(),name:report.getName()};
}

/* =========================
   Database info
   ========================= */

function getDatabaseInfo() {
  requireEditorRun_();
  const id = PropertiesService.getScriptProperties().getProperty(APP.DB_PROP);
  if (!id) return null;
  const ss = SpreadsheetApp.openById(id);
  return { id:id, name:ss.getName(), url:ss.getUrl(), version:APP.VERSION };
}

/* =========================
   Seeds + migration
   ========================= */

function seedSettings_(ss){
  const sh=ss.getSheetByName(APP.SHEETS.SETTINGS);
  const rows=sheetObjects_(sh);
  const existing={};rows.forEach(function(r){existing[String(r.KEY||'')]=true;});
  const defaults={
    APP_NAME:APP.NAME,VERSION:APP.VERSION,
    ISSUE_DEFAULT_REMEDIATION_DAYS:'7',
    DAILY_INTERVAL_DAYS:'1',BIWEEKLY_INTERVAL_DAYS:'14',WEEKLY_INTERVAL_DAYS:'7',
    MONTHLY_MODE:'FROM_FIRST_VISIT',
    APPROVAL_SLA_HOURS:'48',
    GPS_MATCH_METERS:'500',
    GPS_REVIEW_METERS:'1500',
    GPS_MAX_ACCURACY_METERS:'250',
    PLAN_GRACE_DAYS:'0',
    WORKFLOW_MONITOR_HOURS:'1',
    VISIT_PRIORITY_MODE:'MONTHLY_BIWEEKLY_DAILY'
  };
  Object.keys(defaults).forEach(function(k){
    if(!existing[k])appendObject_(sh,{KEY:k,VALUE:defaults[k],UPDATED_AT:new Date()});
    else if(k==='VERSION')updateRowsByKeys_(sh,{KEY:k},{VALUE:APP.VERSION,UPDATED_AT:new Date()});
  });
}

function seedRoles_(ss){
  const sh=ss.getSheetByName(APP.SHEETS.ROLES);
  const roles=sheetObjects_(sh);
  const existing={};roles.forEach(function(r){existing[String(r.ROLE_ID||'')]=true;});
  const seed=[
    {ROLE_ID:'SYSTEM_ADMIN',ROLE_NAME:'مدير النظام',DESCRIPTION:'صلاحية كاملة لإدارة المنصة والبيانات والصلاحيات.',DEFAULT_SCOPE:'ALL',IS_SYSTEM:true,ACTIVE:true},
    {ROLE_ID:'SUPERVISOR',ROLE_NAME:'مشرف المحطات',DESCRIPTION:'ينفّذ الزيارات على محطاته ويعالج ملاحظاته. المحطات والمساعد من صفحة إسناد المحطات.',DEFAULT_SCOPE:'REGIONS',IS_SYSTEM:true,ACTIVE:true},
    {ROLE_ID:'APPROVAL_ASSISTANT',ROLE_NAME:'مساعد الإشراف',DESCRIPTION:'يسند المحطات لمشرفيه، ويعتمد زياراتهم، ويتحقق من معالجة الملاحظات ويغلقها. الجهة الوحيدة للاعتماد.',DEFAULT_SCOPE:'REGIONS',IS_SYSTEM:true,ACTIVE:true},
    {ROLE_ID:'REGION_MANAGER',ROLE_NAME:'مسؤول تشغيل المنطقة',DESCRIPTION:'يطّلع على فريقه، ينقل الأولوية، ويستقبل التصعيد الثاني. لا يعتمد الزيارات.',DEFAULT_SCOPE:'REGIONS',IS_SYSTEM:true,ACTIVE:true},
    {ROLE_ID:'SUPERVISION_MANAGER',ROLE_NAME:'مسؤول الإشراف',DESCRIPTION:'يطّلع على مساعديه ومشرفيهم، ينقل الأولوية، ويستقبل التصعيد الأول. لا يعتمد الزيارات.',DEFAULT_SCOPE:'ALL',IS_SYSTEM:true,ACTIVE:true},
    {ROLE_ID:'OPERATIONS_DEPUTY',ROLE_NAME:'نائب مدير العمليات',DESCRIPTION:'كمدير العمليات: يرى الكل ويطلب الزيارات ويستقبل التصعيد النهائي. لا يعتمد الزيارات.',DEFAULT_SCOPE:'ALL',IS_SYSTEM:true,ACTIVE:true},
    {ROLE_ID:'OPERATIONS_MANAGER',ROLE_NAME:'مدير العمليات',DESCRIPTION:'يرى الكل، يطلب الزيارات ويعيد الإسناد، يدير المحطات والخطط، ويستقبل التصعيد النهائي. لا يعتمد الزيارات.',DEFAULT_SCOPE:'ALL',IS_SYSTEM:true,ACTIVE:true}
  ];
  seed.forEach(function(r){
    if(!existing[r.ROLE_ID]){
      r.CREATED_AT=new Date();r.UPDATED_AT=new Date();appendObject_(sh,r);
    }else{
      // V9.3: مسميات المناصب موحّدة — تُصحَّح في كل ترقية
      updateRowsByKeys_(sh,{ROLE_ID:r.ROLE_ID},{ROLE_NAME:r.ROLE_NAME,DESCRIPTION:r.DESCRIPTION,IS_SYSTEM:true,ACTIVE:true,UPDATED_AT:new Date()});
    }
  });
  invalidateSheet_(APP.SHEETS.ROLES);memoClear_('roles');
}

function seedRolePermissions_(ss){
  const sh=ss.getSheetByName(APP.SHEETS.ROLE_PERMISSIONS);
  const rows=sheetObjects_(sh);
  const existing={};rows.forEach(function(r){existing[String(r.ROLE_ID||'')+'|'+String(r.PERMISSION_KEY||'')]=true;});
  const allKeys=PERMISSIONS.map(function(p){return p[0];});
  const defaults=roleDefaults_();
  const seeds=[];
  allKeys.forEach(function(k){
    if(!existing['SYSTEM_ADMIN|'+k])seeds.push({ROLE_ID:'SYSTEM_ADMIN',PERMISSION_KEY:k,ALLOWED:true,UPDATED_AT:new Date(),UPDATED_BY:'SYSTEM'});
    Object.keys(defaults).forEach(function(roleId){
      if(!existing[roleId+'|'+k])seeds.push({ROLE_ID:roleId,PERMISSION_KEY:k,ALLOWED:defaults[roleId].indexOf(k)!==-1,UPDATED_AT:new Date(),UPDATED_BY:'SYSTEM'});
    });
  });
  appendObjects_(sh,seeds);
}

function seedBootstrapAdmin_(ss){
  const sh=ss.getSheetByName(APP.SHEETS.USERS);
  const rows=sheetObjects_(sh);
  const admin=APP.ADMIN;
  const exists=rows.some(function(r){return String(r.COMPUTER_NO||'')===admin.computerNo;});
  if(exists){
    updateRowsByKeys_(sh,{COMPUTER_NO:admin.computerNo},{ROLE:'SYSTEM_ADMIN',ROLE_ID:'SYSTEM_ADMIN',SCOPE_MODE:'ALL',ACTIVE:true});
    return;
  }
  // V6.4.1: ترحيل حساب مدير النظام القديم (999999) إلى الرقم الجديد مع الحفاظ على كلمة المرور الحالية
  const legacy=rows.some(function(r){return String(r.COMPUTER_NO||'')===admin.legacyComputerNo;});
  if(legacy){
    updateRowsByKeys_(sh,{COMPUTER_NO:admin.legacyComputerNo},{COMPUTER_NO:admin.computerNo,NAME:admin.name,ROLE:'SYSTEM_ADMIN',ROLE_ID:'SYSTEM_ADMIN',SCOPE_MODE:'ALL',ACTIVE:true,UPDATED_AT:new Date()});
    audit_(admin.computerNo,'ADMIN_ACCOUNT_RENAMED',admin.legacyComputerNo+' -> '+admin.computerNo,'ترحيل حساب مدير النظام');
    return;
  }
  const salt=makeSalt_();
  appendObject_(sh,{
    COMPUTER_NO:admin.computerNo,NAME:admin.name,PASSWORD_HASH:hashPassword_('Aldrees@2026',salt),SALT:salt,
    ROLE:'SYSTEM_ADMIN',ROLE_ID:'SYSTEM_ADMIN',REGIONS:'ALL',STATION_NOS:'',SCOPE_MODE:'ALL',
    ACTIVE:true,MUST_CHANGE_PASSWORD:true,CREATED_AT:new Date(),UPDATED_AT:new Date()
  });
}
function migrateLegacyUsers_(ss){
  const sh=ss.getSheetByName(APP.SHEETS.USERS);
  const data=sh.getDataRange().getValues();
  if(data.length<=1)return;
  const idx=headerMap_(data[0]);
  for(let r=1;r<data.length;r++){
    const current=idx.ROLE_ID!==undefined?String(data[r][idx.ROLE_ID]||''):'';
    if(current)continue;
    const legacy=idx.ROLE!==undefined?String(data[r][idx.ROLE]||'SUPERVISOR'):'SUPERVISOR';
    const roleId=normalizeRoleId_(legacy);
    if(idx.ROLE_ID!==undefined)sh.getRange(r+1,idx.ROLE_ID+1).setValue(roleId);
    if(idx.SCOPE_MODE!==undefined)sh.getRange(r+1,idx.SCOPE_MODE+1).setValue(roleId==='SYSTEM_ADMIN'?'ALL':'REGIONS');
  }
}

function seedInitialStations_(ss){
  const sh=ss.getSheetByName(APP.SHEETS.STATIONS);
  const existingRows=sheetObjects_(sh);
  const existing={};existingRows.forEach(function(r){existing[String(r.STATION_NO||'')]=true;});
  const add=[];
  const stationSeeds=(typeof getInitialStations_==='function'?getInitialStations_():(typeof INITIAL_STATIONS!=='undefined'?INITIAL_STATIONS:[]));
  stationSeeds.forEach(function(s){
    const no=String(s[0]||'');
    if(!no||existing[no])return;
    add.push({
      STATION_NO:no,STATION_NAME:String(s[1]||''),REGION:String(s[2]||''),BRANCH:String(s[3]||''),
      CITY:String(s[4]||''),LAT:s[5],LNG:s[6],GOOGLE_MAPS:String(s[7]||''),STATUS:String(s[8]||'تعمل'),
      SYSTEM_ID:String(s[9]||''),SOURCE:String(s[10]||'MASTER'),ACTIVE:true,CREATED_AT:new Date(),CREATED_BY:'MASTER_IMPORT'
    });
    existing[no]=true;
  });
  appendObjects_(sh,add);
  memoClear_('stations');
  return {inserted:add.length,total:Object.keys(existing).filter(Boolean).length};
}

function seedChecklist_(ss){
  const sh=ss.getSheetByName(APP.SHEETS.CHECKLIST);
  if(sh.getLastRow()>1)return;
  const rows=[
    ['D001','DAILY','النظافة والمظهر العام','نظافة ساحة المحطة والممرات وخلوها من المخلفات',10,true,true,true,'دليل التشغيل 2026 - ص4','MEDIUM',3],
    ['D002','DAILY','النظافة والمظهر العام','نظافة جزر التعبئة والمضخات والمناطق المحيطة بها',20,true,true,true,'دليل التشغيل 2026 - ص4-5','MEDIUM',3],
    ['D003','DAILY','النظافة والمظهر العام','نظافة دورات المياه والمسجد وتوفر مستلزمات النظافة',30,true,true,true,'دليل التشغيل 2026 - ص4، ص9','MEDIUM',2],
    ['D004','DAILY','النظافة والمظهر العام','نظافة سكن العمال والمطابخ والمرافق المشتركة',40,true,true,true,'دليل التشغيل 2026 - ص4، ص7','MEDIUM',3],
    ['D005','DAILY','العمال والخدمة','التزام العمال بالزي الرسمي والنظافة الشخصية',50,true,true,true,'دليل التشغيل 2026 - ص4-5','MEDIUM',1],
    ['D006','DAILY','العمال والخدمة','توفر العدد الكافي من العمال وحسن توزيعهم على مواقع الخدمة',60,true,false,true,'دليل التشغيل 2026 - ص5','MEDIUM',3],
    ['D007','DAILY','العمال والخدمة','حسن التعامل مع العملاء وسرعة الاستجابة للخدمة',70,true,false,true,'دليل التشغيل 2026 - ص5','LOW',3],
    ['D008','DAILY','التشغيل','عمل المضخات بصورة طبيعية وعدم وجود توقف ظاهر أو تسريب',80,true,true,true,'دليل التشغيل 2026 - ص25-26','CRITICAL',1],
    ['D009','DAILY','التشغيل','عمل نظام واعي وأجهزة القراءة وعدم وجود أعطال مؤثرة على الخدمة',90,true,true,true,'دليل التشغيل 2026 - ص19','HIGH',1],
    ['D010','DAILY','التشغيل','عمل أجهزة نقاط البيع مدى ومتابعة الإقفالات بصورة صحيحة',100,true,false,true,'دليل التشغيل 2026 - ص13-16','HIGH',1],
    ['D011','DAILY','التشغيل','متابعة المخزون وعدم وجود منتج قريب من الانقطاع دون إجراء متابعة',110,true,false,true,'دليل التشغيل 2026 - ص21','HIGH',1],
    ['D012','DAILY','التشغيل','إقفال الميني شيفت والعمليات المالية حسب الإجراءات المعتمدة',120,true,false,true,'دليل التشغيل 2026 - ص11','HIGH',1],
    ['D013','DAILY','السلامة','خلو منطقة التشغيل من مخاطر ظاهرة أو انسكابات وقود',130,true,true,true,'دليل التشغيل 2026 - ص38، ص41','CRITICAL',1],
    ['D014','DAILY','السلامة','توفر طفايات الحريق ومعدات السلامة في مواقعها وعدم وجود عائق ظاهر',140,true,true,true,'دليل التشغيل 2026 - ص38-39','CRITICAL',1],
    ['D015','DAILY','الهوية واللوحات','وضوح لوحات الدخول والخروج ولوحة الأسعار والشعار وعدم وجود تلف ظاهر',150,true,true,true,'دليل التشغيل 2026 - ص5','MEDIUM',5],
    ['D016','DAILY','الهوية واللوحات','خلو أعمدة المظلة والواجهات من الخدوش والملصقات المخالفة والتشوهات البصرية',160,true,true,true,'دليل التشغيل 2026 - ص4','LOW',7],

    ['B001','BIWEEKLY','المضخات والأنظمة','فحص الخراطيم والمسدسات وعدم وجود تهريب أو تلف ظاهر',10,true,true,true,'دليل التشغيل 2026 - ص25-26، ص59','CRITICAL',1],
    ['B002','BIWEEKLY','المضخات والأنظمة','فحص الكياّلات والفلاتر وسلامة تشغيل المضخات',20,true,true,true,'دليل التشغيل 2026 - ص25-26','HIGH',3],
    ['B003','BIWEEKLY','المضخات والأنظمة','التحقق من تنفيذ المعايرة الدورية وتوثيقها وعدم تجاوز المدة المعتمدة',30,true,true,true,'دليل التشغيل 2026 - ص30-31','HIGH',1],
    ['B004','BIWEEKLY','الخزانات والتفريغ','سلامة فتحات التفريغ وأغطية الخزانات وعدم وجود تسريب ظاهر',40,true,true,true,'دليل التشغيل 2026 - ص27-29','CRITICAL',1],
    ['B005','BIWEEKLY','الخزانات والتفريغ','مطابقة المقاسات اليدوية والإلكترونية عند الحاجة وعدم وجود فروقات غير مبررة',50,true,false,true,'دليل التشغيل 2026 - ص20، ص33، ص59','HIGH',3],
    ['B006','BIWEEKLY','الصيانة','مراجعة الأعطال المفتوحة والتأكد من متابعة أوامر الصيانة حتى الإغلاق',60,true,false,true,'دليل التشغيل 2026 - ص35','MEDIUM',7],
    ['B007','BIWEEKLY','الأعمال المدنية','سلامة الأرضيات وعدم وجود حفر أو هبوط أو شروخ مؤثرة',70,true,true,true,'دليل التشغيل 2026 - ص37','HIGH',7],
    ['B008','BIWEEKLY','الأعمال المدنية','سلامة الأبواب والجزر والأعمدة والهياكل المعدنية وعدم وجود تلف مؤثر',80,true,true,true,'دليل التشغيل 2026 - ص37','MEDIUM',7],
    ['B009','BIWEEKLY','الإنارة','عمل إنارة المظلة والمضخات والمرافق والمداخل والمخارج بصورة سليمة',90,true,true,true,'دليل التشغيل 2026 - ص36','MEDIUM',5],
    ['B010','BIWEEKLY','الهوية','مطابقة المظلة والشعار والألوان واللوحات للهوية المعتمدة',100,true,true,true,'دليل التشغيل 2026 - ص5','MEDIUM',10],
    ['B011','BIWEEKLY','المستأجرون','التزام المستأجرين بالهوية والتعليمات والنظافة العامة للمرافق',110,true,true,true,'دليل التشغيل 2026 - ص4-5','LOW',7],
    ['B012','BIWEEKLY','الكاميرات','عمل كاميرات المراقبة وعدم وجود توقف مؤثر في التسجيل',120,true,false,true,'دليل التشغيل 2026 - ص22، ص49','HIGH',3],
    ['B013','BIWEEKLY','السلامة','سلامة اللوحات الإرشادية وحواجز السلامة بالمواقع الخطرة أو تحت الإنشاء',130,true,true,true,'دليل التشغيل 2026 - ص4','HIGH',2],
    ['B014','BIWEEKLY','الملاحظات','متابعة الملاحظات السابقة والتأكد من عدم تكرار الملاحظة بعد المعالجة',140,true,false,true,'دليل التشغيل 2026 - ص60','MEDIUM',7],

    ['M001','MONTHLY','السلامة','فحص خزان ومضخة الحريق والتأكد من الجاهزية وعدم وجود تسريب',10,true,true,true,'دليل التشغيل 2026 - ص38','CRITICAL',1],
    ['M002','MONTHLY','السلامة','فحص صناديق الحريق والمحابس والخراطيم ومعدات الرغوة',20,true,true,true,'دليل التشغيل 2026 - ص38-39','CRITICAL',1],
    ['M003','MONTHLY','السلامة','فحص لوحة الإنذار وكواشف الدخان وكواسر الزجاج والتأكد من الجاهزية',30,true,true,true,'دليل التشغيل 2026 - ص38-39','CRITICAL',1],
    ['M004','MONTHLY','السلامة','مراجعة صلاحية طفايات الحريق ومؤشرات الضغط وتواريخ الانتهاء',40,true,true,true,'دليل التشغيل 2026 - ص38','CRITICAL',1],
    ['M005','MONTHLY','الإنارة','تنفيذ الفحص الشهري الشامل للإنارة وتوثيق أي أعطال تحتاج معالجة',50,true,true,true,'دليل التشغيل 2026 - ص36','MEDIUM',7],
    ['M006','MONTHLY','الرخص والتصاريح','جميع الرخص والتصاريح المطلوبة موجودة وسارية أو تم التبليغ قبل الانتهاء بوقت كافٍ',60,true,true,true,'دليل التشغيل 2026 - ص45','HIGH',7],
    ['M007','MONTHLY','الملصقات التنظيمية','مراجعة جميع الملصقات التنظيمية والتأكد من وضوحها وسلامتها وثباتها',70,true,true,true,'دليل التشغيل 2026 - ص46','MEDIUM',7],
    ['M008','MONTHLY','البيئة','التصريح البيئي معروض وملف البيئة يحتوي المستندات المطلوبة',80,true,true,true,'دليل التشغيل 2026 - ص41','HIGH',7],
    ['M009','MONTHLY','البيئة','عدم وجود آثار تلوث أو انسكابات مستمرة حول التفريغ والمضخات',90,true,true,true,'دليل التشغيل 2026 - ص41','CRITICAL',1],
    ['M010','MONTHLY','المرافق والخدمات','مراجعة حالة المياه والصرف الصحي وآلية التوريد والتصريف وأي تغيرات بالمرافق',100,true,false,true,'دليل التشغيل 2026 - ص8','MEDIUM',7],
    ['M011','MONTHLY','الأعمال المدنية','مراجعة حالة الدهانات والتخطيط الأرضي والمظهر العام والارتدادات',110,true,true,true,'دليل التشغيل 2026 - ص37','MEDIUM',14],
    ['M012','MONTHLY','الحوادث والملاحظات','مراجعة الحوادث والملاحظات السابقة والتأكد من إغلاق الإجراءات المتعلقة بها',120,true,false,true,'دليل التشغيل 2026 - ص40، ص60','HIGH',7],
    ['M013','MONTHLY','التحصيل والمستندات','مراجعة انتظام التحصيل وحفظ وإرسال المستندات حسب الإجراءات',130,true,false,true,'دليل التشغيل 2026 - ص44','HIGH',3],
    ['M014','MONTHLY','المخزون والمبيعات','مراجعة الاتجاهات غير الطبيعية في المخزون والمبيعات والأعطال المؤثرة',140,true,false,true,'دليل التشغيل 2026 - ص21-22','HIGH',3],
    ['M015','MONTHLY','العمال والسكن','مراجعة حالة السكن والبيئة المعيشية للعاملين وملاحظات النظافة والسلامة',150,true,true,true,'دليل التشغيل 2026 - ص7','MEDIUM',7],
    ['M016','MONTHLY','المستأجرون والهوية','مراجعة التزام جميع المرافق والمستأجرين بالهوية والمظهر العام المعتمد',160,true,true,true,'دليل التشغيل 2026 - ص5','LOW',14]
  ];
  sh.getRange(2,1,rows.length,rows[0].length).setValues(rows);
  invalidateSheet_(sh);
}

/* V9.3: الافتراضيات = المصفوفة الثابتة في Code.gs (ROLE_MATRIX_) + مدير النظام كل شيء. */
function roleDefaults_(){
  const out={};Object.keys(ROLE_MATRIX_).forEach(function(k){out[k]=ROLE_MATRIX_[k].slice();});
  out.SYSTEM_ADMIN=PERMISSIONS.map(function(p){return p[0];});
  return out;
}
function isFixedRole_(roleId){return roleId==='SYSTEM_ADMIN'||!!ROLE_MATRIX_[roleId];}

/* =========================
   Bulk user import (V6.4)
   ========================= */

function adminImportUsers(token, payload) {
  const session = requireSession_(token);
  requirePermission_(session, 'USER_MANAGE');
  payload = payload || {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const roleId = normalizeRoleId_(payload.roleId || 'SUPERVISOR');
  if (!findRole_(roleId)) throw new Error('الدور غير موجود.');
  const tempPassword = String(payload.tempPassword || '');
  if (tempPassword.length < 8) throw new Error('كلمة المرور المؤقتة يجب أن تكون 8 خانات على الأقل.');
  const scopeMode = normalizeScopeMode_(payload.scopeMode, roleId);
  const regions = Array.isArray(payload.regions) ? payload.regions.join(',') : normalizeText_(payload.regions);
  const stationNos = Array.isArray(payload.stationNos) ? payload.stationNos.join(',') : normalizeText_(payload.stationNos);
  const mustChange = payload.mustChangePassword !== false;
  if (!rows.length) throw new Error('لا توجد صفوف للاستيراد.');
  if (rows.length > 500) throw new Error('الحد الأقصى 500 مستخدم في العملية الواحدة.');

  const sh = getDb_().getSheetByName(APP.SHEETS.USERS);
  const existing = {};
  sheetObjects_(sh).forEach(function(u){ existing[String(u.COMPUTER_NO||'')] = true; });

  const toAdd = [], skipped = [], invalid = [], seen = {};
  rows.forEach(function(r, i){
    const computerNo = normalizeText_(r.computerNo).replace(/\.0$/, '');
    const name = normalizeText_(r.name);
    const phone = normalizePhone_(r.phone);
    if (!computerNo || !name) { invalid.push({ line: i + 1, reason: 'رقم الكمبيوتر أو الاسم مفقود' }); return; }
    if (!/^\d{1,10}$/.test(computerNo)) { invalid.push({ line: i + 1, reason: 'رقم كمبيوتر غير صحيح: ' + computerNo }); return; }
    if (seen[computerNo]) { skipped.push({ computerNo: computerNo, name: name, reason: 'مكرر في الملف' }); return; }
    seen[computerNo] = true;
    if (existing[computerNo]) { skipped.push({ computerNo: computerNo, name: name, reason: 'موجود مسبقًا' }); return; }
    const salt = makeSalt_();
    toAdd.push({
      COMPUTER_NO: computerNo, NAME: name, PASSWORD_HASH: hashPassword_(tempPassword, salt), SALT: salt,
      ROLE: roleId, ROLE_ID: roleId, REGIONS: regions, STATION_NOS: stationNos, SCOPE_MODE: scopeMode, PHONE: phone,
      ACTIVE: true, MUST_CHANGE_PASSWORD: mustChange, CREATED_AT: new Date(), UPDATED_AT: new Date()
    });
  });

  if (toAdd.length) appendObjects_(sh, toAdd);
  audit_(session.computerNo, 'USERS_IMPORTED', roleId, 'added=' + toAdd.length + ' skipped=' + skipped.length + ' invalid=' + invalid.length);
  return { added: toAdd.length, skipped: skipped, invalid: invalid, roleId: roleId, scopeMode: scopeMode };
}

function normalizePhone_(v) {
  let d = String(v == null ? '' : v).replace(/\.0$/, '').replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('966') === 0) d = d.slice(3);
  if (d.length === 9 && d.charAt(0) === '5') d = '0' + d;
  return d;
}
