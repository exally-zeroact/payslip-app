/* periods.js — K2 期間分割（締め方）の純関数。月を 月1/半月/10日/任意N日 の期間に割る。
 *   代行のような 1〜10／11〜20／21〜末（月3回）や任意N日締めの報酬明細を出すための期間定義。
 *   ★計算は決定論・Date依存は月末日算出のみ（うるう年/月長は new Date(y,m,0) で正確）。
 *   【利用】ブラウザ window.Periods / Node require('./periods.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Periods = api;
  else if (typeof globalThis !== 'undefined') globalThis.Periods = api;
})(this, function () {
  'use strict';

  var METHODS = ['monthly', 'half', 'ten', 'ndays']; // 月1 / 半月 / 10日 / 任意N日

  function lastDayOf(y, m) { return new Date(y, m, 0).getDate(); } // m=1..12 → その月の末日
  function pad2(d) { return (d < 10 ? '0' : '') + d; }

  // ym='YYYY-MM', method, n(ndays用) → [{key,label,from,to,fromDay,toDay,days}]
  //  from/to は 'YYYY-MM-DD'。label は「1〜10」「21〜末」等（末日は"末"表記）。
  function buildPeriods(ym, method, n) {
    var y = parseInt(String(ym).slice(0, 4), 10), m = parseInt(String(ym).slice(5, 7), 10);
    if (!(y > 0 && m >= 1 && m <= 12)) return [];
    var last = lastDayOf(y, m);
    method = (METHODS.indexOf(method) >= 0) ? method : 'monthly';
    function per(key, a, b, label) {
      return {
        key: key, label: label || (a + '〜' + (b >= last ? '末' : b)),
        from: ym + '-' + pad2(a), to: ym + '-' + pad2(b), fromDay: a, toDay: b, days: b - a + 1
      };
    }
    if (method === 'half') return [per('P1', 1, 15), per('P2', 16, last)];
    if (method === 'ten') return [per('P1', 1, 10), per('P2', 11, 20), per('P3', 21, last)];
    if (method === 'ndays') {
      var nn = Math.max(1, Math.floor(Number(n)) || 10), out = [], a = 1, i = 1;
      while (a <= last) { var b = Math.min(a + nn - 1, last); out.push(per('P' + i, a, b)); a = b + 1; i++; }
      return out;
    }
    return [per('P1', 1, last, '1〜末')]; // monthly=分割なし(1期間)
  }

  function hasSplit(method) { return method === 'half' || method === 'ten' || method === 'ndays'; }

  // 日別エントリ(e.dailyEntries=[{ymd,...}])のうち、期間 p(from<=ymd<=to) に入るものを返す。
  //  ymd 未設定/範囲外は除外。文字列比較(YYYY-MM-DD は辞書順=日付順)で判定。
  function entriesInPeriod(entries, p) {
    if (!p) return [];
    return (entries || []).filter(function (en) {
      var d = en && en.ymd; return typeof d === 'string' && d >= p.from && d <= p.to;
    });
  }

  // ある ym・締め方における、日付 ymd が属する期間キー(P1/P2/…)。該当なしは null。
  function periodKeyOf(ymd, ym, method, n) {
    var ps = buildPeriods(ym, method, n);
    for (var i = 0; i < ps.length; i++) { if (ymd >= ps[i].from && ymd <= ps[i].to) return ps[i].key; }
    return null;
  }

  return { METHODS: METHODS, buildPeriods: buildPeriods, hasSplit: hasSplit, entriesInPeriod: entriesInPeriod, periodKeyOf: periodKeyOf, lastDayOf: lastDayOf };
});
