/* ============================================================
   مزوّد Supabase — أونلاين حقيقي عبر الأجهزة
   • مصادقة إيميل/كلمة سر (bcrypt في Supabase)
   • حضور حيّ (Realtime Presence): من متصل الآن فعلاً
   • سجل دخول/خروج في جدول activity
   • صلاحيات محميّة بـ RLS (انظر supabase/schema.sql)
   إنشاء/حذف المستخدمين يمرّ عبر دالة Netlify آمنة تحمل مفتاح service_role.
   الواجهة مطابقة للمزوّد المحلّي فلا يتغيّر باقي التطبيق.
   ============================================================ */
import { createClient } from '@supabase/supabase-js';

const REFRESH_MS = 15000;
const FN_URL = '/.netlify/functions/admin-users';

export function createSupabaseAuth(url, anonKey) {
  const supa = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  let _me = null;            // الملف الشخصي للمستخدم الحالي (مُخزّن للقراءة المتزامنة)
  let _users = [];           // قائمة المستخدمين (للمدير)
  let _online = new Set();   // معرّفات المتصلين الآن (من الحضور الحيّ)
  let _activityId = null;    // معرّف سجل الدخول الحالي (لتحديث وقت الخروج)
  let _channel = null;
  let _timer = null;

  async function loadProfile(userId) {
    const { data } = await supa.from('profiles').select('*').eq('id', userId).single();
    return data ? mapProfile(data) : null;
  }
  function mapProfile(p, acts) {
    return {
      id: p.id, email: p.email, name: p.full_name || '', position: p.position || '',
      department: p.department || '', role: p.role || 'user', canExport: !!p.can_export,
      active: p.is_active !== false, lastLogin: acts?.login || null, lastLogout: acts?.logout || null,
    };
  }

  async function refreshUsers() {
    if (!_me || _me.role !== 'admin') return;
    const [{ data: profs }, { data: acts }] = await Promise.all([
      supa.from('profiles').select('*'),
      supa.from('activity').select('user_id, login_at, logout_at').order('login_at', { ascending: false }),
    ]);
    const latest = {};
    (acts || []).forEach(a => {
      const e = latest[a.user_id] || (latest[a.user_id] = {});
      if (!e.login) e.login = a.login_at;
      if (!e.logout && a.logout_at) e.logout = a.logout_at;
    });
    _users = (profs || []).map(p => mapProfile(p, latest[p.id]));
    api.onChange && api.onChange();
  }

  async function startPresence() {
    if (!_me) return;
    if (_channel) { try { await supa.removeChannel(_channel); } catch (e) {} }
    _channel = supa.channel('online', { config: { presence: { key: _me.id } } });
    _channel.on('presence', { event: 'sync' }, () => {
      _online = new Set(Object.keys(_channel.presenceState()));
      api.onChange && api.onChange();
    });
    _channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await _channel.track({ id: _me.id, at: Date.now() });
    });
  }

  async function logLogin() {
    const { data } = await supa.from('activity').insert({ user_id: _me.id }).select('id').single();
    _activityId = data ? data.id : null;
  }
  async function logLogout() {
    if (_activityId) { try { await supa.from('activity').update({ logout_at: new Date().toISOString() }).eq('id', _activityId); } catch (e) {} }
  }

  async function callAdmin(payload) {
    const { data: { session } } = await supa.auth.getSession();
    if (!session) return { ok: false, error: 'انتهت الجلسة — سجّل الدخول من جديد' };
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: j.error || `خطأ الخادم (${res.status})` };
      return { ok: true };
    } catch (e) { return { ok: false, error: 'تعذّر الاتصال بخادم الإدارة: ' + e.message }; }
  }

  const api = {
    mode: 'supabase',
    onChange: null,

    async init() {
      const { data: { session } } = await supa.auth.getSession();
      if (session) {
        _me = await loadProfile(session.user.id);
        if (_me) { await startPresence(); await refreshUsers(); if (_timer) clearInterval(_timer); _timer = setInterval(refreshUsers, REFRESH_MS); }
      }
      supa.auth.onAuthStateChange(async (_evt, sess) => {
        if (!sess) { _me = null; }
      });
      return { seededDefault: false };
    },

    currentUser() { return _me; },
    isAuthed() { return !!_me; },
    isAdmin() { return !!_me && _me.role === 'admin'; },
    canExport() { return !!_me && (_me.role === 'admin' || _me.canExport); },

    async signIn(email, password) {
      const { data, error } = await supa.auth.signInWithPassword({ email: (email || '').trim(), password });
      if (error) return { ok: false, error: /invalid/i.test(error.message) ? 'البريد أو كلمة المرور غير صحيحة' : error.message };
      _me = await loadProfile(data.user.id);
      if (!_me) return { ok: false, error: 'لا يوجد ملف شخصي — راجع المدير' };
      if (!_me.active) { await supa.auth.signOut(); _me = null; return { ok: false, error: 'الحساب موقوف — راجع المدير' }; }
      await logLogin();
      await startPresence();
      await refreshUsers();
      if (_timer) clearInterval(_timer); _timer = setInterval(refreshUsers, REFRESH_MS);
      return { ok: true, user: _me };
    },

    signOut() {
      const me = _me; _me = null;   // امسح فوراً ليتحدّث العرض
      (async () => {
        await logLogout();
        if (_channel) { try { await supa.removeChannel(_channel); } catch (e) {} _channel = null; }
        if (_timer) { clearInterval(_timer); _timer = null; }
        await supa.auth.signOut();
      })();
      return me;
    },

    startHeartbeat() { /* الحضور يُدار عبر Realtime — لا حاجة لنبض يدوي */ },
    stopHeartbeat() {},
    heartbeat() {},
    isOnline(u) { return !!u && _online.has(u.id); },
    touchAway() {
      // أفضل جهد عند إغلاق الصفحة: سجّل وقت الخروج (لا يضمن مع realtime لكنه مفيد)
      if (_activityId) { try { navigator.sendBeacon && supa.from('activity').update({ logout_at: new Date().toISOString() }).eq('id', _activityId); } catch (e) {} }
    },

    listUsers() { return _users; },

    async createUser(data) {
      if (!this.isAdmin()) return { ok: false, error: 'صلاحية المدير مطلوبة' };
      if (!/^\S+@\S+\.\S+$/.test((data.email || '').trim())) return { ok: false, error: 'أدخل بريداً صحيحاً' };
      if (!data.password || data.password.length < 6) return { ok: false, error: 'كلمة المرور ٦ أحرف على الأقل' };
      const r = await callAdmin({ action: 'create', ...data });
      if (r.ok) await refreshUsers();
      return r;
    },

    async updateUser(id, patch) {
      if (!this.isAdmin()) return { ok: false, error: 'صلاحية المدير مطلوبة' };
      // حقول الملف الشخصي مباشرة عبر RLS
      const prof = {};
      if (patch.name != null) prof.full_name = patch.name.trim();
      if (patch.position != null) prof.position = patch.position.trim();
      if (patch.department != null) prof.department = patch.department.trim();
      if (patch.role != null) prof.role = patch.role === 'admin' ? 'admin' : 'user';
      if (patch.canExport != null) prof.can_export = !!patch.canExport;
      if (patch.active != null) prof.is_active = !!patch.active;
      if (patch.email != null) prof.email = patch.email.trim();
      if (Object.keys(prof).length) {
        const { error } = await supa.from('profiles').update(prof).eq('id', id);
        if (error) return { ok: false, error: error.message };
      }
      // البريد/كلمة المرور تتطلّب صلاحية الخادم
      if (patch.email || patch.password) {
        const r = await callAdmin({ action: 'update', id, email: patch.email, password: patch.password });
        if (!r.ok) return r;
      }
      await refreshUsers();
      return { ok: true };
    },

    async deleteUser(id) {
      if (!this.isAdmin()) return { ok: false, error: 'صلاحية المدير مطلوبة' };
      if (_me && id === _me.id) return { ok: false, error: 'لا يمكنك حذف حسابك الحالي' };
      const r = await callAdmin({ action: 'delete', id });
      if (r.ok) await refreshUsers();
      return r;
    },
  };

  return api;
}
