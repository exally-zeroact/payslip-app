/* nenmatsu.js — 年末調整の所得控除(生命保険料控除・地震保険料控除ほか)。
 * 【一次情報】国税庁 No.1140 生命保険料控除 / No.1145 地震保険料控除(平成24年/平成19年〜の恒久算式・令和8非依存)。
 *   生保: 新旧3区分(一般/介護医療/個人年金)・介護医療は新のみ・各区分と総額に上限・新旧併用は有利側。
 *   地震: 地震保険料(上限5万)＋旧長期損害(経過措置・上限1.5万)、合算上限5万。
 * 端数: 控除額に1円未満が出る算式は円未満切上(国税庁様式の計算欄に準拠)。
 * 【利用】ブラウザ window.Nenmatsu / Node require('./nenmatsu.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Nenmatsu = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  function ceil1(x) { return Math.ceil(x - 1e-9); } // 1円未満切上

  // 新制度(一般/介護医療/個人年金 共通・各上限40,000)
  function seimeiNew(paid) {
    paid = num(paid); if (paid <= 0) return 0;
    if (paid <= 20000) return paid;
    if (paid <= 40000) return ceil1(paid / 2 + 10000);
    if (paid <= 80000) return ceil1(paid / 4 + 20000);
    return 40000;
  }
  // 旧制度(一般/個人年金・各上限50,000)
  function seimeiOld(paid) {
    paid = num(paid); if (paid <= 0) return 0;
    if (paid <= 25000) return paid;
    if (paid <= 50000) return ceil1(paid / 2 + 12500);
    if (paid <= 100000) return ceil1(paid / 4 + 25000);
    return 50000;
  }
  // 一般 or 個人年金 の区分控除額: 新のみ/旧のみ/新旧併用は「旧のみ(上限5万)」と「新旧合算(上限4万)」の有利側
  function seimeiCategory(paidNew, paidOld) {
    paidNew = num(paidNew); paidOld = num(paidOld);
    var vNew = seimeiNew(paidNew), vOld = seimeiOld(paidOld);
    if (paidNew > 0 && paidOld > 0) return Math.max(vOld, Math.min(40000, vNew + vOld)); // 併用
    return paidOld > 0 ? vOld : vNew; // 旧のみ / 新のみ(または0)
  }
  // 生命保険料控除 合計(総上限120,000)。o={generalNew,generalOld,kaigo,pensionNew,pensionOld}
  function seimeiKojo(o) {
    o = o || {};
    var general = seimeiCategory(o.generalNew, o.generalOld);
    var kaigo = seimeiNew(o.kaigo);              // 介護医療は新制度のみ(上限4万)
    var pension = seimeiCategory(o.pensionNew, o.pensionOld);
    return Math.min(120000, general + kaigo + pension);
  }

  // 地震保険料控除。o={jishin, kyuChoki}(旧長期損害保険料=経過措置)。合算上限50,000
  function jishinKojo(o) {
    o = o || {};
    var jishin = Math.min(num(o.jishin), 50000);
    var k = num(o.kyuChoki), kyu;
    if (k <= 0) kyu = 0;
    else if (k <= 10000) kyu = k;
    else if (k <= 20000) kyu = ceil1(k / 2 + 5000);
    else kyu = 15000;
    return Math.min(50000, jishin + kyu);
  }

  return {
    num: num, seimeiNew: seimeiNew, seimeiOld: seimeiOld, seimeiCategory: seimeiCategory,
    seimeiKojo: seimeiKojo, jishinKojo: jishinKojo
  };
});
