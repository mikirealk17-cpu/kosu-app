# β版バックアップ・復旧手順

## 方針

β期間中は、SupabaseのDBバックアップと、管理画面から取得する工数Excelを併用します。復元は本番へ直接行わず、必ず別のSupabaseプロジェクトで確認してから切り替えます。

## β開始前

1. Supabase Dashboardの `Database > Backups` を開き、現在のプランと利用可能なバックアップを確認する。
2. 有料プランで日次バックアップが表示される場合は、最新バックアップ日時を記録する。
3. 無料プラン、またはDashboardバックアップだけに依存しない場合は、Supabase CLIで論理バックアップを取得する。
4. 管理者で集計画面を開き、β開始前までの全期間・全作業者・全作業内容・全製番を条件にして、明細Excelを保存する。
5. バックアップファイルは、アプリ開発PCとは別の保存先にも複製する。

Supabase公式情報:

- Database Backups: https://supabase.com/docs/guides/platform/backups
- CLIによるBackup and Restore: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

2026-08-03時点の公式説明では、日次バックアップはPro・Team・Enterpriseで自動取得され、保持期間はPro 7日、Team 14日、Enterpriseは最大30日です。FreeプロジェクトはCLIで定期的にエクスポートすることが推奨されています。実際の契約とDashboard表示を必ず優先してください。

## CLIバックアップ

接続文字列にはDBパスワードが含まれます。Gitへ保存せず、共有チャットや手順書にも貼り付けません。

```sh
export KOSU_DATABASE_URL='SupabaseのConnect画面に表示されるSession pooler接続文字列'

supabase db dump --db-url "$KOSU_DATABASE_URL" -f roles.sql --role-only
supabase db dump --db-url "$KOSU_DATABASE_URL" -f schema.sql
supabase db dump --db-url "$KOSU_DATABASE_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"

unset KOSU_DATABASE_URL
```

生成した `roles.sql`、`schema.sql`、`data.sql` は、日付を付けたフォルダへまとめて保管します。

## β期間中の日次運用

1. 毎営業日の終了後、管理者が当日分の明細Excelを出力する。
2. ファイル名の期間と、画面の入力件数・総実働時間を確認する。
3. Excelを日付別フォルダへ保管し、別の保存先へ複製する。
4. Supabase Dashboardで最新バックアップ日時を確認する。
5. 削除や大きな修正をした日は `audit_log` も確認する。

## 誤削除時

1. 追加・更新・削除操作をいったん止める。
2. 削除日時、操作者、作業者、日付、製番を記録する。
3. `audit_log` から対象を確認する。

```sql
select id, created_at, actor_user_id, table_name, record_id, old_data
from public.audit_log
where action = 'delete'
  and table_name = 'work_logs'
order by id desc;
```

4. `old_data` には削除直前の行が残る。復元SQLは対象行と現在のスキーマを照合して作成する。
5. 先に別プロジェクトへ復元し、件数・集計・権限を確認する。
6. 本番復元は、対象と影響範囲を再確認してから管理者が実施する。

## 全体復旧

1. 新しいSupabaseプロジェクトを作成する。
2. 元環境と同じ拡張機能、Auth設定、Redirect URLを用意する。
3. 公式CLI手順に従い `roles.sql`、`schema.sql`、`data.sql` を新プロジェクトへ復元する。
4. Auth設定、APIキー、Realtime設定など、DBバックアップ外の設定を再構成する。
5. 管理者・作業者ログイン、RLS、工数件数、合計分、Excel出力を確認する。
6. 問題がなければ、Vercel側のSupabase URLと公開キーを新プロジェクトへ切り替える。

## 復旧確認の合格条件

- 工数件数がバックアップ取得時点と一致する。
- 総実働分が一致する。
- 作業者が他人の工数を取得できない。
- 管理者だけが集計・マスタ管理を利用できる。
- 明細Excelと画面の合計が一致する。
- 元の本番環境は、確認完了まで変更しない。
