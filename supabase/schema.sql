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
