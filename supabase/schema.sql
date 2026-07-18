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

-- ================================================================
-- 法定データ 中央テーブル(statutory) — 全アプリ(payslip-app/Exally)共通の単一ソース。
--   kind×year で1行(jsonb)。司さん(ベンダー)が中央を1回更新→全国ユーザーへ一括反映(freee型)。
--   各アプリは起動時に anon で読み、libの hydrate() でハードコード既定を上書き(取れなければフォールバック)。
--   ★書込みは service_role/postgres のみ(=中央管理)。全ユーザーは読むだけ。
--   収録kind: shakaihoken/saitei_chingin/koyo/shotokuzei_densan/shotokuzei_hei/shoyo/nenmatsu/warimashi/shouhizei
--   ★seed(実値の投入)は scripts/statutory-migrate.mjs / statutory-migrate2.mjs が payslip-app の検証済みlibから流し込む(捏造なし・追記式)。
--     新規Supabaseプロジェクトでは このDDL適用後に両スクリプトを1回実行すること(未実行時は各アプリがlibのハードコードで動く)。
-- ================================================================
create table if not exists statutory (
  kind        text not null,
  year        int  not null,
  data        jsonb not null default '{}'::jsonb,
  source_url  text,
  verified_at date default now(),
  updated_at  timestamptz not null default now(),
  primary key (kind, year)
);

alter table statutory enable row level security;
drop policy if exists statutory_read on statutory;
create policy statutory_read on statutory for select using (true); -- 全員読取可(法定データは公開情報)
grant select on statutory to anon, authenticated;                  -- 書込みGRANTは無し=service_role/postgresのみ更新

-- ================================================================
-- アカウントの利用状態(exally_entitlements) — ★2026-07-14 Exally全アプリ共通の利用制御★
--   ★1人×1アプリ=1行。同じログイン(account_id)が請求書/給料明細/今後のアプリを使う状態を1箇所で管理★
--   app: 'payslip'(給料明細) | 'invoice'(請求書) | 今後 'daiko' 等（アプリ追加はappの値を足すだけ・DB変更不要）
--   plan: 'trial'(既定=使える) | 'paid'(有料) | 'free'(無料開放) | 'disabled'(停止)
--   ★現段階(知人のお試し)は「使える or 停止」のON/OFFのみ。無料期間(expires_at)/有料無料の細分はリリースでプラン確定時に実装(列は予約・アプリ未参照)★
--   ★本人は自分の行を"読むだけ"。plan変更は service_role(ダッシュボード直編集)のみ=自己アップグレード不可★
--   新規: 各アプリが初回ログインで自分のapp行を trial で自動作成(insertポリシーで plan='trial' 固定)。
--   司さんの操作: Table editor で該当 (account_id, app) 行の plan を 'disabled' にすれば停止(将来 paid/free も)。
--     ・その人を全アプリ止める → account_id で絞って全行 plan='disabled'
--     ・誰かは Authentication>Users のメール/登録日 と account_id で照合
-- ================================================================
create table if not exists exally_entitlements (
  account_id  uuid not null references auth.users(id) on delete cascade,
  app         text not null,                    -- 'payslip' | 'invoice' | ...
  plan        text not null default 'trial',    -- trial | paid | free | disabled
  email       text,                              -- 誰か表示用(登録時にアプリが自分のメールを入れる・管理画面で使う)
  expires_at  timestamptz,                       -- ★予約(将来の無料期間用)・現アプリは未参照★
  note        text,                              -- 司さん用メモ(誰か・何円で 等)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (account_id, app)
);
-- 既に作成済みの環境向け(email列を後から足す)
alter table exally_entitlements add column if not exists email text;

alter table exally_entitlements enable row level security;
-- 本人は自分の行を読める(各アプリが自分のplanを判定)
drop policy if exists ee_read_own on exally_entitlements;
create policy ee_read_own on exally_entitlements for select using (account_id = auth.uid());
-- 本人が自分の trial 行を"作る"のは許可(初回自動作成)。plan='trial' 固定=有料/無料開放を自称できない
drop policy if exists ee_insert_own_trial on exally_entitlements;
create policy ee_insert_own_trial on exally_entitlements for insert
  with check (account_id = auth.uid() and plan = 'trial' and expires_at is null);
