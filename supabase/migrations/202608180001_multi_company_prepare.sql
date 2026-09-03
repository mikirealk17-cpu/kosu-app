-- Phase 1: additive preparation only. This does not enable company isolation yet.
begin;

alter table public.worker_master add column if not exists company_id uuid references public.company_master(id);
alter table public.work_logs add column if not exists company_id uuid references public.company_master(id);
alter table public.work_type_master add column if not exists company_id uuid references public.company_master(id);
alter table public.seiban_master add column if not exists company_id uuid references public.company_master(id);
alter table public.billing_company_master add column if not exists company_id uuid references public.company_master(id);
alter table public.rate_master add column if not exists company_id uuid references public.company_master(id);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value)
values ('multi_company_enabled', 'false'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

create or replace function public.multi_company_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value = 'true'::jsonb from public.app_settings where key = 'multi_company_enabled'),
    false
  )
$$;

revoke all on function public.multi_company_ready() from public;
grant execute on function public.multi_company_ready() to authenticated;

create index if not exists worker_master_company_id_idx on public.worker_master(company_id);
create index if not exists work_logs_company_id_idx on public.work_logs(company_id);
create index if not exists work_type_master_company_id_idx on public.work_type_master(company_id);
create index if not exists seiban_master_company_id_idx on public.seiban_master(company_id);
create index if not exists billing_company_master_company_id_idx on public.billing_company_master(company_id);
create index if not exists rate_master_company_id_idx on public.rate_master(company_id);

commit;
