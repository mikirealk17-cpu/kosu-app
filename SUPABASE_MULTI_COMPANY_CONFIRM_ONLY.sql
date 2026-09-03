-- Read-only checks. Run after phase 1 and before any backfill/finalization.
select id, name, is_active from public.company_master order by created_at;

select 'worker_master' as table_name, count(*) as missing_company from public.worker_master where company_id is null
union all select 'work_logs', count(*) from public.work_logs where company_id is null
union all select 'work_type_master', count(*) from public.work_type_master where company_id is null
union all select 'seiban_master', count(*) from public.seiban_master where company_id is null
union all select 'billing_company_master', count(*) from public.billing_company_master where company_id is null
union all select 'rate_master', count(*) from public.rate_master where company_id is null;

select wl.id, wl.company_id as log_company, w.company_id as worker_company,
       s.company_id as seiban_company, wt.company_id as work_type_company,
       billing.company_id as billing_company, rate.company_id as rate_company
from public.work_logs wl
left join public.worker_master w on w.id = wl.worker_id
left join public.seiban_master s on s.id = wl.seiban_id
left join public.work_type_master wt on wt.id = wl.work_type_id
left join public.billing_company_master billing on billing.id = wl.billing_company_id
left join public.rate_master rate on rate.id = wl.rate_master_id
where wl.company_id is distinct from w.company_id
   or wl.company_id is distinct from s.company_id
   or wl.company_id is distinct from wt.company_id
   or (wl.billing_company_id is not null and wl.company_id is distinct from billing.company_id)
   or (wl.rate_master_id is not null and wl.company_id is distinct from rate.company_id);

select rate.id, rate.company_id, billing.company_id as billing_company,
       worker.company_id as worker_company, seiban.company_id as seiban_company
from public.rate_master rate
left join public.billing_company_master billing on billing.id = rate.billing_company_id
left join public.worker_master worker on worker.id = rate.worker_id
left join public.seiban_master seiban on seiban.id = rate.seiban_id
where rate.company_id is distinct from billing.company_id
   or (rate.worker_id is not null and rate.company_id is distinct from worker.company_id)
   or (rate.seiban_id is not null and rate.company_id is distinct from seiban.company_id);

select company_id, lower(btrim(name)) as normalized_name, count(*) as duplicate_count, array_agg(id) as ids
from public.worker_master group by company_id, lower(btrim(name)) having count(*) > 1;

select company_id, lower(btrim(name)) as normalized_name, count(*) as duplicate_count, array_agg(id) as ids
from public.work_type_master group by company_id, lower(btrim(name)) having count(*) > 1;

select company_id, lower(btrim(name)) as normalized_name, count(*) as duplicate_count, array_agg(id) as ids
from public.billing_company_master group by company_id, lower(btrim(name)) having count(*) > 1;

select company_id, seiban_key, count(*) as duplicate_count, array_agg(id) as ids
from public.seiban_master group by company_id, seiban_key having count(*) > 1;

select up.id, up.auth_user_id, up.role, up.company_id, up.worker_id
from public.user_profiles up
left join public.worker_master w on w.id = up.worker_id
where (up.role in ('worker', 'company_admin') and up.company_id is null)
   or (up.role = 'worker' and (up.worker_id is null or w.company_id is distinct from up.company_id));

select worker_id, count(*) as active_profile_count, array_agg(id) as profile_ids
from public.user_profiles
where is_active = true and worker_id is not null
group by worker_id
having count(*) > 1;

select auth_user_id, count(*) as profile_count, array_agg(id) as profile_ids
from public.user_profiles
group by auth_user_id
having count(*) > 1;

select company_id, rate_type, billing_company_id, worker_id, count(*) as duplicate_count, array_agg(id) as ids
from public.rate_master
where is_active = true and rate_type in ('hourly', 'fixed_per_entry')
group by company_id, rate_type, billing_company_id, worker_id
having count(*) > 1;

select company_id, rate_type, billing_company_id, seiban_id, count(*) as duplicate_count, array_agg(id) as ids
from public.rate_master
where is_active = true and rate_type = 'contract_by_seiban'
group by company_id, rate_type, billing_company_id, seiban_id
having count(*) > 1;

select public.multi_company_ready() as multi_company_enabled;
