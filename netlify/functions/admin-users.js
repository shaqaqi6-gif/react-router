/* ============================================================
   دالة Netlify: إدارة مستخدمي المصادقة (إنشاء/تعديل/حذف)
   تحمل مفتاح service_role السرّي (متغيّر بيئة على Netlify، لا يصل للواجهة).
   تتحقّق أن المُنادي مدير مُفعّل قبل تنفيذ أي إجراء.
   متغيّرات البيئة المطلوبة على Netlify:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   ============================================================ */
import { createClient } from '@supabase/supabase-js';

function resp(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'method not allowed' });
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return resp(500, { error: 'الخادم غير مهيّأ (مفاتيح Supabase مفقودة)' });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // تحقّق من هوية المُنادي وأنه مدير مُفعّل
  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
  if (!token) return resp(401, { error: 'unauthorized' });
  const { data: userData, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !userData?.user) return resp(401, { error: 'unauthorized' });
  const { data: prof } = await admin.from('profiles').select('role, is_active').eq('id', userData.user.id).single();
  if (!prof || prof.role !== 'admin' || !prof.is_active) return resp(403, { error: 'صلاحية المدير مطلوبة' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { error: 'bad request' }); }

  try {
    if (body.action === 'create') {
      const { data, error } = await admin.auth.admin.createUser({
        email: (body.email || '').trim(), password: body.password, email_confirm: true,
        user_metadata: { full_name: body.name || '', position: body.position || '', department: body.department || '', role: body.role === 'admin' ? 'admin' : 'user', can_export: !!body.canExport },
      });
      if (error) return resp(400, { error: error.message });
      // تأكيد حقول الملف الشخصي (المُنشأ عبر المُشغّل trigger)
      await admin.from('profiles').update({
        full_name: body.name || '', position: body.position || '', department: body.department || '',
        role: body.role === 'admin' ? 'admin' : 'user', can_export: !!body.canExport, is_active: body.active !== false,
      }).eq('id', data.user.id);
      return resp(200, { ok: true });
    }

    if (body.action === 'update') {
      const upd = {};
      if (body.email) upd.email = body.email.trim();
      if (body.password) upd.password = body.password;
      if (Object.keys(upd).length) {
        const { error } = await admin.auth.admin.updateUserById(body.id, upd);
        if (error) return resp(400, { error: error.message });
      }
      return resp(200, { ok: true });
    }

    if (body.action === 'delete') {
      const { error } = await admin.auth.admin.deleteUser(body.id);
      if (error) return resp(400, { error: error.message });
      return resp(200, { ok: true });
    }

    return resp(400, { error: 'unknown action' });
  } catch (e) {
    return resp(500, { error: e.message });
  }
}
