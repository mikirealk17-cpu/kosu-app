-- 工数管理版として商品化する前に、匿名ユーザーから金額系データを隠すためのSQLです。
-- Supabase SQL Editorで実行してください。
--
-- 方針:
-- - DBのテーブルや列は削除しません。
-- - 単価・請求機能は第2段階でログインと権限管理を入れてから戻します。
-- - 第1段階では anon 公開キーから rate_master と金額列を読めない・書けない状態にします。
--
-- 実行後に確認すること:
-- - 工数入力、履歴編集、集計、明細CSV、表示中集計CSVが動くこと
-- - rate_master が公開キーから読めないこと
-- - work_logs の rate_type、rate_master_id、unit_price、billing_amount が公開キーから読めないこと

begin;

-- 単価マスタは第2段階まで匿名ユーザーから完全に隠します。
revoke all privileges on table public.rate_master from anon;

drop policy if exists "rate_master_select_public" on public.rate_master;
drop policy if exists "rate_master_insert_public" on public.rate_master;
drop policy if exists "rate_master_update_public" on public.rate_master;

-- 工数記録は、工数管理版に必要な列だけ匿名ユーザーへ許可します。
-- 既存の table-level 権限を外してから、列単位で許可し直します。
revoke select, insert, update on table public.work_logs from anon;

grant select (
  id,
  work_date,
  seiban_id,
  work_type_id,
  worker_id,
  billing_company_id,
  start_time,
  end_time,
  break1_minutes,
  break2_minutes,
  actual_minutes,
  note,
  created_at,
  updated_at
) on table public.work_logs to anon;

grant insert (
  work_date,
  seiban_id,
  work_type_id,
  worker_id,
  billing_company_id,
  start_time,
  end_time,
  break1_minutes,
  break2_minutes,
  actual_minutes,
  note
) on table public.work_logs to anon;

grant update (
  work_date,
  seiban_id,
  work_type_id,
  worker_id,
  billing_company_id,
  start_time,
  end_time,
  break1_minutes,
  break2_minutes,
  actual_minutes,
  note,
  updated_at
) on table public.work_logs to anon;

-- 履歴削除は工数管理版で使うため維持します。
grant delete on table public.work_logs to anon;

notify pgrst, 'reload schema';

commit;
