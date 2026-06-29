-- 単価自動適用に必要なSupabase設定です。
-- Supabase SQL Editorで実行してください。
--
-- 安全方針:
-- - 既存の工数データは更新・削除しません。
-- - 追加列は空欄を許可し、既存データを壊しません。
-- - 重複単価はDB側の一意インデックスでも防止します。
-- 前提:
-- - worker_master、billing_company_master、seiban_master、work_logs が作成済みであること。
-- - 未作成の場合は先に SUPABASE_SETUP.sql または SUPABASE_BILLING_COMPANY_SETUP.sql を実行してください。

create table if not exists public.root_company_master (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.billing_company_master
  add column if not exists root_company_id uuid references public.root_company_master(id);

create table if not exists public.rate_master (
  id uuid primary key default gen_random_uuid(),
  rate_type text not null check (rate_type in ('hourly', 'fixed_per_entry', 'contract_by_seiban')),
  root_company_id uuid not null references public.root_company_master(id),
  billing_company_id uuid not null references public.billing_company_master(id),
  worker_id uuid references public.worker_master(id),
  seiban_id uuid references public.seiban_master(id),
  amount numeric(12, 2) not null check (amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (
    (
      rate_type in ('hourly', 'fixed_per_entry')
      and worker_id is not null
      and seiban_id is null
    )
    or
    (
      rate_type = 'contract_by_seiban'
      and worker_id is null
      and seiban_id is not null
    )
  )
);

create unique index if not exists rate_master_active_worker_rate_idx
  on public.rate_master(rate_type, root_company_id, billing_company_id, worker_id)
  where is_active = true and rate_type in ('hourly', 'fixed_per_entry');

create unique index if not exists rate_master_active_contract_rate_idx
  on public.rate_master(rate_type, root_company_id, billing_company_id, seiban_id)
  where is_active = true and rate_type = 'contract_by_seiban';

alter table public.work_logs
  add column if not exists root_company_id uuid references public.root_company_master(id);

alter table public.work_logs
  add column if not exists rate_type text check (rate_type in ('hourly', 'fixed_per_entry', 'contract_by_seiban'));

alter table public.work_logs
  add column if not exists rate_master_id uuid references public.rate_master(id);

alter table public.work_logs
  add column if not exists unit_price numeric(12, 2);

alter table public.work_logs
  add column if not exists billing_amount integer;

create index if not exists billing_company_master_root_company_id_idx
  on public.billing_company_master(root_company_id);

create index if not exists work_logs_root_company_id_idx
  on public.work_logs(root_company_id);

create index if not exists work_logs_rate_master_id_idx
  on public.work_logs(rate_master_id);

alter table public.root_company_master enable row level security;
alter table public.rate_master enable row level security;

grant select, insert, update on public.root_company_master to anon;
grant select, insert, update on public.rate_master to anon;

drop policy if exists "root_company_master_select_public" on public.root_company_master;
create policy "root_company_master_select_public"
on public.root_company_master
for select
to anon
using (true);

drop policy if exists "root_company_master_insert_public" on public.root_company_master;
create policy "root_company_master_insert_public"
on public.root_company_master
for insert
to anon
with check (true);

drop policy if exists "root_company_master_update_public" on public.root_company_master;
create policy "root_company_master_update_public"
on public.root_company_master
for update
to anon
using (true)
with check (true);

drop policy if exists "rate_master_select_public" on public.rate_master;
create policy "rate_master_select_public"
on public.rate_master
for select
to anon
using (true);

drop policy if exists "rate_master_insert_public" on public.rate_master;
create policy "rate_master_insert_public"
on public.rate_master
for insert
to anon
with check (true);

drop policy if exists "rate_master_update_public" on public.rate_master;
create policy "rate_master_update_public"
on public.rate_master
for update
to anon
using (true)
with check (true);

notify pgrst, 'reload schema';
