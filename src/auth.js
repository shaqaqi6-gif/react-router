/* ============================================================
   نظام المستخدمين والصلاحيات — طبقة مزوّد قابلة للتبديل
   الوضع الحالي: مزوّد محلّي (localStorage) — يعمل للاختبار على متصفح واحد.
   لاحقاً: مزوّد Supabase يفعّل الحضور الحقيقي عبر الأجهزة (انظر SUPABASE_SETUP.md).
   واجهة موحّدة يستهلكها التطبيق بحيث لا يتغيّر شيء عند تبديل المزوّد.
   ============================================================ */

const LS_USERS = 'aldrees_users';
const SS_UID = 'aldrees_uid';
const ONLINE_MS = 70 * 1000;      // يُعدّ متصلاً إن ظهر نبضه خلال 70 ثانية
const HEARTBEAT_MS = 30 * 1000;

async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
function nowISO() { return new Date().toISOString(); }
function uid() { return 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function readUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS) || '[]'); } catch (e) { return []; }
}
function writeUsers(list) {
  try { localStorage.setItem(LS_USERS, JSON.stringify(list)); return true; } catch (e) { return false; }
}

const auth = {
  mode: 'local',
  _hbTimer: null,

  // تهيئة: أنشئ مدير النظام الافتراضي عند أول تشغيل
  async init() {
    let users = readUsers();
    if (!users.length) {
      const admin = {
        id: uid(), email: 'admin@aldrees.sa', name: 'مدير النظام', position: 'مدير النظام',
        department: 'الإدارة', role: 'admin', canExport: true, active: true,
        pwHash: await sha256('Admin@1234'), createdAt: nowISO(),
        lastLogin: null, lastLogout: null, lastSeen: 0,
      };
      users = [admin];
      writeUsers(users);
    }
    return { seededDefault: users.length === 1 && users[0].email === 'admin@aldrees.sa' };
  },

  currentUser() {
    const id = sessionStorage.getItem(SS_UID);
    if (!id) return null;
    return readUsers().find(u => u.id === id) || null;
  },
  isAuthed() { return !!this.currentUser(); },
  isAdmin() { const u = this.currentUser(); return !!u && u.role === 'admin'; },
  canExport() { const u = this.currentUser(); return !!u && (u.role === 'admin' || u.canExport); },

  async signIn(email, password) {
    const users = readUsers();
    const em = (email || '').trim().toLowerCase();
    const u = users.find(x => (x.email || '').toLowerCase() === em);
    if (!u) return { ok: false, error: 'المستخدم غير موجود' };
    if (!u.active) return { ok: false, error: 'الحساب موقوف — راجع المدير' };
    if (u.pwHash !== await sha256(password)) return { ok: false, error: 'كلمة المرور غير صحيحة' };
    u.lastLogin = nowISO(); u.lastSeen = Date.now();
    writeUsers(users);
    sessionStorage.setItem(SS_UID, u.id);
    this.startHeartbeat();
    return { ok: true, user: u };
  },

  signOut() {
    const users = readUsers();
    const id = sessionStorage.getItem(SS_UID);
    const u = users.find(x => x.id === id);
    if (u) { u.lastLogout = nowISO(); u.lastSeen = 0; writeUsers(users); }
    sessionStorage.removeItem(SS_UID);
    this.stopHeartbeat();
  },

  startHeartbeat() {
    this.heartbeat();
    if (this._hbTimer) clearInterval(this._hbTimer);
    this._hbTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  },
  stopHeartbeat() { if (this._hbTimer) { clearInterval(this._hbTimer); this._hbTimer = null; } },
  heartbeat() {
    const users = readUsers();
    const id = sessionStorage.getItem(SS_UID);
    const u = users.find(x => x.id === id);
    if (u) { u.lastSeen = Date.now(); writeUsers(users); }
  },
  isOnline(u) { return !!u && u.lastSeen && (Date.now() - u.lastSeen) < ONLINE_MS; },

  // عند إغلاق الصفحة: سجّل وقت الخروج واجعله غير متصل (تُبقى الجلسة للتحديث)
  touchAway() {
    const users = readUsers();
    const u = users.find(x => x.id === sessionStorage.getItem(SS_UID));
    if (u) { u.lastLogout = nowISO(); u.lastSeen = 0; writeUsers(users); }
  },

  // ---- إدارة (للمدير فقط) ----
  listUsers() { return readUsers(); },

  async createUser(data) {
    if (!this.isAdmin()) return { ok: false, error: 'صلاحية المدير مطلوبة' };
    const users = readUsers();
    const em = (data.email || '').trim().toLowerCase();
    if (!em || !/^\S+@\S+\.\S+$/.test(em)) return { ok: false, error: 'أدخل بريداً إلكترونياً صحيحاً' };
    if (!data.password || data.password.length < 6) return { ok: false, error: 'كلمة المرور ٦ أحرف على الأقل' };
    if (users.some(u => (u.email || '').toLowerCase() === em)) return { ok: false, error: 'البريد مستخدم مسبقاً' };
    users.push({
      id: uid(), email: em, name: (data.name || '').trim(), position: (data.position || '').trim(),
      department: (data.department || '').trim(), role: data.role === 'admin' ? 'admin' : 'user',
      canExport: !!data.canExport, active: data.active !== false, pwHash: await sha256(data.password),
      createdAt: nowISO(), lastLogin: null, lastLogout: null, lastSeen: 0,
    });
    writeUsers(users);
    return { ok: true };
  },

  async updateUser(id, patch) {
    if (!this.isAdmin()) return { ok: false, error: 'صلاحية المدير مطلوبة' };
    const users = readUsers();
    const u = users.find(x => x.id === id);
    if (!u) return { ok: false, error: 'المستخدم غير موجود' };
    if (patch.email != null) {
      const em = patch.email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(em)) return { ok: false, error: 'بريد غير صحيح' };
      if (users.some(x => x.id !== id && (x.email || '').toLowerCase() === em)) return { ok: false, error: 'البريد مستخدم مسبقاً' };
      u.email = em;
    }
    if (patch.name != null) u.name = patch.name.trim();
    if (patch.position != null) u.position = patch.position.trim();
    if (patch.department != null) u.department = patch.department.trim();
    if (patch.role != null) u.role = patch.role === 'admin' ? 'admin' : 'user';
    if (patch.canExport != null) u.canExport = !!patch.canExport;
    if (patch.active != null) u.active = !!patch.active;
    if (patch.password) { if (patch.password.length < 6) return { ok: false, error: 'كلمة المرور ٦ أحرف على الأقل' }; u.pwHash = await sha256(patch.password); }
    writeUsers(users);
    return { ok: true };
  },

  async deleteUser(id) {
    if (!this.isAdmin()) return { ok: false, error: 'صلاحية المدير مطلوبة' };
    if (id === sessionStorage.getItem(SS_UID)) return { ok: false, error: 'لا يمكنك حذف حسابك الحالي' };
    let users = readUsers();
    const admins = users.filter(u => u.role === 'admin');
    const target = users.find(u => u.id === id);
    if (target && target.role === 'admin' && admins.length <= 1) return { ok: false, error: 'يجب بقاء مدير واحد على الأقل' };
    users = users.filter(u => u.id !== id);
    writeUsers(users);
    return { ok: true };
  },
};

export default auth;
