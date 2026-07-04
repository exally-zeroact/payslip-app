/* chingin-daicho.test.js — 賃金台帳・部署別集計の組み立て(純関数) */
'use strict';
var CD = require('../lib/chingin-daicho.js');

var emps = [{ id: 'e1', name: '山田' }, { id: 'e2', name: '鈴木' }];
var records = [
  { ym: '2026-04', employee_id: 'e1', data: { shikyuTotal: 300000, kojoTotal: 50000, net: 250000, dept: '営業', shikyu: [{ label: '基本給', value: 280000 }, { label: '住宅手当', value: 20000 }], kojo: [{ label: '健康保険', value: 15000 }], work: { days: 21, workMin: 9600, otMin: 600, nightMin: 0, holidayMin: 0 } } },
  { ym: '2026-05', employee_id: 'e1', data: { shikyuTotal: 320000, kojoTotal: 52000, net: 268000, dept: '営業', shikyu: [{ label: '基本給', value: 280000 }, { label: '住宅手当', value: 20000 }, { label: '残業', value: 20000 }], kojo: [{ label: '健康保険', value: 15000 }], work: { days: 22, workMin: 10200, otMin: 1200, nightMin: 120, holidayMin: 0 } } },
  { ym: '2025-05', employee_id: 'e1', data: { shikyuTotal: 999999 } } // 別年度=無視
];

T('buildLedger: 対象年の保存済み月だけ埋まる・未保存はnull', function () {
  var L = CD.buildLedger(records, 2026, emps);
  eq(L.length, 2);
  eq(L[0].name, '山田');
  ok(L[0].monthly[4] != null, '4月あり'); ok(L[0].monthly[5] != null, '5月あり');
  eq(L[0].monthly[6], null, '6月は未保存=null');
  eq(L[1].monthly[4], null, '鈴木は保存なし');
});

T('buildLedger: 別年度(2025)のレコードは混ざらない', function () {
  var L = CD.buildLedger(records, 2026, emps);
  eq(CD.itemVal((L[0].monthly[5] || {}).shikyu, '基本給'), 280000); // 2026-05
});

T('ledgerLabels: 月をまたいで支給/控除ラベルを統一(出現順)', function () {
  var L = CD.buildLedger(records, 2026, emps);
  var lab = CD.ledgerLabels(L[0]);
  eq(lab.shikyu.join(','), '基本給,住宅手当,残業'); // 5月で残業が追加
  eq(lab.kojo.join(','), '健康保険');
});

T('ledgerTotals: 年計(労働日数・時間・各項目)', function () {
  var L = CD.buildLedger(records, 2026, emps);
  var t = CD.ledgerTotals(L[0]);
  eq(t.savedMonths, 2);
  eq(t.days, 43); // 21+22
  eq(t.otMin, 1800); // 600+1200
  eq(t.shikyuTotal, 620000); // 300000+320000
  eq(t.shikyu['基本給'], 560000); // 280000*2
  eq(t.shikyu['残業'], 20000); // 5月のみ
  eq(t.kojo['健康保険'], 30000);
});

T('deptGroups: 部署ごと小計＋総合計', function () {
  var rows = [
    { dept: '営業', name: 'A', s: 300000, k: 50000, n: 250000 },
    { dept: '営業', name: 'B', s: 200000, k: 30000, n: 170000 },
    { dept: '', name: 'C', s: 100000, k: 10000, n: 90000 } // dept無し→未分類
  ];
  var g = CD.deptGroups(rows);
  eq(g.groups.length, 2);
  eq(g.groups[0].dept, '営業'); eq(g.groups[0].sub.s, 500000); eq(g.groups[0].rows.length, 2);
  eq(g.groups[1].dept, '未分類'); eq(g.groups[1].sub.s, 100000);
  eq(g.total.s, 600000); eq(g.total.k, 90000); eq(g.total.n, 510000);
});
