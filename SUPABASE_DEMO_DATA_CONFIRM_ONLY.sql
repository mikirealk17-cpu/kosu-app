-- 商品化前の確認用データ「確認専用」SQLです。
--
-- このファイルは確認だけを行います。
-- delete / update / insert は含めていないため、実行してもデータは変更されません。
--
-- 結果に出た行が、消してよい確認用データだけか確認してください。

-- 確認用の作業者
select id, name, is_active
from public.worker_master
where name like 'CSV確認_%'
   or name like 'Codex確認%'
   or name like 'Codex商品化確認%'
order by name;

-- 確認用の作業内容
select id, name, sort_order, is_active
from public.work_type_master
where name like 'CSV確認_%'
   or name like 'Codex確認%'
   or name like 'Codex商品化確認%'
order by name;

-- 確認用の製番
select id, seiban, equipment_name
from public.seiban_master
where seiban like 'CSV-DEMO-%'
   or seiban like 'Codex確認%'
   or equipment_name like 'CSV確認_%'
   or equipment_name like 'Codex確認%'
order by seiban, equipment_name;

-- 確認用に紐づく工数ログ
select
  wl.id,
  wl.work_date,
  wm.name as worker_name,
  sm.seiban,
  sm.equipment_name,
  wtm.name as work_type_name,
  wl.start_time,
  wl.end_time,
  wl.actual_minutes,
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
   or wl.note like 'Codex確認%'
order by wl.work_date, worker_name, seiban;
