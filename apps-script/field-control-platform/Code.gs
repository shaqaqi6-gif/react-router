/* =====================================================================
   منصة الرقابة والزيارات الميدانية — Core: الإعدادات، تشغيل التطبيق، المصادقة، الجلسات، الصلاحيات، الأدوات المساعدة
   V8.1.4.7 · شركة الدريس
   ===================================================================== */

const APP = Object.freeze({
  VERSION: '8.1.4.7',
  NAME: 'منصة الرقابة والزيارات الميدانية',
  COMPANY: 'شركة الدريس للخدمات البترولية والنقليات',
  DB_PROP: 'ALDREES_CHECKLIST_DB_ID',
  PEPPER_PROP: 'ALDREES_CHECKLIST_PEPPER',
  EVIDENCE_FOLDER_PROP: 'ALDREES_CHECKLIST_EVIDENCE_FOLDER_ID',
  SESSION_SECONDS: 21600,
  TZ: 'Asia/Riyadh',
  ADMIN: { computerNo: '11007', name: 'حسن المغربي', legacyComputerNo: '999999' },
  SHEETS: {
    USERS: 'USERS',
    ROLES: 'ROLES',
    ROLE_PERMISSIONS: 'ROLE_PERMISSIONS',
    USER_OVERRIDES: 'USER_PERMISSION_OVERRIDES',
    STATIONS: 'STATIONS',
    CHECKLIST: 'CHECKLIST_ITEMS',
    VISITS: 'VISITS',
    DETAILS: 'VISIT_DETAILS',
    ISSUES: 'ISSUES',
    ISSUE_UPDATES: 'ISSUE_UPDATES',
    VISIT_PLANS: 'VISIT_PLANS',
    AUDIT: 'AUDIT_LOG',
    SETTINGS: 'SETTINGS',
    NOTIFICATIONS: 'NOTIFICATIONS',
    TICKETS: 'TICKETS',
    TICKET_MESSAGES: 'TICKET_MESSAGES',
    STATION_ASSIGNMENTS: 'STATION_ASSIGNMENTS'
  },
  VISIT_TYPES: {
    DAILY: 'يومية',
    BIWEEKLY: 'أسبوعية',
    MONTHLY: 'شهرية'
  }
});

const PERMISSIONS = Object.freeze([
  ['DASHBOARD_VIEW_ALL','لوحة القيادة - جميع البيانات','لوحة القيادة'],
  ['DASHBOARD_VIEW_SCOPE','لوحة القيادة - ضمن النطاق','لوحة القيادة'],
  ['VISIT_CREATE','تنفيذ زيارة ميدانية','الزيارات'],
  ['VISIT_VIEW_ALL','عرض جميع الزيارات','الزيارات'],
  ['VISIT_VIEW_SCOPE','عرض الزيارات ضمن النطاق','الزيارات'],
  ['VISIT_APPROVE','اعتماد الزيارات','الزيارات'],
  ['ISSUE_RESOLVE_OWN','معالجة الملاحظات الخاصة بالمشرف','الملاحظات'],
  ['ISSUE_VIEW_ALL','عرض جميع الملاحظات','الملاحظات'],
  ['ISSUE_VIEW_SCOPE','عرض الملاحظات ضمن النطاق','الملاحظات'],
  ['ISSUE_MANAGE','تحديث ومعالجة الملاحظات','الملاحظات'],
  ['ISSUE_CLOSE','إغلاق الملاحظات','الملاحظات'],
  ['STATION_VIEW','عرض المحطات','المحطات'],
  ['STATION_MANAGE','إضافة وتعديل المحطات','المحطات'],
  ['STATION_ASSIGN_REQUEST','طلب إسناد محطات للمشرفين','المحطات'],
  ['STATION_ASSIGN_APPROVE','اعتماد إسناد المحطات للمشرفين','المحطات'],
  ['USER_MANAGE','إضافة وتعديل المستخدمين','الإدارة'],
  ['ROLE_MANAGE','إضافة وتعديل الأدوار','الإدارة'],
  ['PERMISSION_MANAGE','تعديل الصلاحيات والاستثناءات','الإدارة'],
  ['CHECKLIST_MANAGE','إضافة وتعديل قوائم التحقق','الإدارة'],
  ['VISIT_PLAN_MANAGE','إدارة خطط الزيارات','الإدارة'],
  ['REPORT_EXPORT','تصدير التقارير','التقارير'],
  ['AUDIT_VIEW','عرض سجل العمليات','التقارير'],
  ['TICKET_MANAGE','إدارة تذاكر التواصل مع الإدارة','الإدارة'],
  ['SETTINGS_MANAGE','إدارة إعدادات النظام','الإدارة']
]);

