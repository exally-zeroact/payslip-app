/* make-periods-fixture.mjs — ★期間モード(K2)の入力を凍結する★
 *
 * なぜ必要か: golden-1c128e1(月次のお金) は期間分割を1件も含んでいない。
 *   月次計算エンジン(lib/payroll-monthly.js)は Periods を一切使わないので、それは構造的に正しい。
 *   期間分割の担保は別の凍結セットで持つ。移設(リポジトリ統合)の前後で挙動が変わらないことを、
 *   このセットとの突合で示す。
 *
 * 決定性: Date.now / Math.random / 引数なし new Date() を使わない。何度実行しても同一バイト列。
 * 使い方: node scripts/make-periods-fixture.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'periods-input.json');
const CHECK = process.argv.includes('--check');

// ── ① 期間の切り出し: 締め方 × 月末の長さ(28/29/30/31) ──
const MONTHS = [
  { ym: '2026-02', note: '月末28日' },
  { ym: '2028-02', note: '月末29日(うるう年)' },
  { ym: '2026-04', note: '月末30日' },
  { ym: '2026-07', note: '月末31日' },
  { ym: '2026-06', note: '基準月(30日)' },
];
const METHODS = [
  { method: 'monthly', n: 10, note: '月まとめ=分割なし' },
  { method: 'half', n: 10, note: '半月=1〜15/16〜末' },
  { method: 'ten', n: 10, note: '10日締め(代行)=1〜10/11〜20/21〜末' },
  { method: 'ndays', n: 7, note: '任意N日=7日' },
  { method: 'ndays', n: 13, note: '任意N日=13日(端数が出る)' },
  { method: 'ndays', n: 1, note: '任意N日=1日(極端)' },
  { method: 'ndays', n: 30, note: '任意N日=30日(月より長い場合あり)' },
];

// ── ② 異常系: 落ちない・勝手にどこかへ入れない ──
const ODD = [
  { ym: '2026-06', method: 'unknown-method', n: 10, note: '知らない締め方 → monthly に倒す' },
  { ym: '', method: 'ten', n: 10, note: '空のym → 例外にしない' },
  { ym: '2026-13', method: 'ten', n: 10, note: '13月 → 例外にしない' },
  { ym: 'abc', method: 'ten', n: 10, note: '壊れたym → 例外にしない' },
  { ym: '2026-06', method: 'ten', n: 0, note: 'N=0 → 例外にしない' },
];

// ── ③ 日付→期間キー(範囲外・月またぎ) ──
const KEY_CASES = [
  { ymd: '2026-06-01', ym: '2026-06', method: 'ten', n: 10 },
  { ymd: '2026-06-10', ym: '2026-06', method: 'ten', n: 10 },
  { ymd: '2026-06-11', ym: '2026-06', method: 'ten', n: 10 },
  { ymd: '2026-06-20', ym: '2026-06', method: 'ten', n: 10 },
  { ymd: '2026-06-21', ym: '2026-06', method: 'ten', n: 10 },
  { ymd: '2026-06-30', ym: '2026-06', method: 'ten', n: 10 },
  { ymd: '2026-05-31', ym: '2026-06', method: 'ten', n: 10, note: '前月末=範囲外' },
  { ymd: '2026-07-01', ym: '2026-06', method: 'ten', n: 10, note: '翌月頭=範囲外' },
  { ymd: '2026-06-15', ym: '2026-06', method: 'monthly', n: 10, note: '月まとめは全部P1' },
  { ymd: '2026-02-28', ym: '2026-02', method: 'half', n: 10, note: '28日月の末日' },
  { ymd: '2028-02-29', ym: '2028-02', method: 'half', n: 10, note: 'うるう日' },
];

// ── ④ 台帳の日別行(月またぎ・同日複数行・非課税混在) ──
//  ★同じ日に複数行あっても「1日」に畳まれること(workDays)を見るために 06-03 を3行入れている
const LEDGER_ROWS = [
  { ymd: '2026-05-30', employee_id: 'E1', data: { amount: 8000, minutes: 300, uriage: 12000, count: 2 } },
  { ymd: '2026-05-31', employee_id: 'E1', data: { amount: 7000, minutes: 260, uriage: 9000, count: 1 } },
  { ymd: '2026-06-01', employee_id: 'E1', data: { amount: 9000, minutes: 320, uriage: 15000, count: 3 } },
  { ymd: '2026-06-03', employee_id: 'E1', data: { amount: 5000, minutes: 150, uriage: 7000, count: 1 } },
  { ymd: '2026-06-03', employee_id: 'E1', data: { amount: 4000, minutes: 120, uriage: 6000, count: 1 } },
  { ymd: '2026-06-03', employee_id: 'E1', data: { amount: 1200, minutes: 0, uriage: 0, count: 0, hikazei: true } },
  { ymd: '2026-06-10', employee_id: 'E1', data: { amount: 11000, minutes: 400, uriage: 20000, count: 4 } },
  { ymd: '2026-06-11', employee_id: 'E1', data: { amount: 6000, minutes: 200, uriage: 8000, count: 2 } },
  { ymd: '2026-06-20', employee_id: 'E1', data: { amount: 6500, minutes: 210, uriage: 8500, count: 2 } },
  { ymd: '2026-06-21', employee_id: 'E1', data: { amount: 7200, minutes: 240, uriage: 9800, count: 2 } },
  { ymd: '2026-06-30', employee_id: 'E1', data: { amount: 8800, minutes: 330, uriage: 14000, count: 3 } },
  { ymd: '2026-07-01', employee_id: 'E1', data: { amount: 5500, minutes: 180, uriage: 7700, count: 1 } },
  { ymd: '2026-07-03', employee_id: 'E1', data: { amount: 6100, minutes: 190, uriage: 8100, count: 1 } },
  { ymd: '2026-06-05', employee_id: 'E2', data: { amount: 20000, minutes: 480, uriage: 30000, count: 5 } },
  { ymd: '2026-06-15', employee_id: 'E2', data: { amount: 18000, minutes: 450, uriage: 27000, count: 4 } },
  { ymd: '2026-06-25', employee_id: 'E2', data: { amount: 19000, minutes: 460, uriage: 28000, count: 4 } },
  { ymd: '2026-06-25', employee_id: 'E2', data: { amount: 3000, minutes: 0, uriage: 0, count: 0, hikazei: true } },
  { ymd: '', employee_id: 'E2', data: { amount: 999, minutes: 99, uriage: 99, count: 9 }, note: 'ymd欠落=日数に数えない' },
];

// 単一ソース(K4 §5-3)の突合用: 台帳に無い日を dailyEntries が埋める形
const FALLBACK_ROWS = [
  { ymd: '2026-06-03', employee_id: 'E1', data: { amount: 3333, minutes: 111, uriage: 3333, count: 1 } },
  { ymd: '2026-06-07', employee_id: 'E1', data: { amount: 4444, minutes: 222, uriage: 4444, count: 1 } },
];

// ── ⑤ アプリ層: 支給サイクル × 締め方 で期間分割が効くか(日払い/週払いは分割しない) ──
const APP_CASES = [];
for (const payCycle of ['monthly', 'semimonthly', 'weekly', 'daily']) {
  for (const shimeMethod of ['monthly', 'half', 'ten', 'ndays']) {
    APP_CASES.push({ ym: '2026-06', payCycle, shimeMethod, shimeN: '10' });
  }
}

const fixture = {
  schema: 1,
  generator: 'scripts/make-periods-fixture.mjs',
  note: '期間モード(K2)の凍結入力。月次のお金は golden-1c128e1 が持つ。こちらは期間の切り出しと期間別の実績値。',
  buildCases: MONTHS.flatMap(m => METHODS.map(x => ({ ym: m.ym, method: x.method, n: x.n, note: m.note + ' / ' + x.note }))),
  oddCases: ODD,
  keyCases: KEY_CASES,
  ledgerRows: LEDGER_ROWS,
  fallbackRows: FALLBACK_ROWS,
  appCases: APP_CASES,
};

const json = JSON.stringify(fixture, null, 2) + '\n';
const lf = (s) => (s == null ? null : String(s).replace(/\r\n/g, '\n'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
const same = lf(prev) === lf(json);
if (CHECK) {
  if (same) { console.log('✓ 期間fixtureは凍結どおり(差分なし):', path.relative(ROOT, OUT)); process.exit(0); }
  console.log('✗ 期間fixtureが生成結果と一致しません。凍結が壊れています。'); process.exit(1);
}
if (same) console.log('（変更なし）', path.relative(ROOT, OUT));
else { fs.writeFileSync(OUT, json); console.log('書き出し:', path.relative(ROOT, OUT)); }
console.log(`buildCases=${fixture.buildCases.length} oddCases=${fixture.oddCases.length} keyCases=${fixture.keyCases.length} ledgerRows=${fixture.ledgerRows.length} appCases=${fixture.appCases.length}`);
