/* holidays.js — 日本の国民の祝日を自前計算（毎年更新不要）＋所定労働日数の算出（純関数）
 * ================================================================
 * 根拠: 国民の祝日に関する法律。固定日＋ハッピーマンデー(第n月曜)＋春分/秋分(天文近似式・1980〜2099有効)
 *   ＋振替休日(祝日が日曜→次の非祝日平日)＋国民の休日(祝日に挟まれた平日)。
 *   ※2020〜2021の五輪特例移動・2019の改元(天皇誕生日なし/即位の礼)等の一回限り特例は対象外(2023年以降の通常年が対象)。
 *   天皇誕生日は2020年以降 2/23(令和)。
 * 【利用】ブラウザ window.Holidays / Node require('./holidays.js')
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(); }
  else { root.Holidays = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function dow(y, m, d) { return new Date(y, m - 1, d).getDay(); } // 0=日..6=土
  function nthMonday(y, m, n) { var first = dow(y, m, 1); var firstMon = 1 + ((8 - first) % 7); return firstMon + (n - 1) * 7; }
  // 春分/秋分(1980〜2099有効の近似式)
  function shunbun(y) { return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }
  function shubun(y) { return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }

  // その年の祝日(振替・国民の休日 込み)を {('YYYY-MM-DD'): 名称} で返す
  function holidaysOfYear(year) {
    var y = +year, h = {};
    function add(m, d, name) { h[ymd(y, m, d)] = name; }
    add(1, 1, "元日");
    add(1, nthMonday(y, 1, 2), "成人の日");
    add(2, 11, "建国記念の日");
    if (y >= 2020) add(2, 23, "天皇誕生日");
    add(3, shunbun(y), "春分の日");
    add(4, 29, "昭和の日");
    add(5, 3, "憲法記念日");
    add(5, 4, "みどりの日");
    add(5, 5, "こどもの日");
    add(7, nthMonday(y, 7, 3), "海の日");
    add(8, 11, "山の日");
    add(9, nthMonday(y, 9, 3), "敬老の日");
    add(9, shubun(y), "秋分の日");
    add(10, nthMonday(y, 10, 2), "スポーツの日");
    add(11, 3, "文化の日");
    add(11, 23, "勤労感謝の日");

    // 国民の休日: 祝日に挟まれた平日(両隣が祝日・本人は祝日でも日曜でもない)
    var base = {}; for (var k in h) base[k] = 1;
    var d = new Date(y, 0, 1), end = new Date(y, 11, 31);
    while (d <= end) {
      var ky = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
      if (!base[ky] && d.getDay() !== 0) {
        var prev = new Date(d.getTime() - 86400000), next = new Date(d.getTime() + 86400000);
        var kp = ymd(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
        var kn = ymd(next.getFullYear(), next.getMonth() + 1, next.getDate());
        if (base[kp] && base[kn]) h[ky] = "国民の休日";
      }
      d = new Date(d.getTime() + 86400000);
    }
    // 振替休日: 祝日が日曜→次の「祝日でない日」を振替休日に(2007年以降の運用)
    Object.keys(base).forEach(function (key) {
      var p = key.split("-"); var dt = new Date(+p[0], +p[1] - 1, +p[2]);
      if (dt.getDay() === 0) {
        var c = new Date(dt.getTime() + 86400000);
        while (h[ymd(c.getFullYear(), c.getMonth() + 1, c.getDate())]) c = new Date(c.getTime() + 86400000);
        h[ymd(c.getFullYear(), c.getMonth() + 1, c.getDate())] = "振替休日";
      }
    });
    return h;
  }

  // 'YYYY-MM' のその月の祝日 [{day, name}]
  function holidaysInMonth(ym) {
    var y = +String(ym).slice(0, 4), m = +String(ym).slice(5, 7);
    var all = holidaysOfYear(y), out = [];
    Object.keys(all).forEach(function (key) { var p = key.split("-"); if (+p[1] === m) out.push({ day: +p[2], name: all[key] }); });
    out.sort(function (a, b) { return a.day - b.day; });
    return out;
  }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  // その月の所定労働日数 = 暦日 − 休みの曜日 − 祝日 − 会社独自休日
  //  restDows: 休みの曜日 [0..6] / companyHolidays: ['YYYY-MM-DD'...] (会社独自休・任意)
  function scheduledWorkdays(ym, restDows, companyHolidays) {
    var y = +String(ym).slice(0, 4), m = +String(ym).slice(5, 7);
    var rest = {}; (restDows || []).forEach(function (w) { rest[+w] = 1; });
    var hol = holidaysOfYear(y);
    var comp = {}; (companyHolidays || []).forEach(function (s) { comp[s] = 1; });
    var dim = daysInMonth(y, m), cnt = 0;
    for (var d = 1; d <= dim; d++) {
      var key = ymd(y, m, d);
      if (rest[dow(y, m, d)]) continue;        // 休みの曜日
      if (hol[key]) continue;                   // 祝日(振替/国民の休日含む)
      if (comp[key]) continue;                  // 会社独自休
      cnt++;
    }
    return cnt;
  }

  // [startYmd,endYmd]∩当月ym の所定労働日数(産休/育休など月途中の不就労日算定用)。
  //  範囲は当月内にclipし、休みの曜日・祝日・会社独自休を除く。日付未設定/不正/範囲外は0(安全側)。
  function scheduledWorkdaysBetween(ym, restDows, companyHolidays, startYmd, endYmd) {
    var y = +String(ym).slice(0, 4), m = +String(ym).slice(5, 7);
    if (!y || !m) return 0;
    var dim = daysInMonth(y, m);
    var first = ymd(y, m, 1), last = ymd(y, m, dim);
    var s = startYmd ? String(startYmd).slice(0, 10) : '';
    var e = endYmd ? String(endYmd).slice(0, 10) : '';
    if (!s || !e || e < s) return 0;
    var lo = s > first ? s : first;       // 当月内にclip('YYYY-MM-DD'は辞書順=日付順)
    var hi = e < last ? e : last;
    if (hi < lo) return 0;                 // 範囲が当月外
    var rest = {}; (restDows || []).forEach(function (w) { rest[+w] = 1; });
    var hol = holidaysOfYear(y);
    var comp = {}; (companyHolidays || []).forEach(function (k) { comp[k] = 1; });
    var loD = +lo.slice(8, 10), hiD = +hi.slice(8, 10), cnt = 0;
    for (var d = loD; d <= hiD; d++) {
      var key = ymd(y, m, d);
      if (rest[dow(y, m, d)]) continue;    // 休みの曜日
      if (hol[key]) continue;               // 祝日
      if (comp[key]) continue;              // 会社独自休
      cnt++;
    }
    return cnt;
  }

  return {
    holidaysOfYear: holidaysOfYear, holidaysInMonth: holidaysInMonth,
    scheduledWorkdays: scheduledWorkdays, scheduledWorkdaysBetween: scheduledWorkdaysBetween, daysInMonth: daysInMonth,
    shunbun: shunbun, shubun: shubun, nthMonday: nthMonday
  };
});
