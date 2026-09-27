-- 在 Supabase SQL Editor 執行一次。只使用 publishable key + Supabase Auth；不要在前端放 service_role key。
create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  kind text not null check (kind in ('daily', 'interval', 'weekly', 'monthly', 'yearly')),
  points integer not null check (points between 1 and 100),
  weight integer not null default 1 check (weight between 1 and 100),
  interval_days integer check (interval_days between 1 and 365),
  anchor_date date,
  weekdays integer[] not null default '{}',
  day_of_month integer check (day_of_month between 1 and 31),
  month_of_year integer check (month_of_year between 1 and 12),
  created_on date not null,
  archived_on date,
  sort_order integer not null default 0,
  constraint repeat_is_ten check (kind = 'daily' or points = 10),
  constraint task_owner_unique unique (id, user_id)
);

create table if not exists public.completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  occurrence_key date not null,
  completed_on date not null,
  awarded_points integer not null check (awarded_points between 1 and 100),
  constraint completion_task_owner foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  constraint one_completion_per_task_day unique (user_id, task_id, occurrence_key)
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allocation_mode text not null default 'equal' check (allocation_mode in ('manual', 'weighted', 'equal'))
);

create index if not exists tasks_user_idx on public.tasks(user_id, sort_order);
create index if not exists completions_user_day_idx on public.completions(user_id, completed_on desc);

alter table public.tasks enable row level security;
alter table public.completions enable row level security;
alter table public.settings enable row level security;

-- RLS：只能讀寫自己的任務、完成紀錄及設定。
create policy "tasks select own" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks insert own" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks update own" on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks delete own" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);

create policy "completions select own" on public.completions for select to authenticated using ((select auth.uid()) = user_id);
create policy "completions insert own" on public.completions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "completions update own" on public.completions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "completions delete own" on public.completions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "settings select own" on public.settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "settings insert own" on public.settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "settings update own" on public.settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "settings delete own" on public.settings for delete to authenticated using ((select auth.uid()) = user_id);
