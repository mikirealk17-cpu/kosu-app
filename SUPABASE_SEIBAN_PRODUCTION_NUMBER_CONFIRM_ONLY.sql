-- 生産番号（既存名: 製番）正規化キーの確認専用SQLです。
-- 削除・更新・テーブル変更は行いません。
-- まずこのファイルをSupabase SQL Editorで実行し、下記2つの結果を確認してください。
--
-- 1. empty_key_rows が0件であること
-- 2. duplicate_count が返らないこと
--
-- 問題がなければ、次に SUPABASE_SEIBAN_PRODUCTION_NUMBER_SETUP.sql の適用へ進みます。

with normalized as (
  select
    id,
    seiban,
    equipment_name,
    upper(
      regexp_replace(
        regexp_replace(
          translate(
            translate(
              btrim(coalesce(seiban, '')),
              'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
              'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
            ),
            '‐‑‒–—―−ー－─⁃˗',
            '------------'
          ),
          '[[:space:]　]+',
          '',
          'g'
        ),
        '-+',
        '-',
        'g'
      )
    ) as seiban_key
  from public.seiban_master
)
select
  count(*) as empty_key_rows,
  array_agg(id order by seiban) as seiban_ids,
  array_agg(seiban order by seiban) as seibans
from normalized
where seiban_key = '';

with normalized as (
  select
    id,
    seiban,
    equipment_name,
    upper(
      regexp_replace(
        regexp_replace(
          translate(
            translate(
              btrim(coalesce(seiban, '')),
              'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
              'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
            ),
            '‐‑‒–—―−ー－─⁃˗',
            '------------'
          ),
          '[[:space:]　]+',
          '',
          'g'
        ),
        '-+',
        '-',
        'g'
      )
    ) as seiban_key
  from public.seiban_master
)
select
  seiban_key,
  count(*) as duplicate_count,
  array_agg(id order by seiban) as seiban_ids,
  array_agg(seiban order by seiban) as seibans,
  array_agg(equipment_name order by seiban) as equipment_names
from normalized
where seiban_key <> ''
group by seiban_key
having count(*) > 1
order by seiban_key;
