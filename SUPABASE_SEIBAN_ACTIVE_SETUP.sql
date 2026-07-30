-- 製番マスタを削除ではなく非表示で運用するためのSQLです。
--
-- 背景:
-- - seiban_master は work_logs や rate_master から参照されるため、削除すると外部キーエラーになる場合があります。
-- - 商品化第一段階では、作業者・作業内容と同じく `is_active = false` で通常導線から外す方針にします。
--
-- 実行後:
-- - 既存製番はすべて使用中として扱われます。
-- - 管理画面から非表示化/再表示できます。
-- - 工数入力、履歴編集、集計の製番選択には使用中の製番だけ表示します。

alter table public.seiban_master
add column if not exists is_active boolean not null default true;

create index if not exists seiban_master_is_active_idx
on public.seiban_master (is_active);

update public.seiban_master
set is_active = false
where seiban like 'CSV-DEMO-%'
   or seiban like 'Codex確認%'
   or equipment_name like 'CSV確認_%'
   or equipment_name like 'Codex確認%';

notify pgrst, 'reload schema';
