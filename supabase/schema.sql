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

-- ═══ Web明細(従業員向け配布・パスワード方式) ★2026-07-06 本番(tnfwipbgfgjaymlszeid)適用+E2E検証済★ ═══
-- 会社が公開→従業員はリンク(?t=token)で開き、初回だけ「会社発行の初回コード(init_code)」で本人を縛って
-- 自分のパスワードを設定(pw_hash)→以後はパスワード(＋端末記憶device_token)で自分の明細のみ閲覧。電子交付の同意まで明細を出さない。
-- 生年月日PINは廃止(同じ誕生日・推測に弱い)。
-- ★修正履歴: crypt/gen_salt/gen_random_bytesはextensionsスキーマ→RPCのsearch_pathにextensions必須(publicのみだと関数未解決)/anonへのgrant execute/ブルートフォース対策(fail_count・5回で15分ロック)/PW最小8をサーバ強制。
create extension if not exists pgcrypto with schema extensions;

create table if not exists pay_meisai_pub (
  token         uuid primary key default gen_random_uuid(),
  account_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,  -- 発行元の会社(RLS with checkのため既定=ログイン中uid)
  employee_id   text not null,
  init_code     text,                              -- 会社発行の初回コード。パスワード設定後はnull
  pw_hash       text,                              -- pgcrypto bcrypt。平文で持たない。null=未設定
  device_tokens text[] not null default '{}',      -- 端末記憶(ログイン済み端末)
  consent_at    timestamptz,                       -- 電子交付の同意日時(null=未同意→明細返さない)
  fail_count    int not null default 0,            -- 連続認証失敗回数(ブルートフォース対策)
  locked_until  timestamptz,                       -- ロック解除時刻(nullなら未ロック)
  created_at    timestamptz not null default now()
);
create table if not exists pay_meisai_docs (
  id           text primary key,                   -- 'md_'+token+'_'+ym+'_'+kind
  token        uuid not null references pay_meisai_pub(token) on delete cascade,
  account_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ym           text not null,                       -- 'YYYY-MM'
  kind         text not null,                       -- 'monthly' | 'bonus'
  data         jsonb not null default '{}'::jsonb,  -- {person, doc, prefer, theme}(render.js用)
  published_at timestamptz not null default now(),
  opened_at    timestamptz
);
create index if not exists idx_pay_meisai_docs_token on pay_meisai_docs(token);

-- RLS: 会社(account_id=auth.uid())は自分の発行分を全操作。従業員(anon)は直readさせない=RPC経由のみ。
alter table pay_meisai_pub  enable row level security;
alter table pay_meisai_docs enable row level security;
drop policy if exists own_pay_meisai_pub on pay_meisai_pub;
create policy own_pay_meisai_pub on pay_meisai_pub for all using (account_id = auth.uid()) with check (account_id = auth.uid());
drop policy if exists own_pay_meisai_docs on pay_meisai_docs;
create policy own_pay_meisai_docs on pay_meisai_docs for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- 従業員向け SECURITY DEFINER RPC(search_path=public,extensions で crypt を解決)。
create or replace function meisai_auth(p_token uuid, p_device text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'has_password',(v_pub.pw_hash is not null),
    'remembered',(p_device is not null and p_device = any(v_pub.device_tokens)),
    'locked',(v_pub.locked_until is not null and v_pub.locked_until > now()));
end $$;

