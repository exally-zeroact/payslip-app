/* shiharai-chosho.js — K3 源泉徴収(報酬・料金 204条)＋支払調書 の純関数。
 *   ★法定値は docs/SPEC_gensen_shiharai_tax_K3.md（国税庁 一次情報照合・出典URL付き）に準拠。実数値テストで1円一致。
 *   ★不可侵ガード: 運転代行・運送・軽貨物=204条非該当=源泉なし・支払調書なし。既定は「非該当」。全業務委託に源泉を掛けない。
 *   復興特別所得税込: 10.21%=10%×1.021 / 20.42%=20%×1.021。端数=1円未満切り捨て。
 *   区分(実装): none 非該当 / ippan 一般・士業(A) / shihou 司法書士等(B) / gaikou 外交員等(C) / sonota その他(要確認=非該当扱い)。
 *   出典: No.2795/2798(A) No.2801(B) No.2804(C) No.6929(税込/税抜) No.7431(支払調書) No.2793(義務者)。
 *   【利用】ブラウザ window.ShiharaiChosho / Node require('./shiharai-chosho.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ShiharaiChosho = api;
  else if (typeof globalThis !== 'undefined') globalThis.ShiharaiChosho = api;
})(this, function () {
  'use strict';

  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  var R1 = 0.1021, R2 = 0.2042; // 10.21% / 20.42%(復興込)

  // 報酬区分の器。gensen=204条該当(源泉対象&支払調書対象)か。threshold=支払調書 提出金額基準(超で提出)。
  //  ★'none'/'sonota'=非該当=源泉0・支払調書 対象外(不可侵)。sonota=区分曖昧の逃がし先(捏造で率を作らない)。
  var KUBUN = {
    none: { key: 'none', label: '非該当（運転代行・運送・軽貨物等＝源泉なし）', gensen: false, threshold: null },
    ippan: { key: 'ippan', label: '一般の報酬・料金／士業（弁護士・税理士・原稿・講演・デザイン等）', gensen: true, threshold: 50000, formula: 'A' },
    shihou: { key: 'shihou', label: '司法書士・土地家屋調査士・海事代理士', gensen: true, threshold: 50000, formula: 'B' },
    gaikou: { key: 'gaikou', label: '外交員・集金人・電力量計検針人', gensen: true, threshold: 500000, formula: 'C' },
    sonota: { key: 'sonota', label: 'その他（要確認＝非該当扱い・源泉なし）', gensen: false, threshold: null }
  };
  var KUBUN_ORDER = ['none', 'ippan', 'shihou', 'gaikou', 'sonota'];
  function kubunOf(key) { return KUBUN[key] || KUBUN.none; }

  // A: 一般・士業。100万以下=額×10.21% / 100万超=(額−100万)×20.42%+102,100(=100万×10.21%)。
  function gensenA(amount) {
    var a = num(amount); if (a <= 0) return 0;
    if (a <= 1000000) return Math.floor(a * R1);
    return 102100 + Math.floor((a - 1000000) * R2);
  }
  // B: 司法書士等。(額−1万)×10.21%。1万以下=0。
  function gensenB(amount) {
    var a = num(amount); if (a <= 10000) return 0;
    return Math.floor((a - 10000) * R1);
  }
  // C: 外交員等。(その月の報酬 − 控除額)×10.21%。控除額=12万−その月の給与等(残額・0未満は0)。控除後が0以下=0。
  function gensenC(amount, monthlySalary) {
    var a = num(amount);
    var deduct = Math.max(0, 120000 - num(monthlySalary)); // 給与併給時は残額
    var base = a - deduct;
    return base <= 0 ? 0 : Math.floor(base * R1);
  }

  // 区分別 源泉徴収税額。amount=対象額(既定は税込・区分明確なら税抜=呼び出し側で選択済みの額)。
  //  opts.monthlySalary = C(外交員)の同月給与等(控除残の計算用)。非該当/その他=0(不可侵)。
  function gensenFor(kubunKey, amount, opts) {
    var k = kubunOf(kubunKey);
    if (!k.gensen) return 0; // ★非該当(代行/その他)は必ず0
    if (k.formula === 'A') return gensenA(amount);
    if (k.formula === 'B') return gensenB(amount);
    if (k.formula === 'C') return gensenC(amount, (opts && opts.monthlySalary) || 0);
    return 0;
  }

  // 支払調書の提出基準を満たすか(同一人・年間支払合計 annual が threshold 超)。非該当は常に false。
  function meetsThreshold(kubunKey, annual) {
    var k = kubunOf(kubunKey);
    return !!(k.gensen && k.threshold != null && num(annual) > k.threshold);
  }

  // 支払調書 一覧の行。people=[{name, kubun, annualPay, annualGensen}]。
  //  ★源泉額(annualGensen)は明細で実際に源泉した額の年間合計を入力=法定値の単一ソース(当libで再計算しない)。
  //  非該当/基準未満=target:false で対象外(理由つき・SPEC: 代行はデフォルト出さない)。
  function choshoRows(people) {
    return (people || []).map(function (p) {
      var k = kubunOf(p.kubun);
      var annual = num(p.annualPay);
      var target = meetsThreshold(p.kubun, annual);
      var reason = '';
      if (!k.gensen) reason = '204条非該当（支払調書の対象外）';
      else if (!target) reason = '年間支払が提出基準（' + fmtYen(k.threshold) + '超）未満＝対象外';
      return {
        name: p.name || '', kubunKey: k.key, kubunLabel: k.label,
        annualPay: annual, annualGensen: num(p.annualGensen),
        threshold: k.threshold, target: target, reason: reason
      };
    });
  }

  function fmtYen(n) { return '¥' + num(n).toLocaleString('en-US'); }

  return {
    KUBUN: KUBUN, KUBUN_ORDER: KUBUN_ORDER, kubunOf: kubunOf,
    gensenFor: gensenFor, gensenA: gensenA, gensenB: gensenB, gensenC: gensenC,
    meetsThreshold: meetsThreshold, choshoRows: choshoRows
  };
});