const HEADERS = Object.freeze({
  USERS: [
    'COMPUTER_NO','NAME','PASSWORD_HASH','SALT','ROLE','REGIONS',
    'ACTIVE','MUST_CHANGE_PASSWORD','CREATED_AT','UPDATED_AT',
    'ROLE_ID','SCOPE_MODE','STATION_NOS','PHONE','APPROVER_COMPUTER_NO','MANAGER_COMPUTER_NO'
  ],
  ROLES: [
    'ROLE_ID','ROLE_NAME','DESCRIPTION','DEFAULT_SCOPE','IS_SYSTEM','ACTIVE','CREATED_AT','UPDATED_AT'
  ],
  ROLE_PERMISSIONS: ['ROLE_ID','PERMISSION_KEY','ALLOWED','UPDATED_AT','UPDATED_BY'],
  USER_OVERRIDES: ['COMPUTER_NO','PERMISSION_KEY','EFFECT','UPDATED_AT','UPDATED_BY'],
  STATIONS: [
    'STATION_NO','STATION_NAME','REGION','CITY','LAT','LNG','GOOGLE_MAPS',
    'STATUS','SOURCE','ACTIVE','CREATED_AT','CREATED_BY',
    'BRANCH','SYSTEM_ID'
  ],
  CHECKLIST: [
    'ITEM_ID','VISIT_TYPE','CATEGORY','ITEM_TEXT','SORT_ORDER',
    'REQUIRED','PHOTO_ON_FAIL','ACTIVE','SOURCE_REF','SEVERITY','REMEDIATION_DAYS'
  ],
  VISITS: [
    'VISIT_ID','DATE','STARTED_AT','COMPLETED_AT','COMPUTER_NO','SUPERVISOR_NAME',
    'STATION_NO','STATION_NAME','VISIT_TYPE','SCORE','PASS_COUNT','FAIL_COUNT',
    'NOTES_COUNT','GPS_LAT','GPS_LNG','MANUAL_STATION','STATUS',
    'REGION','CITY','BRANCH','DURATION_MINUTES','APPROVAL_STATUS','APPROVED_BY','APPROVED_AT','APPROVAL_COMMENT',
    'APPROVER_COMPUTER_NO','SUBMITTED_AT','APPROVAL_DUE_AT','APPROVAL_REMINDER_AT','WORKFLOW_STATUS',
    'GPS_ACCURACY_M','GPS_DISTANCE_M','GPS_MATCH_STATUS','GPS_OVERRIDE_REASON'
  ],
  DETAILS: [
    'VISIT_ID','ITEM_ID','CATEGORY','ITEM_TEXT','RESULT','NOTE','PHOTO_URL','CREATED_AT','SEVERITY'
  ],
  ISSUES: [
    'ISSUE_ID','VISIT_ID','ITEM_ID','CATEGORY','ITEM_TEXT','STATION_NO','STATION_NAME',
    'REGION','CITY','BRANCH','CREATED_AT','CREATED_BY','STATUS','SEVERITY','NOTE','PHOTO_URL',
    'OWNER_COMPUTER_NO','DUE_DATE','CLOSED_AT','CLOSED_BY','LAST_UPDATED_AT','REPEAT_KEY',
    'APPROVED_AT','DUE_DAYS','REMEDIATION_SUBMITTED_AT','REMEDIATION_NOTE','REMEDIATION_PHOTO_URL',
    'VERIFIED_AT','VERIFIED_BY','RETURN_REASON','OVERDUE_NOTIFIED_AT','ESCALATION_LEVEL'
  ],
  ISSUE_UPDATES: [
    'UPDATE_ID','ISSUE_ID','TIMESTAMP','COMPUTER_NO','ACTION','COMMENT','PHOTO_URL','STATUS_FROM','STATUS_TO'
  ],
  VISIT_PLANS: [
    'PLAN_ID','COMPUTER_NO','STATION_NO','VISIT_TYPE','START_DATE','END_DATE','ACTIVE','CREATED_AT','CREATED_BY',
    'APPROVER_COMPUTER_NO','ANCHOR_DATE','LAST_VISIT_DATE','NEXT_DUE_DATE','GRACE_DAYS','LAST_MISSED_ALERT_KEY',
    'LAST_SATISFIED_BY_TYPE','LAST_SATISFIED_BY_VISIT_ID'
  ],
  AUDIT: ['TIMESTAMP','COMPUTER_NO','ACTION','REFERENCE','DETAILS'],
  SETTINGS: ['KEY','VALUE','UPDATED_AT'],
  NOTIFICATIONS: ['NOTIFICATION_ID','COMPUTER_NO','TYPE','TITLE','BODY','REFERENCE','READ','CREATED_AT','CREATED_BY'],
  TICKETS: ['TICKET_ID','COMPUTER_NO','NAME','CATEGORY','SUBJECT','BODY','STATUS','PRIORITY','ASSIGNED_TO','CREATED_AT','UPDATED_AT','LAST_REPLY_AT','LAST_REPLY_BY','UNREAD_FOR_USER','UNREAD_FOR_ADMIN'],
  TICKET_MESSAGES: ['MESSAGE_ID','TICKET_ID','COMPUTER_NO','NAME','BODY','CREATED_AT','FROM_ADMIN'],
  STATION_ASSIGNMENTS: ['ASSIGNMENT_ID','SUPERVISOR_COMPUTER_NO','STATION_NO','REQUESTED_BY','REQUESTED_AT','STATUS','APPROVED_BY','APPROVED_AT','REJECTED_BY','REJECTED_AT','DECISION_COMMENT','ACTIVE','UPDATED_AT']
});


/* =========================
   Server self-check (V6.2) — يكشف أي ملف .gs وصل ناقصاً عند اللصق
   ========================= */
const EXPECTED_FUNCTIONS_ = Object.freeze({
  'Code.gs':['doGet','login','resumeSession','getServerHealth'],
  'Visits.gs':['getDashboard','searchStations','getStation','getChecklist','saveVisit','getMyVisits','getVisitDetail','adminListVisits','approveVisit','getApprovalQueue','getMySchedule','getMyIssues','submitIssueResolution','verifyIssueResolution','adminListIssues','adminListVisitPlans','adminSaveVisitPlan','calculatePlanMetrics_'],
  'Workflow.gs':['runWorkflowMonitor','installWorkflowTrigger','resolveApproverForSupervisor_','updatePlanAfterVisit_','nextDueFromAnchor_','getVisitGate','assertVisitTypeAllowed_','satisfyLowerPriorityPlans_'],
  'Admin.gs':['getAdminDashboard','adminBootstrap','adminListUsers','adminSaveUser','adminListRoles','adminSaveRole','adminListChecklist','adminSaveChecklistItem','getStationAssignmentMeta','listStationAssignments','requestStationAssignment','requestStationAssignments','decideStationAssignment','decideStationAssignments'],
  'Supervisors.gs':['getSupervisors','getSupervisorDetail'],
  'Support.gs':['getTicketMeta','createTicket','listMyTickets','getTicket','replyTicket','adminListTickets','adminUpdateTicket']
});
function getServerHealth(token) {
  requireSession_(token);
  const g = (typeof globalThis !== 'undefined') ? globalThis : this;
  const missing = {};
  Object.keys(EXPECTED_FUNCTIONS_).forEach(function(file){
    const lost = EXPECTED_FUNCTIONS_[file].filter(function(fn){ return typeof g[fn] !== 'function'; });
    if (lost.length) missing[file] = lost;
  });
  return { ok: Object.keys(missing).length === 0, version: APP.VERSION, missing: missing };
}

/* =========================
   Web app + setup
   ========================= */

function doGet() {
  // V4.5: serving the app never changes or resets any existing user password.

  // V5.0: the UI is split into several HTML files (Index, Styles, Logo, App1..App4) and assembled here.
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP.NAME + ' | الدريس')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* V6.2 security: maintenance functions can only run from the Apps Script editor by the project owner,
   never from the web app client (google.script.run) — otherwise anyone opening the link could reset the admin. */
function requireEditorRun_() {
  let active = '', effective = '';
  try { active = String(Session.getActiveUser().getEmail() || ''); } catch (e) {}
  try { effective = String(Session.getEffectiveUser().getEmail() || ''); } catch (e) {}
  if (!active && !effective) return; // نادر: بيئة لا تكشف الهوية — لا يمكن أن تكون طلب ويب لأن المُنفّذ الفعلي معروف دائماً في النشر
  if (!active || !effective || active.toLowerCase() !== effective.toLowerCase()) {
    throw new Error('هذه العملية تُنفَّذ من محرر Apps Script فقط بواسطة مالك المشروع.');
  }
  // V8.1.4.7: طبقة ثانية — لو نُشر التطبيق بخيار "التشغيل باسم المستخدم الذي يفتح الرابط"
  // فإن active يساوي effective لأي زائر؛ هنا نتأكد إضافةً أن المُنفّذ هو مالك قاعدة البيانات نفسه.
  const dbId = PropertiesService.getScriptProperties().getProperty(APP.DB_PROP);
  if (dbId) {
    let owner = '';
    try { const o = DriveApp.getFileById(dbId).getOwner(); owner = o ? String(o.getEmail() || '') : ''; } catch (e) { return; }
    if (owner && owner.toLowerCase() !== effective.toLowerCase()) {
      throw new Error('هذه العملية تُنفَّذ من محرر Apps Script فقط بواسطة مالك المشروع.');
    }
  }
}

