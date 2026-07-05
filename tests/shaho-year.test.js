/* shaho-year.test.js — 健保/介護/子育て支援金の「年度自動切替」(社保年度=3月起算) */
'use strict';
var PayslipCalc = require('../lib/calc.js');
var SH = require('../lib/shakaihoken-hyo.js');
var PC = require('../lib/payroll-calc.js');

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
/* 令和7年度=協会けんぽ公式(rate_prefectures/r07・2026-07照合)。値をロックし再発防止 */
T('健保 令和7 公式値ロック(協会けんぽ2025年度)', function () {
  var exp = { hokkaido:0.1031, iwate:0.0962, miyagi:0.1011, yamagata:0.0975, fukushima:0.0962, ibaraki:0.0967, tochigi:0.0982, saitama:0.0976, chiba:0.0979, tokyo:0.0991, kanagawa:0.0992, niigata:0.0955, toyama:0.0965, fukui:0.0994, nagano:0.0969, gifu:0.0993, aichi:0.1003, osaka:0.1024, hyogo:0.1016, hiroshima:0.0997, yamaguchi:0.1036, tokushima:0.1047, kochi:0.1013, fukuoka:0.1031, saga:0.1078, nagasaki:0.1041, kagoshima:0.1031, okinawa:0.0944 };
  Object.keys(exp).forEach(function (p) {
    var k = SH.getKenko(p, '2025-06');
    ok(Math.abs(k.total - exp[p]) < 1e-9, p + ' 令和7=' + k.total + ' 期待' + exp[p]);
    ok(Math.abs(k.jugyoin - k.total / 2) < 1e-9, p + ' 折半でない');
  });
});
T('健保 令和7: 47都道府県すべて存在', function () { eq(Object.keys(SH.KENKO_RITSU).length, 47); });
/* 令和8年度=協会けんぽ公式PDF(R8_*.pdf)機械抽出済。実数リテラルでロック(自己参照でなく) */
T('健保 令和8 公式値ロック(協会けんぽ2026年度・KENKO_2026)', function () {
  eq(Object.keys(SH.KENKO_2026).length, 47);
  var exp = { hokkaido:0.1028, aomori:0.0985, iwate:0.0951, tokyo:0.0985, kanagawa:0.0992, niigata:0.0921, aichi:0.0993, osaka:0.1013, hyogo:0.1012, hiroshima:0.0978, yamaguchi:0.1015, fukuoka:0.1011, saga:0.1055, okinawa:0.0944 };
  Object.keys(exp).forEach(function (p) { ok(Math.abs(SH.KENKO_2026[p] - exp[p]) < 1e-9, p + ' 令和8=' + SH.KENKO_2026[p] + ' 期待' + exp[p]); });
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

/* --- lib側でも健保率を年度自己選択(介護と対称・silent-wrong防止) ---
   これまで健保率はapp.jsのprefRateで年度選択してhealthRateスカラーを渡す前提=渡し忘れると黙って既定率。
   介護(getKaigo(payYm))と同様、pref+payYmを渡せばlib単体で年度自動選択できることを保証する。
   ★明示healthRateがあればそれが勝つ(=app.js現行パス不変=回帰ゼロ)★ */
T('健保 lib自己選択: pref+payYmだけで年度正しい率を導出(明示healthRate省略)', function () {
  var base = { payTotal: 300000, hyojunBase: 300000, employRate: 0.0055, hasKaigo: false };
  // 導出 = app.js prefRate('tokyo', ym) と同一(getKenko.jugyoin + getShienkin)
  var expR7 = SH.getKenko('tokyo', '2025-06').jugyoin + SH.getShienkin('2025-06');
  var expR8 = SH.getKenko('tokyo', '2026-06').jugyoin + SH.getShienkin('2026-06');
  var hyHealth = SH.getHyojunHealth(300000);
  var r7 = PC.calcSocialInsurance(Object.assign({}, base, { pref: 'tokyo', payYm: '2025-06' }));
  var r8 = PC.calcSocialInsurance(Object.assign({}, base, { pref: 'tokyo', payYm: '2026-06' }));
  eq(r7.health, SH.han50(hyHealth * expR7));
  eq(r8.health, SH.han50(hyHealth * expR8));
  ok(r8.health !== r7.health, '令和8健保が令和7と同額(年度選択が効いてない)');
});
T('健保 lib自己選択: 明示healthRateが最優先(pref/payYmを無視=回帰ゼロ)', function () {
  var hyHealth = SH.getHyojunHealth(300000);
  var r = PC.calcSocialInsurance({ payTotal: 300000, hyojunBase: 300000, employRate: 0.0055, hasKaigo: false,
    pref: 'tokyo', payYm: '2026-06', healthRate: 0.05 }); // 明示値=導出と別
  eq(r.health, SH.han50(hyHealth * 0.05));
});
T('健保 lib自己選択: pref未指定+healthRate未指定は既定0.04955のまま(空呼び出し回帰ゼロ)', function () {
  var hyHealth = SH.getHyojunHealth(300000);
  var r = PC.calcSocialInsurance({ payTotal: 300000, hyojunBase: 300000, employRate: 0.0055, hasKaigo: false, payYm: '2026-06' });
  eq(r.health, SH.han50(hyHealth * 0.04955));
});
T('健保 lib自己選択: computePayslip(emp.pref)経由でも年度導出・emp.healthRate明示は勝つ', function () {
  var empBase = { shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1980-05-15', fuyou: 1,
    taxClass: '甲', residentTax: 0, employRate: 0.0055, hyojunBase: 300000, apply: {}, extraKojo: [] };
  var hyHealth = SH.getHyojunHealth(300000);
  // pref経由(healthRate省略)→令和8導出
  var rD = PayslipCalc.computePayslip(Object.assign({}, empBase, { pref: 'tokyo', payYm: '2026-06' }));
  var hD = rD.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  eq(hD, SH.han50(hyHealth * (SH.getKenko('tokyo', '2026-06').jugyoin + SH.getShienkin('2026-06'))));
  // emp.healthRate明示→そのまま(回帰ゼロ)
  var rE = PayslipCalc.computePayslip(Object.assign({}, empBase, { pref: 'tokyo', payYm: '2026-06', healthRate: 0.05 }));
  var hE = rE.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  eq(hE, SH.han50(hyHealth * 0.05));
});
