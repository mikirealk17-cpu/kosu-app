-- 工数管理β版の新規登録・更新をDB側でも検証するSQLです。
--
-- 既存データを失わないため、制約は NOT VALID で追加します。
-- NOT VALIDでも、このSQL実行後の新規登録・更新には制約が適用されます。
-- 既存データの検査と制約VALIDATEは、末尾の確認SQLを実行して問題がない場合だけ行ってください。
--
-- 本番へ直接実行せず、バックアップ取得後にテスト環境で確認してください。

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_logs'::regclass
      and conname = 'work_logs_worker_required_beta'
  ) then
    alter table public.work_logs
      add constraint work_logs_worker_required_beta
      check (worker_id is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_logs'::regclass
      and conname = 'work_logs_break_minutes_beta'
  ) then
    alter table public.work_logs
      add constraint work_logs_break_minutes_beta
      check (
        coalesce(break1_minutes, 0) between 0 and 1440
        and coalesce(break2_minutes, 0) between 0 and 1440
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_logs'::regclass
      and conname = 'work_logs_time_order_beta'
  ) then
    alter table public.work_logs
      add constraint work_logs_time_order_beta
      check (start_time is not null and end_time is not null and end_time > start_time) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_logs'::regclass
      and conname = 'work_logs_actual_minutes_beta'
  ) then
    alter table public.work_logs
      add constraint work_logs_actual_minutes_beta
      check (
        actual_minutes between 1 and 1440
        and actual_minutes = (
          extract(epoch from (end_time - start_time)) / 60
        )::integer - coalesce(break1_minutes, 0) - coalesce(break2_minutes, 0)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_logs'::regclass
      and conname = 'work_logs_note_length_beta'
  ) then
    alter table public.work_logs
      add constraint work_logs_note_length_beta
      check (char_length(coalesce(note, '')) <= 1000) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seiban_master'::regclass
      and conname = 'seiban_master_text_length_beta'
  ) then
    alter table public.seiban_master
      add constraint seiban_master_text_length_beta
      check (
        seiban is not null
        and equipment_name is not null
        and char_length(btrim(seiban)) between 1 and 100
        and char_length(btrim(equipment_name)) between 1 and 200
      ) not valid;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;

-- 既存データの違反確認
-- select id, work_date, worker_id, start_time, end_time,
--        break1_minutes, break2_minutes, actual_minutes, note
-- from public.work_logs
-- where worker_id is null
--    or coalesce(break1_minutes, 0) not between 0 and 1440
--    or coalesce(break2_minutes, 0) not between 0 and 1440
--    or start_time is null
--    or end_time is null
--    or end_time <= start_time
--    or actual_minutes not between 1 and 1440
--    or actual_minutes <> (
--      extract(epoch from (end_time - start_time)) / 60
--    )::integer - coalesce(break1_minutes, 0) - coalesce(break2_minutes, 0)
--    or char_length(coalesce(note, '')) > 1000;

-- 違反が0件の場合だけ、テスト環境でVALIDATEします。
-- alter table public.work_logs validate constraint work_logs_worker_required_beta;
-- alter table public.work_logs validate constraint work_logs_break_minutes_beta;
-- alter table public.work_logs validate constraint work_logs_time_order_beta;
-- alter table public.work_logs validate constraint work_logs_actual_minutes_beta;
-- alter table public.work_logs validate constraint work_logs_note_length_beta;
-- alter table public.seiban_master validate constraint seiban_master_text_length_beta;
