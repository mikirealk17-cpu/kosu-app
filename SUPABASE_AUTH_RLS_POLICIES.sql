-- Supabase Auth + user_profiles 用のRLS設定です。
-- 実行前提:
-- 1. SUPABASE_AUTH_PERMISSION_SETUP.sql を実行済み
-- 2. Supabase Authに管理者・作業者ユーザーを作成済み
-- 3. public.user_profiles に auth_user_id / role / worker_id を設定済み
--
-- 注意:
-- - このSQLを実行すると、未ログインの公開キーだけでは対象テーブルを読めなくなります。
-- - 本番実行前に、必ずテストユーザーでログイン画面と権限取得が動くことを確認してください。
-- - service_roleキーはブラウザに置かないでください。

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_profiles
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.current_worker_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select worker_id
  from public.user_profiles
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'system_admin'
$$;

alter table public.user_profiles enable row level security;
alter table public.company_master enable row level security;
alter table public.work_logs enable row level security;
alter table public.worker_master enable row level security;
alter table public.work_type_master enable row level security;
alter table public.seiban_master enable row level security;
alter table public.rate_master enable row level security;
alter table public.billing_company_master enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.company_master to authenticated;
grant select, insert, update, delete on public.work_logs to authenticated;
grant select, insert, update, delete on public.worker_master to authenticated;
grant select, insert, update, delete on public.work_type_master to authenticated;
grant select, insert, update, delete on public.seiban_master to authenticated;
grant select, insert, update, delete on public.rate_master to authenticated;
grant select, insert, update, delete on public.billing_company_master to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_worker_id() to authenticated;
grant execute on function public.is_system_admin() to authenticated;

revoke all on public.user_profiles from anon;
revoke all on public.company_master from anon;
revoke all on public.work_logs from anon;
revoke all on public.worker_master from anon;
revoke all on public.work_type_master from anon;
revoke all on public.seiban_master from anon;
revoke all on public.rate_master from anon;
revoke all on public.billing_company_master from anon;

drop policy if exists "worker_master_select_public" on public.worker_master;
drop policy if exists "worker_master_insert_public" on public.worker_master;
drop policy if exists "worker_master_update_public" on public.worker_master;
drop policy if exists "billing_company_master_select_public" on public.billing_company_master;
drop policy if exists "billing_company_master_insert_public" on public.billing_company_master;
drop policy if exists "billing_company_master_update_public" on public.billing_company_master;
drop policy if exists "work_logs_select_public" on public.work_logs;
drop policy if exists "work_logs_insert_public" on public.work_logs;
drop policy if exists "work_logs_update_public" on public.work_logs;
drop policy if exists "work_logs_delete_public" on public.work_logs;
drop policy if exists "work_type_master_select_public" on public.work_type_master;
drop policy if exists "work_type_master_insert_public" on public.work_type_master;
drop policy if exists "work_type_master_update_public" on public.work_type_master;
drop policy if exists "seiban_master_select_public" on public.seiban_master;
drop policy if exists "seiban_master_insert_public" on public.seiban_master;
drop policy if exists "seiban_master_update_public" on public.seiban_master;
drop policy if exists "seiban_master_delete_public" on public.seiban_master;
drop policy if exists "rate_master_select_public" on public.rate_master;
drop policy if exists "rate_master_insert_public" on public.rate_master;
drop policy if exists "rate_master_update_public" on public.rate_master;

drop policy if exists "user_profiles_select_own_or_admin" on public.user_profiles;
drop policy if exists "user_profiles_select_own_before_full_rls" on public.user_profiles;
create policy "user_profiles_select_own_or_admin"
on public.user_profiles
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_system_admin()
);

drop policy if exists "user_profiles_admin_write" on public.user_profiles;
create policy "user_profiles_admin_write"
on public.user_profiles
for all
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "company_master_admin_only" on public.company_master;
create policy "company_master_admin_only"
on public.company_master
for all
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "work_logs_select_by_role" on public.work_logs;
create policy "work_logs_select_by_role"
on public.work_logs
for select
to authenticated
using (
  public.is_system_admin()
  or worker_id = public.current_worker_id()
);

drop policy if exists "work_logs_insert_by_role" on public.work_logs;
create policy "work_logs_insert_by_role"
on public.work_logs
for insert
to authenticated
with check (
  public.is_system_admin()
  or worker_id = public.current_worker_id()
);

drop policy if exists "work_logs_update_by_role" on public.work_logs;
create policy "work_logs_update_by_role"
on public.work_logs
for update
to authenticated
using (
  public.is_system_admin()
  or worker_id = public.current_worker_id()
)
with check (
  public.is_system_admin()
  or worker_id = public.current_worker_id()
);

drop policy if exists "work_logs_delete_admin_only" on public.work_logs;
create policy "work_logs_delete_admin_only"
on public.work_logs
for delete
to authenticated
using (public.is_system_admin());

drop policy if exists "worker_master_select_by_role" on public.worker_master;
create policy "worker_master_select_by_role"
on public.worker_master
for select
to authenticated
using (
  public.is_system_admin()
  or id = public.current_worker_id()
);

drop policy if exists "worker_master_admin_write" on public.worker_master;
create policy "worker_master_admin_write"
on public.worker_master
for all
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "work_type_master_select_authenticated" on public.work_type_master;
create policy "work_type_master_select_authenticated"
on public.work_type_master
for select
to authenticated
using (
  public.is_system_admin()
  or is_active = true
);

drop policy if exists "work_type_master_admin_write" on public.work_type_master;
create policy "work_type_master_admin_write"
on public.work_type_master
for all
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "seiban_master_select_authenticated" on public.seiban_master;
create policy "seiban_master_select_authenticated"
on public.seiban_master
for select
to authenticated
using (true);

drop policy if exists "seiban_master_insert_authenticated" on public.seiban_master;
create policy "seiban_master_insert_authenticated"
on public.seiban_master
for insert
to authenticated
with check (true);

drop policy if exists "seiban_master_admin_update" on public.seiban_master;
create policy "seiban_master_admin_update"
on public.seiban_master
for update
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "seiban_master_admin_delete" on public.seiban_master;
create policy "seiban_master_admin_delete"
on public.seiban_master
for delete
to authenticated
using (public.is_system_admin());

drop policy if exists "rate_master_admin_only" on public.rate_master;
create policy "rate_master_admin_only"
on public.rate_master
for all
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "billing_company_master_admin_only" on public.billing_company_master;
create policy "billing_company_master_admin_only"
on public.billing_company_master
for all
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

notify pgrst, 'reload schema';
