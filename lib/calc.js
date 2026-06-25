/* calc.js — 給与明細の計算ラッパ（Exally PayrollCalc を給与明細用にまとめる）
 * 入力: 支給項目(手当/通勤含む)＋生年月日/対象月/扶養/住民税/法定外控除
 * 出力: 支給合計・標準報酬・社保各種・所得税(非課税通勤を課税から除外)・控除一覧・差引
 * 【利用】ブラウザ window.PayslipCalc / Node require('./calc.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./payroll-calc.js'), require('./shotokuzei-hyou.js'));
  } else {
    root.PayslipCalc = factory(root.PayrollCalc, root.SHOTOKUZEI_HYOU);
  }
})(typeof self !== 'undefined' ? self : this, function (PayrollCalc, SHOTOKUZEI) {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }

  // emp = { shikyu:[{label,value,hikazei}], birthYmd, payYm, fuyou, healthRate, employRate, residentTax, extraKojo:[{label,value}] }
  function computePayslip(emp) {
    emp = emp || {};
    var shikyu = (emp.shikyu || []).map(function (it) { return { label: it.label, value: num(it.value), hikazei: !!it.hikazei }; });
    var payTotal = shikyu.reduce(function (a, x) { return a + x.value; }, 0);       // 社保の標準報酬は通勤含む全支給
    var nonTax = shikyu.reduce(function (a, x) { return a + (x.hikazei ? x.value : 0); }, 0); // 非課税(通勤等)
    var hasKaigo = PayrollCalc.isKaigoTarget(emp.birthYmd, emp.payYm);
    var si = PayrollCalc.calcSocialInsurance({ payTotal: payTotal, healthRate: emp.healthRate, employRate: emp.employRate, hasKaigo: hasKaigo });
    var kazei = Math.max(0, (payTotal - nonTax) - si.total);                         // 課税=（支給-非課税）-社保
    var incomeTax = SHOTOKUZEI ? (SHOTOKUZEI.getZei(kazei, emp.fuyou || 0) || 0) : 0;
    var residentTax = num(emp.residentTax);

    var kojo = [];
    kojo.push({ label: '健康保険', value: si.health });
    if (hasKaigo) kojo.push({ label: '介護保険', value: si.kaigo });
    kojo.push({ label: '厚生年金', value: si.pension });
    kojo.push({ label: '雇用保険', value: si.employ });
    kojo.push({ label: '所得税', value: incomeTax });
    if (residentTax) kojo.push({ label: '住民税', value: residentTax });
    (emp.extraKojo || []).forEach(function (k) { kojo.push({ label: k.label, value: num(k.value) }); });
    var kojoTotal = kojo.reduce(function (a, x) { return a + x.value; }, 0);

    return {
      shikyu: shikyu, shikyuTotal: payTotal, nonTaxable: nonTax,
      hyojun: si.hyojun, hasKaigo: hasKaigo, kazei: kazei,
      si: si, incomeTax: incomeTax, residentTax: residentTax,
      kojo: kojo, kojoTotal: kojoTotal, net: payTotal - kojoTotal
    };
  }
  return { computePayslip: computePayslip, _num: num };
});
