-- 依序執行 schema.sql（若尚未執行）、beta_upgrade.sql、beta_timeline_upgrade.sql、此檔。
-- 此升級保留現有任務與完成紀錄。
alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check
  check (kind in ('once', 'daily', 'interval', 'weekly', 'monthly', 'yearly'));

-- points 現在是「自由分配」模式的相對權重；單日實得分數由當日排定的所有任務計算。
alter table public.tasks drop constraint if exists repeat_is_ten;

-- 當天排定超過 100 項時，有些任務會得到 0 分，但總和仍為 100 分。
alter table public.completions drop constraint if exists completions_awarded_points_check;
alter table public.completions add constraint completions_awarded_points_check
  check (awarded_points between 0 and 100);
