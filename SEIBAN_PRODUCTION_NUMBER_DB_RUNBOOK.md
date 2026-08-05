# 生産番号登録機能 DB適用手順

更新日: 2026-08-05

## 現在の状態

- GitHub `origin/main` は `af517f2 Add seiban duplicate precheck SQL` までpush済み。
- Vercel本番にも `SUPABASE_SEIBAN_PRODUCTION_NUMBER_CONFIRM_ONLY.sql` が配信済み。
- フロント側の生産番号検索・仮登録UIは本番反映済み。
- DB本番適用はまだ未実施。

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

安全対策:

- SQL全体をトランザクションで実行します。
- 読み取り専用チェックを飛ばして実行した場合でも、空キー・重複があればスキーマ変更前に停止します。

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
