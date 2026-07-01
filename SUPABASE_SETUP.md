# تفعيل الخادم الحقيقي (Supabase) — دليل الإعداد

النظام يعمل حالياً في **وضع محلّي** (المستخدمون والحضور على متصفح واحد فقط).
لتفعيل **الحضور الحقيقي عبر الأجهزة** والمصادقة الآمنة، اربط Supabase بالخطوات التالية.

> النتيجة بعد الربط: مصادقة إيميل/كلمة سر مشفّرة، معرفة من متصل الآن فعلاً عبر
> كل الأجهزة، سجل دخول/خروج مركزي، وصلاحيات لا يمكن تجاوزها (Row-Level Security).

## 1) إنشاء مشروع Supabase (مجاني)
1. ادخل [supabase.com](https://supabase.com) → New project. اختر اسماً وكلمة سر لقاعدة البيانات.
2. بعد اكتمال التجهيز (~دقيقتان)، افتح **Project Settings → API** وانسخ:
   - **Project URL** (مثل `https://xxxx.supabase.co`)
   - **anon public key** (مفتاح عام آمن للنشر في الواجهة)
   - **service_role key** (سرّي — لا يوضع في الواجهة أبداً؛ للخادم فقط)

## 2) إنشاء الجداول والصلاحيات
1. افتح **SQL Editor → New query**.
2. الصق كامل محتوى `supabase/schema.sql` واضغط **Run**.

## 3) إنشاء أول مدير
1. **Authentication → Users → Add user**: أدخل بريدك وكلمة سر (فعّل Auto-confirm).
2. عُد إلى **SQL Editor** ونفّذ (استبدل بريدك):
   ```sql
   update public.profiles set role='admin', can_export=true, is_active=true
   where email='YOUR_ADMIN_EMAIL@aldrees.sa';
   ```

## 4) ربط المفاتيح بالتطبيق
اختر إحدى الطريقتين:

**أ) متغيّرات بيئة (المفضّل للنشر على Netlify):**
في Netlify → Site settings → Environment variables، أضف:
```
VITE_SUPABASE_URL       = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY  = <anon public key>
```
ثم أعد النشر (Redeploy). سيلتقطها البناء تلقائياً ويتحوّل النظام لوضع الخادم.

**ب) ملف محلّي للتجربة:** أنشئ `.env` في جذر المشروع (لا يُرفع إلى Git — مشمول بـ `.gitignore`):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

## 5) إضافة المستخدمين من داخل التطبيق
لأن إنشاء مستخدم لآخر يتطلّب مفتاح `service_role` السرّي، يُنشأ عبر **دالة Netlify** آمنة
(تُضاف في المرحلة التالية). حتى ذلك الحين يمكن للمدير إضافة المستخدمين من
**Supabase → Authentication → Add user**، ثم ضبط المنصب/القسم/الصلاحيات من صفحة
«إدارة المستخدمين» في التطبيق.

---

### ملاحظة أمنية
- `anon key` عام وآمن في الواجهة — الحماية الفعلية عبر سياسات RLS في قاعدة البيانات.
- `service_role key` سرّي تماماً — يوضع فقط كمتغيّر بيئة في الخادم (Netlify Functions)، ولا يُرفع إلى Git.

بعد إتمام الخطوات 1–4، أرسل لي **Project URL** و**anon key** (كلاهما عام وآمن)
لأكمل ربط مزوّد Supabase في الكود وأتحقّق من عمله فعلياً.