function setupSystem() {
  requireEditorRun_();
  return setupOrUpgradeV4_();
}

function upgradeSystemV4() {
  requireEditorRun_();
  return setupOrUpgradeV4_();
}

function setupOrUpgradeV4_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(APP.PEPPER_PROP)) {
    props.setProperty(APP.PEPPER_PROP, Utilities.getUuid() + Utilities.getUuid());
  }

  let ss;
  const currentId = props.getProperty(APP.DB_PROP);
  if (currentId) {
    ss = SpreadsheetApp.openById(currentId);
  } else {
    ss = SpreadsheetApp.create('Aldrees Field Control DB 2026');
    props.setProperty(APP.DB_PROP, ss.getId());
  }

  ensureSheet_(ss, APP.SHEETS.USERS, HEADERS.USERS);
  ensureSheet_(ss, APP.SHEETS.ROLES, HEADERS.ROLES);
  ensureSheet_(ss, APP.SHEETS.ROLE_PERMISSIONS, HEADERS.ROLE_PERMISSIONS);
  ensureSheet_(ss, APP.SHEETS.USER_OVERRIDES, HEADERS.USER_OVERRIDES);
  ensureSheet_(ss, APP.SHEETS.STATIONS, HEADERS.STATIONS);
  ensureSheet_(ss, APP.SHEETS.CHECKLIST, HEADERS.CHECKLIST);
  ensureSheet_(ss, APP.SHEETS.VISITS, HEADERS.VISITS);
  ensureSheet_(ss, APP.SHEETS.DETAILS, HEADERS.DETAILS);
  ensureSheet_(ss, APP.SHEETS.ISSUES, HEADERS.ISSUES);
  ensureSheet_(ss, APP.SHEETS.ISSUE_UPDATES, HEADERS.ISSUE_UPDATES);
  ensureSheet_(ss, APP.SHEETS.VISIT_PLANS, HEADERS.VISIT_PLANS);
  ensureSheet_(ss, APP.SHEETS.AUDIT, HEADERS.AUDIT);
  ensureSheet_(ss, APP.SHEETS.SETTINGS, HEADERS.SETTINGS);
  ensureSheet_(ss, APP.SHEETS.NOTIFICATIONS, HEADERS.NOTIFICATIONS);
  ensureSheet_(ss, APP.SHEETS.TICKETS, HEADERS.TICKETS);
  ensureSheet_(ss, APP.SHEETS.TICKET_MESSAGES, HEADERS.TICKET_MESSAGES);
  ensureSheet_(ss, APP.SHEETS.STATION_ASSIGNMENTS, HEADERS.STATION_ASSIGNMENTS);

  seedSettings_(ss);
  seedRoles_(ss);
  seedRolePermissions_(ss);
  seedBootstrapAdmin_(ss);
  migrateLegacyUsers_(ss);
  seedChecklist_(ss);
  const stationSeed = seedInitialStations_(ss);
  const folder = ensureEvidenceFolder_();
  if (typeof migrateWorkflowData_ === 'function') migrateWorkflowData_();
  if (typeof migrateSupervisorStationScope_ === 'function') migrateSupervisorStationScope_();
  if (typeof ensureWorkflowTrigger_ === 'function') ensureWorkflowTrigger_();
  invalidateAllSheetCache_();

  const result = {
    ok: true,
    version: APP.VERSION,
    databaseUrl: ss.getUrl(),
    evidenceFolderUrl: folder.getUrl(),
    stationsInserted: stationSeed.inserted,
    stationsTotal: stationSeed.total,
    initialComputerNo: APP.ADMIN.computerNo,
    initialPassword: 'Aldrees@2026',
    note: 'الترقية تحافظ على كلمات مرور جميع المستخدمين الحالية ولا تعيد تهيئتها. انشر إصدارًا جديدًا بعد الترقية.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/* =========================
   Authentication
   ========================= */

function regionLabelForUser_(user, roleId){
  const explicit=csvArray_(user.REGIONS);
  if(explicit.length)return explicit.join('، ');
  const stationNos=csvArray_(user.STATION_NOS), seen={};
  stationNos.forEach(function(no){
    const s=findStation_(no);
    if(s&&s.region)seen[String(s.region)]=true;
  });
  const inferred=Object.keys(seen);
  if(inferred.length)return inferred.join('، ');
  const scope=normalizeScopeMode_(user.SCOPE_MODE,roleId);
  if(roleId==='SYSTEM_ADMIN'||scope==='ALL')return 'جميع المناطق';
  return '—';
}

function login(computerNo, password) {
  // V4.5: authentication only verifies credentials; it never mutates password data.

  computerNo = limitText_(normalizeText_(computerNo), 32);
  password = String(password || '').slice(0, 256);
  if (!computerNo || !password) throw new Error('أدخل رقم الكمبيوتر وكلمة المرور.');
  // V6.2: brute-force protection — 6 failed attempts lock the account for 10 minutes
  // V8.1.4.7: مفتاح الكاش يُنظَّف من أي رموز غير آمنة، والعدّاد يُقرأ كرقم صحيح دائماً.
  const lockCache = CacheService.getScriptCache();
  const failKey = 'LOGIN_FAIL_' + cacheKeyPart_(computerNo);
  const parsedFails = parseInt(lockCache.get(failKey), 10);
  const fails = isNaN(parsedFails) || parsedFails < 0 ? 0 : parsedFails;
  if (fails >= 6) throw new Error('تم إيقاف الدخول مؤقتًا بسبب محاولات خاطئة متكررة. حاول بعد 10 دقائق.');

  const user = findUserByComputerNo_(computerNo);
  if (!user || !toBool_(user.ACTIVE)) { lockCache.put(failKey, String(fails + 1), 600); throw new Error('بيانات الدخول غير صحيحة.'); }

  const expected = hashPassword_(password, String(user.SALT || ''));
  if (!timingSafeEquals_(expected, String(user.PASSWORD_HASH || ''))) {
    audit_(computerNo, 'LOGIN_FAILED', computerNo, 'كلمة مرور غير صحيحة');
    lockCache.put(failKey, String(fails + 1), 600);
    throw new Error('بيانات الدخول غير صحيحة.');
  }

  const roleId = normalizeRoleId_(user.ROLE_ID || user.ROLE || 'SUPERVISOR');
  const permissions = getEffectivePermissions_(computerNo, roleId);
  const session = {
    computerNo: String(user.COMPUTER_NO),
    name: String(user.NAME || ''),
    roleId: roleId,
    roleName: getRoleName_(roleId),
    regions: csvArray_(user.REGIONS),
    regionLabel: regionLabelForUser_(user, roleId),
    stationNos: csvArray_(user.STATION_NOS),
    scopeMode: normalizeScopeMode_(user.SCOPE_MODE, roleId),
    approverComputerNo: String(user.APPROVER_COMPUTER_NO || ''),
    managerComputerNo: String(user.MANAGER_COMPUTER_NO || ''),
    permissions: permissions,
    mustChangePassword: toBool_(user.MUST_CHANGE_PASSWORD),
    issuedAt: Date.now()
  };

  lockCache.remove(failKey);
  purgeExpiredSessions_();
  const token = makeToken_();
  sessionPut_(token, session);
  audit_(computerNo, 'LOGIN_SUCCESS', computerNo, 'تم تسجيل الدخول');

  return {
    token: token,
    profile: session,
    visitTypes: APP.VISIT_TYPES,
    gpsThresholds: gpsThresholds_(),
    brand: { appName: APP.NAME, company: APP.COMPANY, version: APP.VERSION }
  };
}

/* V8.1.4.7: حدود GPS تُقرأ من الإعدادات مرة واحدة وتُرسل للواجهة،
   حتى لا تختلف حالة الموقع الظاهرة للمشرف عن الحالة التي يسجلها الخادم. */
function gpsThresholds_() {
  return {
    maxAccuracy: Number(settingValue_('GPS_MAX_ACCURACY_METERS', '250')) || 250,
    match: Number(settingValue_('GPS_MATCH_METERS', '500')) || 500,
    review: Number(settingValue_('GPS_REVIEW_METERS', '1500')) || 1500
  };
}

function resumeSession(token) {
  // V4.6: validates a stored token and returns a fresh profile (permissions re-read).
  const session = requireSession_(token);
  const user = findUserByComputerNo_(session.computerNo);
  if (!user || !toBool_(user.ACTIVE)) { logout(token); throw new Error('انتهت الجلسة. سجّل الدخول مرة أخرى.'); }
  const roleId = normalizeRoleId_(user.ROLE_ID || user.ROLE || 'SUPERVISOR');
  session.roleId = roleId;
  session.roleName = getRoleName_(roleId);
  session.name = String(user.NAME || '');
  session.regions = csvArray_(user.REGIONS);
  session.regionLabel = regionLabelForUser_(user, roleId);
  session.stationNos = csvArray_(user.STATION_NOS);
  session.scopeMode = normalizeScopeMode_(user.SCOPE_MODE, roleId);
  session.approverComputerNo = String(user.APPROVER_COMPUTER_NO || '');
  session.managerComputerNo = String(user.MANAGER_COMPUTER_NO || '');
  session.permissions = getEffectivePermissions_(session.computerNo, roleId);
  session.mustChangePassword = toBool_(user.MUST_CHANGE_PASSWORD);
  sessionPut_(token, session);
  return { token: token, profile: session, visitTypes: APP.VISIT_TYPES, gpsThresholds: gpsThresholds_(), brand: { appName: APP.NAME, company: APP.COMPANY, version: APP.VERSION } };
}

function logout(token) {
  if (token) sessionRemove_(token);
  return true;
}

function changePassword(token, currentPassword, newPassword) {
  const session = requireSession_(token);
  currentPassword = String(currentPassword || '');
  newPassword = String(newPassword || '');

  if (newPassword.length < 8) throw new Error('كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل.');
  if (newPassword.length > 128) throw new Error('كلمة المرور الجديدة طويلة جدًا (128 خانة كحد أقصى).');
  if (newPassword.trim().length < 8) throw new Error('كلمة المرور لا يمكن أن تكون مسافات فقط.');
  if (currentPassword === newPassword) throw new Error('اختر كلمة مرور جديدة مختلفة عن الحالية.');
  if (newPassword === session.computerNo) throw new Error('كلمة المرور لا يمكن أن تكون رقم الكمبيوتر نفسه.');

  const ss = getDb_();
  const sh = ss.getSheetByName(APP.SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  const idx = headerMap_(data[0]);

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idx.COMPUTER_NO]) !== session.computerNo) continue;
    if (!toBool_(data[r][idx.ACTIVE])) throw new Error('الحساب موقوف. راجع مدير النظام.');
    const salt = String(data[r][idx.SALT] || '');
    if (!timingSafeEquals_(hashPassword_(currentPassword, salt), String(data[r][idx.PASSWORD_HASH] || ''))) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }

    const newSalt = makeSalt_();
    setCellByHeader_(sh, r + 1, idx, 'PASSWORD_HASH', hashPassword_(newPassword, newSalt));
    setCellByHeader_(sh, r + 1, idx, 'SALT', newSalt);
    setCellByHeader_(sh, r + 1, idx, 'MUST_CHANGE_PASSWORD', false);
    setCellByHeader_(sh, r + 1, idx, 'UPDATED_AT', new Date());

    session.mustChangePassword = false;
    sessionPut_(token, session);
    audit_(session.computerNo, 'PASSWORD_CHANGED', session.computerNo, 'تم تغيير كلمة المرور');
    return { ok: true };
  }
  throw new Error('تعذر العثور على المستخدم.');
}

