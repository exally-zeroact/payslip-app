// verify-statutory.mjs — libのハードコード値が中央statutoryテーブルと一致するかを検証(ドリフト防止ガード)。
//   目的: 「lib値≠中央」を CI/手動で弾き、二度と最賃/健保のようなドリフトを起こさない=単一ソースの実効化。
//   ・匿名(anon)公開鍵でREST読取のみ(DBパスワード不要・CI安全)。オフライン/取得不可は「検証スキップ(exit 0)」で赤くしない。
//   ・不一致があれば exit 3 + 差分。CIのstatutory-drift gateに使う。
//   使い方: node scripts/verify-statutory.mjs
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

const SUPA_URL = 'https://tnfwipbgfgjaymlszeid.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek';

const diffs = [];
// キー順は不問(Postgres jsonbはキーを並べ替える)・配列順は有意(ブラケット順)。オブジェクトのキーをソートして正規化比較。
function canon(x) {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
function eq(label, a, b) { if (canon(a) !== canon(b)) diffs.push(label + ': lib=' + canon(a) + ' 中央=' + canon(b)); }

function row(rows, kind, year) { const r = rows.find(x => x.kind === kind && x.year === year); return r ? r.data : null; }

function verify(rows) {
  // ── 社保(健保47県total/介護total) 令和7/令和8 ──
  for (const year of [2025, 2026]) {
    const d = row(rows, 'shakaihoken', year); if (!d) { diffs.push('shakaihoken/' + year + ' 中央に無し'); continue; }
    const libKenko = year >= 2026 ? SHH.KENKO_2026 : Object.fromEntries(Object.keys(SHH.KENKO_RITSU).map(k => [k, SHH.KENKO_RITSU[k].total]));
    eq('健保' + year, libKenko, d.kenko_total);
    eq('介護' + year, SHH.getKaigo(year + '-06').total, d.kaigo_total);
  }
  // ── 最賃47県 ──
  const sai = row(rows, 'saitei_chingin', 2025);
  if (sai) { eq('最賃todofuken', SAI.todofuken, sai.todofuken); eq('最賃全国平均', SAI.ZENKOKU_HEIKIN, sai.zenkoku_heikin); } else diffs.push('saitei_chingin 中央に無し');
  // ── 雇用 令和7/8 ──
  for (const year of [2025, 2026]) { const d = row(rows, 'koyo', year); if (d) eq('雇用' + year, KOYO.RATES[year], d); else diffs.push('koyo/' + year + ' 中央に無し'); }
  // ── 所得税 月額(densan) 令和7/8 ──
  { const d = row(rows, 'shotokuzei_densan', 2025); if (d) { eq('densan2025.kyuyo', D.PARAMS[2025].kyuyo, d.kyuyo); eq('densan2025.kiso', D.PARAMS[2025].kiso, d.kiso); } else diffs.push('shotokuzei_densan/2025 無し'); }
  { const d = row(rows, 'shotokuzei_densan', 2026); if (d) { eq('densan2026.kyuyo', D.PARAMS[2026].kyuyo, d.kyuyo); eq('densan2026.kiso', D.PARAMS[2026].kiso, d.kiso); eq('densan.zeiKo', D.ZEI_KO, d.zeiKo); eq('densan.zeiOtsu', D.ZEI_OTSU, d.zeiOtsu); } else diffs.push('shotokuzei_densan/2026 無し'); }
  // ── 所得税 日額(hei) ──
  { const d = row(rows, 'shotokuzei_hei', 2026); const t = (H.HEI_BY_YEAR && H.HEI_BY_YEAR[2026]) || H.HEI_R8; if (d) { eq('hei.start', t.start, d.start); eq('hei.step', t.step, d.step); eq('hei.arr', t.arr, d.arr); } else diffs.push('shotokuzei_hei 無し'); }
  // ── 所得税 日額 甲乙(nichi) ──
  { const d = row(rows, 'shotokuzei_nichi', 2026); const t = (NI.tableFor && NI.tableFor(2026)) || NI.TABLE_R8; if (d) { eq('nichi.start', t.start, d.start); eq('nichi.step', t.step, d.step); eq('nichi.ko', t.ko, d.ko); eq('nichi.otsu', t.otsu, d.otsu); eq('nichi.koOver', t.koOver, d.koOver); } else diffs.push('shotokuzei_nichi 無し'); }
  // ── 賞与(shoyo) ──
  { const d = row(rows, 'shoyo', 2026); if (d) { eq('shoyo.rates', SZ.RATES, d.rates); eq('shoyo.kou', SZ.KOU_BY_YEAR[2026], d.kou); eq('shoyo.otsu', SZ.OTSU_BY_YEAR[2026], d.otsu); } else diffs.push('shoyo 無し'); }
  // ── 年末調整(nenmatsu) ──
  { const d = row(rows, 'nenmatsu', 2026); if (d) { eq('nen.kyuyoKojo', N.P.kyuyoKojo, d.kyuyoKojo); eq('nen.kisoKojo', N.P.kisoKojo, d.kisoKojo); eq('nen.sanshutu', N.P.sanshutu, d.sanshutu); eq('nen.fuyoKojo', N.P.fuyoKojo, d.fuyoKojo); } else diffs.push('nenmatsu 無し'); }
  // ── 割増(warimashi) 基本率 ──
  { const d = row(rows, 'warimashi', 2023); if (d) { ['ot', 'holiday', 'night', 'over60Add'].forEach(k => eq('warimashi.' + k, WM.RATE[k], d[k])); } else diffs.push('warimashi 無し'); }
}

const run = async () => {
  let rows;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/statutory?select=kind,year,data', { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    rows = await res.json();
  } catch (e) {
    console.log('SKIP: 中央statutoryを取得できず(オフライン等)=検証スキップ。理由: ' + e.message);
    process.exit(0); // オフラインは赤くしない
  }
  verify(rows);
  if (diffs.length) {
    console.log('DRIFT DETECTED — lib と中央statutoryが不一致(' + diffs.length + '件):');
    diffs.slice(0, 40).forEach(d => console.log('  ✗ ' + d));
    console.log('→ どちらかが古い。一次情報で正を確認し、lib修正 + scripts/seed-statutory.mjs で中央を揃える。');
    process.exitCode = 3; return;
  }
  console.log('OK: 全kind lib==中央statutory 一致(ドリフトなし)。');
};
run().catch(e => { console.log('ERROR ' + e.message); process.exitCode = 2; });
