/* daily-pay.js — 日払い/週払いの「日別集計」純関数。日別の労働時数・支給額を集計し、所得税は日ごと(丙欄=日雇い)に計算して合算。
 *  entries = [{ ymd:'2026-06-08', min:390, amount:12400, hikazei:false, count:8 }]  (min=労働分, amount=その日の支給額)
 *  opts = { taxClass:'hei'|'ko'|'otsu', year:2026, heiFn:fn(dailyAmount,{year}), dayTaxFn:fn(その日の課税額)->税額 }
 *  ★所得税は日ごとに計算して合算=正しい(月一括でない)。呼出側が dayTaxFn を渡す:
 *    丙欄(日雇い)=shotokuzei-hei / 甲・乙欄(継続雇用の日払週払)=shotokuzei-nichi 日額表。
 *    dayTaxFn 未指定(税区分に対応表なし)のときのみ tax=null。
 *  返り値: { days:[{ymd,min,amount,count,tax}], count(日数), totalMin, totalAmount, taxableTotal, tax(合計 or null), isHei }
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DailyPay = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function num(v) { v = (v == null || v === '') ? 0 : +String(v).replace(/[^0-9.\-]/g, ''); return isFinite(v) ? v : 0; }

  function computeDaily(entries, opts) {
    opts = opts || {}; entries = (entries || []).filter(function (e) { return e && (num(e.amount) !== 0 || num(e.min) !== 0); });
    var taxClass = opts.taxClass;
    var isHei = (taxClass === 'hei');
    // その日の課税額→税額(最終整数)を返す関数。優先:dayTaxFn(甲/乙/丙を呼出側で決める)。後方互換:丙=heiFn。
    var dayTaxFn = (typeof opts.dayTaxFn === 'function') ? opts.dayTaxFn
      : (isHei && typeof opts.heiFn === 'function') ? function (t) { return opts.heiFn(t, { year: opts.year }); }
      : null;
    var perDay = !!dayTaxFn;
    var days = entries.map(function (e) {
      var amount = num(e.amount), taxable = e.hikazei ? 0 : amount;
      var tax = perDay ? Math.round(dayTaxFn(taxable)) : null;
      return { ymd: e.ymd || '', min: num(e.min), amount: amount, count: num(e.count), hikazei: !!e.hikazei, tax: tax };
    });
    var totalMin = days.reduce(function (a, d) { return a + d.min; }, 0);
    var totalAmount = days.reduce(function (a, d) { return a + d.amount; }, 0);
    var taxableTotal = days.reduce(function (a, d) { return a + (d.hikazei ? 0 : d.amount); }, 0);
    var totalCount = days.reduce(function (a, d) { return a + d.count; }, 0);
    var tax = perDay ? days.reduce(function (a, d) { return a + (d.tax || 0); }, 0) : null;
    return { days: days, count: days.length, totalMin: totalMin, totalAmount: totalAmount, taxableTotal: taxableTotal, totalCount: totalCount, tax: tax, isHei: isHei, taxClass: taxClass };
  }
  function hhmm(min) { min = Math.max(0, num(min)); var h = Math.floor(min / 60), m = min % 60; return h + ':' + ('0' + m).slice(-2); } // 負値は0:00にクランプ(M1)

  return { computeDaily: computeDaily, hhmm: hhmm };
});
