-- 商品化前の確認用データ整理SQLです。
--
-- 使い方:
-- 1. まず「確認クエリ」だけ実行して、対象が確認用データだけか確認します。
-- 2. 問題なければ「整理実行」を実行します。
--
-- 方針:
-- - 作業者・作業内容は過去参照を壊さないため is_active = false にします。
-- - 製番は is_active がないため、確認用工数ログを消した後、未使用になった確認用製番だけ削除します。
-- - 実データを巻き込まないよう、名前/製番/設備名/備考の確認用プレフィックスに限定します。
--
-- 注意:
-- - work_logs の削除は元に戻せません。実行前に必ず確認クエリを見てください。
-- - 実行は管理者でログイン確認済み、RLS適用済みの状態を前提にします。

-- =========================================================
-- 確認クエリ
-- =========================================================

-- 確認用の作業者
select id, name, is_active
from public.worker_master
where name like 'CSV確認_%'
   or name like 'Codex確認%'
   or name like 'Codex商品化確認%';

-- 確認用の作業内容
select id, name, sort_order, is_active
from public.work_type_master
where name like 'CSV確認_%'
   or name like 'Codex確認%'
   or name like 'Codex商品化確認%';

-- 確認用の製番
select id, seiban, equipment_name
from public.seiban_master
where seiban like 'CSV-DEMO-%'
   or seiban like 'Codex確認%'
   or equipment_name like 'CSV確認_%'
   or equipment_name like 'Codex確認%';

-- 確認用に紐づく工数ログ
select
  wl.id,
  wl.work_date,
  wm.name as worker_name,
  sm.seiban,
  sm.equipment_name,
  wtm.name as work_type_name,
  wl.note
from public.work_logs wl
left join public.worker_master wm on wm.id = wl.worker_id
left join public.seiban_master sm on sm.id = wl.seiban_id
left join public.work_type_master wtm on wtm.id = wl.work_type_id
where wm.name like 'CSV確認_%'
   or wm.name like 'Codex確認%'
   or wm.name like 'Codex商品化確認%'
   or wtm.name like 'CSV確認_%'
   or wtm.name like 'Codex確認%'
   or wtm.name like 'Codex商品化確認%'
   or sm.seiban like 'CSV-DEMO-%'
   or sm.seiban like 'Codex確認%'
   or sm.equipment_name like 'CSV確認_%'
   or sm.equipment_name like 'Codex確認%'
   or wl.note like 'CSV確認%'
   or wl.note like 'Codex確認%';

-- =========================================================
-- 整理実行
-- =========================================================

do $$
begin
  raise exception '確認クエリの結果を確認してから、このRAISE EXCEPTIONブロックをコメントアウトして整理実行してください。';
end $$;

begin;

-- 確認用工数ログを削除します。
delete from public.work_logs wl
using public.worker_master wm, public.seiban_master sm, public.work_type_master wtm
where (wl.worker_id = wm.id or wl.worker_id is null)
  and (wl.seiban_id = sm.id or wl.seiban_id is null)
  and (wl.work_type_id = wtm.id or wl.work_type_id is null)
  and (
    wm.name like 'CSV確認_%'
    or wm.name like 'Codex確認%'
    or wm.name like 'Codex商品化確認%'
    or wtm.name like 'CSV確認_%'
    or wtm.name like 'Codex確認%'
    or wtm.name like 'Codex商品化確認%'
    or sm.seiban like 'CSV-DEMO-%'
    or sm.seiban like 'Codex確認%'
    or sm.equipment_name like 'CSV確認_%'
    or sm.equipment_name like 'Codex確認%'
    or wl.note like 'CSV確認%'
    or wl.note like 'Codex確認%'
  );

-- 確認用作業者は非表示にします。
update public.worker_master
set
  is_active = false,
  updated_at = now()
where name like 'CSV確認_%'
   or name like 'Codex確認%'
   or name like 'Codex商品化確認%';

-- 確認用作業内容は非表示にします。
update public.work_type_master
set
  is_active = false,
  updated_at = now()
where name like 'CSV確認_%'
   or name like 'Codex確認%'
   or name like 'Codex商品化確認%';

-- 未使用になった確認用製番だけ削除します。
delete from public.seiban_master sm
where (
    sm.seiban like 'CSV-DEMO-%'
    or sm.seiban like 'Codex確認%'
    or sm.equipment_name like 'CSV確認_%'
    or sm.equipment_name like 'Codex確認%'
  )
  and not exists (
    select 1
    from public.work_logs wl
    where wl.seiban_id = sm.id
  );

commit;

notify pgrst, 'reload schema';

-- =========================================================
-- 実行後確認
-- =========================================================

select count(*) as remaining_demo_workers
from public.worker_master
where is_active = true
  and (
    name like 'CSV確認_%'
    or name like 'Codex確認%'
    or name like 'Codex商品化確認%'
  );

select count(*) as remaining_demo_work_types
from public.work_type_master
where is_active = true
  and (
    name like 'CSV確認_%'
    or name like 'Codex確認%'
    or name like 'Codex商品化確認%'
  );

select count(*) as remaining_demo_logs
from public.work_logs wl
left join public.worker_master wm on wm.id = wl.worker_id
left join public.seiban_master sm on sm.id = wl.seiban_id
left join public.work_type_master wtm on wtm.id = wl.work_type_id
where wm.name like 'CSV確認_%'
   or wm.name like 'Codex確認%'
   or wm.name like 'Codex商品化確認%'
   or wtm.name like 'CSV確認_%'
   or wtm.name like 'Codex確認%'
   or wtm.name like 'Codex商品化確認%'
   or sm.seiban like 'CSV-DEMO-%'
   or sm.seiban like 'Codex確認%'
   or sm.equipment_name like 'CSV確認_%'
   or sm.equipment_name like 'Codex確認%'
   or wl.note like 'CSV確認%'
   or wl.note like 'Codex確認%';
