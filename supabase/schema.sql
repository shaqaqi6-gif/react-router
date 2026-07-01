-- ============================================================
-- مخطّط قاعدة بيانات نظام مستخدمي منصّة تدقيق نقليات الدريس (Supabase)
-- شغّل هذا الملف كاملاً في: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1) الملفات الشخصية (مرتبطة بحسابات المصادقة auth.users)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text default '',
  position    text default '',
  department  text default '',
  role        text not null default 'user' check (role in ('admin','user')),
  can_export  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 2) سجل الدخول والخروج
create table if not exists public.activity (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  login_at  timestamptz not null default now(),
  logout_at timestamptz
);
create index if not exists activity_user_idx on public.activity(user_id, login_at desc);

-- 3) دالة: هل المستخدم الحالي مدير مُفعّل؟
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- 4) تفعيل حماية الصفوف (RLS)
alter table public.profiles enable row level security;
alter table public.activity enable row level security;

-- سياسات profiles: قراءة لكل مُصادَق (لعرض الفريق) · تعديل النفس · صلاحية كاملة للمدير
drop policy if exists "profiles read"        on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles admin all"   on public.profiles;
create policy "profiles read"        on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles self update" on public.profiles for update using (id = auth.uid());
create policy "profiles admin all"   on public.profiles for all    using (public.is_admin()) with check (public.is_admin());

-- سياسات activity: المستخدم يكتب سجلّه · المدير يقرأ الكل
drop policy if exists "activity own insert" on public.activity;
drop policy if exists "activity own update" on public.activity;
drop policy if exists "activity read"       on public.activity;
create policy "activity own insert" on public.activity for insert with check (user_id = auth.uid());
create policy "activity own update" on public.activity for update using (user_id = auth.uid());
create policy "activity read"       on public.activity for select using (user_id = auth.uid() or public.is_admin());

-- 5) إنشاء الملف الشخصي تلقائياً عند إنشاء حساب مصادقة جديد
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, position, department, role, can_export)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'position', ''),
    coalesce(new.raw_user_meta_data->>'department', ''),
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    coalesce((new.raw_user_meta_data->>'can_export')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- بعد إنشاء أول مستخدم (سجّل دخوله مرة عبر التطبيق أو من Authentication → Add user)
-- اجعله مديراً بتشغيل هذا السطر (استبدل البريد):
--   update public.profiles set role='admin', can_export=true, is_active=true
--   where email='YOUR_ADMIN_EMAIL@aldrees.sa';
-- ============================================================
