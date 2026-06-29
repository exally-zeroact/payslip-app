/* select.js — 人数・項目数からテンプレ自動選択（実測の収まり上限に基づく）
 * 容量(実測): cols1=支給/控除 各≤20段(40/40) / cols2=各≤10段(20/20) /
 *             vstack1=支給段+控除段 合計≤18 / strips=支給段+控除段 合計≤17(各人)
 * 段=2項目で1段 → rows2(n)=ceil(n/2)
 * ※ここの 'cols'/'vstack'/'strips' は“収まり判定用のファミリ名”(別レイヤ)。
 *   実際の印刷テンプレ名(prefer)は render.js の col2_1/col2_2/col2_3 と col1_1/col1_2/col1_3。
 *   ライブ印刷は app → Render.build(state.prefer) で、本モジュール(自動選択)は現状ライブ未配線(テスト用)。
 * 【利用】ブラウザ window.PayslipSelect / Node require('./select.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.PayslipSelect = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function rows2(n) { return Math.ceil((n || 0) / 2); }

  function capacity(builder, people) {
    if (builder === 'cols') {
      if (people.length === 1) { var p = people[0]; return rows2(p.shikyu.length) <= 20 && rows2(p.kojo.length) <= 20; }
      return people.slice(0, 2).every(function (q) { return rows2(q.shikyu.length) <= 10 && rows2(q.kojo.length) <= 10; });
    }
    if (builder === 'vstack') { var v = people[0]; return (rows2(v.shikyu.length) + rows2(v.kojo.length)) <= 18; }
    if (builder === 'strips') { return people.every(function (s) { return (rows2(s.shikyu.length) + rows2(s.kojo.length)) <= 17; }); }
    return false;
  }

  function choose(people, prefer) {
    var n = people.length;
    if (prefer && prefer !== 'auto') {
      if (prefer === 'vstack' && n === 1) return { builder: 'vstack', fits: capacity('vstack', people) };
      if (prefer === 'cols') return { builder: 'cols', fits: capacity('cols', people) };
      if (prefer === 'strips') return { builder: 'strips', fits: capacity('strips', people) };
    }
    if (n === 1) return { builder: 'cols', fits: capacity('cols', people) };
    if (n === 2) { if (capacity('cols', people)) return { builder: 'cols', fits: true }; return { builder: 'strips', fits: capacity('strips', people) }; }
    return { builder: 'strips', fits: capacity('strips', people) };
  }

  return { rows2: rows2, capacity: capacity, choose: choose };
});