/* =========================
   Permissions + scope helpers
   ========================= */

function getEffectivePermissions_(computerNo,roleId){
  if(roleId==='SYSTEM_ADMIN'){
    const all={};PERMISSIONS.forEach(function(p){all[p[0]]=true;});return all;
  }

  // V8.1.4.3: مشرف المحطات له صلاحيات ثابتة لا تتأثر بإعدادات الدور أو الاستثناءات.
  // واجهته الميدانية فقط: اختيار محطة معتمدة -> الزيارة المطلوبة (اليومية افتراضياً) -> معالجة ملاحظاته.
  if(roleId==='SUPERVISOR'){
    const fixed={};
    PERMISSIONS.forEach(function(p){fixed[p[0]]=false;});
    fixed.VISIT_CREATE=true;
    fixed.STATION_VIEW=true;
    fixed.ISSUE_RESOLVE_OWN=true;
    return fixed;
  }

  const ss=getDb_();
  const rp=sheetObjects_(ss.getSheetByName(APP.SHEETS.ROLE_PERMISSIONS));
  const ov=sheetObjects_(ss.getSheetByName(APP.SHEETS.USER_OVERRIDES));
  const out={};
  PERMISSIONS.forEach(function(p){out[p[0]]=false;});
  rp.forEach(function(r){
    if(String(r.ROLE_ID||'')===roleId)out[String(r.PERMISSION_KEY||'')]=toBool_(r.ALLOWED);
  });
  ov.forEach(function(r){
    if(String(r.COMPUTER_NO||'')!==computerNo)return;
    const effect=String(r.EFFECT||'INHERIT').toUpperCase();
    if(effect==='ALLOW')out[String(r.PERMISSION_KEY||'')]=true;
    if(effect==='DENY')out[String(r.PERMISSION_KEY||'')]=false;
  });
  return out;
}

