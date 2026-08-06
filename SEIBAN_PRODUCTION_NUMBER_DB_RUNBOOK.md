# 生産番号登録機能 DB適用手順

更新日: 2026-08-06

## 現在の状態

- GitHub `origin/main` は `c5bd217 Harden seiban setup SQL` までpush済み。
- Vercel本番にも `SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql` と `SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql` が配信済み。
- フロント側の生産番号検索・仮登録UIは本番反映済み。
- DB本番適用は完了済み。
- 読み取り専用チェックで `empty_key_rows = 0`、正規化後重複0件を確認済み。
- REST RPCで `normalize_seiban_key('ＡＢ－１２３') = 'AB-123'` を確認済み。
- 匿名RESTで `seiban_master` が読めないことを確認済み。

## 次に確認すること

- 管理画面 `seibans.html` の未確認一覧に `CODEX-TEST-...` があるか確認する。
- ある場合は、テスト登録が完了しているため `pending` 状態・正規化キー・設備名を確認する。
- ない場合は、テスト登録は未完了と判断し、PC操作可能時に再度 `CODEX-TEST-...` で仮登録する。
- 仮登録確認後、管理者で「確認済みにする」を実行し `confirmed` になることを確認する。
- 統合テストは本番データ消失リスクがあるため、統合元が明確なテスト用 `pending` データだけで実行する。

## 実行順序

### 1. バックアップ確認

Supabase Dashboardで、`Database > Backups` の最新バックアップ時刻を確認します。

FreeプランなどでDashboardバックアップが使えない場合は、少なくともβ開始前の全期間明細Excelを保存してください。

### 2. 読み取り専用チェック

Supabase SQL Editorで、先に以下を実行します。

```text
SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql
```

確認する結果:

- 1つ目の結果: `empty_key_rows` が `0`
- 2つ目の結果: 行が返らない

2つ目で行が返った場合は、正規化すると同じ生産番号になる既存データがあります。この場合は本番適用を止め、返ってきた `seiban_key`、`seibans`、`seiban_ids` を確認してから統合方針を決めます。

### 3. DB変更SQL適用

読み取り専用チェックが問題なければ、Supabase SQL Editorで以下を実行します。

```text
SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql
```

このSQLで行うこと:

- `seiban_key` を追加
- `status` を追加
- `customer_name` を追加
- `created_by` / `created_at` を追加
- `confirmed_by` / `confirmed_at` を追加
- 既存製番へ正規化済みキーを設定
- `seiban_key` にUNIQUE indexを作成
- 作業者は `pending` の仮登録だけ可能にするRLSへ更新
- 管理者だけが確認済み化・編集・削除・統合できるようにする
- `merge_pending_seiban` RPCを追加
- RPC実行権限をログイン済みユーザーへ限定し、統合RPC内でも `system_admin` を確認する

安全対策:

- SQL全体をトランザクションで実行します。
- 読み取り専用チェックを飛ばして実行した場合でも、空キー・重複があればスキーマ変更前に停止します。

### 3.1. RLS再実行後の補強

`SUPABASE_AUTH_RLS_POLICIES.sql` を後から再実行した場合は、続けて以下も実行してください。

```text
SUPABASE_SEIBAN_PRODUCTION_NUMBER_RLS_HARDEN.sql
```

この補強SQLは、作業者の仮登録権限を `pending` のみに戻し、確認済み化・統合・削除を管理者だけに限定します。既存データは削除しません。

### 4. 適用後チェック

SQL適用後、Supabase SQL Editorで以下を確認します。

```sql
select
  status,
  count(*) as count
from public.seiban_master
group by status
order by status;
```

```sql
select
  count(*) as missing_key_count
from public.seiban_master
where seiban_key is null
   or seiban_key = '';
```

期待値:

- 既存データは基本的に `confirmed`
- `missing_key_count` は `0`

### 5. 画面確認

本番画面で以下を確認します。

- 管理者で `seibans.html` を開ける
- 製番一覧に既存製番が表示される
- 工数入力画面で既存製番を検索して候補選択できる
- 未登録の生産番号を作業者で仮登録すると `pending` になる
- 管理者が未確認生産番号を確認済みにできる
- 既存番号への統合で、工数データが消えず参照先だけ変わる

## 注意

- 重複確認で行が返った場合は、`SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql` を実行しないでください。
- 統合操作は、統合元が `pending` の生産番号である場合だけ実行します。
- 本番DBの削除・統合を伴う確認は、必ず対象IDと工数件数を確認してから行ってください。