grant select, insert, update on exally_entitlements to authenticated;

-- ── 管理者(司さん)だけが全ユーザーを操作できる層(管理画面 admin.html 用) ──
-- ★service_roleキーはWebに絶対置かない。管理者権限は「exally_adminsに居るuidだけ」をRLSで強制する★
create table if not exists exally_admins (
  account_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table exally_admins enable row level security;
-- 管理者判定関数(security definer=exally_adminsのRLSを迂回して評価。ポリシー内サブクエリの定番)
create or replace function is_exally_admin() returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (select 1 from exally_admins where account_id = auth.uid());
  $$;
-- 管理者は自分が管理者か確認できる(画面の権限判定用)。他人の管理者行は見せない。
drop policy if exists ea_read_self on exally_admins;
create policy ea_read_self on exally_admins for select using (account_id = auth.uid());
grant select on exally_admins to authenticated;
-- 管理者は 全ユーザーの entitlements を 閲覧+変更 できる(RLSで管理者以外は自分の行だけ)
drop policy if exists ee_admin_read on exally_entitlements;
create policy ee_admin_read on exally_entitlements for select using (is_exally_admin());
drop policy if exists ee_admin_update on exally_entitlements;
create policy ee_admin_update on exally_entitlements for update using (is_exally_admin()) with check (is_exally_admin());

-- 既存行のemailを auth.users から埋める(初回一括・以後はアプリが登録時に入れる)
update exally_entitlements e set email = u.email from auth.users u where u.id = e.account_id and e.email is null;

-- ★司さんを管理者に登録(自分のログインメールに置き換えて実行)★
-- insert into exally_admins (account_id) select id from auth.users where email = 'ここに司さんのログインメール';

-- ════════════════════════════════════════════════════════════════════════
-- 年末調整 従業員セルフ申告(Web明細から本人がスマホで入力) ★step2・2026-07-18★
--   ★DDL/RPCの本体と説明は supabase/nencho-decl.sql に集約(貼り付け用)。ここは同一内容を再掲。★
--   Web明細(pay_meisai_pub)で認証済みの従業員が年末調整の申告(配偶者/扶養/保険料等)を
--   スマホから保存→会社(account_id=auth.uid)が読み、管理アプリの年調へ取り込む(applyToNencho)。
--   認証は明細と同方式(device_token or パスワード)。account_id/employee_idはpubから引く=詐称不可。
-- ════════════════════════════════════════════════════════════════════════
create table if not exists pay_nencho_decl (
  token        uuid not null references pay_meisai_pub(token) on delete cascade,
  account_id   uuid not null references auth.users(id) on delete cascade,
  employee_id  text not null,
  year         int  not null,
  decl         jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (token, year)
);
create index if not exists idx_pay_nencho_decl_acct on pay_nencho_decl(account_id, year);
alter table pay_nencho_decl enable row level security;
drop policy if exists own_pay_nencho_decl on pay_nencho_decl;
create policy own_pay_nencho_decl on pay_nencho_decl for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());
create or replace function save_nencho_decl(p_token uuid, p_device text, p_pw text, p_year int, p_decl jsonb)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub; v_ok boolean;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('ok',false,'unauth',true); end if;
  if v_pub.locked_until is not null and v_pub.locked_until > now() then return jsonb_build_object('ok',false,'locked',true,'retry_at',v_pub.locked_until); end if;
  v_ok := (p_device is not null and p_device = any(v_pub.device_tokens))
       or (p_pw is not null and v_pub.pw_hash is not null and v_pub.pw_hash = crypt(p_pw, v_pub.pw_hash));
  if not v_ok then return jsonb_build_object('ok',false,'unauth',true); end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then return jsonb_build_object('ok',false,'bad_year',true); end if;
  insert into pay_nencho_decl(token, account_id, employee_id, year, decl, submitted_at, updated_at)
    values (p_token, v_pub.account_id, v_pub.employee_id, p_year, coalesce(p_decl,'{}'::jsonb), now(), now())
    on conflict (token, year) do update set decl=excluded.decl, updated_at=now();
  return jsonb_build_object('ok',true);