function hasPermission_(session,key){
  return !!(session && session.permissions && session.permissions[key]);
}
function requirePermission_(session,key){
  if(!hasPermission_(session,key))throw new Error('ليس لديك صلاحية لتنفيذ هذه العملية.');
}
function requirePermissionAny_(session,keys){
  for(let i=0;i<keys.length;i++)if(hasPermission_(session,keys[i]))return;
  throw new Error('ليس لديك صلاحية لتنفيذ هذه العملية.');
}

function normalizeRoleId_(value){
  value=normalizeText_(value).toUpperCase();
  if(value==='ADMIN')return 'SYSTEM_ADMIN';
  if(!value)return 'SUPERVISOR';
  return value.replace(/\s+/g,'_');
}

function normalizeScopeMode_(value,roleId){
  const v=normalizeText_(value).toUpperCase();
  if(roleId==='SYSTEM_ADMIN')return 'ALL';
  if(['ALL','REGIONS','STATIONS','MIXED'].indexOf(v)!==-1)return v;
  const role=findRole_(roleId);
  const def=role?String(role.DEFAULT_SCOPE||'').toUpperCase():'';
  return ['ALL','REGIONS','STATIONS','MIXED'].indexOf(def)!==-1?def:'REGIONS';
}

function scopeIsOpen_(session){
  // V8.1.3: المشرف لا يملك نطاقاً مفتوحاً؛ لا يرى إلا المحطات المعتمدة والمخصصة له.
  if(session && session.roleId==='SUPERVISOR')return false;
  const hasRegions=!!(session.regions&&session.regions.length), hasStations=!!(session.stationNos&&session.stationNos.length);
  if(session.scopeMode==='REGIONS')return !hasRegions;
  if(session.scopeMode==='STATIONS')return !hasStations;
  if(session.scopeMode==='MIXED')return !hasRegions&&!hasStations;
  return false;
}
function supervisorStationSet_(computerNo){
  const key='SUP_STATIONS_'+String(computerNo||'');
  if(MEMO_[key])return MEMO_[key];
  const u=findUserByComputerNo_(computerNo), set={};
  csvArray_(u?u.STATION_NOS:'').forEach(function(no){set[String(no)]=true;});
  MEMO_[key]=set;
  return set;
}
function clearSupervisorStationMemo_(computerNo){delete MEMO_['SUP_STATIONS_'+String(computerNo||'')];}
function stationAllowed_(session,s){
  if(session.roleId==='SYSTEM_ADMIN')return true;
  if(session.roleId==='SUPERVISOR'){
    return !!supervisorStationSet_(session.computerNo)[String(s.stationNo||'')];
  }
  if(session.scopeMode==='ALL' || scopeIsOpen_(session))return true;
  const regionMatch=session.regions.indexOf(String(s.region||''))!==-1 || session.regions.indexOf(String(s.branch||''))!==-1;
  const stationMatch=session.stationNos.indexOf(String(s.stationNo||''))!==-1;
  if(session.scopeMode==='REGIONS')return regionMatch;
  if(session.scopeMode==='STATIONS')return stationMatch;
  if(session.scopeMode==='MIXED')return regionMatch||stationMatch;
  return false;
}

function visitAllowed_(session,v){
  if(session.roleId==='SYSTEM_ADMIN' || session.scopeMode==='ALL')return true;
  const s={stationNo:String(v.STATION_NO||''),region:String(v.REGION||''),branch:String(v.BRANCH||'')};
  return stationAllowed_(session,s);
}
function issueAllowed_(session,x){
  if(session.roleId==='SYSTEM_ADMIN' || session.scopeMode==='ALL')return true;
  const s={stationNo:String(x.STATION_NO||''),region:String(x.REGION||''),branch:String(x.BRANCH||'')};
  return stationAllowed_(session,s);
}

/* =========================
   Generic sheet helpers
   ========================= */

function getDb_(){
  const id=PropertiesService.getScriptProperties().getProperty(APP.DB_PROP);
  if(!id)throw new Error('لم يتم تهيئة النظام. شغّل setupSystem() أولًا.');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss,name,headers){
  let sh=ss.getSheetByName(name);
  if(!sh)sh=ss.insertSheet(name);
  if(sh.getLastRow()===0){
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }else{
    const lastCol=Math.max(1,sh.getLastColumn());
    const current=sh.getRange(1,1,1,lastCol).getValues()[0].map(String);
    // V8.1.4.7: نتجاهل الخلايا الفارغة في نهاية صف العناوين حتى لا تُضاف الأعمدة الجديدة بعد فراغ.
    let width=current.length;
    while(width>0&&normalizeText_(current[width-1])==='')width--;
    const named=current.slice(0,width);
    if(!width){
      sh.getRange(1,1,1,headers.length).setValues([headers]);
    }else{
      const missing=headers.filter(function(h){return named.indexOf(h)===-1;});
      if(missing.length){
        sh.getRange(1,width+1,1,missing.length).setValues([missing]);
      }
    }
  }
  sh.setFrozenRows(1);
  applyTextColumnFormats_(sh);
  const lc=sh.getLastColumn();
  if(lc){
    sh.getRange(1,1,1,lc).setBackground('#009DDF').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  return sh;
}

const TEXT_COLUMNS_=['COMPUTER_NO','STATION_NO','DATE','START_DATE','END_DATE','OWNER_COMPUTER_NO','REGIONS','STATION_NOS','SYSTEM_ID','ITEM_ID','APPROVER_COMPUTER_NO','MANAGER_COMPUTER_NO','ASSIGNMENT_ID','SUPERVISOR_COMPUTER_NO','REQUESTED_BY','APPROVED_BY','REJECTED_BY'];
function applyTextColumnFormats_(sh){
  const lc=sh.getLastColumn();if(!lc)return;
  const headers=sh.getRange(1,1,1,lc).getValues()[0].map(String);
  headers.forEach(function(h,i){
    if(TEXT_COLUMNS_.indexOf(h)===-1)return;
    sh.getRange(1,i+1,sh.getMaxRows(),1).setNumberFormat('@');
  });
}

/* ---------- V6.1 performance: per-execution memo + cross-execution cache ----------
   الشيتات قليلة التغيّر تُقرأ من CacheService (مضغوطة) بدل قراءة الشيت كل مرة.
   أي كتابة على شيت تُلغي الكاش الخاص به تلقائياً. */
const SHEET_MEMO_={};
const CACHED_SHEETS_={STATIONS:900,ROLES:900,ROLE_PERMISSIONS:900,CHECKLIST_ITEMS:900,SETTINGS:900}; // USERS تُقرأ دائماً من الشيت (أمان)
function sheetObjects_(sh){
  const name=sh.getName();
  if(SHEET_MEMO_[name])return SHEET_MEMO_[name];
  const ttl=CACHED_SHEETS_[name];
  let rows=ttl?cacheGetJson_('SHEET_'+name):null;
  if(!rows){rows=readSheetObjects_(sh);if(ttl)cachePutJson_('SHEET_'+name,rows,ttl);}
  SHEET_MEMO_[name]=rows;
  return rows;
}
function invalidateSheet_(sh){
  const name=typeof sh==='string'?sh:sh.getName();
  delete SHEET_MEMO_[name];
  if(name===APP.SHEETS.STATIONS)delete MEMO_.stations;
  if(name===APP.SHEETS.ROLES)delete MEMO_.roles;
  if(CACHED_SHEETS_[name])cacheRemoveJson_('SHEET_'+name);
}
function invalidateAllSheetCache_(){Object.keys(CACHED_SHEETS_).forEach(function(k){invalidateSheet_(k);});Object.keys(SHEET_MEMO_).forEach(function(k){delete SHEET_MEMO_[k];});}
function cachePutJson_(key,obj,ttl){
  try{
    const b64=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj))).getBytes());
    const size=90000,parts=[];for(let i=0;i<b64.length;i+=size)parts.push(b64.slice(i,i+size));
    const cache=CacheService.getScriptCache(),bag={};
    parts.forEach(function(pp,i){bag[key+'#'+i]=pp;});bag[key+'#n']=String(parts.length);
    cache.putAll(bag,ttl);
  }catch(e){}
}
function cacheGetJson_(key){
  try{
    const cache=CacheService.getScriptCache();const n=Number(cache.get(key+'#n')||0);if(!n)return null;
    const keys=[];for(let i=0;i<n;i++)keys.push(key+'#'+i);
    const got=cache.getAll(keys);let b64='';
    for(let i=0;i<n;i++){if(!got[key+'#'+i])return null;b64+=got[key+'#'+i];}
    const json=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64),'application/x-gzip')).getDataAsString();
    return JSON.parse(json);
  }catch(e){return null;}
}
function cacheRemoveJson_(key){
  try{const cache=CacheService.getScriptCache();const n=Number(cache.get(key+'#n')||0);const keys=[key+'#n'];for(let i=0;i<Math.max(n,1);i++)keys.push(key+'#'+i);cache.removeAll(keys);}catch(e){}
}
function readSheetObjects_(sh){
  const data=sh.getDataRange().getValues();
  if(data.length<=1)return [];
  const headers=data[0].map(String);
  const out=[];
  for(let r=1;r<data.length;r++){
    let empty=true;for(let c=0;c<data[r].length;c++){if(data[r][c]!==''&&data[r][c]!=null){empty=false;break;}}
    if(empty)continue;
    out.push(rowToObject_(headers,data[r]));
  }
  return out;
}

