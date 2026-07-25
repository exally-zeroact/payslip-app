-- ════════════════════════════════════════════════════════════════════════
-- statutory-admin.sql — 管理画面(admin.html)から中央 statutory を「反映」する安全パス
--   ★これを Supabase の SQL Editor に1回だけ貼って実行する(以後は admin の[反映]ボタンが使う)★
--   前提: supabase/schema.sql が適用済み(statutory テーブル / exally_admins / is_exally_admin() が存在)。
--
--   なぜRPCか: statutory への書込みは service_role/postgres のみ(=中央管理・誤値の全国配信を防ぐ設計)。
--   service_role キーをブラウザに置くのは厳禁。そこで SECURITY DEFINER 関数=内部はpostgres権限で書くが、
--   呼び出しは is_exally_admin()(exally_adminsに居るuid)だけに限定する。既存の管理者判定を再利用。
-- ════════════════════════════════════════════════════════════════════════

create or replace function statutory_upsert(p_kind text, p_year int, p_data jsonb, p_source_url text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- ① 管理者以外は拒否(exally_admins に自分のuidが無ければ例外)
  if not is_exally_admin() then
    raise exception '権限がありません(管理者のみ更新できます)';
  end if;
  -- ② kind ホワイトリスト(想定外のkindを中央に作らせない)
  if p_kind is null or p_kind not in (
    'saitei_chingin','shakaihoken','koyo','shotokuzei_densan','shotokuzei_hei',
    'shotokuzei_nichi','shoyo','nenmatsu','warimashi','shouhizei') then
    raise exception '不正なkindです: %', p_kind;
  end if;
  -- ③ 年・data の健全性
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception '不正なyearです: %', p_year;
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'dataがオブジェクトではありません';
  end if;
  -- ④ 追記式upsert(値が実際に変わる時だけ書く=updated_atの無駄更新を避ける。seedと同一ロジック)
  insert into statutory(kind, year, data, source_url, verified_at, updated_at)
  values (p_kind, p_year, p_data, p_source_url, now(), now())
  on conflict (kind, year) do update
    set data = excluded.data, source_url = excluded.source_url, verified_at = now(), updated_at = now()
  where statutory.data is distinct from excluded.data
     or statutory.source_url is distinct from excluded.source_url;
end;
$$;

-- 呼び出し権限: 匿名(anon)は不可・ログイン済(authenticated)のみ(関数内で更に管理者判定)
revoke all on function statutory_upsert(text, int, jsonb, text) from public;
revoke all on function statutory_upsert(text, int, jsonb, text) from anon;
grant execute on function statutory_upsert(text, int, jsonb, text) to authenticated;

-- 動作確認(管理者アカウントのSQL Editorで実行すれば成功・非管理者は例外):
--   select statutory_upsert('shouhizei', 2019, '{"hyojun":0.10,"keigen":0.08}'::jsonb,
--     'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6101.htm');
