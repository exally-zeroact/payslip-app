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

-- ═══════════════════════════════════════════════════════════════
-- 給与明細アプリ 専用の棚(pay_*) ★2026-06-27 既存プロジェクト(daikou-seikyu/Exally)に作成済★
--   構成= 倉庫(プロジェクト)共有・棚はアプリ毎に完全独立・アカウント(auth)共通
--   →独立アプリだけの人もExally経由の人も同じ pay_* を本人(account_id=auth.uid)で読む
--   ※代行請求の棚(companies/meisai/issuer/payments/export_tokens)とは完全分離・無関係
-- ═══════════════════════════════════════════════════════════════
create table if not exists pay_companies (         -- 会社情報+会社の決まり(1アカウント1社)
  account_id  uuid primary key default auth.uid(),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create table if not exists pay_employees (          -- 従業員マスタ(就業状況/退職も data 内)
  id          text primary key,
  account_id  uuid not null default auth.uid(),
  sort        int default 0,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists idx_pay_employees_acct on pay_employees(account_id, sort);
create table if not exists pay_payslips (           -- 月次の明細/入力(定時決定4-6月の自動入力・履歴の素)
  id          text primary key,
  account_id  uuid not null default auth.uid(),
  ym          text not null,                        -- 'YYYY-MM'
  employee_id text,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists idx_pay_payslips_acct on pay_payslips(account_id, ym);

-- RLS: 本人(account_id=auth.uid())の行だけ(代行と同方式)
alter table pay_companies enable row level security;
alter table pay_employees enable row level security;
alter table pay_payslips  enable row level security;
drop policy if exists own_pay_companies on pay_companies;
create policy own_pay_companies on pay_companies for all using (account_id = auth.uid()) with check (account_id = auth.uid());
drop policy if exists own_pay_employees on pay_employees;
create policy own_pay_employees on pay_employees for all using (account_id = auth.uid()) with check (account_id = auth.uid());
drop policy if exists own_pay_payslips on pay_payslips;
create policy own_pay_payslips on pay_payslips for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- 棚名/列名は後から変更可(データそのまま): alter table 旧 rename to 新; / alter table x rename column 旧 to 新;
-- 次の配線: index.html に supabase-js(CDN)+window.SUPA、アプリに ログイン(auth) を付け、保存/復元を pay_* に。
