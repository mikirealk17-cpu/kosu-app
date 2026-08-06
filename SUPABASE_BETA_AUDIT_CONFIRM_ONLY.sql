-- 工数管理β版 監査ログ適用前の確認専用SQLです。
-- このSQLはデータや設定を変更しません。
-- Supabase SQL Editorで実行し、audit_ready_summary の各件数を確認してください。

with target_tables(table_name) as (
  values
    ('work_logs'),
    ('worker_master'),
    ('work_type_master'),
    ('seiban_master'),
    ('billing_company_master'),
    ('rate_master')
),
existing_tables as (
  select
    target_tables.table_name,
    to_regclass('public.' || target_tables.table_name) is not null as exists_in_db
  from target_tables
),
existing_triggers as (
  select
    c.relname as table_name,
    t.tgname as trigger_name
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'beta_audit_trigger'
    and not t.tgisinternal
),
required_functions as (
  select 'public.current_app_role()' as function_name,
         to_regprocedure('public.current_app_role()') is not null as exists_in_db
  union all
  select 'public.current_company_id()',
         to_regprocedure('public.current_company_id()') is not null
  union all
  select 'public.capture_beta_audit()',
         to_regprocedure('public.capture_beta_audit()') is not null
),
audit_table_columns as (
  select
    column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'audit_log'
    and column_name in (
      'id',
      'company_id',
      'actor_user_id',
      'action',
      'table_name',
      'record_id',
      'old_data',
      'new_data',
      'created_at'
    )
)
select
  'target_tables' as check_name,
  count(*) filter (where exists_in_db) as ok_count,
  count(*) filter (where not exists_in_db) as ng_count,
  array_agg(table_name order by table_name) filter (where not exists_in_db) as details
from existing_tables
union all
select
  'audit_log_columns',
  count(*)::bigint,
  (9 - count(*))::bigint,
  null
from audit_table_columns
union all
select
  'audit_triggers',
  count(existing_triggers.trigger_name)::bigint,
  (
    select count(*)::bigint
    from existing_tables
    where exists_in_db
  ) - count(existing_triggers.trigger_name)::bigint,
  array_agg(existing_tables.table_name order by existing_tables.table_name)
    filter (where existing_tables.exists_in_db and existing_triggers.trigger_name is null)
from existing_tables
left join existing_triggers on existing_triggers.table_name = existing_tables.table_name
union all
select
  'required_functions',
  count(*) filter (where exists_in_db),
  count(*) filter (where not exists_in_db),
  array_agg(function_name order by function_name) filter (where not exists_in_db)
from required_functions;
