/* =====================================================================
   Support.gs — تذاكر التواصل والوصول لقاعدة البيانات
   V8.0 · شركة الدريس — مراجعة أمنية V9.7: حدود أطوال، قوائم مسموحة، تحقق من المكلَّف، وسجل لمشاركة قاعدة البيانات
   ===================================================================== */
const TICKET_CATEGORIES_=Object.freeze(['تشغيل','صلاحيات','محطة','زيارة','ملاحظة','تقني','أخرى']);
const TICKET_PRIORITIES_=Object.freeze(['LOW','NORMAL','HIGH','URGENT']);
const TICKET_STATUSES_=Object.freeze(['OPEN','IN_PROGRESS','CLOSED']);
function ticketSheets_(){const ss=getDb_();return{tickets:ss.getSheetByName(APP.SHEETS.TICKETS),messages:ss.getSheetByName(APP.SHEETS.TICKET_MESSAGES)};}
function ticketObject_(r){return{ticketId:String(r.TICKET_ID||''),computerNo:String(r.COMPUTER_NO||''),name:String(r.NAME||''),category:String(r.CATEGORY||''),subject:String(r.SUBJECT||''),body:String(r.BODY||''),status:String(r.STATUS||'OPEN'),priority:String(r.PRIORITY||'NORMAL'),assignedTo:String(r.ASSIGNED_TO||''),createdAt:formatDateTimeSafe_(r.CREATED_AT),updatedAt:formatDateTimeSafe_(r.UPDATED_AT),lastReplyAt:formatDateTimeSafe_(r.LAST_REPLY_AT),lastReplyBy:String(r.LAST_REPLY_BY||''),unreadForUser:toBool_(r.UNREAD_FOR_USER),unreadForAdmin:toBool_(r.UNREAD_FOR_ADMIN)};}
function canManageTickets_(s){return s.roleId==='SYSTEM_ADMIN'||hasPermission_(s,'TICKET_MANAGE');}
function ticketManagers_(){return sheetObjects_(getDb_().getSheetByName(APP.SHEETS.USERS)).filter(function(u){const role=normalizeRoleId_(u.ROLE_ID||u.ROLE||'');return toBool_(u.ACTIVE)&&['SYSTEM_ADMIN','OPERATIONS_MANAGER','OPERATIONS_DEPUTY','SUPERVISION_MANAGER'].indexOf(role)!==-1;}).map(function(u){return{computerNo:String(u.COMPUTER_NO||''),name:String(u.NAME||'')};});}
function ticketId_(id){return limitText_(normalizeText_(id),60);}
function findTicket_(ts,id){return sheetObjects_(ts.tickets).filter(function(x){return String(x.TICKET_ID||'')===id;})[0]||null;}
function getTicketMeta(token){const s=requireSession_(token);return{categories:TICKET_CATEGORIES_.slice(),priorities:TICKET_PRIORITIES_.slice(),managers:canManageTickets_(s)?ticketManagers_():[]};}
function createTicket(token,p){
  const s=requireSession_(token);p=p||{};
  const subject=limitText_(normalizeText_(p.subject),200),body=limitText_(normalizeText_(p.body),4000);
  if(!subject||!body)throw new Error('العنوان والتفاصيل مطلوبة.');
  const category=TICKET_CATEGORIES_.indexOf(normalizeText_(p.category))!==-1?normalizeText_(p.category):'أخرى';
  const priority=TICKET_PRIORITIES_.indexOf(String(p.priority||'').toUpperCase())!==-1?String(p.priority).toUpperCase():'NORMAL';
  // V9.7: حدّ 20 تذكرة مفتوحة لكل مستخدم حتى لا يُغرق أحد الجدول
  const openMine=sheetObjects_(ticketSheets_().tickets).filter(function(t){return String(t.COMPUTER_NO||'')===s.computerNo&&String(t.STATUS||'OPEN')!=='CLOSED';}).length;
  if(openMine>=20)throw new Error('لديك 20 تذكرة مفتوحة — أغلق بعضها أو انتظر الرد قبل فتح جديدة.');
  const sh=ticketSheets_().tickets,id='TKT-'+Utilities.formatDate(new Date(),APP.TZ,'yyyyMMddHHmmss')+'-'+Utilities.getUuid().slice(0,5),now=new Date();
  appendObject_(sh,{TICKET_ID:id,COMPUTER_NO:s.computerNo,NAME:s.name,CATEGORY:category,SUBJECT:subject,BODY:body,STATUS:'OPEN',PRIORITY:priority,ASSIGNED_TO:'',CREATED_AT:now,UPDATED_AT:now,LAST_REPLY_AT:now,LAST_REPLY_BY:s.computerNo,UNREAD_FOR_USER:false,UNREAD_FOR_ADMIN:true});
  ticketManagers_().slice(0,3).forEach(function(m){notify_(m.computerNo,'NEW_TICKET','تذكرة دعم جديدة',subject,id,s.computerNo);});
  return{ok:true,ticketId:id};
}
function listMyTickets(token){const s=requireSession_(token);return sheetObjects_(ticketSheets_().tickets).filter(function(t){return String(t.COMPUTER_NO||'')===s.computerNo;}).sort(function(a,b){return sortKeyFromValue_(b.UPDATED_AT).localeCompare(sortKeyFromValue_(a.UPDATED_AT));}).map(ticketObject_);}
function getTicket(token,id){
  const s=requireSession_(token),ts=ticketSheets_();id=ticketId_(id);
  const t=findTicket_(ts,id);if(!t)throw new Error('التذكرة غير موجودة.');
  if(String(t.COMPUTER_NO||'')!==s.computerNo&&!canManageTickets_(s))throw new Error('التذكرة خارج صلاحيتك.');
  const msgs=sheetObjects_(ts.messages).filter(function(m){return String(m.TICKET_ID||'')===id;}).sort(function(a,b){return sortKeyFromValue_(a.CREATED_AT).localeCompare(sortKeyFromValue_(b.CREATED_AT));}).map(function(m){return{id:String(m.MESSAGE_ID||''),computerNo:String(m.COMPUTER_NO||''),name:String(m.NAME||''),body:String(m.BODY||''),createdAt:formatDateTimeSafe_(m.CREATED_AT),fromAdmin:toBool_(m.FROM_ADMIN)};});
  updateRowsByKeys_(ts.tickets,{TICKET_ID:id},canManageTickets_(s)?{UNREAD_FOR_ADMIN:false}:{UNREAD_FOR_USER:false});
  return{ticket:ticketObject_(t),messages:msgs};
}
function replyTicket(token,id,body){
  const s=requireSession_(token),ts=ticketSheets_();id=ticketId_(id);body=limitText_(normalizeText_(body),4000);
  if(!body)throw new Error('اكتب الرد.');
  const t=findTicket_(ts,id);if(!t)throw new Error('التذكرة غير موجودة.');
  if(String(t.STATUS||'OPEN')==='CLOSED')throw new Error('هذه التذكرة مغلقة. مدير النظام يستطيع إعادة فتحها إذا لزم.');
  const admin=canManageTickets_(s);
  if(String(t.COMPUTER_NO||'')!==s.computerNo&&!admin)throw new Error('التذكرة خارج صلاحيتك.');
  appendObject_(ts.messages,{MESSAGE_ID:'MSG-'+Utilities.getUuid(),TICKET_ID:id,COMPUTER_NO:s.computerNo,NAME:s.name,BODY:body,CREATED_AT:new Date(),FROM_ADMIN:admin});
  updateRowsByKeys_(ts.tickets,{TICKET_ID:id},{UPDATED_AT:new Date(),LAST_REPLY_AT:new Date(),LAST_REPLY_BY:s.computerNo,UNREAD_FOR_USER:admin,UNREAD_FOR_ADMIN:!admin});
  if(admin)notify_(String(t.COMPUTER_NO||''),'TICKET_REPLY','رد جديد على تذكرتك',String(t.SUBJECT||''),id,s.computerNo);
  return{ok:true};
}
function adminListTickets(token,filters){
  const s=requireSession_(token);if(!canManageTickets_(s))throw new Error('ليس لديك صلاحية.');filters=filters||{};
  const st=String(filters.status||'').toUpperCase();
  return sheetObjects_(ticketSheets_().tickets).filter(function(t){return !st||String(t.STATUS||'')===st;}).sort(function(a,b){return sortKeyFromValue_(b.UPDATED_AT).localeCompare(sortKeyFromValue_(a.UPDATED_AT));}).slice(0,200).map(ticketObject_);
}
function adminUpdateTicket(token,id,p){
  const s=requireSession_(token),ts=ticketSheets_();if(!canManageTickets_(s))throw new Error('ليس لديك صلاحية.');p=p||{};id=ticketId_(id);
  const t=findTicket_(ts,id);if(!t)throw new Error('التذكرة غير موجودة.');
  const nextStatus=normalizeText_(p.status||t.STATUS||'OPEN').toUpperCase();
  if(TICKET_STATUSES_.indexOf(nextStatus)===-1)throw new Error('حالة التذكرة غير صحيحة.');
  if(nextStatus==='CLOSED'&&s.roleId!=='SYSTEM_ADMIN')throw new Error('إغلاق التذكرة متاح لمدير النظام فقط.');
  const priority=String(p.priority||t.PRIORITY||'NORMAL').toUpperCase();
  if(TICKET_PRIORITIES_.indexOf(priority)===-1)throw new Error('أولوية التذكرة غير صحيحة.');
  // V9.7: المكلَّف يجب أن يكون من مديري التذاكر النشطين (أو فارغًا)
  const assignedTo=limitText_(normalizeText_(p.assignedTo!==undefined?p.assignedTo:t.ASSIGNED_TO),32);
  if(assignedTo&&!ticketManagers_().some(function(m){return m.computerNo===assignedTo;}))throw new Error('المكلَّف ليس من مديري التذاكر.');
  updateRowsByKeys_(ts.tickets,{TICKET_ID:id},{STATUS:nextStatus,PRIORITY:priority,ASSIGNED_TO:assignedTo,UPDATED_AT:new Date(),UNREAD_FOR_USER:true});
  if(nextStatus!==String(t.STATUS||'')){const label=nextStatus==='CLOSED'?'مغلقة':(nextStatus==='IN_PROGRESS'?'تحت المعالجة':'مفتوحة');notify_(String(t.COMPUTER_NO||''),'TICKET_STATUS','تم تحديث حالة التذكرة','حالة التذكرة '+id+' أصبحت: '+label+'.',id,s.computerNo);audit_(s.computerNo,'TICKET_STATUS_CHANGED',id,String(t.STATUS||'')+' -> '+nextStatus);}
  return{ok:true,status:nextStatus};
}
function requireSystemAdmin_(token){const s=requireSession_(token);if(s.roleId!=='SYSTEM_ADMIN')throw new Error('مدير النظام فقط.');return s;}
function adminGetDatabaseAccess(token,includeEditors){
  requireSystemAdmin_(token);
  const id=PropertiesService.getScriptProperties().getProperty(APP.DB_PROP);
  if(!id)throw new Error('لم يتم العثور على قاعدة بيانات المنصة.');
  const ss=SpreadsheetApp.openById(id);
  const out={ok:true,id:id,name:ss.getName(),url:ss.getUrl(),editors:[],editorsLoaded:false,sharingAvailable:true,sharingError:''};
  // V8.1.1: لا نقرأ Drive عند فتح الصفحة. هذا يمنع NetworkError / HTTP 0.
  // قراءة المحررين تتم فقط عند ضغط مدير النظام على زر "إدارة المحررين".
  if(includeEditors===true){
    try{
      const file=DriveApp.getFileById(id);
      out.editors=file.getEditors().map(function(u){return String(u.getEmail()||'');}).filter(Boolean);
      out.editorsLoaded=true;
    }catch(e){
      out.sharingAvailable=false;
      out.sharingError='تعذر قراءة صلاحيات Google Drive من Web App. افتح Google Sheets واستخدم زر «مشاركة» لإدارة المحررين.';
    }
  }
  return out;
}
/* V9.7: مشاركة قاعدة البيانات أخطر إجراء في المنصة (المحرر يرى كل شيء ويعدّل الأدوار) — صيغة بريد صارمة وسجل تدقيق دائم */
function adminShareDatabase(token,email){
  const s=requireSystemAdmin_(token);email=limitText_(normalizeText_(email),120).toLowerCase();
  if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email))throw new Error('البريد غير صحيح.');
  DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty(APP.DB_PROP)).addEditor(email);
  audit_(s.computerNo,'DB_EDITOR_ADDED',email,'إضافة محرر لقاعدة البيانات');
  return{ok:true};
}
function adminUnshareDatabase(token,email){
  const s=requireSystemAdmin_(token);email=limitText_(normalizeText_(email),120).toLowerCase();
  if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email))throw new Error('البريد غير صحيح.');
  DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty(APP.DB_PROP)).removeEditor(email);
  audit_(s.computerNo,'DB_EDITOR_REMOVED',email,'إزالة محرر من قاعدة البيانات');
  return{ok:true};
}
