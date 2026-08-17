# β版 残作業の安全な実行順

2026-08-16時点で、工数入力・本人履歴・本人集計・管理者集計・Excel出力・生産番号候補検索は実装済みです。残作業は、次の順番で確認します。

## 1. 本番へ影響しない確認

1. `npm test` を実行する。
2. `SUPABASE_BETA_AUDIT_CONFIRM_ONLY.sql` をSupabase SQL Editorで実行する。
3. `SUPABASE_BETA_VALIDATION_CONFIRM_ONLY.sql` をSupabase SQL Editorで実行する。
4. 確認結果を保存し、既存データ違反や不足項目を整理する。

この段階のSQLは読み取り専用です。結果に問題があっても、続けてSETUP SQLを実行しません。

### 結果の判断方法

`SUPABASE_BETA_AUDIT_CONFIRM_ONLY.sql`:

- `target_tables` の `ng_count` は `0` が必須。
- `audit_log_columns`、`audit_triggers`、`required_functions` は、監査ログ未適用なら `ng_count` が残っていても想定内。
- 監査ログSETUP適用後は、上記すべての `ng_count` が `0` になったことを確認する。

`SUPABASE_BETA_VALIDATION_CONFIRM_ONLY.sql`:

- `work_logs_existing_data` の `issue_count` は `0` が必須。
- `seiban_master_existing_data` の `issue_count` は `0` が必須。
- `expected_constraints_present` は入力制約未適用なら不足数が表示されても想定内。SETUP適用後は `0` が必須。
- `expected_constraints_validated` はSETUP適用後に `0` が必須。

既存データの `issue_count` が1件以上なら、対象IDと理由を記録して停止します。自動修正や削除は行いません。

## 2. バックアップ確認

1. Supabase Dashboardの `Database > Backups` で、プランと最新バックアップ日時を確認する。
2. 全期間の明細Excelを保存する。
3. `BETA_BACKUP_RECOVERY.md` に従って論理バックアップを取得する。
4. バックアップファイルを開発PCとは別の保存先にも複製する。

バックアップ取得と復元可能性を確認するまでは、本番へ監査ログ・入力制約SQLを適用しません。

## 3. 別Supabase環境での確認

1. 課金が発生しないことを確認してから、復元確認用プロジェクトを用意する。
2. バックアップを復元し、工数件数・集計合計・認証/RLSを確認する。
3. `SUPABASE_BETA_AUDIT_SETUP.sql` を適用し、追加・更新・削除が監査ログへ記録されることを確認する。
4. `SUPABASE_BETA_VALIDATION_SETUP.sql` を適用し、不正な時間・休憩・文字数が拒否されることを確認する。

本番とは異なるスキーマやデータ件数になった場合は、本番適用を止めて差分を調査します。

## 4. 生産番号機能の安全確認

`SEIBAN_PRODUCTION_NUMBER_DB_RUNBOOK.md` に従い、テスト用と明確に分かる生産番号だけを使用します。

1. 表記揺れが既存番号として選択され、新規マスタが増えないことを確認する。
2. 同一番号の同時登録相当で、UNIQUE制約エラー後に既存番号が選択されることを確認する。
3. 作業者の新規登録が `pending` になることを確認する。
4. 管理者が `confirmed` に変更できることを確認する。
5. 統合前に、統合元を参照する工数件数と統合先IDを記録する。
6. 統合後に、工数件数が変わらず参照先だけ変更されたことを確認する。

本番の実在する生産番号を削除・統合してテストしません。

## 5. iPhone実機確認

- 工数入力、履歴編集、自分の工数集計で横はみ出しがない。
- キーボード表示中も保存・更新ボタンを押せる。
- 生産番号候補を選択しやすい。
- 未登録時の新規登録ボタンが一目で分かる。
- 保存後の直近入力カードが表示される。

## 6. GitHub main保護

2026-08-16に設定済みです。

- Pull Request経由を必須にする。
- `npm test` の成功をmerge条件にする。
- 管理者にも保護ルールを適用する。
- force pushとmainブランチ削除を禁止する。
- 1人開発のため、他人によるレビューは必須にしない。

Codexは引き続き作業ブランチへpushし、人間の明確な承認後だけPull Requestをmainへmergeします。

## β版公開判定

上記の確認が終わり、データ消失・権限漏れ・重大な集計不一致がなければ、1社・3〜5人・14日間のβ版を開始します。
