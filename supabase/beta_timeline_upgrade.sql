-- 先執行 beta_upgrade.sql，然後執行本檔。可重複執行。
-- 小時 24–26 表示所選日期的隔天凌晨 00:00–02:00。
alter table public.schedule_entries add column if not exists lane text;
alter table public.schedule_entries add column if not exists start_hour integer;
alter table public.schedule_entries add column if not exists end_hour integer;
alter table public.schedule_entries add column if not exists task_id uuid;

update public.schedule_entries
set lane = coalesce(lane, 'planned'),
    start_hour = coalesce(start_hour, extract(hour from start_time)::integer),
    end_hour = coalesce(end_hour, greatest(extract(hour from start_time)::integer + 1, ceil(extract(epoch from end_time) / 3600)::integer))
where lane is null or start_hour is null or end_hour is null;

alter table public.schedule_entries alter column lane set default 'planned';
alter table public.schedule_entries alter column lane set not null;
alter table public.schedule_entries alter column start_hour set not null;
alter table public.schedule_entries alter column end_hour set not null;
alter table public.schedule_entries drop constraint if exists schedule_time_order;
alter table public.schedule_entries drop constraint if exists schedule_lane_check;
alter table public.schedule_entries add constraint schedule_lane_check check (lane in ('planned', 'actual'));
alter table public.schedule_entries drop constraint if exists schedule_hours_check;
alter table public.schedule_entries add constraint schedule_hours_check check (start_hour between 0 and 25 and end_hour between 1 and 26 and end_hour > start_hour);

-- 跨帳號的待辦無法被連結；刪除待辦時只解除連結，行程紀錄保留。
alter table public.schedule_entries drop constraint if exists schedule_task_owner;
alter table public.schedule_entries add constraint schedule_task_owner
  foreign key (task_id, user_id) references public.tasks(id, user_id)
  on delete set null (task_id);
create index if not exists schedule_task_idx on public.schedule_entries(task_id) where task_id is not null;
