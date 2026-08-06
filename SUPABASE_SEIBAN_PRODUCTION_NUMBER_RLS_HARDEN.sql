-- 生産番号（既存名: 製番）仮登録機能のRLS/RPC補強SQLです。
--
-- 使う場面:
-- - SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql 適用後の権限を再確認・再適用したい場合
-- - SUPABASE_AUTH_RLS_POLICIES.sql を後から再実行し、seiban_master のinsert policyが緩んだ可能性がある場合
--
-- 注意:
-- - このSQLは既存データを削除しません。
-- - 生産番号追加カラムが未適用の場合は停止します。先に SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql を実行してください。

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seiban_master'
      and column_name in ('seiban_key', 'status', 'created_by', 'confirmed_by', 'confirmed_at')
    group by table_schema, table_name
    having count(*) = 5
  ) then
    raise exception 'seiban_master production-number columns are missing. Run SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql first.';
  end if;

  if not exists (
    select 1
    from pg_proc
    where proname = 'is_system_admin'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'public.is_system_admin() is missing. Run SUPABASE_AUTH_RLS_POLICIES.sql first.';
  end if;

  if not exists (
    select 1
    from pg_proc
    where proname = 'normalize_seiban_key'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'public.normalize_seiban_key(text) is missing. Run SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql first.';
  end if;
end
$$;

create or replace function public.merge_pending_seiban(source_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'only system_admin can merge seiban_master rows';
  end if;

  if source_id = target_id then
    raise exception 'source_id and target_id must be different';
  end if;

  if not exists (
    select 1 from public.seiban_master
    where id = source_id and status = 'pending'
  ) then
    raise exception 'source seiban must exist and be pending';
  end if;

  if not exists (
    select 1 from public.seiban_master
    where id = target_id
  ) then
    raise exception 'target seiban does not exist';
  end if;

  update public.work_logs
  set seiban_id = target_id,
      updated_at = now()
  where seiban_id = source_id;

  update public.rate_master
  set seiban_id = target_id
  where seiban_id = source_id;

  delete from public.seiban_master
  where id = source_id;
end;
$$;

revoke all on function public.normalize_seiban_key(text) from public;
revoke all on function public.normalize_seiban_key(text) from anon;
revoke all on function public.merge_pending_seiban(uuid, uuid) from public;
revoke all on function public.merge_pending_seiban(uuid, uuid) from anon;
grant execute on function public.normalize_seiban_key(text) to authenticated;
grant execute on function public.merge_pending_seiban(uuid, uuid) to authenticated;

drop policy if exists "seiban_master_insert_authenticated" on public.seiban_master;
create policy "seiban_master_insert_authenticated"
on public.seiban_master
for insert
to authenticated
with check (
  public.is_system_admin()
  or (
    status = 'pending'
    and created_by = auth.uid()
    and confirmed_by is null
    and confirmed_at is null
  )
);

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

commit;

notify pgrst, 'reload schema';
