/* ledger-agg.js — K4: Exally台帳(pay_ledger)を期間×従業員で集計し、pay-rule.js の ctx を作る純関数。
 *   ★契約=docs/HANDOFF_K4_ledger_to_kyually.md §3(Exally lib/ledger-agg.js と定義一致・ドリフト禁止)。
 *   pay_ledger の data: {uriage(売上), minutes(分), amount, count, hikazei(bool), business, memo}
 *   ctx(pay-rule.jsが食う): { workMin, workDays, sales, commission, count }  ＋ 別枠 hikazeiAmount(非課税支給)
 *   ★workDays=同じ人の同じ日に何行あっても「1日」(異なるymdの数)。
 *   ★commission=amountの合計だが【非課税(hikazei:true)は除く】。非課税ぶんは hikazeiAmount に分離(課税に混ぜない)。
 *   【利用】ブラウザ window.LedgerAgg / Node require('./ledger-agg.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LedgerAgg = api;
  else if (typeof globalThis !== 'undefined') globalThis.LedgerAgg = api;
})(this, function () {
  'use strict';
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  // 1従業員の(期間内)台帳行を集計。rows=[{ymd, data:{uriage,minutes,amount,count,hikazei}}]
  //  返り: { ctx:{workMin,workDays,sales,commission,count}, hikazeiAmount, workDays, rowCount, days:[ymd...] }
  function aggregateEmployee(rows) {
    var days = {}, workMin = 0, sales = 0, cnt = 0, commission = 0, hikazeiAmount = 0, rowCount = 0;
    (rows || []).forEach(function (r) {
      var d = (r && r.data) || {}; rowCount++;
      if (r && r.ymd) days[r.ymd] = 1;                 // ★同日複数行でも1日(キーで畳む)
      workMin += num(d.minutes);
      sales += num(d.uriage);
      cnt += num(d.count);
      if (d.hikazei) hikazeiAmount += num(d.amount);    // 非課税=別枠(課税に混ぜない)
      else commission += num(d.amount);                 // 課税分だけ commission
    });
    var wd = Object.keys(days).length;
    return {
      ctx: { workMin: workMin, workDays: wd, sales: sales, commission: commission, count: cnt },
      hikazeiAmount: hikazeiAmount, workDays: wd, rowCount: rowCount, days: Object.keys(days).sort()
    };
  }

  // 期間×従業員に集計。rows=台帳全行, periods=Periods.buildPeriods()の結果。
  //  返り: { [periodKey]: { label, from, to, employees: { [employeeId]: aggregateEmployee(...) } } }
  function byPeriod(rows, periods) {
    var out = {};
    (periods || []).forEach(function (p) {
      var inP = (rows || []).filter(function (r) { return r && typeof r.ymd === 'string' && r.ymd >= p.from && r.ymd <= p.to; });
      var byEmp = {};
      inP.forEach(function (r) { (byEmp[r.employee_id] = byEmp[r.employee_id] || []).push(r); });
      var emps = {};
      Object.keys(byEmp).forEach(function (eid) { emps[eid] = aggregateEmployee(byEmp[eid]); });
      out[p.key] = { label: p.label, from: p.from, to: p.to, employees: emps };
    });
    return out;
  }

  // ★§5-2 単一ソース原則: 同じ実績を二度数えない。
  //  primary(台帳=正) と fallback(dailyEntries=移行前の手入力) を「日付単位」で畳む。
  //  → ある ymd が primary に1行でもあれば、その日は primary だけ採用（fallback の同日行は捨てる）。
  //     primary に無い ymd だけ fallback を残す（移行期間のデータ欠落を防ぐ）。
  //  これで (employee_id, ymd) の実績は必ずどちらか一方からしか集計されない（合計が倍にならない）。
  //  行形式は aggregateEmployee と同じ [{ymd, data:{minutes,amount,count,hikazei,uriage}}]。
  function unifyByDay(primary, fallback) {
    var covered = {};
    (primary || []).forEach(function (r) { if (r && r.ymd) covered[r.ymd] = 1; });
    var out = (primary || []).slice();
    (fallback || []).forEach(function (r) { if (r && r.ymd && !covered[r.ymd]) out.push(r); });
    return out;
  }

  // 台帳(primary)と手入力(fallback)を単一ソースで畳んでから1従業員集計。
  function unifyEmployee(primary, fallback) { return aggregateEmployee(unifyByDay(primary, fallback)); }

  return { aggregateEmployee: aggregateEmployee, byPeriod: byPeriod, unifyByDay: unifyByDay, unifyEmployee: unifyEmployee };
});
