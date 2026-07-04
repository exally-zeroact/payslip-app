/* chingin-daicho.js — 賃金台帳・部署別集計の組み立て(純関数)
 * 賃金台帳: 保存済み月次(pay_payslips.data)から 従業員別×月 の表データを組む。労基法108条/規則54条。
 * 部署別集計: 月次行を部署でグループ化。
 * 【利用】ブラウザ window.ChinginDaicho / Node require('./chingin-daicho.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.ChinginDaicho = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }

  // records:[{ym:'YYYY-MM',employee_id,data}], year:number, employees:[{id,name}]
  // → [{id,name,monthly:{1..12: data|null}}]（保存済み月だけ値・未保存はnull）
  function buildLedger(records, year, employees) {
    var byKey = {};
    (records || []).forEach(function (r) {
      if (!r) return; var ym = String(r.ym || ''); var y = +ym.slice(0, 4); var m = +ym.slice(5, 7);
      if (y !== year || !(m >= 1 && m <= 12)) return; byKey[r.employee_id + '|' + m] = r.data || {};
    });
    return (employees || []).map(function (e) {
      var monthly = {}; for (var m = 1; m <= 12; m++) monthly[m] = byKey[e.id + '|' + m] || null;
      return { id: e.id, name: e.name, monthly: monthly };
    });
  }

  // ある従業員の年間の 支給/控除 ラベル集合(月をまたいで統一・出現順)
  function ledgerLabels(row) {
    var sh = [], ko = [], sS = {}, sK = {};
    for (var m = 1; m <= 12; m++) {
      var d = row.monthly[m]; if (!d) continue;
      (d.shikyu || []).forEach(function (x) { var l = x.label || ''; if (l && !sS[l]) { sS[l] = 1; sh.push(l); } });
      (d.kojo || []).forEach(function (x) { var l = x.label || ''; if (l && !sK[l]) { sK[l] = 1; ko.push(l); } });
    }
    return { shikyu: sh, kojo: ko };
  }

  function itemVal(list, label) { var f = (list || []).filter(function (x) { return (x.label || '') === label; })[0]; return f ? num(f.value) : 0; }

  // 労働日数/時間・各支給控除の年計
  function ledgerTotals(row) {
    var labels = ledgerLabels(row);
    var t = { days: 0, workMin: 0, otMin: 0, nightMin: 0, holidayMin: 0, shikyuTotal: 0, kojoTotal: 0, net: 0, savedMonths: 0, shikyu: {}, kojo: {} };
    labels.shikyu.forEach(function (l) { t.shikyu[l] = 0; }); labels.kojo.forEach(function (l) { t.kojo[l] = 0; });
    for (var m = 1; m <= 12; m++) {
      var d = row.monthly[m]; if (!d) continue; t.savedMonths++;
      var w = d.work || {};
      t.days += num(w.days); t.workMin += num(w.workMin); t.otMin += num(w.otMin); t.nightMin += num(w.nightMin); t.holidayMin += num(w.holidayMin);
      t.shikyuTotal += num(d.shikyuTotal); t.kojoTotal += num(d.kojoTotal); t.net += num(d.net);
      labels.shikyu.forEach(function (l) { t.shikyu[l] += itemVal(d.shikyu, l); });
      labels.kojo.forEach(function (l) { t.kojo[l] += itemVal(d.kojo, l); });
    }
    return t;
  }

  // 部署別グループ化: rows=[{dept,name,s,k,n}] → {groups:[{dept,rows,sub:{s,k,n}}], total:{s,k,n}}
  function deptGroups(rows) {
    var map = {}, order = [];
    (rows || []).forEach(function (r) {
      var d = r.dept || '未分類';
      if (!map[d]) { map[d] = { dept: d, rows: [], sub: { s: 0, k: 0, n: 0 } }; order.push(d); }
      map[d].rows.push(r); map[d].sub.s += num(r.s); map[d].sub.k += num(r.k); map[d].sub.n += num(r.n);
    });
    var total = { s: 0, k: 0, n: 0 };
    order.forEach(function (d) { total.s += map[d].sub.s; total.k += map[d].sub.k; total.n += map[d].sub.n; });
    return { groups: order.map(function (d) { return map[d]; }), total: total };
  }

  return { buildLedger: buildLedger, ledgerLabels: ledgerLabels, ledgerTotals: ledgerTotals, itemVal: itemVal, deptGroups: deptGroups, _num: num };
});
