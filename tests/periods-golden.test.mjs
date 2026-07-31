/* periods-golden.test.mjs — ★期間モード(K2)が移設前と1つも変わっていないことの証明★
 *
 * 相手は【移設前 1c128e1 に凍結した golden-periods-1c128e1.json】。
 *   月次のお金は golden-1c128e1 が守る。こちらは Periods(期間の切り出し)と
 *   LedgerAgg(期間別の実績値ctx)、および app層の「日払い/週払いは期間分割しない」決まりを守る。
 *
 * 凍結の番人も兼ねる: 入力fixture と ゴールデン本体の SHA256 を照合し、
 *   期待値の作り直し・入力の書き換えを検知して赤にする（既存 golden-immutable と同じ作り）。
 *
 * 使い方: node tests/periods-golden.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const BASE_COMMIT = '1c128e1';

const Periods = require(path.join(ROOT, 'lib/periods.js'));
const LedgerAgg = require(path.join(ROOT, 'lib/ledger-agg.js'));

const inputRaw = fs.readFileSync(path.join(ROOT, 'tests/fixtures/periods-input.json'), 'utf8');
const input = JSON.parse(inputRaw);
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, `tests/fixtures/golden-periods-${BASE_COMMIT}.json`), 'utf8'));
const G = golden.datasets;

let pass = 0, fail = 0;
const diffs = [];
function T(n, fn) { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } }
const sha256 = (s) => crypto.createHash('sha256').update(String(s).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
const LD = (ym) => Periods.lastDayOf(Number(String(ym).slice(0, 4)), Number(String(ym).slice(5, 7))); // lastDayOf(y, m)
const safe = (fn) => { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } };
function deep(a, b, where) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) { diffs.push(where); throw new Error(`${where}\n  golden=${B.slice(0, 260)}\n  now   =${A.slice(0, 260)}`); }
}

console.log('\n[periods-golden] 移設前ゴールデン(1c128e1) vs 現在の lib/app');

// ── 凍結の番人 ──
T('ゴールデンの baseCommit が移設前(' + BASE_COMMIT + ')のまま', function () {
  if (golden.meta.baseCommit !== BASE_COMMIT) throw new Error('baseCommit=' + golden.meta.baseCommit);
});
T('入力fixtureのSHA256が meta.inputSha256 と一致（入力が後から動いていない）', function () {
  const now = sha256(inputRaw);
  if (now !== golden.meta.inputSha256) throw new Error(`expected ${golden.meta.inputSha256} got ${now}`);
});
T('ゴールデン本体のSHA256が meta.goldenSha256 と一致（期待値が作り直されていない）', function () {
  const now = sha256(JSON.stringify(G));
  if (now !== golden.meta.goldenSha256) throw new Error(`expected ${golden.meta.goldenSha256} got ${now}`);
});

// ── ① 期間の切り出し（締め方 × 月末28/29/30/31） ──
T(`期間の切り出しが全ケース一致（${G.buildResults.length}件: 月まとめ/半月/10日締め/任意N日 × 月末28・29・30・31）`, function () {
  input.buildCases.forEach((c, i) => {
    const g = G.buildResults[i];
    deep(safe(() => Periods.buildPeriods(c.ym, c.method, c.n)), g.periods, `buildPeriods ${c.ym}/${c.method}/N=${c.n}`);
    deep(safe(() => Periods.hasSplit(c.method)), g.hasSplit, `hasSplit ${c.method}`);
    deep(safe(() => LD(c.ym)), g.lastDay, `lastDayOf ${c.ym}`);
  });
});
T('★月の全日がちょうど1つの期間に入る（漏れ・重複ゼロ）', function () {
  for (const c of input.buildCases) {
    const ps = Periods.buildPeriods(c.ym, c.method, c.n);
    if (!ps.length) continue;
    const last = LD(c.ym);
    const seen = {};
    ps.forEach(p => { for (let d = p.fromDay; d <= p.toDay; d++) { if (seen[d]) throw new Error(`${c.ym}/${c.method}/N=${c.n}: ${d}日が重複`); seen[d] = 1; } });
    for (let d = 1; d <= last; d++) if (!seen[d]) throw new Error(`${c.ym}/${c.method}/N=${c.n}: ${d}日が漏れ`);
    if (Object.keys(seen).length !== last) throw new Error(`${c.ym}/${c.method}/N=${c.n}: 日数不一致 ${Object.keys(seen).length}≠${last}`);
  }
});

// ── ② 異常系（落ちない・勝手にどこかへ入れない） ──
T(`異常系が一致（${G.oddResults.length}件: 知らない締め方 / 空ym / 13月 / 壊れたym / N=0）`, function () {
  input.oddCases.forEach((c, i) => {
    const g = G.oddResults[i];
    deep(safe(() => Periods.buildPeriods(c.ym, c.method, c.n)), g.periods, `odd buildPeriods ${c.note}`);
    deep(safe(() => Periods.hasSplit(c.method)), g.hasSplit, `odd hasSplit ${c.note}`);
  });
});
T('★知らない締め方は monthly に倒れ、壊れた ym は例外でなく空配列', function () {
  const unk = Periods.buildPeriods('2026-06', 'unknown-method', 10);
  if (unk.length !== 1 || unk[0].key !== 'P1') throw new Error('未知の締め方が monthly に倒れていない: ' + JSON.stringify(unk));
  for (const bad of ['', '2026-13', 'abc']) {
    const r = Periods.buildPeriods(bad, 'ten', 10);
    if (!Array.isArray(r) || r.length !== 0) throw new Error(`壊れたym(${bad})が空配列でない: ` + JSON.stringify(r));
  }
});

// ── ③ 日付→期間キー（範囲外は null） ──
T(`日付→期間キーが一致（${G.keyResults.length}件・前月末/翌月頭は null）`, function () {
  input.keyCases.forEach((c, i) => {
    deep(safe(() => Periods.periodKeyOf(c.ymd, c.ym, c.method, c.n)), G.keyResults[i].key, `periodKeyOf ${c.ymd}/${c.method}`);
  });
});

// ── ④ 期間別の実績値(ctx)＝台帳→給与の橋 ──
T(`期間別の実績値が一致（月まとめ/半月/10日締め・月またぎ行を含む台帳${input.ledgerRows.length}行）`, function () {
  G.ledgerResults.forEach(g => {
    const periods = Periods.buildPeriods('2026-06', g.method, 10);
    deep(periods.map(p => ({ key: p.key, from: p.from, to: p.to })), g.periods, `periods ${g.method}`);
    deep(safe(() => LedgerAgg.byPeriod(input.ledgerRows, periods)), g.byPeriod, `byPeriod ${g.method}`);
    periods.forEach((p, i) => {
      deep(safe(() => Periods.entriesInPeriod(input.ledgerRows, p).map(r => r.ymd)), g.entriesInPeriod[i].ymds, `entriesInPeriod ${g.method}/${p.key}`);
    });
  });
});
T('★月またぎ: 前月(5/30,5/31)・翌月(7/1,7/3)の行はどの期間にも入らない', function () {
  const periods = Periods.buildPeriods('2026-06', 'ten', 10);
  const all = periods.flatMap(p => Periods.entriesInPeriod(input.ledgerRows, p).map(r => r.ymd));
  ['2026-05-30', '2026-05-31', '2026-07-01', '2026-07-03'].forEach(d => {
    if (all.indexOf(d) >= 0) throw new Error(d + ' が期間に混入している');
  });
});
T('集計(同日複数行は1日・非課税は別枠・単一ソースの穴埋め)が一致', function () {
  deep(safe(() => LedgerAgg.aggregateEmployee(input.ledgerRows.filter(r => r.employee_id === 'E1'))), G.aggregateResults.E1, 'aggregate E1');
  deep(safe(() => LedgerAgg.aggregateEmployee(input.ledgerRows.filter(r => r.employee_id === 'E2'))), G.aggregateResults.E2, 'aggregate E2');
  deep(safe(() => LedgerAgg.aggregateEmployee(input.ledgerRows)), G.aggregateResults.all, 'aggregate all');
  deep(safe(() => LedgerAgg.unifyByDay(input.ledgerRows.filter(r => r.employee_id === 'E1'), input.fallbackRows).map(r => r.ymd)), G.aggregateResults.unifyByDay, 'unifyByDay');
  deep(safe(() => LedgerAgg.unifyEmployee(input.ledgerRows.filter(r => r.employee_id === 'E1'), input.fallbackRows)), G.aggregateResults.unifyEmployee, 'unifyEmployee');
});

// ── ⑤ app層: 日払い/週払いは期間分割しない ──
if (!G.appResults) {
  console.log('  … app層はゴールデン生成時に jsdom 未導入でSKIPされています（黙って緑にしない）');
} else {
  // app層の照合は下の appLayer() で実行する（jsdomの読み込みに await が要るため）
}

async function appLayer() {
  if (!G.appResults) return;
  let JSDOM;
  try { ({ JSDOM } = await import('jsdom')); }
  catch { console.log('  ✗ app層: jsdom未導入のため照合できません（ゴールデンには入っています）'); fail++; return; }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/\?.*$/, ''))
    .filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network'));
  for (const src of srcs) { const el = win.document.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8'); win.document.body.appendChild(el); }
  const A = win.__PAYSLIP_TEST;
  T(`支給サイクル別の期間分割が一致（${G.appResults.length}件: 月1/月2/週払い/日払い × 4締め方）`, function () {
    if (!A) throw new Error('__PAYSLIP_TEST 未露出');
    input.appCases.forEach((c, i) => {
      A.state.company = Object.assign({}, A.state.company, { payCycle: c.payCycle, shimeMethod: c.shimeMethod, shimeN: c.shimeN });
      A.state.month = c.ym;
      const g = G.appResults[i];
      deep(safe(() => A.shimeSplit()), g.shimeSplit, `shimeSplit ${c.payCycle}/${c.shimeMethod}`);
      deep(safe(() => A.shimePeriods(c.ym).map(p => p.key)), g.shimePeriods, `shimePeriods ${c.payCycle}/${c.shimeMethod}`);
    });
  });
  T('★日払い・週払いでは締め方に関係なく期間分割しない（凍結値どおり）', function () {
    G.appResults.filter(a => a.payCycle === 'daily' || a.payCycle === 'weekly').forEach(a => {
      if (a.shimeSplit.value !== false) throw new Error(`${a.payCycle}/${a.shimeMethod} が分割されている`);
    });
    const split = G.appResults.filter(a => a.payCycle === 'monthly' && a.shimeMethod !== 'monthly');
    if (!split.length || !split.every(a => a.shimeSplit.value === true)) throw new Error('月1では分割が効いているはず');
  });
}

await appLayer();

console.log(`\n── 実測 ──`);
console.log(`  期間の切り出し: ${G.buildResults.length}件 / 異常系: ${G.oddResults.length}件 / 期間キー: ${G.keyResults.length}件`);
console.log(`  期間別の実績値: ${G.ledgerResults.length}方式 × 台帳${input.ledgerRows.length}行 / app層: ${G.appResults ? G.appResults.length : 'SKIP'}件`);
console.log(`  差分: ${diffs.length} 件` + (diffs.length ? '\n   ' + diffs.slice(0, 15).join('\n   ') : '  ← 差分ゼロ'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