function appendObject_(sh,obj){
  appendObjects_(sh,[obj]);
}

function appendObjects_(sh,objs){
  if(!objs||!objs.length)return;
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const rows=objs.map(function(o){return headers.map(function(h){return o[h]!==undefined?o[h]:'';});});
  sh.getRange(sh.getLastRow()+1,1,rows.length,headers.length).setValues(rows);
  invalidateSheet_(sh);
}

function patchRowByNumber_(sh,rowNumber,patch){
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const idx=headerMap_(headers);
  Object.keys(patch).forEach(function(k){
    if(idx[k]!==undefined)sh.getRange(rowNumber,idx[k]+1).setValue(patch[k]);
  });
  invalidateSheet_(sh);
}

function updateRowsByKeys_(sh,keys,patch){
  const data=sh.getDataRange().getValues();
  if(data.length<=1)return 0;
  const headers=data[0].map(String),idx=headerMap_(headers);
  const keyNames=Object.keys(keys).filter(function(k){return idx[k]!==undefined;});
  if(keyNames.length!==Object.keys(keys).length)return 0; // مفتاح غير موجود = لا تحديث عشوائي
  const patchNames=Object.keys(patch).filter(function(k){return idx[k]!==undefined;});
  if(!patchNames.length)return 0;
  // V8.1.4.7: نجمع الأعمدة المتغيّرة في مقاطع متجاورة ونكتب كل مقطع دفعة واحدة،
  // فلا نلمس أي عمود لم يتغيّر (حماية من الكتابة فوق تعديل متزامن) ونقلّل عدد الاستدعاءات.
  const cols=patchNames.map(function(k){return idx[k];}).sort(function(a,b){return a-b;});
  const runs=[];
  cols.forEach(function(c){
    const last=runs[runs.length-1];
    if(last&&c===last[last.length-1]+1)last.push(c);
    else runs.push([c]);
  });
  const byCol={};patchNames.forEach(function(k){byCol[idx[k]]=patch[k];});
  let count=0;
  for(let r=1;r<data.length;r++){
    let ok=true;
    for(let i=0;i<keyNames.length;i++){
      const k=keyNames[i];
      if(String(data[r][idx[k]]||'')!==String(keys[k]||'')){ok=false;break;}
    }
    if(!ok)continue;
    runs.forEach(function(run){
      sh.getRange(r+1,run[0]+1,1,run.length).setValues([run.map(function(c){return byCol[c];})]);
    });
    count++;
  }
  if(count)invalidateSheet_(sh);
  return count;
}

function setCellByHeader_(sh,rowNumber,idx,key,value){
  if(idx[key]!==undefined){sh.getRange(rowNumber,idx[key]+1).setValue(value);invalidateSheet_(sh);}
}

/* =========================
   V8.1.4.7 helpers: حدود الإدخال، مقارنة ثابتة الزمن، وقفل الكتابة
   ========================= */
function limitText_(v,max){const s=String(v==null?'':v);return s.length>max?s.slice(0,max):s;}
function cacheKeyPart_(v){return String(v==null?'':v).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80);}
function timingSafeEquals_(a,b){
  a=String(a||'');b=String(b||'');
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
/* الكتابات التي تلمس أكثر من شيت (حفظ زيارة، اعتماد) تُنفَّذ داخل قفل حتى لا تتداخل عمليتان
   وتكتبان على نفس الصف عند استخدام getLastRow(). */
function withDbLock_(fn,timeoutMs){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(timeoutMs||20000))throw new Error('النظام مشغول بعملية أخرى. أعد المحاولة بعد لحظات.');
  try{return fn();}finally{try{lock.releaseLock();}catch(e){}}
}

function headerMap_(headers){
  const m={};headers.forEach(function(h,i){m[String(h)]=i;});return m;
}
function rowToObject_(headers,row){
  const o={};headers.forEach(function(h,i){o[h]=row[i];});return o;
}

/* =========================
   Lookups
   ========================= */

function findUserByComputerNo_(computerNo){
  const rows=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.USERS));
  return rows.filter(function(r){return String(r.COMPUTER_NO||'')===String(computerNo);})[0]||null;
}

const MEMO_={};
function memoClear_(key){delete MEMO_[key];if(key==='stations')invalidateSheet_(APP.SHEETS.STATIONS);if(key==='roles')invalidateSheet_(APP.SHEETS.ROLES);}
function stationIndex_(){
  if(!MEMO_.stations){
    const rows=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.STATIONS));
    const m={};rows.forEach(function(r){m[String(r.STATION_NO||'')]=r;});
    MEMO_.stations=m;
  }
  return MEMO_.stations;
}
function findStation_(stationNo){
  const r=stationIndex_()[String(stationNo)];
  return r?stationObject_(r):null;
}