end $$;
create or replace function get_nencho_decl(p_token uuid, p_device text, p_pw text, p_year int)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub; v_ok boolean; v_row pay_nencho_decl;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('unauth',true); end if;
  v_ok := (p_device is not null and p_device = any(v_pub.device_tokens))
       or (p_pw is not null and v_pub.pw_hash is not null and v_pub.pw_hash = crypt(p_pw, v_pub.pw_hash));
  if not v_ok then return jsonb_build_object('unauth',true); end if;
  select * into v_row from pay_nencho_decl where token=p_token and year=p_year;
  if v_row.token is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'decl',v_row.decl,'submittedAt',v_row.submitted_at,'updatedAt',v_row.updated_at);
end $$;
grant execute on function save_nencho_decl(uuid,text,text,int,jsonb), get_nencho_decl(uuid,text,text,int) to anon;

-- ════════════════════════════════════════════════════════════════════════
-- 従業員セルフ登録: 振込先を本人がWeb明細から登録 ★step3・2026-07-18★
--   ★DDL/RPCの本体と説明は supabase/emp-profile.sql に集約(貼り付け用)。ここは同一内容を再掲。★
--   Web明細で認証済みの従業員が振込先(銀行/支店/科目/口座/名義カナ)を登録→会社が従業員マスタへ取り込む。
--   認証は明細と同方式・account_id/employee_idはpubから引く=詐称不可。
-- ════════════════════════════════════════════════════════════════════════
create table if not exists pay_emp_profile (
  token        uuid primary key references pay_meisai_pub(token) on delete cascade,
  account_id   uuid not null references auth.users(id) on delete cascade,
  employee_id  text not null,
  data         jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_pay_emp_profile_acct on pay_emp_profile(account_id);
alter table pay_emp_profile enable row level security;
drop policy if exists own_pay_emp_profile on pay_emp_profile;
create policy own_pay_emp_profile on pay_emp_profile for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());
create or replace function save_emp_profile(p_token uuid, p_device text, p_pw text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub; v_ok boolean;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('ok',false,'unauth',true); end if;
  if v_pub.locked_until is not null and v_pub.locked_until > now() then return jsonb_build_object('ok',false,'locked',true,'retry_at',v_pub.locked_until); end if;
  v_ok := (p_device is not null and p_device = any(v_pub.device_tokens))
       or (p_pw is not null and v_pub.pw_hash is not null and v_pub.pw_hash = crypt(p_pw, v_pub.pw_hash));
  if not v_ok then return jsonb_build_object('ok',false,'unauth',true); end if;
  insert into pay_emp_profile(token, account_id, employee_id, data, submitted_at, updated_at)
    values (p_token, v_pub.account_id, v_pub.employee_id, coalesce(p_data,'{}'::jsonb), now(), now())
    on conflict (token) do update set data=excluded.data, updated_at=now();
  return jsonb_build_object('ok',true);
end $$;
create or replace function get_emp_profile(p_token uuid, p_device text, p_pw text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_pub pay_meisai_pub; v_ok boolean; v_row pay_emp_profile;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('unauth',true); end if;
  v_ok := (p_device is not null and p_device = any(v_pub.device_tokens))
       or (p_pw is not null and v_pub.pw_hash is not null and v_pub.pw_hash = crypt(p_pw, v_pub.pw_hash));
  if not v_ok then return jsonb_build_object('unauth',true); end if;
  select * into v_row from pay_emp_profile where token=p_token;
  if v_row.token is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'data',v_row.data,'submittedAt',v_row.submitted_at,'updatedAt',v_row.updated_at);
end $$;
grant execute on function save_emp_profile(uuid,text,text,jsonb), get_emp_profile(uuid,text,text) to anon;
