-- 商品化前の確認用データ整理「実行用」SQLです。
--
-- 注意:
-- - このファイルは実際に delete / update を実行します。
-- - 対象は `CSV確認_%`、`Codex確認%`、`Codex商品化確認%`、`CSV-DEMO-%` などの確認用データに限定しています。
-- - `OSZ-1000` のような通常製番そのものは削除しません。
-- - 通常製番に紐づいていても、作業者が `CSV確認_*` の工数ログは確認用として削除します。
-- - 確認用製番は rate_master などから参照される場合があるため、このSQLでは削除しません。

begin;

-- 確認用工数ログを削除します。
delete from public.work_logs wl
where wl.note like 'CSV確認%'
   or wl.note like 'Codex確認%'
   or exists (
     select 1
     from public.worker_master wm
     where wm.id = wl.worker_id
       and (
         wm.name like 'CSV確認_%'
         or wm.name like 'Codex確認%'
         or wm.name like 'Codex商品化確認%'
       )
   )
   or exists (
     select 1
     from public.work_type_master wtm
     where wtm.id = wl.work_type_id
       and (
         wtm.name like 'CSV確認_%'
         or wtm.name like 'Codex確認%'
         or wtm.name like 'Codex商品化確認%'
       )
   )
   or exists (
     select 1
     from public.seiban_master sm
     where sm.id = wl.seiban_id
       and (
         sm.seiban like 'CSV-DEMO-%'
         or sm.seiban like 'Codex確認%'
         or sm.equipment_name like 'CSV確認_%'
         or sm.equipment_name like 'Codex確認%'
       )
   );

-- 確認用作業者は非表示にします。
update public.worker_master
set is_active = false
where name like 'CSV確認_%'
   or name like 'Codex確認%'
   or name like 'Codex商品化確認%';

-- 確認用作業内容は非表示にします。
update public.work_type_master
set is_active = false
where name like 'CSV確認_%'
   or name like 'Codex確認%'
   or name like 'Codex商品化確認%';

-- 確認用製番は削除しません。
-- rate_master などから参照される場合があるため、DB整合性を優先して残します。

commit;

notify pgrst, 'reload schema';

-- 実行後確認
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
