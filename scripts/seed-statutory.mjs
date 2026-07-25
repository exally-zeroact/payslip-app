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
const NI = require('../lib/shotokuzei-nichi.js');
const SZ = require('../lib/shoyo-zei.js');
const N = require('../lib/nenmatsu.js');
const WM = require('../lib/warimashi.js');
const { buildStatutoryRows } = require('../lib/statutory-rows.js');

const c = new pg.Client({ host: 'db.tnfwipbgfgjaymlszeid.supabase.co', port: 5432, user: 'postgres', password: process.env.SUPA_DB_PW, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

// ★行生成は lib/statutory-rows.js に集約(seedとadmin.htmlで単一ソース・二重持ち禁止)★
const rows = buildStatutoryRows({ SHH, SAI, KOYO, D, H, NI, SZ, N, WM });

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
