-- ════════════════════════════════════════════════════════════════════════
-- 年末調整 従業員セルフ申告(Web明細から本人がスマホで入力) ★step2★
--   Web明細(pay_meisai_pub)で認証済みの従業員が、年末調整の申告
--   (配偶者/扶養/生命保険料/地震保険料/iDeCo/住宅ローン等)をスマホから入力→保存。
--   会社(account_id=auth.uid)は自分の発行分の申告を読み、管理アプリの年末調整へ
--   「取り込む」(lib/nencho-declaration.js applyToNencho)。
--   認証は明細と同方式(device_token or パスワード)。account_id/employee_idは
--   pay_meisai_pub から引くので従業員は詐称できない。
--   decl の中身は lib/nencho-declaration.js の normalize 済みオブジェクト
--   (サーバは中身を検証せず保管=法定ロジックはクライアント/管理アプリ側に集約)。
--   ★このファイルは pay_meisai_pub(Web明細)適用済みの環境で1回実行する。冪等(再実行OK)。
-- ════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto with schema extensions; -- crypt解決(明細と同じ・既に有効なら無害)

create table if not exists pay_nencho_decl (
  token        uuid not null references pay_meisai_pub(token) on delete cascade,
  account_id   uuid not null references auth.users(id) on delete cascade, -- 発行会社(RPC内でpubから設定=従業員は詐称不可)
  employee_id  text not null,                        -- pubからコピー(会社側の突合用)
  year         int  not null,                        -- 対象年(西暦)
  decl         jsonb not null default '{}'::jsonb,   -- 申告内容(normalize済)
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (token, year)
);
create index if not exists idx_pay_nencho_decl_acct on pay_nencho_decl(account_id, year);

-- RLS: 会社(発行元 account_id=auth.uid())は自分の申告を全操作。従業員(anon)は直readさせない=RPC経由のみ。
alter table pay_nencho_decl enable row level security;
drop policy if exists own_pay_nencho_decl on pay_nencho_decl;
create policy own_pay_nencho_decl on pay_nencho_decl for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- 従業員: 申告を保存(認証=device or pw)。account_id/employee_idはpubから引くので詐称不可。
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

-- 従業員: 自分の申告を取得(前回の続き/確認用)。
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
