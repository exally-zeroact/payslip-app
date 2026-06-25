/* shotokuzei-densan.js — 源泉所得税「電算機計算の特例」(甲欄・令和3〜7年分)
 * 出典: 国税庁「月額表の甲欄を適用する給与等に対する税額の電算機計算の特例について」(令和3〜7年分)
 *   https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2022/data/denshi_10.pdf
 * 月額表の打ち切り(課税302,000で頭打ち→0)問題を根本解決。全所得レンジで正しい税額を返す。
 * A = その月の社会保険料等控除後の給与等の金額(円・整数)。fuyou = 扶養親族等の数(源泉控除対象配偶者を含む)。
 * 【利用】ブラウザ window.ShotokuzeiDensan / Node require('./shotokuzei-densan.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.ShotokuzeiDensan = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FUYOU_KOJO = 31667;      // 第2表: 配偶者控除/扶養控除 1人あたり(月)
  function ceil1(x) { return Math.ceil(x - 1e-9); }      // 1円未満切上
  function round10(x) { return Math.round(x / 10) * 10; } // 10円未満四捨五入

  // 第1表 給与所得控除の額
  function kyuyoKojo(A) {
    if (A <= 135416) return 45834;
    if (A <= 149999) return ceil1(A * 0.40 - 8333);
    if (A <= 299999) return ceil1(A * 0.30 + 6667);
    if (A <= 549999) return ceil1(A * 0.20 + 36667);
    if (A <= 708330) return ceil1(A * 0.10 + 91667);
    return 162500;
  }
  // 第3表 基礎控除の額
  function kisoKojo(A) {
    if (A <= 2162499) return 40000;
    if (A <= 2204166) return 26667;
    if (A <= 2245833) return 13334;
    return 0;
  }
  // 第4表 課税給与所得金額(B)に対する税額
  function zeiFromB(B) {
    var t;
    if (B <= 162500) t = B * 0.05105;
    else if (B <= 275000) t = B * 0.10210 - 8296;
    else if (B <= 579166) t = B * 0.20420 - 36374;
    else if (B <= 750000) t = B * 0.23483 - 54113;
    else if (B <= 1500000) t = B * 0.33693 - 130688;
    else if (B <= 3333333) t = B * 0.40840 - 237893;
    else t = B * 0.45945 - 408061;
    return round10(t);
  }
  // A: 社会保険料控除後の給与等の金額, fuyou: 扶養親族等の数(配偶者含む)
  function calc(A, fuyou) {
    A = Math.floor(Math.max(0, A || 0));
    if (A <= 0) return 0;
    var f = Math.max(0, Math.floor(fuyou || 0));
    var B = A - kyuyoKojo(A) - FUYOU_KOJO * f - kisoKojo(A);
    if (B <= 0) return 0;
    return zeiFromB(B);
  }
  return { calc: calc, kyuyoKojo: kyuyoKojo, kisoKojo: kisoKojo, zeiFromB: zeiFromB, FUYOU_KOJO: FUYOU_KOJO, NENDO: '令和3〜7年分' };
});
