-- 在既有 schema.sql 已執行的 Supabase 專案中執行一次。
-- 用 SQL Editor 指派 developer；網頁使用者無法自行修改角色。

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'developer'))
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

create policy "read own role" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time not null,
  title text not null check (char_length(trim(title)) between 1 and 100),
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'planned' check (status in ('planned', 'done')),
  constraint schedule_time_order check (end_time > start_time)
);

create index if not exists schedule_user_day_idx on public.schedule_entries(user_id, day, start_time);
alter table public.schedule_entries enable row level security;
revoke all on public.schedule_entries from anon, authenticated;
grant select, insert, update, delete on public.schedule_entries to authenticated;

-- 避免只隱藏前端按鈕：每一次讀寫都在資料庫驗證角色與資料擁有者。
create policy "developer reads own schedule" on public.schedule_entries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'developer')
  );

create policy "developer creates own schedule" on public.schedule_entries
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'developer')
  );

create policy "developer edits own schedule" on public.schedule_entries
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'developer')
  )
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'developer')
  );

create policy "developer deletes own schedule" on public.schedule_entries
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'developer')
  );

-- 指派角色範例：先從 Authentication → Users 複製自己的 User UID，
-- 再於 SQL Editor 執行下列指令（將 <USER_UID> 換成真正的 UUID）：
-- insert into public.user_roles(user_id, role)
-- values ('<USER_UID>'::uuid, 'developer')
-- on conflict (user_id) do update set role = excluded.role;
