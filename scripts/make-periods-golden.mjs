/* make-periods-golden.mjs — ★期間モード(K2)の真値を 1c128e1 のツリーから凍結する★
 *
 * なぜ 1c128e1 か: 既存 golden-1c128e1(月次のお金) と同じ「移設前」の基準に揃えるため。
 *   期待値を今のツリー(移設後)から作ると自己参照になる。
 *
 * 2層で採る:
 *   ①lib層(headless) … Periods(期間の切り出し/キー判定/異常系) と LedgerAgg(期間別の実績値ctx)
 *   ②app層(jsdom)    … 本物の app.js の shimeSplit / shimePeriods
 *                        （支給サイクルが日払い・週払いのときは期間分割しない、というアプリの決まり）
 *
 * 使い方:
 *   git worktree add ../payslip-base 1c128e1
 *   node scripts/make-periods-golden.mjs --tree ../payslip-base
 *   node scripts/make-periods-golden.mjs --tree ../payslip-base --check   （再現するかだけ見る）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_COMMIT = '1c128e1';
const INPUT = path.join(ROOT, 'tests', 'fixtures', 'periods-input.json');
const OUT = path.join(ROOT, 'tests', 'fixtures', `golden-periods-${BASE_COMMIT}.json`);
const CHECK = process.argv.includes('--check');

const ti = process.argv.indexOf('--tree');
if (ti < 0 || !process.argv[ti + 1]) {
  console.log('使い方: node scripts/make-periods-golden.mjs --tree <1c128e1のworktreeパス>');
  console.log('  例) git worktree add ../payslip-base 1c128e1');
  process.exit(1);
}
const TREE = path.resolve(ROOT, process.argv[ti + 1]);

// ★改行を正規化してからハッシュ(CRLF/LFでブレない)
const sha256 = (s) => crypto.createHash('sha256').update(String(s).replace(/\r\n/g, '\n'), 'utf8').digest('hex');

// ── ツリーが本当に 1c128e1 か検証 ──
function verifyTree() {
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: TREE }).toString().trim();
  if (!BASE_COMMIT.startsWith(head) && !head.startsWith(BASE_COMMIT)) {
    throw new Error(`--tree の HEAD が ${head} です。${BASE_COMMIT} のworktreeを指してください。`);
  }
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: TREE }).toString().trim();
  if (dirty) throw new Error(`--tree に未コミットの変更があります:\n${dirty}`);
  return head;
}

const head = verifyTree();
const requireBase = createRequire(path.join(TREE, 'package.json'));
const Periods = requireBase(path.join(TREE, 'lib/periods.js'));
const LedgerAgg = requireBase(path.join(TREE, 'lib/ledger-agg.js'));

const inputRaw = fs.readFileSync(INPUT, 'utf8');
const inputSha256 = sha256(inputRaw);
const input = JSON.parse(inputRaw);

// 例外もそのまま記録する（「落ちない」ことが仕様なので、落ちたら落ちたと焼く）
const safe = (fn) => { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } };

// ── ① lib層 ──
const buildResults = input.buildCases.map(c => ({
  ym: c.ym, method: c.method, n: c.n, note: c.note,
  periods: safe(() => Periods.buildPeriods(c.ym, c.method, c.n)),
  hasSplit: safe(() => Periods.hasSplit(c.method)),
  lastDay: safe(() => Periods.lastDayOf(Number(String(c.ym).slice(0, 4)), Number(String(c.ym).slice(5, 7)))),
}));
const oddResults = input.oddCases.map(c => ({
  ym: c.ym, method: c.method, n: c.n, note: c.note,
  periods: safe(() => Periods.buildPeriods(c.ym, c.method, c.n)),
  hasSplit: safe(() => Periods.hasSplit(c.method)),
}));
const keyResults = input.keyCases.map(c => ({
  ymd: c.ymd, ym: c.ym, method: c.method, n: c.n, note: c.note || '',
  key: safe(() => Periods.periodKeyOf(c.ymd, c.ym, c.method, c.n)),
}));

// 期間別の実績値(ctx)＝台帳→給与の橋。月またぎ・同日複数行・非課税分離が効いているか
const ledgerResults = ['monthly', 'half', 'ten'].map(method => {
  const periods = Periods.buildPeriods('2026-06', method, 10);
  return {
    method,
    periods: periods.map(p => ({ key: p.key, from: p.from, to: p.to })),
    byPeriod: safe(() => LedgerAgg.byPeriod(input.ledgerRows, periods)),
    entriesInPeriod: periods.map(p => ({
      key: p.key,
      ymds: safe(() => Periods.entriesInPeriod(input.ledgerRows, p).map(r => r.ymd)),
    })),
  };
});
const aggregateResults = {
  E1: safe(() => LedgerAgg.aggregateEmployee(input.ledgerRows.filter(r => r.employee_id === 'E1'))),
  E2: safe(() => LedgerAgg.aggregateEmployee(input.ledgerRows.filter(r => r.employee_id === 'E2'))),
  all: safe(() => LedgerAgg.aggregateEmployee(input.ledgerRows)),
  // K4 §5-3 単一ソース: 台帳(primary)に無い日だけ dailyEntries(fallback)で埋める
  unifyByDay: safe(() => LedgerAgg.unifyByDay(input.ledgerRows.filter(r => r.employee_id === 'E1'), input.fallbackRows).map(r => r.ymd)),
  unifyEmployee: safe(() => LedgerAgg.unifyEmployee(input.ledgerRows.filter(r => r.employee_id === 'E1'), input.fallbackRows)),
};

// ── ② app層(jsdom): 支給サイクル別の期間分割 ──
let appResults = null;
let JSDOM = null;
try { ({ JSDOM } = await import('jsdom')); } catch { /* 未導入 */ }
if (!JSDOM) {
  console.log('SKIP(app層): jsdom未導入。lib層だけ凍結します。'); // 黙って緑にしない=明示
} else {
  const html = fs.readFileSync(path.join(TREE, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/\?.*$/, ''))
    .filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network'));
  for (const src of srcs) {
    const el = win.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(TREE, src), 'utf8');
    win.document.body.appendChild(el);
  }
  const A = win.__PAYSLIP_TEST;
  if (!A) throw new Error('__PAYSLIP_TEST 未露出');
  appResults = input.appCases.map(c => {
    A.state.company = Object.assign({}, A.state.company, { payCycle: c.payCycle, shimeMethod: c.shimeMethod, shimeN: c.shimeN });
    A.state.month = c.ym;
    return {
      ym: c.ym, payCycle: c.payCycle, shimeMethod: c.shimeMethod, shimeN: c.shimeN,
      shimeSplit: safe(() => A.shimeSplit()),
      shimePeriods: safe(() => A.shimePeriods(c.ym).map(p => p.key)),
    };
  });
}

