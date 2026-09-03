-- Make a backup first. Replace target_company_id, then run in a test project first.
-- Only NULL company_id values are filled. No row is deleted or merged.
begin;

do $$
declare
  target_company_id uuid := null; -- replace with the existing company's UUID
begin
  if target_company_id is null then
    raise exception 'Set target_company_id before running this script.';
  end if;
  if not exists (select 1 from public.company_master where id = target_company_id) then
    raise exception 'target_company_id does not exist in company_master.';
  end if;

  update public.worker_master set company_id = target_company_id where company_id is null;
  update public.work_type_master set company_id = target_company_id where company_id is null;
  update public.seiban_master set company_id = target_company_id where company_id is null;
  update public.billing_company_master set company_id = target_company_id where company_id is null;
  update public.rate_master set company_id = target_company_id where company_id is null;
  update public.work_logs wl
     set company_id = coalesce((select w.company_id from public.worker_master w where w.id = wl.worker_id), target_company_id)
   where wl.company_id is null;
  update public.user_profiles profile
     set company_id = worker.company_id
    from public.worker_master worker
   where profile.company_id is null
     and profile.role = 'worker'
     and worker.id = profile.worker_id;
  update public.user_profiles set company_id = target_company_id
   where company_id is null and role = 'company_admin';
end $$;

do $$
begin
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
    raise exception 'Cross-company references remain. Transaction rolled back.';
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
    raise exception 'Cross-company rate references remain. Transaction rolled back.';
  end if;

  if exists (
    select 1 from public.user_profiles profile
    left join public.worker_master worker on worker.id = profile.worker_id
    where (profile.role in ('worker', 'company_admin') and profile.company_id is null)
       or (profile.role = 'worker' and (profile.worker_id is null or worker.company_id is distinct from profile.company_id))
  ) then
    raise exception 'User profile company assignment is incomplete. Transaction rolled back.';
  end if;
end $$;

commit;
