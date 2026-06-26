/* warimashi.js — 割増賃金（残業・深夜・休日）計算（純関数）
 * 根拠: 労基法37条+政令(平6第5号)・施行規則19条(月平均所定)・基発150号(端数)
 *  率: 時間外1.25 / 深夜+0.25 / 法定休日1.35 / 月60h超1.5 / 時間外×深夜1.5 / 60h超×深夜1.75 / 法定休日×深夜1.6
 *  1時間単価 = 割増基礎 ÷ 1か月平均所定労働時間((365|366−年間所定休日)×1日所定÷12)・50銭以上切上
 *  端数(基発150号): 単価・各区分割増額は50銭未満切捨/以上切上(han50)。
 * 【利用】ブラウザ window.Warimashi / Node require('./warimashi.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./shakaihoken-hyo.js'));
  } else {
    root.Warimashi = factory(root.SHAKAIHOKEN_HYO);
  }
})(typeof self !== 'undefined' ? self : this, function (SH) {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  // 50銭未満切捨・以上切上（FP安全）
  function han50(x) {
    if (SH && SH.han50) return SH.han50(x);
    var n = Math.round(x * 100) / 100; var f = n - Math.floor(n);
    return f <= 0.5 ? Math.floor(n) : Math.ceil(n);
  }
  // 「時間」「分」→ 総分
  function hm2min(h, m) { return num(h) * 60 + num(m); }

  // 1か月平均所定労働時間(h)
  function monthlyStdHours(annualHolidays, dailyHours, leap) {
    var yearDays = leap ? 366 : 365;
    var days = yearDays - num(annualHolidays);
    var dh = num(dailyHours);
    if (days <= 0 || dh <= 0) return 0;
    return days * dh / 12;
  }
  // 1時間単価（割増基礎 ÷ 月平均所定・50銭以上切上）
  function hourlyUnit(base, monthlyStdH) {
    if (!(monthlyStdH > 0)) return 0;
    return han50(num(base) / monthlyStdH);
  }

  // 全率（詳細モードの排他7区分）
  var RATE = { ot: 1.25, otNight: 1.5, over60: 1.5, over60Night: 1.75, night: 0.25, holiday: 1.35, holidayNight: 1.6 };

  // components: [{key,label,rate,minutes}] → 各区分 amt=han50(unit*rate*分/60)・total=Σ
  function calc(unit, components) {
    unit = num(unit);
    var lines = (components || []).filter(function (c) { return num(c.minutes) > 0; }).map(function (c) {
      var hours = num(c.minutes) / 60;
      var raw = unit * num(c.rate) * hours;
      return { key: c.key, label: c.label, rate: num(c.rate), minutes: num(c.minutes), hours: hours, raw: raw, amount: han50(raw) };
    });
    var total = lines.reduce(function (a, x) { return a + x.amount; }, 0);
    return { unit: unit, lines: lines, total: total };
  }

  // かんたん: 残業(総)/深夜/休日 の総分 → 増分方式 components
  //  残業は全時間×1.25、深夜は+0.25、月60h超は+0.25(=1.5)、休日は×1.35。
  //  (深夜/60h超は残業に内包される時間への“上乗せ”なので増分。詳細の排他区分と同額になる)
  function easyComponents(otMin, nightMin, holidayMin) {
    otMin = num(otMin); nightMin = num(nightMin); holidayMin = num(holidayMin);
    var over60 = Math.max(0, otMin - 60 * 60); // 月60時間=3600分 超
    var c = [];
    if (otMin > 0) c.push({ key: 'ot', label: '残業（時間外）', rate: RATE.ot, minutes: otMin });
    if (nightMin > 0) c.push({ key: 'night', label: '深夜割増', rate: RATE.night, minutes: nightMin });
    if (over60 > 0) c.push({ key: 'over60inc', label: '月60時間超（追加）', rate: 0.25, minutes: over60 });
    if (holidayMin > 0) c.push({ key: 'holiday', label: '法定休日', rate: RATE.holiday, minutes: holidayMin });
    return c;
  }

  // 詳細モード：排他7区分（各区分に総分を直接入力・率は全率）
  var DETAIL = [
    ['ot', '時間外（〜60h）', 'ot'], ['otNight', '時間外×深夜', 'otNight'],
    ['over60', '月60時間超', 'over60'], ['over60Night', '60h超×深夜', 'over60Night'],
    ['night', '所定内深夜', 'night'], ['holiday', '法定休日', 'holiday'], ['holidayNight', '法定休日×深夜', 'holidayNight']
  ];
  // seg: {ot,otNight,over60,over60Night,night,holiday,holidayNight} 各=総分
  function detailComponents(seg) {
    seg = seg || {};
    return DETAIL.map(function (d) { return { key: d[0], label: d[1], rate: RATE[d[2]], minutes: num(seg[d[0]]) }; });
  }
  function detail(opts) {
    var unit = hourlyUnit(opts.base, monthlyStdHours(opts.annualHolidays, opts.dailyHours, opts.leap));
    return calc(unit, detailComponents(opts.seg || {}));
  }

  // かんたん総合: 入力(時間/分)→ 割増合計
  function easy(opts) {
    var unit = hourlyUnit(opts.base, monthlyStdHours(opts.annualHolidays, opts.dailyHours, opts.leap));
    var comps = easyComponents(hm2min(opts.otH, opts.otM), hm2min(opts.nightH, opts.nightM), hm2min(opts.holidayH, opts.holidayM));
    return calc(unit, comps);
  }

  // ── 歩合給(出来高払) ──
  // 歩合の1時間単価 = 歩合給総額 ÷ "総"労働時間(所定+時間外含む)。固定給(÷所定×1.25)とは別。
  function commissionUnit(commissionTotal, totalWorkMin) {
    var h = num(totalWorkMin) / 60; return h > 0 ? num(commissionTotal) / h : 0;
  }
  // 歩合の割増は割増部分のみ: 時間外+0.25 / 深夜+0.25 / 法定休日+0.35 (1.0は歩合総額に含むため)
  function commissionComponents(seg) {
    seg = seg || {};
    return [
      { key: 'ot', label: '歩合 時間外', rate: 0.25, minutes: num(seg.ot) },
      { key: 'night', label: '歩合 深夜', rate: 0.25, minutes: num(seg.night) },
      { key: 'holiday', label: '歩合 法定休日', rate: 0.35, minutes: num(seg.holiday) }
    ];
  }
  // 歩合の割増合計(端数は各区分50銭→合算)
  function commission(opts) {
    var unit = commissionUnit(opts.commissionTotal, opts.totalWorkMin);
    return calc(unit, commissionComponents(opts.seg || {}));
  }
  // 保障給/「高い方」: 歩合実績 と 時間給ベース保障(時給×総労働時間) の高い方
  function higherOf(a, b) { return Math.max(num(a), num(b)); }
  function guaranteePay(hourlyGuarantee, totalWorkMin) { return Math.round(num(hourlyGuarantee) * num(totalWorkMin) / 60); }
  // 最低賃金チェック: (賃金合計 ÷ 総労働時間) ≧ 地域別最賃 か(割増/通勤は分子から除く前提で呼ぶ)
  function minWageHourly(basePayTotal, totalWorkMin) { var h = num(totalWorkMin) / 60; return h > 0 ? num(basePayTotal) / h : 0; }
  function minWageOk(basePayTotal, totalWorkMin, minWage) { return minWageHourly(basePayTotal, totalWorkMin) >= num(minWage) - 1e-9; }

  return {
    num: num, han50: han50, hm2min: hm2min,
    commissionUnit: commissionUnit, commissionComponents: commissionComponents, commission: commission,
    higherOf: higherOf, guaranteePay: guaranteePay, minWageHourly: minWageHourly, minWageOk: minWageOk,
    monthlyStdHours: monthlyStdHours, hourlyUnit: hourlyUnit,
    RATE: RATE, calc: calc, easyComponents: easyComponents, easy: easy,
    DETAIL: DETAIL, detailComponents: detailComponents, detail: detail
  };
});
