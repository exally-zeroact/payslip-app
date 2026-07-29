/* ledger-agg.test.js — K4 台帳集計。HANDOFF §3(ctx定義)を実数でロック。
 *   ★workDays=同日複数行でも1日 ★commission=amount合計だが非課税除外 ★hikazeiAmountに分離。 */
'use strict';
var LA = require('../lib/ledger-agg.js');
var P = require('../lib/periods.js');

T('aggregateEmployee: workDays=同日複数行でも1日・非課税は分離', function () {
  var rows = [
    { ymd: '2026-07-03', data: { uriage: 100000, minutes: 480, amount: 12000, count: 2 } }, // 課税
    { ymd: '2026-07-03', data: { uriage: 50000, minutes: 240, count: 1 } },                 // 同日2本目(amount無)
    { ymd: '2026-07-05', data: { amount: 8000, hikazei: true } }                            // 非課税
  ];
  var a = LA.aggregateEmployee(rows);
  eq(a.ctx.workDays, 2, '3行でも日は2日(7/3,7/5)');
  eq(a.ctx.workMin, 720, '分の合計=480+240');
  eq(a.ctx.sales, 150000, '売上=100000+50000');
  eq(a.ctx.count, 3, '件数=2+1');
  eq(a.ctx.commission, 12000, 'commission=課税amountのみ(12000・非課税8000は除外)');
  eq(a.hikazeiAmount, 8000, '非課税amountは別枠');
  eq(a.rowCount, 3, '行数3');
});

T('aggregateEmployee: 空/未定義でも0でクラッシュしない', function () {
  var a = LA.aggregateEmployee([]);
  eq(a.ctx.workDays, 0); eq(a.ctx.workMin, 0); eq(a.ctx.sales, 0); eq(a.ctx.commission, 0); eq(a.ctx.count, 0); eq(a.hikazeiAmount, 0);
});

T('byPeriod: 10日締めで期間×従業員に振り分け・期間境界で分離', function () {
  var periods = P.buildPeriods('2026-07', 'ten'); // P1 1-10 / P2 11-20 / P3 21-末
  var rows = [
    { employee_id: 'e1', ymd: '2026-07-05', data: { uriage: 100000 } }, // P1
    { employee_id: 'e1', ymd: '2026-07-05', data: { uriage: 50000 } },  // P1 同日
    { employee_id: 'e1', ymd: '2026-07-15', data: { uriage: 30000 } },  // P2
    { employee_id: 'e2', ymd: '2026-07-25', data: { minutes: 600 } }    // P3 別人
  ];
  var bp = LA.byPeriod(rows, periods);
  eq(bp.P1.employees.e1.ctx.sales, 150000, 'P1 e1 売上=15万(同日2本)');
  eq(bp.P1.employees.e1.ctx.workDays, 1, 'P1 e1 は1日(同日2本)');
  eq(bp.P2.employees.e1.ctx.sales, 30000, 'P2 e1 売上=3万');
  ok(!bp.P1.employees.e2, 'P1にe2は居ない');
  eq(bp.P3.employees.e2.ctx.workMin, 600, 'P3 e2 分=600');
});

T('★§5-3 単一ソース: 台帳3件＋同日dailyEntries1件 → 合計が二重にならない', function () {
  // 台帳(primary): 2026-07-03 に3件(amount 5000+3000+2000=10000, minutes計 480)
  var ledger = [
    { ymd: '2026-07-03', data: { amount: 5000, minutes: 240, count: 1 } },
    { ymd: '2026-07-03', data: { amount: 3000, minutes: 120, count: 1 } },
    { ymd: '2026-07-03', data: { amount: 2000, minutes: 120, count: 1 } }
  ];
  // dailyEntries(fallback): 同じ 2026-07-03 に1件(amount 9999) → ★捨てられるべき
  var daily = [{ ymd: '2026-07-03', data: { amount: 9999, minutes: 999 } }];
  var a = LA.unifyEmployee(ledger, daily);
  eq(a.ctx.commission, 10000, '★台帳のみ=10000(9999を足して19999にしない)');
  eq(a.ctx.workMin, 480, '★分も台帳のみ=480(999混入させない)');
  eq(a.ctx.workDays, 1, '同日=1日');
  eq(a.rowCount, 3, '台帳3件のみ集計(dailyEntriesの同日1件は除外)');
});

T('★§5-3 移行期間: 台帳に無い日は dailyEntries を残す(欠落させない)', function () {
  var ledger = [{ ymd: '2026-07-03', data: { amount: 5000 } }]; // 3日だけ台帳
  var daily = [
    { ymd: '2026-07-03', data: { amount: 9999 } }, // 台帳がある日=捨てる
    { ymd: '2026-07-10', data: { amount: 4000 } }  // 台帳に無い日=残す
  ];
  var a = LA.unifyEmployee(ledger, daily);
  eq(a.ctx.commission, 9000, '3日=台帳5000 + 10日=手入力4000 = 9000(9999は除外)');
  eq(a.ctx.workDays, 2, '2日(7/3,7/10)');
});

T('★代行=売上×0.35と保障の高い方(max) が ctx.sales で動く(pay-rule接続)', function () {
  var PR = require('../lib/pay-rule.js');
  if (!(PR && PR.basePay)) { ok(true, 'pay-rule未ロード=skip'); return; }
  // 司さんの代行spec: 固定0 + max(売上×35%, 時給保障×時間)
  var spec = { fixed: '0', variable: { mode: 'max', parts: [{ type: 'rate', amount: '35' }, { type: 'hourly', amount: '1200' }] } };
  // 売上30万→30万×0.35=105,000 / 時給1200×10h(600分)=12,000 → 高い方=105,000
  var ctx = { sales: 300000, workMin: 600, workDays: 1, commission: 0, count: 0 };
  eq(PR.basePay(spec, ctx).base, 105000, '売上×0.35=105,000(保障12,000より高い方)');
  // 売上を1万に→1万×0.35=3,500 / 保障=12,000 → 高い方=12,000
  eq(PR.basePay(spec, { sales: 10000, workMin: 600, workDays: 1 }).base, 12000, '売上少なら保障12,000');
});
