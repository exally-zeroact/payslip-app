/* taishoku-shotoku.js — 退職所得(退職金)の源泉徴収。★月次給与とは全く別系統(分離課税)★
 *  出典: 国税庁 No.1420 退職所得。
 *  ・退職所得控除額: 勤続20年以下=40万×年(最低80万) / 20年超=800万+70万×(年-20)。勤続年数は1年未満切上。
 *  ・課税退職所得金額=(退職金-控除)×1/2、1000円未満切捨。
 *    - 短期退職手当等(勤続5年以下・非役員): (退職金-控除)のうち300万円超部分は1/2しない。
 *    - 特定役員退職手当等(役員等で勤続5年以下): 1/2しない(全額)。
 *  ・所得税(源泉)=課税退職所得金額に所得税速算表→×102.1%(復興特別所得税)、1円未満切捨。
 *    速算表は nenmatsu.js の sanshutuShotokuZei を再利用(単一ソース)。
 *  ・「退職所得の受給に関する申告書」を提出しない場合=退職金×20.42%(一律・分離)。
 *  ・住民税(分離)=課税退職所得金額×10%(市町村6%+道府県4%・各1円未満切捨。令和4改正で10%控除は廃止)。会社が特別徴収。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./nenmatsu.js'));
  else root.TaishokuShotoku = factory(root.Nenmatsu);
})(typeof self !== 'undefined' ? self : this, function (Nenmatsu) {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }

  // 勤続年数(1年未満切上・最低1年)
  function years(y) { return Math.max(1, Math.ceil(num(y))); }

  // 退職所得控除額
  function taishokuKojo(y) {
    var n = years(y);
    if (n <= 20) return Math.max(800000, 400000 * n);
    return 8000000 + 700000 * (n - 20);
  }

  // 課税退職所得金額(1000円未満切捨)。opts:{shortTerm:勤続5年以下の非役員, officer:役員等で勤続5年以下}
  function kazeiTaishoku(gross, y, opts) {
    opts = opts || {};
    var base = Math.max(0, num(gross) - taishokuKojo(y)); // 控除後(退職金-控除)
    var n = years(y), kazei;
    if (opts.officer && n <= 5) { kazei = base; }                 // 特定役員=1/2なし
    else if (opts.shortTerm && n <= 5) {                          // 短期退職手当等=300万超部分は1/2なし
      kazei = base <= 3000000 ? base / 2 : 1500000 + (base - 3000000);
    } else { kazei = base / 2; }
    return Math.floor(kazei / 1000) * 1000;
  }

  // 退職所得の所得税(源泉)。申告書なし=退職金×20.42% / ありは速算表×1.021・1円未満切捨。
  function incomeTax(gross, y, opts) {
    opts = opts || {};
    if (opts.noReport) return Math.floor(num(gross) * 0.2042);
    var kazei = kazeiTaishoku(gross, y, opts);
    var base = (Nenmatsu && Nenmatsu.sanshutuShotokuZei) ? Nenmatsu.sanshutuShotokuZei(kazei) : 0;
    return Math.floor(base * 1.021);
  }

  // 住民税(分離・課税退職所得金額×10%)。市町村6%+道府県4%を各1円未満切捨。
  function residentTax(gross, y, opts) {
    opts = opts || {};
    if (opts.noReport) { // 申告書なしでも住民税は課税退職所得金額×10%(分離)で徴収
    }
    var kazei = kazeiTaishoku(gross, y, opts);
    return Math.floor(kazei * 0.06) + Math.floor(kazei * 0.04);
  }

  // まとめ
  function compute(o) {
    o = o || {};
    var gross = num(o.gross);
    var kojo = taishokuKojo(o.years);
    var kazei = kazeiTaishoku(gross, o.years, o);
    var tax = incomeTax(gross, o.years, o);
    var jumin = residentTax(gross, o.years, o);
    return { gross: gross, kojo: kojo, kazei: kazei, incomeTax: tax, residentTax: jumin, net: gross - tax - jumin };
  }

  return { num: num, years: years, taishokuKojo: taishokuKojo, kazeiTaishoku: kazeiTaishoku, incomeTax: incomeTax, residentTax: residentTax, compute: compute };
});