create or replace function meisai_set_password(p_token uuid, p_init text, p_pw text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('ok',false); end if;
  if v_pub.locked_until is not null and v_pub.locked_until > now() then return jsonb_build_object('ok',false,'locked',true,'retry_at',v_pub.locked_until); end if;
  if v_pub.pw_hash is not null then return jsonb_build_object('ok',false,'already_set',true); end if;
  if length(coalesce(p_pw,'')) < 8 then return jsonb_build_object('ok',false,'weak',true); end if;
  if v_pub.init_code is null or upper(trim(coalesce(p_init,''))) <> v_pub.init_code then
    update pay_meisai_pub set fail_count=fail_count+1,
      locked_until = case when fail_count+1 >= 5 then now()+interval '15 minutes' else locked_until end
      where token=p_token returning fail_count, locked_until into v_pub.fail_count, v_pub.locked_until;
    if v_pub.fail_count >= 5 then return jsonb_build_object('ok',false,'bad_init',true,'locked',true,'retry_at',v_pub.locked_until); end if;
    return jsonb_build_object('ok',false,'bad_init',true,'remaining',5 - v_pub.fail_count);
  end if;
  update pay_meisai_pub set pw_hash=crypt(p_pw, gen_salt('bf')), init_code=null, fail_count=0, locked_until=null where token=p_token;
  return jsonb_build_object('ok',true);
end $$;

create or replace function meisai_verify(p_token uuid, p_pw text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub; v_dev text;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('ok',false); end if;
  if v_pub.locked_until is not null and v_pub.locked_until > now() then return jsonb_build_object('ok',false,'locked',true,'retry_at',v_pub.locked_until); end if;
  if v_pub.pw_hash is null or v_pub.pw_hash <> crypt(p_pw, v_pub.pw_hash) then
    update pay_meisai_pub set fail_count=fail_count+1,
      locked_until = case when fail_count+1 >= 5 then now()+interval '15 minutes' else locked_until end
      where token=p_token returning fail_count, locked_until into v_pub.fail_count, v_pub.locked_until;
    if v_pub.fail_count >= 5 then return jsonb_build_object('ok',false,'locked',true,'retry_at',v_pub.locked_until); end if;
    return jsonb_build_object('ok',false,'remaining',5 - v_pub.fail_count);
  end if;
  v_dev := encode(gen_random_bytes(18),'hex');
  update pay_meisai_pub set device_tokens=array_append(device_tokens, v_dev), fail_count=0, locked_until=null where token=p_token;
  return jsonb_build_object('ok',true,'device_token',v_dev);
end $$;

create or replace function get_meisai(p_token uuid, p_device text, p_pw text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub; v_docs jsonb; v_ok boolean;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('unauth',true); end if;
  v_ok := (p_device is not null and p_device = any(v_pub.device_tokens))
       or (p_pw is not null and v_pub.pw_hash is not null and v_pub.pw_hash = crypt(p_pw, v_pub.pw_hash));
  if not v_ok then return jsonb_build_object('unauth',true); end if;
  if v_pub.consent_at is null then return jsonb_build_object('need_consent',true); end if;
  -- 既読化は一括でなく mark_meisai_opened で1件ずつ(per-doc未読)。ここでは各docのopened_atを返すだけ。
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'ym',ym,'kind',kind,'data',data,'openedAt',opened_at) order by ym desc),'[]') into v_docs
    from pay_meisai_docs where token=p_token;
  return jsonb_build_object('docs',v_docs);
end $$;

-- mark_meisai_opened: 認証(device or pw)確認して その1件だけ 既読化(従業員がタップした月のみ)
create or replace function mark_meisai_opened(p_token uuid, p_id text, p_device text, p_pw text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub; v_ok boolean;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('ok',false); end if;
  v_ok := (p_device is not null and p_device = any(v_pub.device_tokens))
       or (p_pw is not null and v_pub.pw_hash is not null and v_pub.pw_hash = crypt(p_pw, v_pub.pw_hash));
  if not v_ok then return jsonb_build_object('ok',false,'unauth',true); end if;
  update pay_meisai_docs set opened_at=coalesce(opened_at, now()) where id=p_id and token=p_token;
  return jsonb_build_object('ok',true);
end $$;

create or replace function set_meisai_consent(p_token uuid, p_device text, p_pw text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub; v_ok boolean;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('ok',false); end if;
  v_ok := (p_device is not null and p_device = any(v_pub.device_tokens))
       or (p_pw is not null and v_pub.pw_hash is not null and v_pub.pw_hash = crypt(p_pw, v_pub.pw_hash));
  if not v_ok then return jsonb_build_object('ok',false,'unauth',true); end if;
  update pay_meisai_pub set consent_at=coalesce(consent_at, now()) where token=p_token;
  return jsonb_build_object('ok',true);
end $$;
-- init_code再発行(会社)はRLSで会社が直接 update pay_meisai_pub set init_code=..., pw_hash=null, device_tokens='{}', fail_count=0, locked_until=null でよい。
grant execute on function meisai_auth(uuid,text), meisai_set_password(uuid,text,text), meisai_verify(uuid,text), get_meisai(uuid,text,text), set_meisai_consent(uuid,text,text), mark_meisai_opened(uuid,text,text,text) to anon;
