-- ════════════════════════════════════════════════════════════════════════
-- 従業員セルフ登録: 振込先(＋任意で住所)を本人がWeb明細から登録 ★step3★
--   Web明細(pay_meisai_pub)で認証済みの従業員が、自分の振込先(銀行/支店/科目/口座/名義カナ)を
--   スマホから登録→保存。会社(account_id=auth.uid)は自分の発行分を読み、従業員マスタの振込先へ
--   「取り込む」。会社の総合振込データ(全銀ファイル)がそのまま完成する=転記の手間/誤りを削減。
--   認証は明細と同方式(device_token or パスワード)。account_id/employee_idはpubから引く=詐称不可。
--   data の中身はクライアントが持つ振込先フィールド(furiBankName等)をそのまま保管(サーバは検証せず)。
--   ★このファイルは pay_meisai_pub(Web明細)適用済みの環境で1回実行する。冪等(再実行OK)。
-- ════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto with schema extensions; -- crypt解決(明細と同じ・既に有効なら無害)

create table if not exists pay_emp_profile (
  token        uuid primary key references pay_meisai_pub(token) on delete cascade, -- 1従業員(token)=1行
  account_id   uuid not null references auth.users(id) on delete cascade,           -- 発行会社(RPC内でpubから設定=従業員は詐称不可)
  employee_id  text not null,                        -- pubからコピー(会社側の突合用)
  data         jsonb not null default '{}'::jsonb,   -- 振込先(furiBankName/furiBankNo/furiBranchName/furiBranchNo/furiYokin/furiAccount/furiKana 等)
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_pay_emp_profile_acct on pay_emp_profile(account_id);

-- RLS: 会社(発行元 account_id=auth.uid())は自分の登録を全操作。従業員(anon)は直readさせない=RPC経由のみ。
alter table pay_emp_profile enable row level security;
drop policy if exists own_pay_emp_profile on pay_emp_profile;
create policy own_pay_emp_profile on pay_emp_profile for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- 従業員: 振込先を保存(認証=device or pw)。account_id/employee_idはpubから引くので詐称不可。
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

-- 従業員: 自分の登録を取得(前回の続き/確認用)。
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
