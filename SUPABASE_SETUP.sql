-- 作業者・元請け対応に必要なSupabase設定です。
-- Supabase SQL Editorで実行してください。
-- すでに作成済みの項目がある場合は、該当行を飛ばしてください。

create table if not exists public.worker_master (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_company_master (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.work_logs
  add column if not exists worker_id uuid references public.worker_master(id);

alter table public.work_logs
  add column if not exists billing_company_id uuid references public.billing_company_master(id);

create index if not exists work_logs_worker_id_idx
  on public.work_logs(worker_id);

create index if not exists work_logs_billing_company_id_idx
  on public.work_logs(billing_company_id);

-- RLS運用方針:
-- このアプリはログインなしで使うため、利用者はSupabase上では anon として扱われます。
-- そのため、ここでは「アプリで必要な操作だけ」を anon に許可します。
-- service_role などの秘密キーはブラウザ用JavaScriptへ絶対に書かないでください。
-- URLを知っている人は下記の操作ができます。社外公開や個人情報保存には向きません。

alter table public.worker_master enable row level security;
alter table public.billing_company_master enable row level security;
alter table public.work_logs enable row level security;
alter table public.work_type_master enable row level security;
alter table public.seiban_master enable row level security;

-- API権限。RLSポリシーと両方そろって初めて操作できます。
grant select, insert, update on public.worker_master to anon;
grant select, insert, update on public.billing_company_master to anon;
grant select, insert, update, delete on public.work_logs to anon;
grant select, insert, update on public.work_type_master to anon;
grant select, insert, update, delete on public.seiban_master to anon;

-- 作業者マスタ: 表示、追加、編集、非表示化(is_active=false)を許可します。
drop policy if exists "worker_master_select_public" on public.worker_master;
create policy "worker_master_select_public"
on public.worker_master
for select
to anon
using (true);

drop policy if exists "worker_master_insert_public" on public.worker_master;
create policy "worker_master_insert_public"
on public.worker_master
for insert
to anon
with check (true);

drop policy if exists "worker_master_update_public" on public.worker_master;
create policy "worker_master_update_public"
on public.worker_master
for update
to anon
using (true)
with check (true);

-- 元請けマスタ: 表示、追加、編集、非表示化(is_active=false)を許可します。
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

-- 工数記録: 入力、集計、履歴編集、履歴削除で必要な操作を許可します。
drop policy if exists "work_logs_select_public" on public.work_logs;
create policy "work_logs_select_public"
on public.work_logs
for select
to anon
using (true);

drop policy if exists "work_logs_insert_public" on public.work_logs;
create policy "work_logs_insert_public"
on public.work_logs
for insert
to anon
with check (true);

drop policy if exists "work_logs_update_public" on public.work_logs;
create policy "work_logs_update_public"
on public.work_logs
for update
to anon
using (true)
with check (true);

drop policy if exists "work_logs_delete_public" on public.work_logs;
create policy "work_logs_delete_public"
on public.work_logs
for delete
to anon
using (true);

-- 作業内容マスタ: 表示、追加、編集、非表示化(is_active=false)を許可します。
drop policy if exists "work_type_master_select_public" on public.work_type_master;
create policy "work_type_master_select_public"
on public.work_type_master
for select
to anon
using (true);

drop policy if exists "work_type_master_insert_public" on public.work_type_master;
create policy "work_type_master_insert_public"
on public.work_type_master
for insert
to anon
with check (true);

drop policy if exists "work_type_master_update_public" on public.work_type_master;
create policy "work_type_master_update_public"
on public.work_type_master
for update
to anon
using (true)
with check (true);

-- 製番マスタ: 表示、追加、編集、削除を許可します。
-- 過去の工数で使われている製番は外部キー制約により削除に失敗する場合があります。
drop policy if exists "seiban_master_select_public" on public.seiban_master;
create policy "seiban_master_select_public"
on public.seiban_master
for select
to anon
using (true);

drop policy if exists "seiban_master_insert_public" on public.seiban_master;
create policy "seiban_master_insert_public"
on public.seiban_master
for insert
to anon
with check (true);

drop policy if exists "seiban_master_update_public" on public.seiban_master;
create policy "seiban_master_update_public"
on public.seiban_master
for update
to anon
using (true)
with check (true);

drop policy if exists "seiban_master_delete_public" on public.seiban_master;
create policy "seiban_master_delete_public"
on public.seiban_master
for delete
to anon
using (true);

-- SupabaseのREST APIへ新しいテーブル・列を反映します。
notify pgrst, 'reload schema';
