/* shoyo-zei.js — 賞与（ボーナス）の源泉所得税・社会保険料（純関数）
 * ================================================================
 * 【一次情報】
 *  源泉: 国税庁「賞与に対する源泉徴収税額の算出率の表」(denshi 別表第三) / No.2523 賞与に対する源泉徴収
 *   ⑴ 前月中の給与等(賞与除く)−その社会保険料等 = 前月課税ベース
 *   ⑵ 扶養親族等の数 と ⑴ で甲欄の率(賞与の金額に乗ずべき率)を引く
 *   ⑶ 賞与の源泉 = (賞与 − 賞与の社会保険料等) × 率   ※率は復興特別所得税込み
 *   特例: 前月給与が無い/社保以下、または (賞与−社保) が 前月課税ベースの10倍超 → この表によらず月額表で計算
 *  社保: 日本年金機構「賞与にかかる保険料」標準賞与額=賞与総額(税引前)の1,000円未満切捨
 *   健保=標準賞与額(年度累計573万上限)×健保率÷2 / 厚年=標準賞与額(1回150万上限)×18.3%÷2
 *   介護=標準賞与額×介護率÷2 / 雇用=賞与総額×雇用保険料率(従業員)
 * 【年度キー】賞与支給月(payYm)の年分で算出率表を選択(所得税densanと同型)。令和8(2026)を収録。
 *  ※健保/介護率・標準賞与額上限は呼出側が shakaihoken-hyo の年度選択値を渡す。
 * 【乙欄】令和8の乙欄(申告書なし)も収録(公式PDFを画面描画で読み取り): 前月社保控除後給与で5段階
 *   〜224千円=10.210% / 224〜295=20.420% / 295〜527=30.630% / 527〜1,118=38.798% / 1,118千円〜=45.945%
 * 【利用】ブラウザ window.ShoyoZei / Node require('./shoyo-zei.js')
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(require("./shotokuzei-densan.js")); }
  else { root.ShoyoZei = factory(root.ShotokuzeiDensan); }
})(typeof self !== "undefined" ? self : this, function (Densan) {
  "use strict";
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, "")); return isNaN(n) ? 0 : n; }
  // 端数: 50銭以下切捨・超切上(社保と同じ han50)。賞与社保もこの丸め。
  function han50(x) { var n = Math.round(x * 100) / 100; var f = n - Math.floor(n); return f <= 0.5 ? Math.floor(n) : Math.ceil(n); }

  // 賞与の金額に乗ずべき率(%)。index=率、各扶養人数(0..7)の「前月の社保控除後給与」下限(以上・千円)。
  // 0%は最初の下限未満。率は復興特別所得税込み。出典: 国税庁 令和8年分 算出率表(甲)。
  var RATES = [0.000, 2.042, 4.084, 6.126, 8.168, 10.210, 12.252, 14.294, 16.336, 18.378, 20.420, 22.462, 24.504, 26.546, 28.588, 30.630, 32.672, 35.735, 38.798, 41.861, 45.945];
  // 各扶養人数の下限(千円)。RATES と同じ並び。0番目(0%)の下限は0(=その人数の最初のしきい値未満は0%)。
  var KOU_2026 = {
    0: [0, 82, 94, 260, 309, 342, 372, 402, 433, 520, 605, 684, 715, 752, 795, 854, 922, 1318, 1521, 2621, 3495],
    1: [0, 107, 250, 289, 346, 373, 401, 430, 463, 520, 621, 705, 739, 778, 821, 882, 952, 1342, 1526, 2645, 3527],
    2: [0, 143, 276, 321, 377, 400, 426, 457, 492, 525, 636, 728, 764, 804, 848, 910, 983, 1367, 1526, 2669, 3559],
    3: [0, 181, 300, 354, 405, 424, 452, 484, 517, 550, 651, 751, 788, 830, 876, 938, 1013, 1391, 1538, 2693, 3590],
    4: [0, 218, 300, 387, 431, 452, 477, 509, 540, 577, 666, 774, 813, 856, 903, 966, 1044, 1416, 1555, 2716, 3622],
    5: [0, 251, 304, 412, 457, 479, 503, 531, 564, 604, 681, 798, 838, 881, 930, 994, 1074, 1440, 1555, 2740, 3654],
    6: [0, 284, 343, 438, 483, 505, 527, 553, 589, 630, 697, 821, 862, 907, 957, 1022, 1104, 1464, 1555, 2764, 3685],
    7: [0, 317, 383, 463, 508, 529, 552, 578, 614, 657, 708, 845, 887, 933, 985, 1051, 1135, 1489, 1583, 2788, 3717]
  };
  var KOU_BY_YEAR = { 2026: KOU_2026 };
  // 乙欄(扶養控除等申告書の提出が無い人)。前月の社保控除後給与の下限(千円)→率(%)。出典:国税庁 令和8年分 算出率表(乙)。
  var OTSU_2026 = [[0, 10.210], [224, 20.420], [295, 30.630], [527, 38.798], [1118, 45.945]];
  var OTSU_BY_YEAR = { 2026: OTSU_2026 };
  // 健保: 年度累計上限573万 / 厚年: 1回150万 / 厚年率18.3%(従業員9.15%)
  var KENPO_YEAR_CAP = 5730000, KOSEI_PER_CAP = 1500000, KOSEI_RITSU_JUGYOIN = 0.0915;

  function shoyoYearOf(payYm) { return parseInt(String(payYm == null ? "" : payYm).slice(0, 4), 10) || 2026; }

  // 賞与の率(%)。甲(申告書あり)/乙(なし=taxClass==='otsu')。範囲外年は直近年+stale。
  function bonusRate(prevAfterSI, fuyou, opts) {
    opts = opts || {};
    var year = opts.year || 2026;
    var manYen = num(prevAfterSI) / 1000; // 千円単位で比較(表は千円・以上)
    if (opts.taxClass === "otsu") {
      var ot = OTSU_BY_YEAR[year], ost = false;
      if (!ot) { var oys = Object.keys(OTSU_BY_YEAR).map(Number).sort(function (a, b) { return a - b; }); year = oys[oys.length - 1]; ot = OTSU_BY_YEAR[year]; ost = true; }
      var orate = ot[0][1];
      for (var k = 0; k < ot.length; k++) { if (manYen >= ot[k][0]) orate = ot[k][1]; else break; }
      return { rate: orate, year: year, stale: ost, otsu: true };
    }
    var table = KOU_BY_YEAR[year], stale = false;
    if (!table) { var ys = Object.keys(KOU_BY_YEAR).map(Number).sort(function (a, b) { return a - b; }); year = ys[ys.length - 1]; table = KOU_BY_YEAR[year]; stale = true; }
    var f = Math.max(0, Math.min(7, Math.floor(num(fuyou))));
    var lows = table[f];
    var idx = 0;
    for (var i = 0; i < lows.length; i++) { if (manYen >= lows[i]) idx = i; else break; }
    return { rate: RATES[idx], year: year, stale: stale };
  }

  /** 賞与の源泉所得税。
   * @param {object} o {bonus:賞与総額, bonusSI:賞与の社保合計, prevSalary:前月給与(賞与除く), prevSI:前月の社保, fuyou, taxClass, payYm}
   * @returns {object} {tax, rate, special, otsu, prevAfter} special/otsuは自動算出せずフラグ(税0)
   */
  function calcBonusTax(o) {
    o = o || {};
    var bonus = num(o.bonus), bonusSI = num(o.bonusSI);
    var taxableBonus = Math.max(0, bonus - bonusSI);
    var prevAfter = Math.max(0, num(o.prevSalary) - num(o.prevSI));
    var year = shoyoYearOf(o.payYm);
    var isOtsu = o.taxClass === "otsu";
    var months = num(o.bonusMonths) >= 7 ? 12 : 6; // 賞与計算期間が6か月超なら12・通常6(国税庁 特例)
    // 特例: 前月給与なし/社保以下、または賞与(社保後)が前月課税ベースの10倍超 → 算出率表によらず月額表(電算式)で計算(甲乙共通)。
    //  国税庁式: {(賞与社保後÷月数 + 前月社保後給与)を月額表 − 前月社保後給与を月額表} × 月数。前月なしは前月分=0。
    if (prevAfter <= 0 || taxableBonus > prevAfter * 10) {
      var tax0;
      if (Densan && Densan.calcByClass) {
        var per = Math.floor(taxableBonus / months);
        var cls = isOtsu ? "otsu" : "ko", opt = { year: year };
        var A = Densan.calcByClass(prevAfter + per, num(o.fuyou), cls, opt);
        var B = prevAfter > 0 ? Densan.calcByClass(prevAfter, num(o.fuyou), cls, opt) : 0;
        tax0 = Math.max(0, Math.floor((A - B) * months));
      } else { tax0 = 0; } // Densan未ロード時のみ従来どおり0(呼出側が手計算警告)
      return { tax: tax0, special: true, specialComputed: !!(Densan && Densan.calcByClass), method: "月額表", months: months, otsu: isOtsu, prevAfter: prevAfter, year: year };
    }
    var r = bonusRate(prevAfter, o.fuyou, { taxClass: isOtsu ? "otsu" : "ko", year: year });
    var tax = Math.floor(taxableBonus * r.rate / 100); // 円未満切捨
    return { tax: tax, rate: r.rate, special: false, otsu: isOtsu, prevAfter: prevAfter, year: r.year, stale: r.stale };
  }

  /** 賞与の社会保険料(従業員負担)。
   * @param {object} o {bonus:賞与総額, healthRate:健保従業員率(支援金込), kaigoRate:介護従業員率, hasKaigo, employRate:雇用従業員率,
   *                    ytdKenpoBonus:当年度の既往標準賞与額累計(健保573万上限用・既定0)}
   * @returns {object} {hyojun:標準賞与額, health, kaigo, pension, employ, total, kenpoBase, koseiBase}
   */
  function calcBonusSI(o) {
    o = o || {};
    var bonus = num(o.bonus);
    if (bonus <= 0) return { hyojun: 0, health: 0, kaigo: 0, pension: 0, employ: 0, total: 0, kenpoBase: 0, koseiBase: 0 };
    var hyojun = Math.floor(bonus / 1000) * 1000; // 標準賞与額=1,000円未満切捨
    var ytd = num(o.ytdKenpoBonus);
    var kenpoBase = Math.max(0, Math.min(hyojun, KENPO_YEAR_CAP - ytd)); // 健保: 年度累計573万上限
    var koseiBase = Math.min(hyojun, KOSEI_PER_CAP);                     // 厚年: 1回150万上限
    var healthRate = o.healthRate != null ? num(o.healthRate) : 0.04955;
    var kaigoRate = o.kaigoRate != null ? num(o.kaigoRate) : 0.00795;
    var employRate = o.employRate != null ? num(o.employRate) : 0.0055;
    var health = han50(kenpoBase * healthRate);
    var kaigo = o.hasKaigo ? han50(kenpoBase * kaigoRate) : 0;
    var pension = han50(koseiBase * KOSEI_RITSU_JUGYOIN);
    var employ = han50(bonus * employRate); // 雇用保険は賞与総額ベース
    return { hyojun: hyojun, health: health, kaigo: kaigo, pension: pension, employ: employ, total: health + pension + kaigo + employ, kenpoBase: kenpoBase, koseiBase: koseiBase };
  }

  // 中央(Supabase statutory kind=shoyo)の値で上書き。不正/部分欠落フィールドはskip=ハードコードのまま(フォールバック)。
  // year別: KOU_BY_YEAR[year]=data.kou / OTSU_BY_YEAR[year]=data.otsu。RATES・各上限はグローバル(closure var)を差替。
  function hydrate(year, data) {
    if (!data || typeof data !== "object") return;
    if (year && data.kou && typeof data.kou === "object" && !Array.isArray(data.kou)) {
      var kouOk = true;
      for (var d = 0; d <= 7; d++) { if (!Array.isArray(data.kou[d])) { kouOk = false; break; } }
      if (kouOk) KOU_BY_YEAR[year] = data.kou;
    }
    if (year && Array.isArray(data.otsu) && data.otsu.length &&
        data.otsu.every(function (r) { return Array.isArray(r) && r.length === 2 && typeof r[0] === "number" && typeof r[1] === "number"; })) {
      OTSU_BY_YEAR[year] = data.otsu;
    }
    if (Array.isArray(data.rates) && data.rates.length &&
        data.rates.every(function (v) { return typeof v === "number" && !isNaN(v); })) {
      RATES.length = 0; for (var ri = 0; ri < data.rates.length; ri++) RATES.push(data.rates[ri]); // in-place=export参照も追従(bonusRateもcalcも同一配列)
    }
    if (typeof data.kenpo_year_cap === "number" && !isNaN(data.kenpo_year_cap)) KENPO_YEAR_CAP = data.kenpo_year_cap;
    if (typeof data.kosei_per_cap === "number" && !isNaN(data.kosei_per_cap)) KOSEI_PER_CAP = data.kosei_per_cap;
    if (typeof data.kosei_ritsu_jugyoin === "number" && !isNaN(data.kosei_ritsu_jugyoin)) KOSEI_RITSU_JUGYOIN = data.kosei_ritsu_jugyoin;
  }

  return {
    num: num, han50: han50, shoyoYearOf: shoyoYearOf, bonusRate: bonusRate,
    calcBonusTax: calcBonusTax, calcBonusSI: calcBonusSI, hydrate: hydrate,
    RATES: RATES, KOU_BY_YEAR: KOU_BY_YEAR, OTSU_BY_YEAR: OTSU_BY_YEAR,
    KENPO_YEAR_CAP: KENPO_YEAR_CAP, KOSEI_PER_CAP: KOSEI_PER_CAP,
    KOSEI_RITSU_JUGYOIN: KOSEI_RITSU_JUGYOIN // 厚年従業員率(9.15%)=shakaihoken-hyoと一致をテストで固定(独立UMDのため参照でなくロック)
  };
});
