-- 給与明細アプリ Supabase スキーマ
-- 1バッチ = 会社/対象月/支給日/従業員配列(JSON)。account_id でマルチテナント(Exally方式)。

create table if not exists payslip_batches (
  id          text primary key,
  account_id  uuid not null default auth.uid(),
  title       text,
  company     text,
  month       text,
  pay_date    text,
  prefer      text default 'auto',
  people      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_payslip_batches_account on payslip_batches(account_id, updated_at desc);

-- Row Level Security: 自分(account_id)の行だけ読み書き
alter table payslip_batches enable row level security;

drop policy if exists "own rows select" on payslip_batches;
create policy "own rows select" on payslip_batches for select using (account_id = auth.uid());

drop policy if exists "own rows write" on payslip_batches;
create policy "own rows write" on payslip_batches for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- 注: クライアントの store.js は列名 pay_date を payDate にマップしていません。
--   Supabase 本接続時は store.js 側で {pay_date: batch.payDate} 等の変換を追加してください。

-- ───────────────────────────────────────────────
-- アプリ全体の状態(会社情報+従業員マスタ+休暇/退職など)を1レコードで保持
-- store.js の Store.cloudSaveState / cloudLoadState が使用(window.SUPA設定時のみ有効)
-- 当面 id=端末uid。認証導入後は id=auth.uid()::text + RLS。
create table if not exists payslip_state (
  id          text primary key,
  data        jsonb not null,            -- {company, employees[], month, theme, prefer, ...}
  updated_at  timestamptz not null default now()
);

-- 有効化手順:
--   1) このSQLをSupabase SQL Editorで実行
--   2) index.html の app.js/store.js より前に:
--      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
--      <script>window.SUPA={url:'https://xxxx.supabase.co', key:'(anon public key)'}</script>
--   これで Store.mode='supabase' になり、状態が自動でクラウド保存/復元される。
-- 本番(認証導入後)は payslip_state も RLS:
--   alter table payslip_state enable row level security;
--   create policy own_state on payslip_state for all using (id = auth.uid()::text) with check (id = auth.uid()::text);
