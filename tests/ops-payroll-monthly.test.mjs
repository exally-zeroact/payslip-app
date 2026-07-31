/* ops-payroll-monthly.test.mjs — オペ経由でも官公値の実数が出ること＋Excel同一ソース＋テストAPI非露出
 *
 * ★期待値は公式一次情報の実数リテラル。オペ自身の出力から作らない。出典はURLまで残す:
 *   健保 東京 令和8年度 9.85% / 介護 1.62% … https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html
 *   厚年 18.3%（平成29年9月〜固定）        … https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf
 *   子ども・子育て支援金 0.23%(労使折半)   … https://www.cfa.go.jp/policies/kodomokosodateshienkinseido
 *   雇用保険 令和8年度 一般 5/1000         … https://jsite.mhlw.go.jp/yamagata-roudoukyoku/koyouhoken-20260316.html
 *   最低賃金 令和7年度 東京 1,226円        … https://www.mhlw.go.jp/content/11200000/001571192.pdf
 *   適用拡大 週20h/月8.8万/2か月超/学生除外/51人以上 … https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const op = require(path.join(ROOT, 'ops/payroll.monthly.js'));

let pass = 0, fail = 0;
function T(n, fn) { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } }
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + `expected ${b} got ${a}`); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function near(a, b, tol, m) { if (Math.abs(a - b) > tol) throw new Error((m ? m + ': ' : '') + `expected≈${b} got ${a}`); }

const CO = { name: 'Z社', annualHolidays: '120', dailyWorkH: '8', dailyWorkM: '0', gyoshu: 'ippan', holidays: [0], ruleOn: {} };
const emp = (o) => Object.assign({ id: 'e1', name: '甲 太郎', payType: '月給', base: '300000', fuyou: '0', pref: 'tokyo', birthYmd: '1990-01-01' }, o);
const run = (o, ym, co) => op.engine({ month: ym || '2026-06', company: co || CO, employees: [emp(o)] });
const one = (o, ym, co) => run(o, ym, co).value.people[0];

console.log('\n[ops-payroll-monthly] オペ経由の官公値(実数リテラル・出典照合済)');

T('厚生年金: 標準報酬(厚年)×18.3%÷2（協会けんぽ R8保険料額表・平成29年9月〜固定）', function () {
  const p = one();
  eq(p.si.pension, Math.round(p.hyojunPension * 0.183 / 2));
});
// 保険料の端数処理=50銭以下切捨て・50銭超切上げ（協会けんぽ）。率でなく【確定した控除額】を1円で見る。
const han50 = (x) => (x % 1 <= 0.5 ? Math.floor(x) : Math.ceil(x));

T('★健康保険 東京 令和8年度: 標準報酬×(9.85%+子育て支援金0.23%)÷2 が控除額と1円一致', function () {
  const p = one({}, '2026-06');
  eq(p.hyojunHealth, 300000, '標準報酬(健保)');
  eq(p.si.health, han50(p.hyojunHealth * (0.0985 + 0.0023) / 2), '公式率から出した額と1円一致');
  eq(p.si.health, 15120, '実額リテラル(令和8年度・東京・標準報酬30万)');
});
T('介護保険 令和8年度: 標準報酬×1.62%÷2 が控除額と1円一致（40〜64歳のみ）', function () {
  const y = one({ birthYmd: '1981-02-20' }, '2026-06');   // 45歳=対象
  const n = one({ birthYmd: '1990-01-01' }, '2026-06');   // 36歳=対象外
  eq(y.si.kaigo, han50(y.hyojunHealth * 0.0162 / 2), '公式率から出した額と1円一致');
  eq(y.si.kaigo, 2430, '実額リテラル(標準報酬30万)');
  eq(n.si.kaigo, 0, '40歳未満は介護なし');
});
T('雇用保険 令和8年度 一般の事業: 総支給×5/1000（労働者負担）', function () {
  const p = one({}, '2026-06');
  eq(p.si.employ, Math.round(p.shikyuTotal * 0.005));
});
T('最低賃金 令和7年度 東京=1,226円: 時給1,225円は割れる／1,226円は割れない', function () {
  const w1 = run({ payType: '時給', hourly: '1225', workedH: '160', workedM: '0' }).warnings;
  const w2 = run({ payType: '時給', hourly: '1226', workedH: '160', workedM: '0' }).warnings;
  ok(w1.some(x => x.code === 'MIN_WAGE_UNDER'), '1,225円は最賃割れ');
  ok(!w2.some(x => x.code === 'MIN_WAGE_UNDER'), '1,226円は最賃割れでない');
});
T('社保 適用拡大の実数: 週20h未満/月88,000円未満/学生 は加入対象にしない（誤警告ゼロ）', function () {
  const co = Object.assign({}, CO, { shakaTokutei: true });
  const base = { payType: '時給', apply: { health: false, pension: false }, workedH: '100', workedM: '0' };
  const req = (o) => run(Object.assign({}, base, o), '2026-06', co).warnings.some(x => x.code === 'SHAHO_KANYU_REQUIRED');
  ok(req({ hourly: '1300', weeklyScheduledH: '20' }), '週20h・月8.8万以上→対象');
  ok(!req({ hourly: '1300', weeklyScheduledH: '19' }), '週19h→非該当');
  ok(!req({ hourly: '1000', weeklyScheduledH: '20' }), '月88,000円未満(1000×20×52/12=86,667)→非該当');
  ok(!req({ hourly: '1300', weeklyScheduledH: '25', honninKinrou: true }), '学生→除外');
});
T('特定適用事業所トグルOFF(小さい会社)では適用拡大の警告を一切出さない', function () {
  const r = run({ payType: '時給', hourly: '1300', weeklyScheduledH: '25', apply: { health: false, pension: false }, workedH: '100', workedM: '0' });
  ok(!r.warnings.some(x => x.code === 'SHAHO_KANYU_REQUIRED'), '誤警告ゼロ');
});
T('労基37条の法定下限: 時間外25%/休日35%/深夜+25%/月60超+25% を下回ると会社スコープで警告', function () {
  const co = Object.assign({}, CO, { rateOt: '20', rateHoliday: '30', rateNight: '20', rateOver60: '20' });
  const codes = run({}, '2026-06', co).warnings.filter(w => w.scope === 'company').map(w => w.code);
  ['RATE_BELOW_LEGAL_OT', 'RATE_BELOW_LEGAL_HOLIDAY', 'RATE_BELOW_LEGAL_NIGHT', 'RATE_BELOW_LEGAL_OVER60'].forEach(c => ok(codes.indexOf(c) >= 0, c));
  // ★入力は「割増後の総率」表記(時間外125%/休日135%)。深夜・月60超は上乗せ分(+25%)。UIのplaceholderと同じ。
  const okco = Object.assign({}, CO, { rateOt: '125', rateHoliday: '135', rateNight: '25', rateOver60: '25' });
  eq(run({}, '2026-06', okco).warnings.filter(w => /RATE_BELOW_LEGAL/.test(w.code)).length, 0, '下限ちょうどは警告なし');
});
T('労基36条: 月45時間超で警告 / 45時間ちょうどは出さない', function () {
  const w = (h) => run({ warimashi: { mode: 'easy', otH: String(h), otM: '0' } }).warnings.map(x => x.code);
  ok(w(46).indexOf('OT_OVER45') >= 0, '46h');
  ok(w(45).indexOf('OT_OVER45') < 0, '45hちょうどは出さない');
});

console.log('\n[ops-payroll-monthly] Excelとグリッドが同一ソース');
T('cells.sheets と excel.export の sheets が同一オブジェクト（ズレようがない）', function () {
  const r = run();
  const x = op.excel.export(r);
  eq(x.sheets, r.cells.sheets, '同一参照');
  eq(x.filename, '給与明細_2026-06.xlsx');
  ok(x.sheets.length === 2, '集計＋明細1枚');
  eq(x.sheets[0].name, '集計');
});
T('excel.export は純関数（XLSX.writeFile を呼ばない＝グローバルXLSX不要で動く）', function () {
  ok(typeof globalThis.XLSX === 'undefined', 'この環境にXLSXは無い');
  const x = op.excel.export(run());
  ok(Array.isArray(x.sheets[0].aoa) && x.sheets[0].aoa.length >= 4, 'AOAが作れている');
});
T('集計シートの合計行が value.totals と一致', function () {
  const r = op.engine({ month: '2026-06', company: CO, employees: [emp({ id: 'a', name: 'A' }), emp({ id: 'b', name: 'B', base: '250000' })] });
  const aoa = r.cells.sheets[0].aoa;
  const last = aoa[aoa.length - 1];
  eq(last[0], '合計');
  eq(last[1], r.value.totals.shikyuTotal);
  eq(last[2], r.value.totals.kojoTotal);
  eq(last[3], r.value.totals.net);
});

console.log('\n[ops-payroll-monthly] テストAPIの非露出(実配信物の静的ガード)');
T('★__PAYSLIP_TEST への代入は jsdom ガードの内側に1箇所だけ（通常のブラウザでは undefined）', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const assigns = src.match(/__PAYSLIP_TEST\s*=/g) || [];
  eq(assigns.length, 1, '代入は1箇所だけ');
  const idx = src.indexOf('__PAYSLIP_TEST=');
  const before = src.slice(Math.max(0, idx - 400), idx);
  ok(/\/jsdom\/i\.test\(navigator\.userAgent/.test(before), '直前に jsdom ガードがある: ' + before.slice(-160));
});
T('★app.js に計算式が残っていない（委譲ラッパ以外で lib の計算を再実装していない）', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  // 移設した関数は「1行の委譲」だけであること
  const MOVED = ['compute', 'warimashiOf', 'syncBasePay', 'syncCommute', 'minWageInfo', 'laborLimitItems',
    'shahoOffWarn', 'shahoKanyuWarn', 'statutoryStaleWarn', 'empWarnings', 'prorateNote', 'residentTaxOf',
    'leaveNoWorkInfo', 'jintekiOf', 'prefRate', 'applyNenchoAdj', 'shahoBasisOf', 'warimashiBasis'];
  MOVED.forEach(function (fn) {
    const re = new RegExp('^\\s*function\\s+' + fn + '\\s*\\([^)]*\\)\\s*\\{\\s*return\\s+P[MW]\\(\\)\\.[\\w$]+\\([^;]*\\);\\s*\\}\\s*$', 'm');
    ok(re.test(src), fn + ' が1行の委譲になっていない（計算がapp.jsに残っている可能性）');
  });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
