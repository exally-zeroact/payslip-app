/* shotokuzei-hei.js — 所得税「日額表 丙欄」(日雇い) の表引き（純関数）
 * 丙欄=日々雇い入れられる人(日雇い・継続2か月を超えない)に適用。甲欄/乙欄は月額表(算式=電算機計算の特例)だが、
 * ★丙欄は電算機計算の特例が無い=国税庁「日額表」の表引きが正★。年分別テーブルが必要。
 * 出典: 国税庁 給与所得の源泉徴収税額表(令和8年分) 日額表 08-14.pdf を機械抽出した実値(2026-07照合)。
 *   令和8年分: その日の社保控除後の日額 9,800円未満=0 / 100円刻み(以上9,800〜未満24,000で142段・24,000で738円)。
 * 【利用】ブラウザ window.ShotokuzeiHei / Node require('./shotokuzei-hei.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.ShotokuzeiHei = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  // 令和8年分 日額表 丙欄(実値)。arr[i] = 日額 (9800 + i*100) 〜 未満(+100) の税額。
  var HEI_R8 = { start: 9800, step: 100, arr: [1,5,8,12,15,19,22,26,29,33,36,40,43,47,51,55,58,62,65,69,72,76,79,83,86,90,93,98,101,105,108,112,115,119,122,126,129,133,136,140,144,149,153,157,161,165,169,173,177,181,185,189,193,198,202,206,210,214,218,222,226,230,234,238,242,247,251,255,259,263,267,271,275,279,283,287,292,296,300,304,308,312,316,320,324,328,332,336,341,345,349,353,357,361,365,369,373,378,386,395,403,411,419,427,435,444,452,460,468,476,484,493,501,509,517,525,533,542,550,558,566,574,582,591,599,607,615,623,631,640,648,656,664,672,681,689,697,705,713,721,730,738] };
  // 年分別テーブル(年度キー)。現状R8のみ。hydrate()で中央データ上書き可。
  var HEI_BY_YEAR = { 2026: HEI_R8 };
  var LATEST = 2026;
  // opts.year → 収録テーブル選択。2026以降=当年(無ければ最新)/2026未満=直近収録(=2026)。
  function tableFor(year) {
    var y = parseInt(year, 10);
    if (!y || y < LATEST) return HEI_BY_YEAR[LATEST];
    return HEI_BY_YEAR[y] || HEI_BY_YEAR[LATEST];
  }

  // 丙欄税額: その日の社保控除後の日額 → 税額。opts.year(令和8=2026以降)。
  // ※令和7年分以前(year<2026)の丙欄は未収録=令和8表を暫定使用(令和7の日雇いは極稀。要別途照合)。
  // ※日額24,000円以上(日雇いで実質発生しない超高額)は末尾値＋超過分の近似(上限%は割愛)。
  function heiTax(dailyAmount, opts) {
    var amt = num(dailyAmount);
    var T = tableFor(opts && opts.year);
    if (amt < T.start) return 0;
    var i = Math.floor((amt - T.start) / T.step);
    if (i < T.arr.length) return T.arr[i];
    var lastAmt = T.start + T.arr.length * T.step; // =24,000
    return T.arr[T.arr.length - 1] + Math.floor((amt - lastAmt) / T.step * 8.4);
  }

  // 中央(Supabase statutory kind=hei)の値で年分別に上書き。不正なら何もしない=ハードコードのまま(フォールバック)。
  // data 形状: { start:number>0, step:number>0, arr:number[](非空) }。
  function hydrate(year, data) {
    if (!year || !data || typeof data !== 'object') return;
    if (!Array.isArray(data.arr) || data.arr.length === 0) return;
    if (!(typeof data.start === 'number' && data.start > 0)) return;
    if (!(typeof data.step === 'number' && data.step > 0)) return;
    HEI_BY_YEAR[parseInt(year, 10)] = { start: data.start, step: data.step, arr: data.arr.slice() };
  }
  return { heiTax: heiTax, HEI_R8: HEI_R8, HEI_BY_YEAR: HEI_BY_YEAR, hydrate: hydrate };
});
