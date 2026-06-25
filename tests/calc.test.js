/* calc.test.js — 給与計算ラッパ＋エンジン検証（監査指摘の回帰込み） */
'use strict';
var PayslipCalc = require('../lib/calc.js');
var PayrollCalc = require('../lib/payroll-calc.js');
var Densan = require('../lib/shotokuzei-densan.js');
var SHAKAIHOKEN_HYO = require('../lib/shakaihoken-hyo.js');

/* ---- 公式「電算機計算の特例」例での検算（国税庁PDF） ---- */
T('特例 公式例1: A=175,000/扶養2 → 640円', function () { eq(Densan.calc(175000, 2), 640); });
T('特例 公式例2: A=446,000/扶養8 → 1,370円', function () { eq(Densan.calc(446000, 8), 1370); });
T('特例 公式例3: A=775,200/扶養3 → 61,170円', function () { eq(Densan.calc(775200, 3), 61170); });

/* ---- 社保（標準報酬分離・50銭ルール） ---- */
T('アンカー 支給292,931/扶養1/介護対象: 社保46,311(健14865 厚27450 介2385 雇1611)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 292931 }], birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 1 });
  eq(r.si.health, 14865); eq(r.si.pension, 27450); eq(r.si.kaigo, 2385); eq(r.si.employ, 1611); eq(r.si.total, 46311);
  eq(r.kazei, 246620, 'A=社保控除後');
  eq(r.incomeTax, 4810, '特例での所得税');
  eq(r.net, 241810); eq(r.kojoTotal, 51121);
});

T('不変条件: net=支給-控除, 控除合計=Σ控除', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  var s = r.kojo.reduce(function (a, x) { return a + x.value; }, 0);
  eq(r.kojoTotal, s); eq(r.net, r.shikyuTotal - r.kojoTotal);
});

/* ---- C-1: 高給でも所得税が0にならない（旧バグ回帰） ---- */
T('C-1 月給45万・独身 → 所得税>0（旧:課税302,000超で0）', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 450000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.kazei, 385463, 'A');
  ok(r.incomeTax > 0, '所得税>0'); eq(r.incomeTax, 15360, '特例での税額');
});
T('C-1b 課税が非常に高くても税額が出る(¥150万課税)', function () { ok(Densan.calc(1500000, 0) > 0); });

/* ---- H-1: 50銭ルール（.5は切捨て） ---- */
T('H-1 介護 標準110,000×0.00795=874.5 → 874(切捨), 875でない', function () {
  var si = PayrollCalc.calcSocialInsurance({ payTotal: 110000, hasKaigo: true });
  eq(si.hyojunHealth, 110000); eq(si.kaigo, 874);
});

/* ---- 再監査NEW-BUG: 50銭ちょうどのFP誤差で切上げない ---- */
T('han50 FP: 健保0.04855×650,000=31,557.5 → 31,557(切捨), 31,558でない', function () {
  eq(PayrollCalc.calcSocialInsurance({ payTotal: 650000, healthRate: 0.04855 }).health, 31557);
});
T('han50 FP: 介護0.00795×1,030,000=8,188.5 → 8,188', function () {
  // payTotal 1,030,000 → 健保標準1,030,000(>=1,005,000,<1,055,000)
  eq(SHAKAIHOKEN_HYO ? SHAKAIHOKEN_HYO.han50(8188.5) : 8188, 8188);
});

/* ---- 通勤以外の非課税(出張旅費等)は限度なく全額非課税 ---- */
T('非課税の出張旅費20万は全額非課税(15万で切られない)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '出張旅費', value: 200000, hikazei: true }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.nonTaxable, 200000);
});

/* ---- M-3: 健保上限は1,390,000・厚年は650,000 ---- */
T('M-3 支給80万: 健保標準=790,000 / 厚年標準=650,000（健保は上限が高い）', function () {
  var si = PayrollCalc.calcSocialInsurance({ payTotal: 800000, hasKaigo: false });
  eq(si.hyojunHealth, 790000); eq(si.hyojunPension, 650000);
  ok(si.health > Math.round(650000 * 0.04955) - 2, '健保は790,000ベースで650,000より高い');
});
T('M-3b 超高給150万: 健保標準=1,390,000(上限) / 厚年=650,000', function () {
  var si = PayrollCalc.calcSocialInsurance({ payTotal: 1500000, hasKaigo: false });
  eq(si.hyojunHealth, 1390000); eq(si.hyojunPension, 650000);
});

/* ---- M-1: 通勤手当 非課税限度(15万) 超過分は課税 ---- */
T('M-1 通勤20万(非課税)→非課税は15万まで・超過5万は課税', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '通勤手当', value: 200000, hikazei: true }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.nonTaxable, 150000, '非課税は限度まで');
});

/* ---- M-4: 差引マイナスは警告フラグ ---- */
T('M-4 控除過大で差引マイナス → netNegative=true', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 100000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, extraKojo: [{ label: '社宅費', value: 200000 }] });
  ok(r.net < 0); eq(r.netNegative, true);
});

/* ---- M-2: 雇用保険は業種率を渡せば反映（総支給ベース） ---- */
T('M-2 雇用保険率0.0065(建設)を渡すと反映', function () {
  var a = PayrollCalc.calcSocialInsurance({ payTotal: 600000 });
  var b = PayrollCalc.calcSocialInsurance({ payTotal: 600000, employRate: 0.0065 });
  eq(a.employ, 3300); eq(b.employ, 3900);
});

/* ---- L-1/8: 介護 40歳到達 1日生まれの境界 ---- */
T('介護境界 1986-06-01生: 2026-05は対象/2026-04は非対象', function () {
  eq(PayrollCalc.isKaigoTarget('1986-06-01', '2026-05'), true);
  eq(PayrollCalc.isKaigoTarget('1986-06-01', '2026-04'), false);
});

/* ---- 既存の健全性 ---- */
T('住民税を渡すと控除に住民税が入る', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, residentTax: 12500 });
  ok(r.kojo.some(function (k) { return k.label === '住民税' && k.value === 12500; }));
});
T('40歳未満は介護保険なし', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '2000-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.hasKaigo, false); ok(!r.kojo.some(function (k) { return k.label === '介護保険'; }));
});
T('空入力でも例外なく数値', function () { var r = PayslipCalc.computePayslip({}); eq(typeof r.net, 'number'); eq(r.shikyuTotal, 0); });