const datasets = { buildResults, oddResults, keyResults, ledgerResults, aggregateResults, appResults };
const goldenSha256 = sha256(JSON.stringify(datasets));

const golden = {
  meta: {
    baseCommit: BASE_COMMIT,
    headAtGeneration: head,
    generator: 'scripts/make-periods-golden.mjs',
    generatedAt: new Date().toISOString(),
    inputFixture: 'tests/fixtures/periods-input.json',
    inputSha256,
    goldenSha256,
    note: '★移設前(1c128e1)の期間モードの真値。リポジトリ統合の前後でこれと一致すること。作り直し禁止(sha照合で検知)。',
  },
  datasets,
};
const json = JSON.stringify(golden, null, 2) + '\n';

if (CHECK) {
  if (!fs.existsSync(OUT)) { console.log('✗ 期間ゴールデンが存在しません:', path.relative(ROOT, OUT)); process.exit(1); }
  const cur = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const ok = cur.meta.goldenSha256 === goldenSha256 && cur.meta.inputSha256 === inputSha256;
  console.log(ok ? '✓ 期間ゴールデンは再現します(sha一致)' : '✗ 期間ゴールデンが再現しません(sha不一致)');
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(OUT, json);
console.log('書き出し:', path.relative(ROOT, OUT));
console.log(`baseCommit=${BASE_COMMIT} / build=${buildResults.length} odd=${oddResults.length} key=${keyResults.length} ledger=${ledgerResults.length} app=${appResults ? appResults.length : 'SKIP'}`);
console.log(`inputSha256=${inputSha256}`);
console.log(`goldenSha256=${goldenSha256}`);
