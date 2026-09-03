-- Phase 2: run only after backup, confirm-only checks, and backfill succeed.
begin;

do $$
begin
  if exists (select 1 from public.worker_master where company_id is null)
    or exists (select 1 from public.work_logs where company_id is null)
    or exists (select 1 from public.work_type_master where company_id is null)
    or exists (select 1 from public.seiban_master where company_id is null)
    or exists (select 1 from public.billing_company_master where company_id is null)
    or exists (select 1 from public.rate_master where company_id is null) then
    raise exception 'company_id backfill is incomplete. Transaction rolled back.';
  end if;

  if exists (
    select 1 from public.work_logs wl
    left join public.worker_master w on w.id = wl.worker_id
    left join public.seiban_master s on s.id = wl.seiban_id
    left join public.work_type_master wt on wt.id = wl.work_type_id
    left join public.billing_company_master billing on billing.id = wl.billing_company_id
    left join public.rate_master rate on rate.id = wl.rate_master_id
    where wl.company_id is distinct from w.company_id
       or wl.company_id is distinct from s.company_id
       or wl.company_id is distinct from wt.company_id
       or (wl.billing_company_id is not null and wl.company_id is distinct from billing.company_id)
       or (wl.rate_master_id is not null and wl.company_id is distinct from rate.company_id)
  ) then
    raise exception 'Cross-company work log reference exists. Transaction rolled back.';
  end if;

  if exists (
    select 1 from public.user_profiles up
    left join public.worker_master w on w.id = up.worker_id
    where (up.role in ('worker', 'company_admin') and up.company_id is null)
       or (up.role = 'worker' and (up.worker_id is null or w.company_id is distinct from up.company_id))
  ) then
    raise exception 'User profile company assignment is incomplete. Transaction rolled back.';
  end if;

  if exists (
    select 1 from public.user_profiles group by auth_user_id having count(*) > 1
  ) then
    raise exception 'Duplicate Auth user profiles exist. Transaction rolled back.';
  end if;

  if exists (
    select 1 from public.user_profiles
    where is_active = true and worker_id is not null
    group by worker_id having count(*) > 1
  ) then
    raise exception 'A worker is linked to multiple active profiles. Transaction rolled back.';
  end if;

  if exists (
    select 1 from public.rate_master rate
    left join public.billing_company_master billing on billing.id = rate.billing_company_id
    left join public.worker_master worker on worker.id = rate.worker_id
    left join public.seiban_master seiban on seiban.id = rate.seiban_id
    where rate.company_id is distinct from billing.company_id
       or (rate.worker_id is not null and rate.company_id is distinct from worker.company_id)
       or (rate.seiban_id is not null and rate.company_id is distinct from seiban.company_id)
  ) then
    raise exception 'Cross-company rate reference exists. Transaction rolled back.';
  end if;

  if exists (select 1 from public.seiban_master where coalesce(seiban_key, '') = '') then
    raise exception 'Empty production number key exists. Transaction rolled back.';
  end if;

  if exists (
    select 1 from public.worker_master group by company_id, lower(btrim(name)) having count(*) > 1
  ) or exists (
    select 1 from public.work_type_master group by company_id, lower(btrim(name)) having count(*) > 1
  ) or exists (
    select 1 from public.billing_company_master group by company_id, lower(btrim(name)) having count(*) > 1
  ) or exists (
    select 1 from public.seiban_master group by company_id, seiban_key having count(*) > 1
  ) then
    raise exception 'Duplicate company master values exist. Transaction rolled back.';
  end if;

  if exists (
    select 1 from public.rate_master
    where is_active = true and rate_type in ('hourly', 'fixed_per_entry')
    group by company_id, rate_type, billing_company_id, worker_id having count(*) > 1
  ) or exists (
    select 1 from public.rate_master
    where is_active = true and rate_type = 'contract_by_seiban'
    group by company_id, rate_type, billing_company_id, seiban_id having count(*) > 1
  ) then
    raise exception 'Duplicate active rate settings exist. Transaction rolled back.';
  end if;
end $$;

do $$
declare item record;
begin
  for item in
    select ns.nspname, tab.relname as table_name, idx.relname as index_name
    from pg_index i
    join pg_class tab on tab.oid = i.indrelid
    join pg_namespace ns on ns.oid = tab.relnamespace
    join pg_class idx on idx.oid = i.indexrelid
    join pg_attribute a on a.attrelid = tab.oid and a.attnum = any(i.indkey)
    left join pg_constraint c on c.conindid = i.indexrelid
    where ns.nspname = 'public' and i.indisunique and not i.indisprimary and c.oid is null
      and tab.relname in ('worker_master', 'work_type_master', 'billing_company_master')
    group by ns.nspname, tab.relname, idx.relname, i.indnatts
    having i.indnatts = 1 and max(a.attname) = 'name'
  loop
    execute format('drop index %I.%I', item.nspname, item.index_name);
  end loop;
