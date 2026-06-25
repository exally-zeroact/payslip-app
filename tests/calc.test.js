/* calc.test.js — 給与計算ラッパの検証 */
'use strict';
var PayslipCalc = require('../lib/calc.js');

// アンカー: nodeスモークと一致するケース(通勤なし・扶養1・1980生・2026-06)
T('アンカー: 支給292,931/扶養1/介護対象 → 社保46,311・所得税6,060・差引240,560', function () {
  var r = PayslipCalc.computePayslip({
    shikyu: [{ label: '基本給', value: 292931 }],
    birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 1
  });
  eq(r.shikyuTotal, 292931, 'shikyuTotal');
  eq(r.hasKaigo, true, 'hasKaigo');
  eq(r.si.total, 46311, 'si.total');
  eq(r.incomeTax, 6060, 'incomeTax');
  eq(r.kojoTotal, 52371, 'kojoTotal');
  eq(r.net, 240560, 'net');
});

T('不変条件: net = 支給合計 - 控除合計、控除合計 = Σ控除', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }, { label: '残業手当', value: 19531 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  var sumK = r.kojo.reduce(function (a, x) { return a + x.value; }, 0);
  eq(r.kojoTotal, sumK, 'kojoTotal=Σkojo');
  eq(r.net, r.shikyuTotal - r.kojoTotal, 'net=支給-控除');
});

T('非課税通勤は社保の標準報酬には含むが課税からは除外 → 税が下がる', function () {
  var base = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 292931 }], birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 1 });
  var withCommute = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 284531 }, { label: '通勤手当', value: 8400, hikazei: true }], birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 1 });
  eq(withCommute.shikyuTotal, 292931, '支給合計は同じ');
  eq(withCommute.si.total, base.si.total, '社保は標準報酬(通勤含む)ベースで同じ');
  eq(withCommute.nonTaxable, 8400, '非課税=8400');
  ok(withCommute.incomeTax <= base.incomeTax, '通勤非課税分だけ課税が下がり税≤');
  ok(withCommute.kazei < base.kazei, '課税額が低い');
});

T('住民税を渡すと控除に住民税が入り控除が増える', function () {
  var a = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  var b = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, residentTax: 12500 });
  eq(b.kojoTotal - a.kojoTotal, 12500, '住民税12,500ぶん増');
  ok(b.kojo.some(function (k) { return k.label === '住民税' && k.value === 12500; }), '住民税行あり');
});

T('40歳未満は介護保険なし(行が出ない)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '2000-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.hasKaigo, false, 'hasKaigo false');
  ok(!r.kojo.some(function (k) { return k.label === '介護保険'; }), '介護保険行なし');
});

T('法定外控除(社宅費等)を追加できる', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, extraKojo: [{ label: '社宅費', value: 15000 }] });
  ok(r.kojo.some(function (k) { return k.label === '社宅費' && k.value === 15000; }), '社宅費行あり');
});

T('空入力でも例外なく数値を返す', function () {
  var r = PayslipCalc.computePayslip({});
  eq(typeof r.net, 'number', 'net is number');
  eq(r.shikyuTotal, 0, 'shikyuTotal 0');
});
