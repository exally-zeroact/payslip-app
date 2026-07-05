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
  // ── 産前産後休業・育児休業の社会保険料免除（月末在籍基準）──
  // 根拠(一次情報): 健保法159条/159条の3・厚年法81条の2/81条の2の2。日本年金機構。
  //  月給(標準報酬月額)分: その月の末日が休業中なら免除(開始=開始日の属する月/終了=終了日翌日の属する月の前月=終了日が月末なら終了月まで)。
  //  令和4年10月改正(育休のみ): 開始月==終了日翌日の属する月==対象月の短期育休でも、同一月内に育休14日以上(暦日・就業予定日除く)なら免除。
  //  賞与分: 産休=賞与支払月末が産休中なら免除(1か月超要件なし)。育休=賞与支払月末を含む連続1か月超(暦日)の育休のみ免除(厚年81条の2第1項ただし書)。
  //  介護休/病休/休業/通常=免除なし。日付未設定=null(呼び出し側で従来フォールバック)。
  function isExemptType(t) { return t === 'sankyu' || t === 'ikukyu' || t === '産休' || t === '育休'; }
  function isIkukyu(t) { return t === 'ikukyu' || t === '育休'; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function lastDateStr(ym) { var y = +String(ym).slice(0, 4), m = +String(ym).slice(5, 7); return String(ym).slice(0, 7) + '-' + pad2(new Date(y, m, 0).getDate()); }
  function addDaysStr(ymd, n) { var d = new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)); d.setDate(d.getDate() + n); return isoOf(d); }
  function addMonthsStr(ymd, n) { var d = new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)); d.setMonth(d.getMonth() + n); return isoOf(d); }
  function inRange(ymd, start, end) { return start <= ymd && ymd <= end; } // 'YYYY-MM-DD'は辞書順=日付順
  // 月給分の免除(bool) / 日付未設定はnull
  function shahoExemptMonthly(o) {
    o = o || {};
    if (!isExemptType(o.leaveType)) return false;          // 介護/病休/休業/なし → 免除なし
    if (!o.startYmd || !o.endYmd) return null;             // 日付未設定 → 呼び出し側フォールバック(従来=全月免除)
    var ym = String(o.ym).slice(0, 7);
    var monthEnd = lastDateStr(ym);
    if (inRange(monthEnd, o.startYmd, o.endYmd)) return true;          // 月末基準
    if (isIkukyu(o.leaveType)) {                                       // 令和4年改正(育休14日)
      var startM = String(o.startYmd).slice(0, 7);
      var endNextM = String(addDaysStr(o.endYmd, 1)).slice(0, 7);      // 終了日の翌日が属する月
      if (startM === ym && endNextM === ym && num(o.leaveDaysInMonth) >= 14) return true;
    }
    return false;
  }
  // 賞与分の免除(bool) / 日付未設定はnull
  function shahoExemptBonus(o) {
    o = o || {};
    if (!isExemptType(o.leaveType)) return false;
    if (!o.startYmd || !o.endYmd) return null;
    var ym = String(o.bonusYm).slice(0, 7);
    var monthEnd = lastDateStr(ym);
    if (!inRange(monthEnd, o.startYmd, o.endYmd)) return false;        // 賞与支払月末が休業中でなければ免除なし
    if (isIkukyu(o.leaveType)) {                                       // 育休=連続1か月超(暦日)のみ
      return o.endYmd >= addMonthsStr(o.startYmd, 1);                  // 応当日以降=1か月超(例 4/15〜5/15)
    }
    return true;                                                       // 産休=1か月超要件なし
  }
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  // ── 社保の当月/翌月徴収 → その月の給与から控除する社保の「月数」(0/1/2) ──
  // 根拠(一次情報): 法定原則=翌月徴収(前月分を報酬から控除・健保法167条/厚年法84条)。資格取得月から・喪失(退職日翌日)の前月分まで。
  //  翌月徴収の月末退職=最終給与で2か月分(前月分＋当月分)/月中退職=1か月分(前月分)/入社月=控除なし(翌月から)。当月徴収=常に当月分1。
  //  timing未指定/'current'=1(現行=当月相当。退職月中の非徴収は呼び出し側の既存shahoMonthに委ねる)。日付未設定=1(回帰ゼロ)。
  function shahoChargeMonths(o) {
    o = o || {};
    var timing = (o.timing === 'next') ? 'next' : 'current';
    if (timing !== 'next') return 1;                    // 当月/既定 = 現行どおり1(退職月中は既存shahoMonthで0)
    var ym = String(o.ym || '').slice(0, 7);
    var jm = ym7(o.joinYmd), tm = ym7(o.taishokuYmd);
    var isJoin = !!(jm && ym === jm), isLeave = !!(tm && ym === tm);
    if (isJoin && isLeave) return 1;                    // 同月得喪
    if (isJoin) return 0;                               // 入社月=翌月から控除→当月は0
    if (isLeave) { var dim = daysInMonthYm(ym); return (day(o.taishokuYmd) >= dim) ? 2 : 1; } // 月末退職=2/月中退職=1(前月分)
    return 1;                                           // 通常月=前月分1
  }
  return { isActiveInMonth: isActiveInMonth, prorateInfo: prorateInfo, daysInMonthYm: daysInMonthYm,
    shahoExemptMonthly: shahoExemptMonthly, shahoExemptBonus: shahoExemptBonus, shahoChargeMonths: shahoChargeMonths };
});