end $$;

alter table public.worker_master alter column company_id set not null;
alter table public.work_logs alter column company_id set not null;
alter table public.work_type_master alter column company_id set not null;
alter table public.seiban_master alter column company_id set not null;
alter table public.billing_company_master alter column company_id set not null;
alter table public.rate_master alter column company_id set not null;
alter table public.seiban_master alter column seiban_key set not null;

alter table public.user_profiles drop constraint if exists user_profiles_role_requirements;
alter table public.user_profiles
  add constraint user_profiles_role_requirements check (
    (role = 'system_admin' and worker_id is null)
    or (role = 'company_admin' and company_id is not null and worker_id is null)
    or (role = 'worker' and company_id is not null and worker_id is not null)
  ) not valid;
alter table public.user_profiles validate constraint user_profiles_role_requirements;

-- Remove only old global single-column uniqueness so another company may reuse a name/code.
do $$
declare item record;
begin
  for item in
    select c.conrelid::regclass as table_name, c.conname
    from pg_constraint c
    join unnest(c.conkey) with ordinality keys(attnum, ord) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = keys.attnum
    where c.contype = 'u'
      and c.conrelid in ('public.worker_master'::regclass, 'public.work_type_master'::regclass, 'public.billing_company_master'::regclass)
    group by c.conrelid, c.conname
    having count(*) = 1 and max(a.attname) = 'name'
  loop
    execute format('alter table %s drop constraint %I', item.table_name, item.conname);
  end loop;
end $$;

drop index if exists public.seiban_master_seiban_key_uidx;
drop index if exists public.rate_master_active_worker_rate_by_billing_idx;
drop index if exists public.rate_master_active_contract_rate_by_billing_idx;

create unique index if not exists worker_master_company_name_uidx on public.worker_master(company_id, lower(btrim(name)));
create unique index if not exists work_type_master_company_name_uidx on public.work_type_master(company_id, lower(btrim(name)));
create unique index if not exists billing_company_master_company_name_uidx on public.billing_company_master(company_id, lower(btrim(name)));
create unique index if not exists seiban_master_company_key_uidx on public.seiban_master(company_id, seiban_key);
create unique index if not exists user_profiles_auth_user_id_idx on public.user_profiles(auth_user_id);
create unique index if not exists user_profiles_active_worker_uidx on public.user_profiles(worker_id) where is_active = true and worker_id is not null;
create unique index if not exists rate_master_company_worker_uidx
  on public.rate_master(company_id, rate_type, billing_company_id, worker_id)
  where is_active = true and rate_type in ('hourly', 'fixed_per_entry');
create unique index if not exists rate_master_company_contract_uidx
  on public.rate_master(company_id, rate_type, billing_company_id, seiban_id)
  where is_active = true and rate_type = 'contract_by_seiban';

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.user_profiles
  where auth_user_id = (select auth.uid()) and is_active = true limit 1
$$;
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select up.company_id
  from public.user_profiles up
  join public.company_master company on company.id = up.company_id and company.is_active = true
  where up.auth_user_id = (select auth.uid()) and up.is_active = true limit 1
$$;
create or replace function public.current_worker_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select worker.id
  from public.user_profiles profile
  join public.worker_master worker
    on worker.id = profile.worker_id
   and worker.company_id = profile.company_id
   and worker.is_active = true
  where profile.auth_user_id = (select auth.uid()) and profile.is_active = true
  limit 1
