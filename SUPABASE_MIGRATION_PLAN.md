# Supabase migration管理への移行案

## 現状

現在は、用途別のSQLファイルをGit管理し、必要なタイミングでSupabase SQL Editorから手動実行しています。

主なSQLファイル:

- `SUPABASE_SETUP.sql`
- `SUPABASE_RATE_SETUP.sql`
- `SUPABASE_AUTH_PERMISSION_SETUP.sql`
- `SUPABASE_AUTH_RLS_POLICIES.sql`
- `SUPABASE_WORK_TRACKING_RELEASE_SECURITY.sql`
- `SUPABASE_SEIBAN_ACTIVE_SETUP.sql`
- `SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql`
- `SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN.sql`
- `SUPABASE_BETA_AUDIT_SETUP.sql`
- `SUPABASE_BETA_VALIDATION_SETUP.sql`

確認専用SQL:

- `SUPABASE_DEMO_DATA_CONFIRM_ONLY.sql`
- `SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql`
- `SUPABASE_BETA_AUDIT_CONFIRM_ONLY.sql`
- `SUPABASE_BETA_VALIDATION_CONFIRM_ONLY.sql`

この運用は、1人開発・1社βでは進めやすい一方で、どのSQLがどの環境に適用済みかを機械的に保証できません。

## 移行の目的

- 本番とテスト環境のschema差分を減らす
- SQL適用順序をGit履歴で明確にする
- 本番適用前にPreviewまたはstagingで確認しやすくする
- rollback手順を migration 単位で検討しやすくする

## 安全な移行方針

### 1. 既存SQLをすぐ自動適用しない

既存のSQLファイルをいきなり `supabase/migrations/` へ移して自動適用しないでください。

理由:

- すでに本番へ適用済みのSQLがある
- 手動実行済みの順番と現在DB状態の照合が必要
- 重複実行できるSQLと、事前確認が必要なSQLが混在している

### 2. 現在DB状態の棚卸しを先に行う

読み取り専用SQLで以下を確認します。

- 存在するテーブル
- 存在するカラム
- 存在する制約
- 存在するindex
- 有効なRLS
- 適用済みpolicy
- 適用済みfunction / trigger

確認結果を `BETA_RELEASE_STATUS.md` または新しい棚卸しドキュメントに記録します。

### 3. 新規変更から migration 化する

過去分を無理に変換するより、今後の新規DB変更から `supabase/migrations/` に追加するのが安全です。

例:

```text
supabase/migrations/
  202608070001_add_audit_log.sql
  202608070002_add_work_log_validation_constraints.sql
```

### 4. 破壊的変更は migration に入れる前に確認専用SQLを用意する

以下に該当する変更は、必ず確認専用SQLを先に用意します。

- delete
- drop
- alter column type
- not null化
- unique制約追加
- RLS policy変更
- trigger追加
- security definer function変更

### 5. staging Supabaseを作ってから自動適用を検討する

本番へ自動migration適用する前に、staging Supabaseを用意します。

最初の運用:

1. stagingへ手動でschemaを再現
2. migrationをstagingへ適用
3. アプリをPreviewでstagingへ接続
4. 問題なければ本番SQL Editorで手動適用

次の段階:

1. GitHub Actionsでmigration dry-run
2. stagingへ自動適用
3. 本番は人間承認後に適用

## 当面のルール

- 今回は本番DBへの自動migration適用はしない
- 既存SQLファイルは削除しない
- 本番DB変更は、確認専用SQL、バックアップ、手動確認を経て実行する
- 新規DB変更から `supabase/migrations/` 形式への移行を検討する
