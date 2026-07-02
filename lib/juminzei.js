/* juminzei.js — 個人住民税 特別徴収(給与天引き)の月割・退職時の徴収額(純関数)
 * 根拠: 地方税法 第20条の4の2 第6項+第8項(端数計算・特別徴収は100円読替)
 *       第321条の5 第2項(退職等の一括徴収)
 *  特別徴収=6月〜翌5月の12回。年税額を12分割し100円未満端数を初月(6月)に合算。
 *   base=floor(年税額/12/100)*100 / 6月=年税額-base*11 / 7月〜翌5月=base
 *  退職: 翌1/1〜4/30退職=未徴収残額を一括徴収(義務) / 5月退職=当月分のみ /
 *        6/1〜12/31退職=原則 普通徴収へ切替(退職月分のみ徴収)・本人申出あれば一括徴収
 *  ※本来は市区町村の特別徴収税額決定通知書の各月額が正。12分割は通知書が無い場合の簡便/検算用。
 * 【利用】ブラウザ window.Juminzei / Node require('./juminzei.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Juminzei = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  // 特別徴収の徴収順(6月=0番目 … 翌5月=11番目)。6→0,7→1,…,12→6,1→7,…,5→11
  function collectionIndex(month) { month = num(month); return month >= 6 ? month - 6 : month + 6; }
  // 月割額: base=floor(年税額/12/100)*100(100円未満切捨)・6月=年税額-base*11(端数を初月合算)・他=base
  function juminMonthly(annualTax, month) {
    var annual = num(annualTax); if (annual <= 0) return 0;
    var base = Math.floor(annual / 12 / 100) * 100;
    return (num(month) === 6) ? (annual - base * 11) : base;
  }
  // fromMonth(徴収順で含む)〜翌5月の残額 = 年税額 - (6月〜fromMonth直前月の徴収済)
  function juminRemaining(annualTax, fromMonth) {
    var annual = num(annualTax); if (annual <= 0) return 0;
    var base = Math.floor(annual / 12 / 100) * 100, june = annual - base * 11;
    var ci = collectionIndex(fromMonth); // 0..11
    var collectedBefore = ci >= 1 ? (june + base * (ci - 1)) : 0;
    return annual - collectedBefore;
  }
  // その月に給与天引きする住民税額
  //  opts:{annualTax, ym:'YYYY-MM', retireYmd:'YYYY-MM-DD'|'', ikkatsu:bool}
  function juminForMonth(opts) {
    opts = opts || {}; var annual = num(opts.annualTax); if (annual <= 0) return 0;
    var ym = String(opts.ym || ''); var m = ym.length >= 7 ? num(ym.slice(5, 7)) : 0, y = ym.length >= 4 ? num(ym.slice(0, 4)) : 0;
    if (!m) return 0;
    var rt = String(opts.retireYmd || '');
    if (rt.length < 7) return juminMonthly(annual, m); // 退職なし→通常月割
    var ry = num(rt.slice(0, 4)), rM = num(rt.slice(5, 7));
    var ymSeq = y * 12 + (m - 1), rSeq = ry * 12 + (rM - 1); // 暦の年月で絶対順比較
    if (ymSeq < rSeq) return juminMonthly(annual, m); // 退職月より前→通常
    if (ymSeq > rSeq) return 0;                        // 退職月より後→徴収なし(普通徴収/終了)
    // 退職月:
    if (rM >= 1 && rM <= 4) return juminRemaining(annual, rM); // 翌1〜4月退職=残額一括(義務)
    if (rM === 5) return juminMonthly(annual, 5);             // 5月退職=当月のみ
    return opts.ikkatsu ? juminRemaining(annual, rM) : juminMonthly(annual, rM); // 6〜12月=申出で一括/原則退職月分のみ
  }
  return { num: num, collectionIndex: collectionIndex, juminMonthly: juminMonthly, juminRemaining: juminRemaining, juminForMonth: juminForMonth };
});
