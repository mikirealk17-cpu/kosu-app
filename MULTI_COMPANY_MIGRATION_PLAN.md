# 複数会社対応への移行計画

## 現在のβ版

今回のβ版は1社専用として運用します。`company_master` と一部の `company_id` はありますが、現在のRLSは主に `system_admin` と `worker_id` で制御しており、全テーブルの会社分離はまだ完了していません。

したがって、複数会社対応の移行が終わるまでは次を禁止します。

- 2社目の会社データ登録
- 他社ユーザーの同一Supabaseプロジェクトへの追加
- `system_admin` を複数社へ配布すること。1社βでは信頼できる管理者1名だけに限定する

## 移行対象

次のテーブルへ必須の `company_id` を持たせます。

- `user_profiles`
- `worker_master`
- `work_logs`
- `work_type_master`
- `seiban_master`
- `billing_company_master`
- `rate_master`

監査ログの `audit_log.company_id` も同じ会社を保存します。

## 移行順序

1. 現行DBの完全バックアップを取得する。
2. 会社マスタを登録し、既存データの所属会社を確定する。
3. 各テーブルへ nullable な `company_id` を追加する。
4. 作業者、工数、各マスタを会社IDでバックフィルする。
5. NULL件数と不整合を確認する。
6. フロントエンドの全登録処理で会社IDをサーバー側から自動付与する。
7. `company_admin` をアプリ側の管理者権限として扱う。
8. RLSを会社IDと役割の両方で制限する。
9. 単一列の一意制約を、必要に応じて `(company_id, 対象列)` の会社単位制約へ変更する。
10. テスト用のA社・B社で相互アクセス不能を確認する。
11. 確認後に `company_id` を `not null` にする。

## RLSの基本条件

- `worker`: 自分の `worker_id` かつ自社 `company_id` の工数だけ。
- `company_admin`: 自社 `company_id` の工数・作業者・マスタだけ。
- `system_admin`: 現行1社βでは信頼できる管理者1名だけ。複数会社化後は運営保守専用にする。
- 未ログイン: 全対象テーブルを拒否。

フロントエンドが送信した任意の会社IDを信用せず、DBトリガーまたはSecurity Definer関数で `auth.uid()` の `user_profiles.company_id` を保存します。

## 移行前の確認SQL

```sql
select 'user_profiles' as table_name, count(*) as company_id_nulls
from public.user_profiles where company_id is null
union all
select 'worker_master', count(*) from public.worker_master where company_id is null
union all
select 'work_logs', count(*) from public.work_logs where company_id is null;
```

各マスタへ `company_id` を追加した後も同じNULL確認を行います。1件でも不明な所属があれば、本番RLSの切り替えと `not null` 化は行いません。
