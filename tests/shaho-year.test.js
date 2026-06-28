/* shaho-year.test.js — 健保/介護/子育て支援金の「年度自動切替」(社保年度=3月起算) */
'use strict';
var PayslipCalc = require('../lib/calc.js');
var SH = require('../lib/shakaihoken-hyo.js');

/* --- shahoYearOf: 3月起算 --- */
T('社保年度: 2026-06 → 2026(令和8年度)', function () { eq(SH.shahoYearOf('2026-06'), 2026); });
T('社保年度: 2026-03 → 2026(年度初め)', function () { eq(SH.shahoYearOf('2026-03'), 2026); });
T('社保年度: 2026-02 → 2025(前年度)', function () { eq(SH.shahoYearOf('2026-02'), 2025); });
T('社保年度: 2025-06 → 2025(令和7年度)', function () { eq(SH.shahoYearOf('2025-06'), 2025); });

/* --- getKenko: 年度で健保料率が変わる --- */
T('健保 東京 令和8(2026-06)=9.85%・折半=4.925%', function () {
  var k = SH.getKenko('tokyo', '2026-06');
  ok(Math.abs(k.total - 0.0985) < 1e-9, 'total ' + k.total);
  ok(Math.abs(k.jugyoin - k.total / 2) < 1e-9, '折半でない');
  eq(k.stale, false);
});
T('健保 東京 令和7(2025-06)=既存KENKO_RITSU(9.91%)', function () {
  var k = SH.getKenko('tokyo', '2025-06');
  ok(Math.abs(k.total - SH.KENKO_RITSU.tokyo.total) < 1e-9, 'total ' + k.total);
});
T('健保 令和8で東京と新潟で料率が異なる(新潟9.21%)', function () {
  eq(SH.getKenko('niigata', '2026-06').total, 0.0921);
  ok(SH.getKenko('tokyo', '2026-06').total !== SH.getKenko('niigata', '2026-06').total);
});
T('健保 令和8: 47都道府県すべて存在', function () {
  eq(Object.keys(SH.KENKO_2026).length, 47);
  Object.keys(SH.KENKO_RITSU).forEach(function (k) { ok(SH.KENKO_2026[k] != null, k + ' が令和8に無い'); });
});

/* --- getKaigo: 介護料率の年度切替 --- */
T('介護 令和7(2025-06)=0.795% / 令和8(2026-06)=0.81%', function () {
  eq(SH.getKaigo('2025-06').jugyoin, 0.00795);
  eq(SH.getKaigo('2026-06').jugyoin, 0.0081);
});

/* --- getShienkin: 子育て支援金(令和8/4分〜・折半) --- */
T('支援金: 2026-04以降は0.115%、3月以前/令和7は0', function () {
  eq(SH.getShienkin('2026-04'), 0.0023 / 2);
  eq(SH.getShienkin('2026-06'), 0.00115);
  eq(SH.getShienkin('2026-03'), 0);
  eq(SH.getShienkin('2025-06'), 0);
});

/* --- computePayslip 通し: 同じ人で対象月だけ変えると健保/介護が変わる --- */
function buildEmp(payYm) {
  var rate = SH.getKenko('tokyo', payYm).jugyoin + SH.getShienkin(payYm); // = app.js prefRate と同じ
  return {
    shikyu: [{ label: '基本給', value: 300000 }],
    birthYmd: '1980-05-15', payYm: payYm, fuyou: 1, taxClass: '甲',
    residentTax: 0, healthRate: rate, employRate: 0.0055,
    hyojunBase: 300000, apply: {}, extraKojo: [],
  };
}
T('通し: 健保は令和8(支援金込)>令和7、介護も令和8>令和7', function () {
  var r25 = PayslipCalc.computePayslip(buildEmp('2025-06'));
  var r26 = PayslipCalc.computePayslip(buildEmp('2026-06'));
  var h25 = r25.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  var h26 = r26.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  var k25 = r25.kojo.filter(function (x) { return x.label === '介護保険'; })[0].value;
  var k26 = r26.kojo.filter(function (x) { return x.label === '介護保険'; })[0].value;
  ok(h26 > h25, '健保 令和8(' + h26 + ') が令和7(' + h25 + ')以下');
  ok(k26 > k25, '介護 令和8(' + k26 + ') が令和7(' + k25 + ')以下');
});
T('通し: 令和8の介護額 = han50(標準報酬(健保) × 0.81%)', function () {
  var hy = SH.getHyojunHealth(300000);
  var expect = SH.han50(hy * 0.0081);
  var r26 = PayslipCalc.computePayslip(buildEmp('2026-06'));
  var k26 = r26.kojo.filter(function (x) { return x.label === '介護保険'; })[0].value;
  eq(k26, expect);
});
T('通し: 令和8の健保額 = han50(標準報酬(健保) × (9.85%/2 + 0.115%))', function () {
  var hy = SH.getHyojunHealth(300000);
  var expect = SH.han50(hy * (0.0985 / 2 + 0.00115));
  var r26 = PayslipCalc.computePayslip(buildEmp('2026-06'));
  var h26 = r26.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  eq(h26, expect);
});
