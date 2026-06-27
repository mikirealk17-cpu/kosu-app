-- 作業者対応に必要なSupabase設定です。
-- Supabase SQL Editorで実行してください。
-- すでに作成済みの項目がある場合は、該当行を飛ばしてください。

create table if not exists public.worker_master (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.work_logs
  add column if not exists worker_id uuid references public.worker_master(id);

create index if not exists work_logs_worker_id_idx
  on public.work_logs(worker_id);

alter table public.worker_master enable row level security;

grant select, insert, update on public.worker_master to anon;
grant select, insert, update on public.worker_master to authenticated;
grant select, insert, update, delete on public.work_logs to anon;
grant select, insert, update, delete on public.work_logs to authenticated;
grant select, insert, update on public.work_type_master to anon;
grant select, insert, update on public.work_type_master to authenticated;
grant select, insert, update, delete on public.seiban_master to anon;
grant select, insert, update, delete on public.seiban_master to authenticated;

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

alter table public.work_type_master enable row level security;

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

alter table public.seiban_master enable row level security;

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
