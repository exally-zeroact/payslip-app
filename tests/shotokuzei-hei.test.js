/* shotokuzei-hei.test.js — 所得税 日額表 丙欄(日雇い)の公式値ロック＋computePayslip通し
 * 出典: 国税庁 給与所得の源泉徴収税額表(令和8年分) 日額表 丙欄(実値・2026-07照合) */
'use strict';
var Hei = require('../lib/shotokuzei-hei.js');
var PayslipCalc = require('../lib/calc.js');

/* 丙欄 令和8 公式値ロック(表引き・実値) */
T('丙欄: 9,800円未満=0 / 9,800=1 / 9,900=5 / 10,000=8', function () {
  eq(Hei.heiTax(9700), 0); eq(Hei.heiTax(9799), 0);
  eq(Hei.heiTax(9800), 1); eq(Hei.heiTax(9850), 1);
  eq(Hei.heiTax(9900), 5); eq(Hei.heiTax(10000), 8);
});
T('丙欄: 15,000=193 / 上限手前 23,900〜24,000未満=738', function () {
  eq(Hei.heiTax(15000), 193);
  eq(Hei.heiTax(23900), 738); eq(Hei.heiTax(23999), 738);
});
T('丙欄: 142段・start9800/step100', function () {
  eq(Hei.HEI_R8.arr.length, 142); eq(Hei.HEI_R8.start, 9800); eq(Hei.HEI_R8.step, 100);
});

/* computePayslip通し: taxClass='hei'は heiTaxAmount をそのまま所得税に(甲乙の算式不使用) */
T('通し: 丙欄 日給12,000×出勤20日 → 所得税=heiTax(12000)*20', function () {
  var per = Hei.heiTax(12000); // 79
  var r = PayslipCalc.computePayslip({
    shikyu: [{ label: '基本給', value: 12000 * 20 }], birthYmd: '1990-01-01', payYm: '2026-06',
    taxClass: 'hei', heiTaxAmount: per * 20, hyojunBase: 240000, apply: { health: false, pension: false, kaigo: false, employ: false }
  });
  eq(r.incomeTax, per * 20); eq(per, 79); eq(r.incomeTax, 1580);
});
T('通し: 丙欄はincomeTaxオフで0', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 240000 }], birthYmd: '1990-01-01', payYm: '2026-06', taxClass: 'hei', heiTaxAmount: 1580, apply: { incomeTax: false }, hyojunBase: 240000 });
  eq(r.incomeTax, 0);
});
