// seed-statutory.mjs — 中央 statutory テーブルに全kindの実値を投入(版管理・再現可能)。
//   値は payslip-app の検証済みlibからそのまま流し込む(捏造なし)。追記式(kind,year主キー・既存に触れない)。
//   使い方: SUPA_DB_PW='...' node scripts/seed-statutory.mjs
//   前提: supabase/schema.sql の statutory テーブルDDLが適用済みであること(未適用なら本スクリプトが create も行う)。
import pg from 'pg';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SHH = require('../lib/shakaihoken-hyo.js');
const SAI = require('../lib/saitei-chingin.js');
const KOYO = require('../lib/koyo-hoken.js');
const D = require('../lib/shotokuzei-densan.js');
const H = require('../lib/shotokuzei-hei.js');
const SZ = require('../lib/shoyo-zei.js');
const N = require('../lib/nenmatsu.js');
const WM = require('../lib/warimashi.js');

const c = new pg.Client({ host: 'db.tnfwipbgfgjaymlszeid.supabase.co', port: 5432, user: 'postgres', password: process.env.SUPA_DB_PW, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

// 社保: 各年度を1行に束ねる(健保47県total/介護total/支援金total/厚年total)
function shakaihokenRow(year) {
  const kenko = year >= 2026 ? SHH.KENKO_2026 : Object.fromEntries(Object.keys(SHH.KENKO_RITSU).map(k => [k, SHH.KENKO_RITSU[k].total]));
  const ym = year + '-06';
  return { kenko_total: kenko, kaigo_total: SHH.getKaigo(ym).total, shienkin_total: (year >= 2026 ? SHH.SHIENKIN_TOTAL_FROM_2026_04 : 0), kosei_total: SHH.KOSEI_NENKIN_RITSU_TOTAL };
}
const heiTable = (H.HEI_BY_YEAR && H.HEI_BY_YEAR[2026]) || H.HEI_R8;

const rows = [
  { kind: 'saitei_chingin', year: 2025, data: { todofuken: SAI.todofuken, zenkoku_heikin: SAI.ZENKOKU_HEIKIN, nendo: SAI.NENDO }, source_url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/' },
  { kind: 'shakaihoken', year: 2025, data: shakaihokenRow(2025), source_url: 'https://www.kyoukaikenpo.or.jp/g7/cat330/' },
  { kind: 'shakaihoken', year: 2026, data: shakaihokenRow(2026), source_url: 'https://www.kyoukaikenpo.or.jp/g7/cat330/' },
  { kind: 'koyo', year: 2025, data: KOYO.RATES[2025], source_url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyouhoken_ryouritsu.html' },
  { kind: 'koyo', year: 2026, data: KOYO.RATES[2026], source_url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyouhoken_ryouritsu.html' },
  { kind: 'shotokuzei_densan', year: 2025, data: { fuyouKojo: D.PARAMS[2025].fuyouKojo, kyuyo: D.PARAMS[2025].kyuyo, kiso: D.PARAMS[2025].kiso }, source_url: 'https://www.nta.go.jp/users/gensen/' },
  { kind: 'shotokuzei_densan', year: 2026, data: { fuyouKojo: D.PARAMS[2026].fuyouKojo, kyuyo: D.PARAMS[2026].kyuyo, kiso: D.PARAMS[2026].kiso, zeiKo: D.ZEI_KO, zeiOtsu: D.ZEI_OTSU }, source_url: 'https://www.nta.go.jp/users/gensen/2026kaisei/index.htm' },
  { kind: 'shotokuzei_hei', year: 2026, data: { start: heiTable.start, step: heiTable.step, arr: heiTable.arr }, source_url: 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/02.htm' },
  { kind: 'shoyo', year: 2026, data: { rates: SZ.RATES, kou: SZ.KOU_BY_YEAR[2026], otsu: SZ.OTSU_BY_YEAR[2026], kenpo_year_cap: SZ.KENPO_YEAR_CAP, kosei_per_cap: SZ.KOSEI_PER_CAP, kosei_ritsu_jugyoin: SZ.KOSEI_RITSU_JUGYOIN }, source_url: 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/03.htm' },
  { kind: 'nenmatsu', year: 2026, data: N.P, source_url: 'https://www.nta.go.jp/users/gensen/2026kaisei/index.htm' },
  { kind: 'warimashi', year: 2023, data: WM.RATE, source_url: 'https://www.mhlw.go.jp/hourei/doc/kouji/K060000-A5.pdf' },
  { kind: 'shouhizei', year: 2019, data: { hyojun: 0.10, keigen: 0.08 }, source_url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6101.htm' }, // 2019-10〜(国税庁 消費税率)
];

const run = async () => {
  await c.connect();
  await c.query(`create table if not exists statutory (kind text not null, year int not null, data jsonb not null default '{}'::jsonb, source_url text, verified_at date default now(), updated_at timestamptz not null default now(), primary key (kind, year))`);
  await c.query('alter table statutory enable row level security');
  await c.query('drop policy if exists statutory_read on statutory');
  await c.query('create policy statutory_read on statutory for select using (true)');
  await c.query('grant select on statutory to anon, authenticated');
  for (const r of rows) {
    await c.query(
      `insert into statutory(kind,year,data,source_url) values($1,$2,$3,$4)
       on conflict (kind,year) do update set data=excluded.data, source_url=excluded.source_url, updated_at=now()
       where statutory.data is distinct from excluded.data`,
      [r.kind, r.year, JSON.stringify(r.data), r.source_url]);
  }
  const chk = await c.query('select kind, year from statutory order by kind, year');
  console.log('SEEDED statutory rows:', chk.rows.length);
  chk.rows.forEach(x => console.log('  ', x.kind, x.year));
  await c.end();
};
run().catch(e => { console.log('ERR', e.message); process.exit(2); });