function stationObject_(r){
  return {
    stationNo:String(r.STATION_NO||''),stationName:String(r.STATION_NAME||'')||('محطة '+String(r.STATION_NO||'')),
    region:String(r.REGION||''),branch:String(r.BRANCH||''),city:String(r.CITY||''),
    lat:r.LAT===''?'':Number(r.LAT),lng:r.LNG===''?'':Number(r.LNG),
    googleMaps:String(r.GOOGLE_MAPS||''),status:String(r.STATUS||'تعمل'),source:String(r.SOURCE||''),
    systemId:String(r.SYSTEM_ID||''),manual:String(r.SOURCE||'').toUpperCase()==='MANUAL',active:toBool_(r.ACTIVE)
  };
}

function findRole_(roleId){
  if(!MEMO_.roles){
    const rows=sheetObjects_(getDb_().getSheetByName(APP.SHEETS.ROLES));
    const m={};rows.forEach(function(r){m[String(r.ROLE_ID||'')]=r;});
    MEMO_.roles=m;
  }
  return MEMO_.roles[String(roleId)]||null;
}
function getRoleName_(roleId){
  const r=findRole_(roleId);return r?String(r.ROLE_NAME||roleId):roleId;
}

/* =========================
   Permission writers
   ========================= */

function saveRolePermissions_(session,roleId,permissions){
  const sh=getDb_().getSheetByName(APP.SHEETS.ROLE_PERMISSIONS);
  Object.keys(permissions).forEach(function(key){
    const allowed=!!permissions[key];
    const count=updateRowsByKeys_(sh,{ROLE_ID:roleId,PERMISSION_KEY:key},{ALLOWED:allowed,UPDATED_AT:new Date(),UPDATED_BY:session.computerNo});
    if(!count)appendObject_(sh,{ROLE_ID:roleId,PERMISSION_KEY:key,ALLOWED:allowed,UPDATED_AT:new Date(),UPDATED_BY:session.computerNo});
  });
}

function saveUserOverrides_(session,computerNo,overrides){
  const sh=getDb_().getSheetByName(APP.SHEETS.USER_OVERRIDES);
  const rows=sh.getDataRange().getValues();
  if(!rows.length)return;
  const idx=headerMap_(rows[0].map(String));
  const existing={};
  for(let r=1;r<rows.length;r++){
    if(String(rows[r][idx.COMPUTER_NO]||'')!==String(computerNo))continue;
    existing[String(rows[r][idx.PERMISSION_KEY]||'')]=r+1;
  }
  const now=new Date(),toDelete=[],toAppend=[];
  Object.keys(overrides).forEach(function(key){
    let effect=String(overrides[key]||'INHERIT').toUpperCase();
    if(['ALLOW','DENY','INHERIT'].indexOf(effect)===-1)effect='INHERIT';
    const rowNum=existing[key];
    if(effect==='INHERIT'){
      if(rowNum)toDelete.push(rowNum);
    }else if(rowNum){
      patchRowByNumber_(sh,rowNum,{EFFECT:effect,UPDATED_AT:now,UPDATED_BY:session.computerNo});
    }else{
      toAppend.push({COMPUTER_NO:String(computerNo),PERMISSION_KEY:key,EFFECT:effect,UPDATED_AT:now,UPDATED_BY:session.computerNo});
    }
  });
  // V8.1.4.7: الحذف من الأسفل للأعلى حتى لا تنزاح أرقام الصفوف أثناء الحذف.
  toDelete.sort(function(a,b){return b-a;}).forEach(function(rowNum){sh.deleteRow(rowNum);});
  if(toDelete.length)invalidateSheet_(sh);
  appendObjects_(sh,toAppend);
}

/* =========================
   Session + crypto
   ========================= */

/* V6.5 sessions: الكاش سريع لكنه قد يُفرَّغ فجأة، لذا تُحفظ الجلسة أيضاً في Script Properties كنسخة احتياطية.
   النتيجة: ما ينطرد المستخدم من النظام إلا عند انتهاء المدة الفعلية (6 ساعات) أو تسجيل الخروج. */
function sessionPut_(token, session) {
  token = String(token || '');
  session.expiresAt = Date.now() + APP.SESSION_SECONDS * 1000;
  const raw = JSON.stringify(session);
  try { CacheService.getScriptCache().put('SESSION_' + token, raw, APP.SESSION_SECONDS); } catch (e) {}
  try { PropertiesService.getScriptProperties().setProperty('SESSION_' + token, raw); } catch (e) {}
  // V8.1.4.7: تنظيف دوري خفيف (5% من الكتابات) حتى لا تمتلئ خصائص السكربت بجلسات منتهية.
  if (Math.random() < 0.05) purgeExpiredSessions_();
}
function sessionRemove_(token) {
  token = String(token || '');
  try { CacheService.getScriptCache().remove('SESSION_' + token); } catch (e) {}
  try { PropertiesService.getScriptProperties().deleteProperty('SESSION_' + token); } catch (e) {}
}
function requireSession_(token){
  token=String(token||'');
  if(!token)throw new Error('انتهت الجلسة. سجّل الدخول مرة أخرى.');
  let raw=null;
  try{raw=CacheService.getScriptCache().get('SESSION_'+token);}catch(e){}
  if(!raw){
    try{raw=PropertiesService.getScriptProperties().getProperty('SESSION_'+token);}catch(e){}
    if(raw){ try{CacheService.getScriptCache().put('SESSION_'+token,raw,APP.SESSION_SECONDS);}catch(e){} }
  }
  if(!raw)throw new Error('انتهت الجلسة. سجّل الدخول مرة أخرى.');
  const session=JSON.parse(raw);
  if(session.expiresAt && Date.now()>session.expiresAt){ sessionRemove_(token); throw new Error('انتهت الجلسة. سجّل الدخول مرة أخرى.'); }
  return session;
}
function purgeExpiredSessions_(){
  try{
    const props=PropertiesService.getScriptProperties();const all=props.getProperties();const now=Date.now();
    Object.keys(all).forEach(function(k){
      if(k.indexOf('SESSION_')!==0)return;
      try{const s=JSON.parse(all[k]);if(!s.expiresAt||s.expiresAt<now)props.deleteProperty(k);}catch(e){props.deleteProperty(k);}
    });
  }catch(e){}
}

function hashPassword_(password,salt){
  const pepper=PropertiesService.getScriptProperties().getProperty(APP.PEPPER_PROP)||'';
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(password)+'|'+String(salt)+'|'+pepper,Utilities.Charset.UTF_8);
  return bytes.map(function(b){const v=(b<0?b+256:b).toString(16);return v.length===1?'0'+v:v;}).join('');
}
function makeSalt_(){return Utilities.getUuid()+Utilities.getUuid();}
function makeToken_(){return Utilities.base64EncodeWebSafe(Utilities.getUuid()+Utilities.getUuid()).replace(/=+$/,'');}
function makeVisitId_(computerNo){return 'VIS-'+Utilities.formatDate(new Date(),APP.TZ,'yyyyMMdd-HHmmss')+'-'+String(computerNo)+'-'+Utilities.getUuid().slice(0,6);}
function makeIssueId_(stationNo){return 'ISS-'+String(stationNo)+'-'+Utilities.formatDate(new Date(),APP.TZ,'yyyyMMddHHmmss')+'-'+Utilities.getUuid().slice(0,5);}



