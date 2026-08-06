-- 工数管理β版 DB入力制約適用前の確認専用SQLです。
-- このSQLはデータや設定を変更しません。
-- work_logs_existing_data と seiban_master_existing_data の issue_count が0なら、
-- 既存データは予定している制約に適合しています。

with work_log_violations as (
  select
    id,
    work_date,
    worker_id,
    start_time,
    end_time,
    break1_minutes,
    break2_minutes,
    actual_minutes,
    note,
    case
      when worker_id is null then 'worker_id_empty'
      when coalesce(break1_minutes, 0) not between 0 and 1440 then 'break1_minutes_invalid'
      when coalesce(break2_minutes, 0) not between 0 and 1440 then 'break2_minutes_invalid'
      when start_time is null then 'start_time_empty'
      when end_time is null then 'end_time_empty'
      when end_time <= start_time then 'time_order_invalid'
      when actual_minutes not between 1 and 1440 then 'actual_minutes_range_invalid'
      when actual_minutes <> (
        extract(epoch from (end_time - start_time)) / 60
      )::integer - coalesce(break1_minutes, 0) - coalesce(break2_minutes, 0) then 'actual_minutes_mismatch'
      when char_length(coalesce(note, '')) > 1000 then 'note_too_long'
      else null
    end as reason
  from public.work_logs
),
seiban_violations as (
  select
    id,
    seiban,
    equipment_name,
    case
      when seiban is null or char_length(btrim(seiban)) = 0 then 'seiban_empty'
      when char_length(btrim(seiban)) > 100 then 'seiban_too_long'
      when equipment_name is null or char_length(btrim(equipment_name)) = 0 then 'equipment_name_empty'
      when char_length(btrim(equipment_name)) > 200 then 'equipment_name_too_long'
      else null
    end as reason
  from public.seiban_master
),
expected_constraints as (
  select 'work_logs' as table_name, 'work_logs_worker_required_beta' as constraint_name
  union all select 'work_logs', 'work_logs_break_minutes_beta'
  union all select 'work_logs', 'work_logs_time_order_beta'
  union all select 'work_logs', 'work_logs_actual_minutes_beta'
  union all select 'work_logs', 'work_logs_note_length_beta'
  union all select 'seiban_master', 'seiban_master_text_length_beta'
),
existing_constraints as (
  select
    c.relname as table_name,
    con.conname as constraint_name,
    con.convalidated
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
)
select
  'work_logs_existing_data' as check_name,
  count(*) filter (where reason is not null) as issue_count,
  array_agg(id::text || ':' || reason order by work_date, id)
    filter (where reason is not null) as details
from work_log_violations
union all
select
  'seiban_master_existing_data',
  count(*) filter (where reason is not null),
  array_agg(id::text || ':' || reason order by seiban, id)
    filter (where reason is not null)
from seiban_violations
union all
select
  'expected_constraints_present',
  count(*) filter (where existing_constraints.constraint_name is null),
  array_agg(expected_constraints.constraint_name order by expected_constraints.constraint_name)
    filter (where existing_constraints.constraint_name is null)
from expected_constraints
left join existing_constraints
  on existing_constraints.table_name = expected_constraints.table_name
 and existing_constraints.constraint_name = expected_constraints.constraint_name
union all
select
  'expected_constraints_validated',
  count(*) filter (where existing_constraints.constraint_name is not null and not existing_constraints.convalidated),
  array_agg(expected_constraints.constraint_name order by expected_constraints.constraint_name)
    filter (where existing_constraints.constraint_name is not null and not existing_constraints.convalidated)
from expected_constraints
left join existing_constraints
  on existing_constraints.table_name = expected_constraints.table_name
 and existing_constraints.constraint_name = expected_constraints.constraint_name;
