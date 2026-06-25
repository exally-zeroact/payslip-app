/* calc.js — 給与明細の計算ラッパ
 * 社保=Exally PayrollCalc(健保/厚年/介護/雇用・標準報酬分離・50銭ルール)
 * 所得税=電算機計算の特例(ShotokuzeiDensan・全所得レンジ正確・月額表打ち切り問題を解消)
 * 通勤手当の非課税限度(既定 月15万・公共交通)を超えた分は課税に算入。差引マイナスは netNegative で警告。
 * 【利用】ブラウザ window.PayslipCalc / Node require('./calc.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./payroll-calc.js'), require('./shotokuzei-densan.js'));
  } else {
    root.PayslipCalc = factory(root.PayrollCalc, root.ShotokuzeiDensan);
  }
})(typeof self !== 'undefined' ? self : this, function (PayrollCalc, Densan) {
  'use strict';
  var COMMUTE_NONTAX_LIMIT = 150000; // 公共交通機関の1か月あたり非課税限度
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }

  // emp = { shikyu:[{label,value,hikazei,nonTaxLimit?}], birthYmd, payYm, fuyou, healthRate, employRate, residentTax, extraKojo:[{label,value}] }
  function computePayslip(emp) {
    emp = emp || {};
    var shikyu = (emp.shikyu || []).map(function (it) { return { label: it.label, value: num(it.value), hikazei: !!it.hikazei, nonTaxLimit: it.nonTaxLimit }; });
    var payTotal = shikyu.reduce(function (a, x) { return a + x.value; }, 0); // 社保の標準報酬は通勤含む全支給
    // 非課税は限度額まで。超過分は課税対象（限度=指定なければ通勤の15万）
    var nonTax = shikyu.reduce(function (a, x) {
      if (!x.hikazei) return a;
      // 限度: 明示指定>「通勤」項目は既定15万>その他の非課税は全額(Infinity)
      var lim = (x.nonTaxLimit != null) ? num(x.nonTaxLimit) : (/通勤/.test(x.label || '') ? COMMUTE_NONTAX_LIMIT : Infinity);
      return a + Math.min(x.value, lim);
    }, 0);

    var hasKaigo = PayrollCalc.isKaigoTarget(emp.birthYmd, emp.payYm);
    var si = PayrollCalc.calcSocialInsurance({ payTotal: payTotal, healthRate: emp.healthRate, employRate: emp.employRate, hasKaigo: hasKaigo });
    var A = Math.max(0, (payTotal - nonTax) - si.total);                  // その月の社会保険料控除後の給与等の金額
    var incomeTax = Densan ? Densan.calc(A, num(emp.fuyou)) : 0;
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
    var net = payTotal - kojoTotal;

    return {
      shikyu: shikyu, shikyuTotal: payTotal, nonTaxable: nonTax,
      hyojun: si.hyojun, hyojunHealth: si.hyojunHealth, hyojunPension: si.hyojunPension,
      hasKaigo: hasKaigo, kazei: A,
      si: si, incomeTax: incomeTax, residentTax: residentTax,
      kojo: kojo, kojoTotal: kojoTotal, net: net, netNegative: net < 0
    };
  }
  return { computePayslip: computePayslip, _num: num, COMMUTE_NONTAX_LIMIT: COMMUTE_NONTAX_LIMIT };
});
