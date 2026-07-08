# PROJECT

## 目的

設備組付け作業者が、迷わず短時間で工数を入力できることを優先します。

## 基本方針

- 現行版ではログイン機能は作らない
- 作業者はプルダウンから選ぶ
- 入力項目は必要最小限にする
- 商品化第一段階は工数管理版として進め、単価・請求は通常導線から外す
- 通常入力では元請け・単価区分を入力しない
- 入力ミスが起きやすい項目は自動計算・自動表示にする
- 初心者が読めるように、処理を分かりやすく分ける
- 不要なライブラリは追加しない
- UIは入力速度を優先し、集計はSaaS管理画面のように状態を把握しやすくする
- CSSは共通、フォーム、ボタン、集計、履歴、管理、スマホ対応の役割ごとに整理する

将来のログイン・権限管理は `AUTH_PERMISSION_DESIGN.md` に整理しています。
DB側の下準備SQL案は `SUPABASE_AUTH_PERMISSION_SETUP.sql` に分けています。
金額を扱うため、実装時は画面制御だけでなくSupabase RLSで閲覧範囲を制限します。

## 画面

- `index.html`: 工数入力画面
- `summary.html`: 集計画面
- `logs.html`: 入力履歴編集画面
- `admin.html`: 管理画面
- `workers.html`: 作業者管理画面
- `billing-companies.html`: 元請け管理画面
- `rates.html`: 単価管理画面（第2段階向け、通常導線からは外す）
- `work-types.html`: 作業内容マスタ管理画面
- `seibans.html`: 製番マスタ管理画面

## データベース

- `seiban_master`: 製番マスタ
- `work_type_master`: 作業内容マスタ
- `work_logs`: 工数記録
- `worker_master`: 作業者マスタ
- `billing_company_master`: 元請けマスタ
- `rate_master`: 単価マスタ
- `company_master`: 所属会社マスタ
- `user_profiles`: ログインユーザーと権限の紐づけ

2026-07-01時点で、現在接続中のSupabaseには作業者、元請け、単価自動適用に必要なテーブルと列が反映済みです。
新規環境へ設定する場合は、`SUPABASE_SETUP.sql` と `SUPABASE_RATE_SETUP.sql` をSupabase SQL Editorで実行します。
元請け対応だけを追加したい場合は、`SUPABASE_BILLING_COMPANY_SETUP.sql` を実行します。
これらのSQLは既存の工数データを自動変換せず、過去データを勝手に変更しない方針です。
旧版で追加した大元請けテーブルや列は、データ破損を避けるため削除せず、現行画面・単価判定では使いません。
ログイン・権限管理用のSQL案は `SUPABASE_AUTH_PERMISSION_SETUP.sql` にあります。
このSQL案では、会社マスタとユーザープロフィール、既存テーブルの `company_id` 列を追加するだけに留め、RLSの有効化は別段階にします。

SQL実行後の動き:

- `workers.html` で作業者を追加する
- `billing-companies.html` で元請けを追加する
- 第2段階では `rates.html` で時間単価、固定単価、請負単価を追加する
- `index.html` で作業者、製番、作業内容、時間を入力して工数を保存する
- `work_logs.worker_id` に選択した作業者IDが保存される
- 第2段階では `work_logs.billing_company_id` に選択した元請けIDが保存される
- 第2段階では `work_logs.rate_master_id`、`unit_price`、`billing_amount` に保存時点の単価情報が保存される
- `summary.html` の元請け別タブで元請けごとの工数を確認する
- 請求確認CSVはログイン・権限管理を入れるまで通常導線から外す
- `summary.html` の作業者別タブで作業者ごとの工数を確認する
- 集計画面のCSV出力は、明細CSV、表示中タブに合わせた集計CSVを通常導線にする

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
- `billing_company_master`: 表示、追加、編集、非表示化を許可
- `rate_master`: 第2段階向け。工数管理版では通常導線から外す
- `work_logs`: 表示、追加、編集、削除を許可
- `work_type_master`: 表示、追加、編集、非表示化を許可
- `seiban_master`: 表示、追加、編集、削除を許可

注意点:

- URLを知っている人は、上記の操作ができます
- 社外公開や個人情報保存には向きません
- 秘密情報を含む列は作らない
- `service_role` などの秘密キーはブラウザ用JavaScriptへ書かない

この方針は `SUPABASE_SETUP.sql` に反映しています。
