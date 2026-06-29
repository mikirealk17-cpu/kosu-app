-- 元請け対応だけを追加するSupabase設定です。
-- Supabase SQL Editorで実行してください。
--
-- 安全方針:
-- - 既存の工数データは更新・削除しません。
-- - work_logs.billing_company_id は空欄を許可します。
-- - すでに作成済みの場合は if not exists で再作成を避けます。

create table if not exists public.billing_company_master (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.work_logs
  add column if not exists billing_company_id uuid references public.billing_company_master(id);

create index if not exists work_logs_billing_company_id_idx
  on public.work_logs(billing_company_id);

-- このアプリはログインなしで使うため、利用者はSupabase上では anon として扱われます。
-- 元請けマスタの表示、追加、編集、非表示化(is_active=false)だけを許可します。

alter table public.billing_company_master enable row level security;

grant select, insert, update on public.billing_company_master to anon;

drop policy if exists "billing_company_master_select_public" on public.billing_company_master;
create policy "billing_company_master_select_public"
on public.billing_company_master
for select
to anon
using (true);

drop policy if exists "billing_company_master_insert_public" on public.billing_company_master;
create policy "billing_company_master_insert_public"
on public.billing_company_master
for insert
to anon
with check (true);

drop policy if exists "billing_company_master_update_public" on public.billing_company_master;
create policy "billing_company_master_update_public"
on public.billing_company_master
for update
to anon
using (true)
with check (true);

-- SupabaseのREST APIへ新しいテーブル・列を反映します。
notify pgrst, 'reload schema';
