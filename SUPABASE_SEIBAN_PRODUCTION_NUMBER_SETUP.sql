-- 生産番号（既存名: 製番）検索・仮登録用の追加SQLです。
-- 本番実行前に、必ず SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql を先に実行してください。
-- 重複が出た場合は、このSQLで自動削除・自動統合せず、一覧を確認してから手動で統合してください。

create or replace function public.normalize_seiban_key(value text)
returns text
language plpgsql
immutable
as $$
declare
  result text;
begin
  result := coalesce(value, '');
  result := btrim(result);
  result := translate(
    result,
    'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  );
  result := translate(result, '‐‑‒–—―−ー－─⁃˗', '---------------');
  result := regexp_replace(result, '[[:space:]　]+', '', 'g');
  result := upper(result);
  result := regexp_replace(result, '-+', '-', 'g');
  return result;
end;
$$;

-- 正規化後に重複する既存製番の確認。
-- ここで行が出る場合、unique index作成前にどれへ統合するか判断してください。
select
  public.normalize_seiban_key(seiban) as seiban_key,
  count(*) as duplicate_count,
  array_agg(id order by seiban) as seiban_ids,
  array_agg(seiban order by seiban) as seibans
from public.seiban_master
group by public.normalize_seiban_key(seiban)
having public.normalize_seiban_key(seiban) <> ''
   and count(*) > 1
order by seiban_key;

alter table public.seiban_master
  add column if not exists seiban_key text;

alter table public.seiban_master
  add column if not exists status text not null default 'confirmed';

alter table public.seiban_master
  add column if not exists customer_name text;

alter table public.seiban_master
  add column if not exists created_by uuid;

alter table public.seiban_master
  add column if not exists created_at timestamptz not null default now();

alter table public.seiban_master
  add column if not exists confirmed_by uuid;

alter table public.seiban_master
  add column if not exists confirmed_at timestamptz;

update public.seiban_master
set
  seiban_key = public.normalize_seiban_key(seiban),
  status = coalesce(status, 'confirmed'),
  confirmed_at = coalesce(confirmed_at, created_at, now())
where seiban_key is null
   or seiban_key = ''
   or status is null
   or confirmed_at is null;

do $$
begin
  if exists (
    select 1
    from public.seiban_master
    where coalesce(seiban_key, '') = ''
  ) then
    raise exception 'seiban_master contains empty seiban_key. Fix empty seiban values before continuing.';
  end if;

  if exists (
    select 1
    from public.seiban_master
    group by seiban_key
    having count(*) > 1
  ) then
    raise exception 'seiban_master contains duplicate normalized seiban_key values. Review the duplicate query result and merge manually before creating the unique index.';
  end if;
end
$$;

create unique index if not exists seiban_master_seiban_key_uidx
on public.seiban_master (seiban_key);

create index if not exists seiban_master_status_idx
on public.seiban_master (status);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.seiban_master'::regclass
      and conname = 'seiban_master_status_check'
  ) then
    alter table public.seiban_master
      add constraint seiban_master_status_check
      check (status in ('pending', 'confirmed'));
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

notify pgrst, 'reload schema';
