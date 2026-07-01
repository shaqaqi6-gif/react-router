/* ============================================================
   اختيار مزوّد المصادقة تلقائياً:
   - إن وُجدت مفاتيح Supabase (متغيّرات البيئة) → مزوّد Supabase (أونلاين حقيقي).
   - وإلا → المزوّد المحلّي (localStorage) للتجربة على متصفح واحد.
   الواجهة موحّدة فلا يتغيّر باقي التطبيق.
   ============================================================ */
import local from './auth-local.js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let auth = local;
if (URL && KEY) {
  try {
    const { createSupabaseAuth } = await import('./auth-supabase.js');
    auth = createSupabaseAuth(URL, KEY);
  } catch (e) {
    console.error('تعذّر تحميل مزوّد Supabase — سيُستخدم الوضع المحلّي:', e);
  }
}

export default auth;