$$;
create or replace function public.is_system_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_app_role() = 'system_admin'
$$;
create or replace function public.is_app_admin_for_company(target_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_system_admin()
    or (public.current_app_role() = 'company_admin' and public.current_company_id() = target_company_id)
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.current_company_id() from public;
revoke all on function public.current_worker_id() from public;
revoke all on function public.is_system_admin() from public;
revoke all on function public.is_app_admin_for_company(uuid) from public;
grant execute on function public.current_app_role(), public.current_company_id(), public.current_worker_id(), public.is_system_admin(), public.is_app_admin_for_company(uuid) to authenticated;

-- Remove old policies, including obsolete anon/public policies, from tenant tables.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in (
             'company_master','user_profiles','worker_master','work_logs','work_type_master',
             'seiban_master','billing_company_master','rate_master'
           )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

alter table public.company_master enable row level security;
alter table public.user_profiles enable row level security;
alter table public.worker_master enable row level security;
alter table public.work_logs enable row level security;
alter table public.work_type_master enable row level security;
alter table public.seiban_master enable row level security;
alter table public.billing_company_master enable row level security;
alter table public.rate_master enable row level security;

revoke all on public.company_master, public.user_profiles, public.worker_master, public.work_logs,
  public.work_type_master, public.seiban_master, public.billing_company_master, public.rate_master from anon;
revoke all on public.company_master, public.user_profiles, public.worker_master, public.work_logs,
  public.work_type_master, public.seiban_master, public.billing_company_master, public.rate_master from authenticated;
grant select, insert, update on public.company_master, public.worker_master, public.work_type_master,
  public.seiban_master, public.billing_company_master, public.rate_master to authenticated;
grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.work_logs to authenticated;

create policy company_select on public.company_master for select to authenticated using (
  (select public.is_system_admin()) or id = (select public.current_company_id())
);
create policy company_insert on public.company_master for insert to authenticated with check ((select public.is_system_admin()));
create policy company_update on public.company_master for update to authenticated using ((select public.is_system_admin())) with check ((select public.is_system_admin()));

create policy profile_select on public.user_profiles for select to authenticated using (
  auth_user_id = (select auth.uid()) or (select public.is_system_admin())
  or ((select public.current_app_role()) = 'company_admin' and company_id = (select public.current_company_id()))
);
create policy worker_select on public.worker_master for select to authenticated using (
  public.is_app_admin_for_company(company_id)
  or (company_id = (select public.current_company_id()) and id = (select public.current_worker_id()))
);
create policy worker_insert on public.worker_master for insert to authenticated with check (public.is_app_admin_for_company(company_id));
create policy worker_update on public.worker_master for update to authenticated using (public.is_app_admin_for_company(company_id)) with check (public.is_app_admin_for_company(company_id));

create policy work_type_select on public.work_type_master for select to authenticated using (company_id = (select public.current_company_id()) or (select public.is_system_admin()));
create policy work_type_insert on public.work_type_master for insert to authenticated with check (public.is_app_admin_for_company(company_id));
create policy work_type_update on public.work_type_master for update to authenticated using (public.is_app_admin_for_company(company_id)) with check (public.is_app_admin_for_company(company_id));

create policy seiban_select on public.seiban_master for select to authenticated using (company_id = (select public.current_company_id()) or (select public.is_system_admin()));
create policy seiban_insert on public.seiban_master for insert to authenticated with check (
  public.is_app_admin_for_company(company_id)
  or ((select public.current_app_role()) = 'worker' and company_id = (select public.current_company_id()) and status = 'pending' and created_by = (select auth.uid()))
);
create policy seiban_update on public.seiban_master for update to authenticated using (public.is_app_admin_for_company(company_id)) with check (public.is_app_admin_for_company(company_id));

create policy billing_select on public.billing_company_master for select to authenticated using (public.is_app_admin_for_company(company_id));
create policy billing_insert on public.billing_company_master for insert to authenticated with check (public.is_app_admin_for_company(company_id));
create policy billing_update on public.billing_company_master for update to authenticated using (public.is_app_admin_for_company(company_id)) with check (public.is_app_admin_for_company(company_id));
create policy rate_select on public.rate_master for select to authenticated using (public.is_app_admin_for_company(company_id));
create policy rate_insert on public.rate_master for insert to authenticated with check (public.is_app_admin_for_company(company_id));
create policy rate_update on public.rate_master for update to authenticated using (public.is_app_admin_for_company(company_id)) with check (public.is_app_admin_for_company(company_id));

create policy logs_select on public.work_logs for select to authenticated using (
  public.is_app_admin_for_company(company_id)
  or (company_id = (select public.current_company_id()) and worker_id = (select public.current_worker_id()))
);
create policy logs_insert on public.work_logs for insert to authenticated with check (
  public.is_app_admin_for_company(company_id)
  or (company_id = (select public.current_company_id()) and worker_id = (select public.current_worker_id()))
);
create policy logs_update on public.work_logs for update to authenticated using (
  public.is_app_admin_for_company(company_id)
  or (company_id = (select public.current_company_id()) and worker_id = (select public.current_worker_id()))
) with check (
  public.is_app_admin_for_company(company_id)
  or (company_id = (select public.current_company_id()) and worker_id = (select public.current_worker_id()))
);
create policy logs_delete on public.work_logs for delete to authenticated using (public.is_app_admin_for_company(company_id));

create or replace function public.validate_work_log_company()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.worker_master where id = new.worker_id and company_id = new.company_id)
    or not exists (select 1 from public.seiban_master where id = new.seiban_id and company_id = new.company_id)
    or not exists (select 1 from public.work_type_master where id = new.work_type_id and company_id = new.company_id)
    or (new.billing_company_id is not null and not exists (
      select 1 from public.billing_company_master where id = new.billing_company_id and company_id = new.company_id
    ))
    or (new.rate_master_id is not null and not exists (
      select 1 from public.rate_master where id = new.rate_master_id and company_id = new.company_id
    )) then
    raise exception 'work log references must belong to the same company';
  end if;
  return new;
