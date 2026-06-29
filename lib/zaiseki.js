/* zaiseki.js — 在籍判定と入社月/退職月の日割・社保徴収可否（純関数）
 * 根拠: 社保資格喪失日=退職日の翌日、保険料は喪失月の前月分まで(健保法36/156・厚年法14/19)。
 *   退職月の社保=退職日が月末なら徴収あり/月中なら徴収なし。入社月は1か月分(日割しない)。同月得喪は社保あり。
 *   在籍判定は対象月(勤務/締め月)で行う。給与の日割(月給)は在籍暦日/月暦日(v1=暦日)。割増・標準報酬・通勤は日割しない。
 * 日付未設定＆retired運用は従来どおり(prorate:false/shahoMonth:true・常に在籍判定は呼び出し側のretired運用に委ねる)。
 * 【利用】ブラウザ window.Zaiseki / Node require('./zaiseki.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Zaiseki = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function ym7(v) { return v ? String(v).slice(0, 7) : null; }
  function day(v) { return +String(v).slice(8, 10) || 0; }
  // 対象月の暦日数(末日)
  function daysInMonthYm(ym) { var y = +String(ym).slice(0, 4), m = +String(ym).slice(5, 7); return new Date(y, m, 0).getDate(); }
  // 在籍判定: 対象月(勤務/締め月)で[入社月〜退職月]に入るか。日付未設定＆retired運用は従来どおり。
  function isActiveInMonth(e, ym) {
    e = e || {};
    if (e.retired && !e.taishokuYmd) return false;            // 旧来の即除外運用は不変
    if (e.joinYmd && ym < ym7(e.joinYmd)) return false;        // 入社月より前は対象外
    if (e.taishokuYmd && ym > ym7(e.taishokuYmd)) return false; // 退職月の翌月以降は対象外
    return true;
  }
  // 入社月/退職月の日割係数と社保徴収可否
  function prorateInfo(e, ym) {
    e = e || {};
    var jm = ym7(e.joinYmd), tm = ym7(e.taishokuYmd);
    var isJoin = !!(jm && ym === jm), isLeave = !!(tm && ym === tm);
    var res = { prorate: false, factor: 1, shahoMonth: true, isJoin: isJoin, isLeave: isLeave, zd: 0, dim: 0, mid: false };
    if (!isJoin && !isLeave) return res;
    var dim = daysInMonthYm(ym);
    var startD = isJoin ? (day(e.joinYmd) || 1) : 1;
    var endD = isLeave ? (day(e.taishokuYmd) || dim) : dim;
    var zd = Math.max(0, endD - startD + 1); // 在籍暦日(両端含む)
    res.dim = dim; res.zd = zd;
    if (e.payType === '月給') { res.prorate = true; res.factor = dim > 0 ? zd / dim : 1; } // 月給のみ日割(時給/日給/役員は実績ベース)
    var sameMonth = isJoin && isLeave; // 同月得喪=社保あり(免除しない)
    if (isLeave && !sameMonth) { var leaveLast = day(e.taishokuYmd) >= dim; res.shahoMonth = leaveLast; res.mid = !leaveLast; } // 月中退職=社保なし/月末退職=社保あり
    return res;
  }
  return { isActiveInMonth: isActiveInMonth, prorateInfo: prorateInfo, daysInMonthYm: daysInMonthYm };
});
