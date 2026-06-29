# PROJECT

## 目的

設備組付け作業者が、迷わず短時間で工数を入力できることを優先します。

## 基本方針

- ログイン機能は作らない
- 作業者はプルダウンから選ぶ
- 入力項目は必要最小限にする
- 入力ミスが起きやすい項目は自動計算・自動表示にする
- 初心者が読めるように、処理を分かりやすく分ける
- 不要なライブラリは追加しない
- UIは入力速度を優先し、集計はSaaS管理画面のように状態を把握しやすくする
- CSSは共通、フォーム、ボタン、集計、履歴、管理、スマホ対応の役割ごとに整理する

## 画面

- `index.html`: 工数入力画面
- `summary.html`: 集計画面
- `logs.html`: 入力履歴編集画面
- `admin.html`: 管理画面
- `workers.html`: 作業者管理画面
- `root-companies.html`: 大元請け管理画面
- `billing-companies.html`: 元請け管理画面
- `rates.html`: 単価管理画面
- `work-types.html`: 作業内容マスタ管理画面
- `seibans.html`: 製番マスタ管理画面

## データベース

- `seiban_master`: 製番マスタ
- `work_type_master`: 作業内容マスタ
- `work_logs`: 工数記録
- `worker_master`: 作業者マスタ
- `root_company_master`: 大元請けマスタ
- `billing_company_master`: 元請けマスタ
- `rate_master`: 単価マスタ

2026-06-26時点のAPI確認では、現在接続中のSupabaseに `worker_master` と `work_logs.worker_id` はまだ反映されていません。
作業者対応を有効にするには、`SUPABASE_SETUP.sql` をSupabase SQL Editorで実行してください。
元請け対応も同じSQLに含めています。実行すると `billing_company_master` と `work_logs.billing_company_id` が追加されます。
元請け対応だけを追加する場合は、`SUPABASE_BILLING_COMPANY_SETUP.sql` を実行します。
このSQLは既存の工数データを更新・削除せず、空欄を許可する追加列だけを作ります。
単価自動適用を追加する場合は、`SUPABASE_RATE_SETUP.sql` を実行します。

SQL実行後の動き:

- `workers.html` で作業者を追加する
- `root-companies.html` で大元請けを追加する
- `billing-companies.html` で元請けを追加し、大元請けに紐づける
- `rates.html` で時間単価、固定単価、請負単価を追加する
- `index.html` で作業者、大元請け、元請け、単価区分を選んで工数を保存する
- `work_logs.worker_id` に選択した作業者IDが保存される
- `work_logs.root_company_id` と `work_logs.billing_company_id` に選択した大元請け・元請けIDが保存される
- `work_logs.rate_master_id`、`unit_price`、`billing_amount` に保存時点の単価情報が保存される
- `summary.html` の元請け別タブで元請けごとの工数を確認する
- 請求確認CSVで、大元請け、元請け、単価区分、単価、金額を出力する
- `summary.html` の作業者別タブで作業者ごとの工数を確認する

## Supabase利用方針

ブラウザから直接Supabaseへアクセスします。
そのため、JavaScriptに書けるのは公開用キーだけです。

`.env` やVercel Environment Variablesは、秘密キーを隠す目的ではこの構成に向きません。
フロントエンドだけで使う値は最終的にブラウザへ渡るためです。
秘密キーを使う必要が出た場合は、Vercel Serverless Functionsなどのサーバー側処理を追加します。

## RLSの考え方

ログインなし運用では、利用者は全員「公開利用者」として扱われます。
Supabase側でRLSを有効にし、公開利用者に許可する操作を明確にしてください。

現在の運用方針:

- `worker_master`: 表示、追加、編集、非表示化を許可
- `root_company_master`: 表示、追加、編集、非表示化を許可
- `billing_company_master`: 表示、追加、編集、非表示化を許可
- `rate_master`: 表示、追加、編集、非表示化を許可
- `work_logs`: 表示、追加、編集、削除を許可
- `work_type_master`: 表示、追加、編集、非表示化を許可
- `seiban_master`: 表示、追加、編集、削除を許可

注意点:

- URLを知っている人は、上記の操作ができます
- 社外公開や個人情報保存には向きません
- 秘密情報を含む列は作らない
- `service_role` などの秘密キーはブラウザ用JavaScriptへ書かない

この方針は `SUPABASE_SETUP.sql` に反映しています。
