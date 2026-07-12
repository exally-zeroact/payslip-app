/* daily-pay.test.js — 日払い/週払いの日別集計(労働時数・支給額・丙欄税の合算) */
'use strict';
var DP = require('../lib/daily-pay.js');
var Hei = require('../lib/shotokuzei-hei.js');

T('日別集計: 支給額・労働時数・件数を合算', function () {
  var r = DP.computeDaily([
    { ymd: '2026-06-08', min: 360, amount: 12400, count: 8 },
    { ymd: '2026-06-09', min: 420, amount: 13648, count: 9 }
  ], { taxClass: 'ko' });
  eq(r.count, 2); eq(r.totalMin, 780); eq(r.totalAmount, 26048); eq(r.totalCount, 17);
});
T('丙欄(日雇い): 日ごとに丙欄税を計算して合算', function () {
  // モックheiFnで集計ロジックを決定論的にロック: その日の課税額×3%(切捨)
  var r = DP.computeDaily([
    { ymd: '2026-06-08', min: 360, amount: 10000 },
    { ymd: '2026-06-09', min: 420, amount: 20000 }
  ], { taxClass: 'hei', heiFn: function (a) { return Math.floor(a * 0.03); } });
  eq(r.isHei, true); eq(r.tax, 300 + 600); // 各日別に計算して合算(月合計に一括でない=丙欄の正しい挙動)
});
T('非課税の日は課税合計・税から除外(支給合計には入る)', function () {
  var r = DP.computeDaily([
    { ymd: '2026-06-08', min: 360, amount: 10000 },
    { ymd: '2026-06-09', min: 60, amount: 1200, hikazei: true } // 交通費など
  ], { taxClass: 'hei', heiFn: function (a) { return Math.floor(a * 0.03); } });
  eq(r.totalAmount, 11200); eq(r.taxableTotal, 10000); eq(r.tax, 300); // 非課税分は税ゼロ
});
T('甲/乙は日額表未収録=per-day税はnull(呼出側で期間まとめ)', function () {
  var r = DP.computeDaily([{ ymd: '2026-06-08', min: 360, amount: 10000 }], { taxClass: 'ko', heiFn: function () { return 999; } });
  eq(r.tax, null); eq(r.isHei, false);
});
T('実の丙欄(ShotokuzeiHei.heiTax)で統合: 税は非負の数値', function () {
  var r = DP.computeDaily([
    { ymd: '2026-06-08', min: 360, amount: 12000 },
    { ymd: '2026-06-09', min: 420, amount: 15000 }
  ], { taxClass: 'hei', year: 2026, heiFn: Hei.heiTax });
  ok(typeof r.tax === 'number' && r.tax >= 0, '丙欄合計は非負の数値');
});
T('hhmm: 390分→6:30 / 32:30', function () {
  eq(DP.hhmm(390), '6:30'); eq(DP.hhmm(1950), '32:30');
});
T('空/無効は落ちない', function () {
  eq(DP.computeDaily(null, {}).count, 0); eq(DP.computeDaily([], {}).totalAmount, 0);
});