/* =========================
   Emergency admin access repair
   Run manually from Apps Script editor only when the bootstrap admin cannot sign in.
   ========================= */
function RESET_SYSTEM_ADMIN_ACCESS() {
  requireEditorRun_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(APP.PEPPER_PROP)) {
    props.setProperty(APP.PEPPER_PROP, Utilities.getUuid() + Utilities.getUuid());
  }

  const ss = getDb_();
  const sh = ensureSheet_(ss, APP.SHEETS.USERS, HEADERS.USERS);
  const temporaryPassword = 'Aldrees@2026';
  const salt = makeSalt_();
  const patch = {
    NAME: APP.ADMIN.name,
    PASSWORD_HASH: hashPassword_(temporaryPassword, salt),
    SALT: salt,
    ROLE: 'SYSTEM_ADMIN',
    ROLE_ID: 'SYSTEM_ADMIN',
    REGIONS: 'ALL',
    STATION_NOS: '',
    SCOPE_MODE: 'ALL',
    ACTIVE: true,
    MUST_CHANGE_PASSWORD: true,
    UPDATED_AT: new Date()
  };

  const updated = updateRowsByKeys_(sh, { COMPUTER_NO: APP.ADMIN.computerNo }, patch);
  if (!updated) {
    patch.COMPUTER_NO = APP.ADMIN.computerNo;
    patch.CREATED_AT = new Date();
    appendObject_(sh, patch);
  }

  seedRoles_(ss);
  seedRolePermissions_(ss);
  audit_(APP.ADMIN.computerNo, 'ADMIN_ACCESS_RESET', APP.ADMIN.computerNo, 'إعادة ضبط وصول مدير النظام من محرر Apps Script');

  const result = {
    ok: true,
    computerNo: APP.ADMIN.computerNo,
    temporaryPassword: temporaryPassword,
    mustChangePassword: true,
    message: 'تم إصلاح حساب مدير النظام. سجّل الدخول بكلمة المرور المؤقتة ثم غيّرها من داخل المنصة.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/* =========================
   Audit + Drive
   ========================= */

function audit_(computerNo,action,reference,details){
  try{
    appendObject_(getDb_().getSheetByName(APP.SHEETS.AUDIT),{
      TIMESTAMP:new Date(),COMPUTER_NO:String(computerNo||''),ACTION:String(action||''),REFERENCE:String(reference||''),DETAILS:String(details||'')
    });
  }catch(e){}
}

function ensureEvidenceFolder_(){
  const props=PropertiesService.getScriptProperties();
  const existing=props.getProperty(APP.EVIDENCE_FOLDER_PROP);
  if(existing){
    try{return DriveApp.getFolderById(existing);}catch(e){}
  }
  const folder=DriveApp.createFolder('Aldrees Checklist Evidence 2026');
  props.setProperty(APP.EVIDENCE_FOLDER_PROP,folder.getId());
  return folder;
}
function getOrCreateChildFolder_(parent,name){
  const it=parent.getFoldersByName(String(name));return it.hasNext()?it.next():parent.createFolder(String(name));
}

/* =========================
   Filters + dates + misc
   ========================= */

function normalizeDashboardFilters_(filters){
  const today=dateKey_(new Date());
  const monthStart=today.substring(0,8)+'01';
  return {
    startDate:normalizeText_(filters.startDate||monthStart),
    endDate:normalizeText_(filters.endDate||today),
    region:normalizeText_(filters.region),
    branch:normalizeText_(filters.branch),
    supervisor:normalizeText_(filters.supervisor),
    visitType:normalizeText_(filters.visitType).toUpperCase(),
    stationNo:normalizeText_(filters.stationNo)
  };
}

function filterStation_(s,f){
  if(f.region && s.region!==f.region)return false;
  if(f.branch && s.branch!==f.branch)return false;
  if(f.stationNo && s.stationNo!==f.stationNo)return false;
  return true;
}
function dateInRange_(d,start,end){return (!start||d>=start)&&(!end||d<=end);}
function dateKey_(d){return Utilities.formatDate(d,APP.TZ,'yyyy-MM-dd');}
function formatDateTime_(d){return Utilities.formatDate(d,APP.TZ,'yyyy-MM-dd HH:mm');}
function formatDateTimeSafe_(v){const d=asDate_(v);return d?formatDateTime_(d):'';}
function dateKeyFromValue_(v){const d=asDate_(v);return d?dateKey_(d):(typeof v==='string'?v.slice(0,10):'');}
function sortKeyFromValue_(v){const d=asDate_(v);return d?Utilities.formatDate(d,APP.TZ,'yyyy-MM-dd HH:mm:ss'):String(v||'');}
function asDate_(v){if(v instanceof Date && !isNaN(v.getTime()))return v; if(!v)return null; const d=new Date(v);return isNaN(d.getTime())?null:d;}
function parseDateKey_(s){if(!s)return null;const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));}
function daysInclusive_(a,b){const d1=parseDateKey_(a),d2=parseDateKey_(b);return d1&&d2?Math.floor((d2-d1)/86400000)+1:0;}
function monthsInclusive_(a,b){const d1=parseDateKey_(a),d2=parseDateKey_(b);return d1&&d2?((d2.getFullYear()-d1.getFullYear())*12+d2.getMonth()-d1.getMonth()+1):0;}
function maxDateKey_(a,b){if(!a)return b;if(!b)return a;return a>b?a:b;}
function minDateKey_(a,b){if(!a)return b;if(!b)return a;return a<b?a:b;}
function ageDays_(v){const d=asDate_(v);return d?Math.max(0,Math.floor((new Date()-d)/86400000)):0;}
function round1_(n){return Math.round(Number(n||0)*10)/10;}
function uniqueSorted_(arr){const m={};arr.forEach(function(x){m[String(x)]=true;});return Object.keys(m).sort(function(a,b){return a.localeCompare(b,'ar');});}
function csvArray_(v){return String(v||'').split(',').map(function(x){return x.trim();}).filter(function(x){return x&&x.toUpperCase()!=='ALL';});}
function normalizeText_(v){return String(v==null?'':v).trim();}
function toBool_(v){if(v===true||v===1)return true;const s=String(v||'').toLowerCase();return s==='true'||s==='1'||s==='yes'||s==='نعم';}
function sanitizeFileName_(name){return String(name||'file').replace(/[\\/:*?"<>|#%{}~]/g,'_').slice(0,120);}
function styleReportHeader_(range){range.setBackground('#009DDF').setFontColor('#FFFFFF').setFontWeight('bold');}
