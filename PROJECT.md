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

## 画面

- `index.html`: 工数入力画面
- `summary.html`: 集計画面
- `logs.html`: 入力履歴編集画面
- `workers.html`: 作業者管理画面

## データベース

- `seiban_master`: 製番マスタ
- `work_type_master`: 作業内容マスタ
- `work_logs`: 工数記録
- `worker_master`: 作業者マスタ

2026-06-26時点のAPI確認では、現在接続中のSupabaseに `worker_master` と `work_logs.worker_id` はまだ反映されていません。
作業者対応を有効にするには、`SUPABASE_SETUP.sql` をSupabase SQL Editorで実行してください。

SQL実行後の動き:

- `workers.html` で作業者を追加する
- `index.html` で作業者を選んで工数を保存する
- `work_logs.worker_id` に選択した作業者IDが保存される
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

例:

- マスタ取得は許可
- 工数登録は許可
- 作業者管理の追加・編集・削除を許可するかは運用ルールで判断
- 秘密情報を含む列は作らない