end $$;
drop trigger if exists validate_work_log_company_trigger on public.work_logs;
create trigger validate_work_log_company_trigger before insert or update on public.work_logs
for each row execute function public.validate_work_log_company();
revoke all on function public.validate_work_log_company() from public;

create or replace function public.validate_rate_company()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.billing_company_master where id = new.billing_company_id and company_id = new.company_id)
    or (new.worker_id is not null and not exists (
      select 1 from public.worker_master where id = new.worker_id and company_id = new.company_id
    ))
    or (new.seiban_id is not null and not exists (
      select 1 from public.seiban_master where id = new.seiban_id and company_id = new.company_id
    )) then
    raise exception 'rate references must belong to the same company';
  end if;
  return new;
end $$;
drop trigger if exists validate_rate_company_trigger on public.rate_master;
create trigger validate_rate_company_trigger before insert or update on public.rate_master
for each row execute function public.validate_rate_company();
revoke all on function public.validate_rate_company() from public;

create or replace function public.validate_profile_company()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.role = 'worker' and not exists (
    select 1 from public.worker_master where id = new.worker_id and company_id = new.company_id
  ) then
    raise exception 'worker profile must reference a worker in the same company';
  end if;
  return new;
end $$;
drop trigger if exists validate_profile_company_trigger on public.user_profiles;
create trigger validate_profile_company_trigger before insert or update on public.user_profiles
for each row execute function public.validate_profile_company();
revoke all on function public.validate_profile_company() from public;

create or replace function public.enforce_worker_seiban_metadata()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select public.current_app_role()) = 'worker' then
    new.company_id := (select public.current_company_id());
    new.status := 'pending';
    new.created_by := (select auth.uid());
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists enforce_worker_seiban_metadata_trigger on public.seiban_master;
create trigger enforce_worker_seiban_metadata_trigger before insert on public.seiban_master
for each row execute function public.enforce_worker_seiban_metadata();
revoke all on function public.enforce_worker_seiban_metadata() from public;

create or replace function public.merge_pending_seiban(source_id uuid, target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare source_company_id uuid;
begin
  if source_id = target_id then raise exception 'source and target must differ'; end if;
  select company_id into source_company_id from public.seiban_master
   where id = source_id and status = 'pending' for update;
  if source_company_id is null then raise exception 'pending source not found'; end if;
  if not public.is_app_admin_for_company(source_company_id) then raise exception 'permission denied'; end if;
  if not exists (select 1 from public.seiban_master where id = target_id and company_id = source_company_id) then
    raise exception 'target must belong to the same company';
  end if;
  if exists (
    select 1
    from public.rate_master source_rate
    join public.rate_master target_rate
      on target_rate.company_id = source_rate.company_id
     and target_rate.billing_company_id = source_rate.billing_company_id
     and target_rate.rate_type = source_rate.rate_type
     and target_rate.seiban_id = target_id
     and target_rate.is_active = true
    where source_rate.seiban_id = source_id
      and source_rate.company_id = source_company_id
      and source_rate.is_active = true
  ) then
    raise exception 'source and target have conflicting active rate settings';
  end if;
  update public.work_logs set seiban_id = target_id where seiban_id = source_id and company_id = source_company_id;
  update public.rate_master set seiban_id = target_id where seiban_id = source_id and company_id = source_company_id;
  delete from public.seiban_master where id = source_id and company_id = source_company_id;
end $$;
revoke all on function public.merge_pending_seiban(uuid, uuid) from public;
grant execute on function public.merge_pending_seiban(uuid, uuid) to authenticated;

update public.app_settings set value = 'true'::jsonb, updated_at = now()
where key = 'multi_company_enabled';

notify pgrst, 'reload schema';
commit;
