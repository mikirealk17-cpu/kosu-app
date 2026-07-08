-- ログイン・権限管理に向けたSupabase設定案です。
-- まだ本番反映前の下準備用です。実行前に AUTH_PERMISSION_DESIGN.md と合わせて確認してください。
--
-- 安全方針:
-- - 既存の工数データは更新・削除しません。
-- - 既存テーブルへ追加する company_id は空欄を許可し、既存データを壊しません。
-- - RLSの有効化はこのSQLでは行いません。
-- - ログイン画面とプロフィール取得を実装してから、RLSは別手順で段階的に追加します。
--
-- 前提:
-- - Supabase Authを使う方針で進めること。
-- - worker_master と work_logs が作成済みであること。

create table if not exists public.company_master (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists company_master_active_name_idx
  on public.company_master(name)
  where is_active = true;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid references public.worker_master(id),
  company_id uuid references public.company_master(id),
  role text not null check (role in ('system_admin', 'company_admin', 'worker')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (
    (
      role = 'system_admin'
      and worker_id is null
    )
    or
    (
      role = 'company_admin'
      and company_id is not null
    )
    or
    (
      role = 'worker'
      and company_id is not null
      and worker_id is not null
    )
  )
);

create unique index if not exists user_profiles_auth_user_id_idx
  on public.user_profiles(auth_user_id);

create index if not exists user_profiles_company_id_idx
  on public.user_profiles(company_id);

create index if not exists user_profiles_worker_id_idx
  on public.user_profiles(worker_id);

alter table public.worker_master
  add column if not exists company_id uuid references public.company_master(id);

create index if not exists worker_master_company_id_idx
  on public.worker_master(company_id);

alter table public.work_logs
  add column if not exists company_id uuid references public.company_master(id);

create index if not exists work_logs_company_id_idx
  on public.work_logs(company_id);

-- ここでは grant や RLS policy は追加しません。
-- 理由:
-- - ログイン実装前にRLSを強くすると、既存画面が急に表示できなくなる可能性があります。
-- - company_id が未設定の既存データをどう扱うか決めてから、読み取り範囲を制限する必要があります。
--
-- 次の段階で行うこと:
-- 1. 会社マスタを登録する。
-- 2. 作業者に company_id を付与する。
-- 3. 既存 work_logs に保存時点の company_id を付与する手順を確認する。
-- 4. ログイン画面と user_profiles 取得処理を追加する。
-- 5. テストユーザーで閲覧範囲を確認する。
-- 6. RLSを読み取りから段階的に有効化する。

notify pgrst, 'reload schema';
