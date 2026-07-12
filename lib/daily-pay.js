/* daily-pay.js — 日払い/週払いの「日別集計」純関数。日別の労働時数・支給額を集計し、所得税は日ごと(丙欄=日雇い)に計算して合算。
 *  entries = [{ ymd:'2026-06-08', min:390, amount:12400, hikazei:false, count:8 }]  (min=労働分, amount=その日の支給額)
 *  opts = { taxClass:'hei'|'ko'|'otsu', year:2026, heiFn:function(dailyAmount,{year}) }
 *  ★所得税: taxClass='hei'(丙欄/日雇い)は日ごとに heiFn(その日の課税額) を合算=正しい。
 *    甲/乙は日額表が未収録のため per-day 税は出さない(呼出側で期間まとめ・近似の注記)。tax=null で返す。
 *  返り値: { days:[{ymd,min,amount,count,tax}], count(日数), totalMin, totalAmount, taxableTotal, tax(合計 or null), isHei }
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DailyPay = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function num(v) { v = (v == null || v === '') ? 0 : +String(v).replace(/[^0-9.\-]/g, ''); return isFinite(v) ? v : 0; }

  function computeDaily(entries, opts) {
    opts = opts || {}; entries = (entries || []).filter(function (e) { return e && (num(e.amount) !== 0 || num(e.min) !== 0); });
    var isHei = (opts.taxClass === 'hei');
    var heiFn = (typeof opts.heiFn === 'function') ? opts.heiFn : null;
    var days = entries.map(function (e) {
      var amount = num(e.amount), taxable = e.hikazei ? 0 : amount;
      var tax = (isHei && heiFn) ? Math.round(heiFn(taxable, { year: opts.year })) : null;
      return { ymd: e.ymd || '', min: num(e.min), amount: amount, count: num(e.count), hikazei: !!e.hikazei, tax: tax };
    });
    var totalMin = days.reduce(function (a, d) { return a + d.min; }, 0);
    var totalAmount = days.reduce(function (a, d) { return a + d.amount; }, 0);
    var taxableTotal = days.reduce(function (a, d) { return a + (d.hikazei ? 0 : d.amount); }, 0);
    var totalCount = days.reduce(function (a, d) { return a + d.count; }, 0);
    var tax = (isHei && heiFn) ? days.reduce(function (a, d) { return a + (d.tax || 0); }, 0) : null;
    return { days: days, count: days.length, totalMin: totalMin, totalAmount: totalAmount, taxableTotal: taxableTotal, totalCount: totalCount, tax: tax, isHei: isHei };
  }
  function hhmm(min) { min = num(min); var h = Math.floor(min / 60), m = min % 60; return h + ':' + ('0' + m).slice(-2); }

  return { computeDaily: computeDaily, hhmm: hhmm };
});
