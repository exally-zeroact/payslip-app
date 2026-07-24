/* warimashi.js — 割増賃金（残業・深夜・休日）計算（純関数）
 * 根拠: 労基法37条+政令(平6第5号)・施行規則19条(月平均所定)・基発150号(端数)
 *  率: 時間外1.25 / 深夜+0.25 / 法定休日1.35 / 月60h超1.5 / 時間外×深夜1.5 / 60h超×深夜1.75 / 法定休日×深夜1.6
 *  1時間単価 = 割増基礎 ÷ 1か月平均所定労働時間((365|366−年間所定休日)×1日所定÷12)・50銭以上切上
 *  端数(基発150号): 単価・各区分割増額は50銭未満切捨/以上切上(han50Up)。社保用han50(ちょうど50銭は切捨)とは別。
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
  // 社保用：50銭"以下"切捨・超切上（ちょうど50銭は切捨）
  function han50(x) {
    if (SH && SH.han50) return SH.han50(x);
    var n = Math.round(x * 100) / 100; var f = n - Math.floor(n);
    return f <= 0.5 ? Math.floor(n) : Math.ceil(n);
  }
  // 割増用(基発150号)：50銭"未満"切捨・以上切上（ちょうど50銭は切上）
  function han50Up(x) {
    var n = Math.round(x * 100) / 100; var f = n - Math.floor(n);
    return f < 0.5 ? Math.floor(n) : Math.ceil(n);
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
  // 1時間単価（割増基礎 ÷ 月平均所定・基発150号=50銭未満切捨/以上切上=han50Up。社保のhan50とは「ちょうど50銭」が逆）
  function hourlyUnit(base, monthlyStdH) {
    if (!(monthlyStdH > 0)) return 0;
    return han50Up(num(base) / monthlyStdH);
  }

  // 全率（詳細モードの排他7区分）法定下限の既定。会社/従業員でrates上書き可。単一ソース(resolveRates/hydrateもここを読む)。
  //  基本率=ot/holiday/night/over60Add。★合成率(otNight/over60/over60Night/holidayNight)は基本率から派生=常にcalcと一貫(単独設定不可)。
  var RATE = { ot: 1.25, otNight: 1.5, over60: 1.5, over60Night: 1.75, night: 0.25, holiday: 1.35, holidayNight: 1.6, over60Add: 0.25 };
  function r4(x) { return Math.round(x * 10000) / 10000; } // 合成のFP誤差を丸め
  // 合成率を基本率から再計算(基本率が変わった後に呼ぶ)。detailComponentsの合成式と同一=表示RATE.otNight等が計算値と乖離しない。
  function syncComposites() {
    RATE.otNight = r4(RATE.ot + RATE.night);
    RATE.over60 = r4(RATE.ot + RATE.over60Add);
    RATE.over60Night = r4(RATE.ot + RATE.over60Add + RATE.night);
    RATE.holidayNight = r4(RATE.holiday + RATE.night);
  }
  // 率オーバーライド解決：基本率(ot/holiday)＋増分(night/over60Add)。未指定は法定下限(RATEを単一ソースに参照)。会社は上げられる。
  function resolveRates(rates) {
    var r = rates || {};
    return {
      ot: r.ot != null && r.ot !== '' ? num(r.ot) : RATE.ot,
      holiday: r.holiday != null && r.holiday !== '' ? num(r.holiday) : RATE.holiday,
      night: r.night != null && r.night !== '' ? num(r.night) : RATE.night,
      over60Add: r.over60Add != null && r.over60Add !== '' ? num(r.over60Add) : RATE.over60Add
    };
  }

  // 割増率が法定下限を下回るものを列挙(労基37条)。会社は上げてよいが下回りは違法の恐れ。
  //  rates=会社上書き(pctRate後の倍率: 時間外1.25/休日1.35/深夜+0.25/60h超+0.25)。未指定はRATE既定=下限=対象外。
  //  下限はRATE(法定下限の単一ソース・中央hydrateで引上げも追随)を参照。返り[{key,label,floor,value}]。
  var FLOOR_LABELS = { ot: '時間外', holiday: '法定休日', night: '深夜(上乗せ)', over60Add: '月60時間超(上乗せ)' };
  function belowLegalRates(rates) {
    var R = resolveRates(rates);
    var floors = { ot: RATE.ot, holiday: RATE.holiday, night: RATE.night, over60Add: RATE.over60Add };
    var out = [];
    ['ot', 'holiday', 'night', 'over60Add'].forEach(function (k) {
      if (R[k] < floors[k] - 1e-9) out.push({ key: k, label: FLOOR_LABELS[k], floor: floors[k], value: R[k] });
    });
    return out;
  }

  // 36協定の時間外労働 上限(労基36条)。当月の時間外(分)・法定休日労働(分)に対し 'none'|'over45'|'over100'。
  //  ★上限は2本立て: 原則 月45h=「時間外のみ」(休日含まず) / 単月100h未満=「時間外＋休日労働の合計」★。
  //  over45=時間外>45h / over100=(時間外+休日)>=100h。複数月80h平均は履歴要=別途。黄・非ブロック注意向き。
  function overtimeLimitLevel(otMin, holidayMin) {
    var ot = num(otMin), combined = ot + num(holidayMin);
    if (combined >= 100 * 60) return 'over100'; // 時間外＋休日=単月100h以上
    if (ot > 45 * 60) return 'over45';          // 時間外のみ=月45h超
    return 'none';
  }

  // 36協定 特別条項の複数月/年の上限(労基36条)。months=[{otMin,holidayMin},...] 分単位・古い→新しい(当月が最後)。
  //  - 複数月平均: 当月を末尾に2〜6ヶ月連続の「時間外＋休日」平均が80h超 → over80(最も超過するwindow)
  //  - 年720h: 直近12ヶ月(あるだけ)の「時間外のみ(休日除く)」合計が720h超 → over720
  //  - 月45h超が年6回まで: 直近12ヶ月で時間外>45hの月数 → over45count(6超で違反)
  //  ★特別条項でも超えられない絶対上限。単月100h(時間外+休日)は overtimeLimitLevel が別途判定。黄・非ブロック向け。
  function overtime36Check(months) {
    var ms = (months || []).map(function (m) { return { ot: num(m && m.otMin), hd: num(m && m.holidayMin) }; });
    var n = ms.length, res = { over80: null, over720: null, over45count: 0 };
    for (var w = 2; w <= 6 && w <= n; w++) {
      var sum = 0; for (var i = n - w; i < n; i++) sum += ms[i].ot + ms[i].hd;
      var avg = sum / w;
      if (avg > 80 * 60 + 1e-9 && (!res.over80 || avg > res.over80.avgMin)) res.over80 = { months: w, avgMin: avg };
    }
    var last12 = ms.slice(Math.max(0, n - 12));
    var yrOt = last12.reduce(function (a, m) { return a + m.ot; }, 0);
    if (yrOt > 720 * 60 + 1e-9) res.over720 = { totalMin: yrOt };
    res.over45count = last12.filter(function (m) { return m.ot > 45 * 60 + 1e-9; }).length;
    return res;
  }

  // 年間所定労働時間が法定(週40h)の目安を超えるか(労基32条)。年間休日が少ない/所定が長いと超える。
  //  ★変形労働時間制なら適法もあり得る=グレー→黄色注意向き(ブロックしない)。判定は週平均で行い、
  //   週休2日8h(=週40h相当)の標準を誤警告しない(閾値40.1h/週)。材料不足(所定0/年間休日未入力)はnull。
  function annualHoursCheck(annualHolidays, dailyHours, leap) {
    if (annualHolidays == null || annualHolidays === '') return null;
    var dh = num(dailyHours); if (dh <= 0) return null;
    var yearDays = leap ? 366 : 365;
    var workDays = Math.max(0, yearDays - num(annualHolidays));
    var annualHours = workDays * dh;
    var avgWeekly = annualHours / (yearDays / 7);
    var legalWeekly = 40;
    return { annualHours: annualHours, avgWeekly: avgWeekly, legalWeekly: legalWeekly, workDays: workDays, over: avgWeekly > legalWeekly + 0.1 };
  }

  // 中央(Supabase statutory kind=warimashi)の値でRATEを上書き。年度キーではない=法定"最低"の固定値だが、
  //  将来の法改正(例: 割増率引上げ)を中央から配信して即反映できるようにする。数値のみ受理・不正はフォールバック(RATE不変)。
  //  ★基本率(ot/holiday/night/over60Add)のみ受理し、合成率は基本率から派生(単独設定を許すと計算値と乖離するため)。数値のみ受理・不正はフォールバック(RATE不変)。
  //  data 例: { ot:1.25, holiday:1.35, night:0.25, over60Add:0.25 }
  function hydrate(data) {
    if (!data || typeof data !== 'object') return;
    ['ot', 'holiday', 'night', 'over60Add'].forEach(function (k) {
      var v = data[k];
      if (typeof v === 'number' && isFinite(v)) RATE[k] = v;
    });
    syncComposites(); // 合成率を基本率に追従させる(乖離防止)
  }

  // components: [{key,label,rate,minutes}] → 各区分 amt=han50(unit*rate*分/60)・total=Σ
  function calc(unit, components) {
    unit = num(unit);
    var lines = (components || []).filter(function (c) { return num(c.minutes) > 0; }).map(function (c) {
      var hours = num(c.minutes) / 60;
      var raw = unit * num(c.rate) * hours;
      return { key: c.key, label: c.label, rate: num(c.rate), minutes: num(c.minutes), hours: hours, raw: raw, amount: han50Up(raw) };
    });
    var total = lines.reduce(function (a, x) { return a + x.amount; }, 0);
    return { unit: unit, lines: lines, total: total };
  }

  // かんたん: 残業(総)/深夜/休日 の総分 → 増分方式 components
  //  残業は全時間×1.25、深夜は+0.25、月60h超は+0.25(=1.5)、休日は×1.35。
  //  (深夜/60h超は残業に内包される時間への“上乗せ”なので増分。詳細の排他区分と同額になる)
  //  minashiMin=固定残業(みなし)時間(分)。時間外(ot)の基本割増(1.25)から控除し超過分のみ支払う。
  //  深夜割増・60h超増分は実残業ベースで別途支払う(固定残業代は深夜/60h超の割増を充当できない＝法令)。
  function easyComponents(otMin, nightMin, holidayMin, rates, minashiMin) {
    otMin = num(otMin); nightMin = num(nightMin); holidayMin = num(holidayMin); minashiMin = num(minashiMin);
    var R = resolveRates(rates);
    var over60 = Math.max(0, otMin - 60 * 60); // 月60時間=3600分 超(実残業で判定)
    var paidOt = Math.max(0, otMin - minashiMin); // 固定残業(みなし)分を時間外の基本割増から控除
    var c = [];
    if (paidOt > 0) c.push({ key: 'ot', label: '残業（時間外）', rate: R.ot, minutes: paidOt });
    if (nightMin > 0) c.push({ key: 'night', label: '深夜割増', rate: R.night, minutes: nightMin });
    if (over60 > 0) c.push({ key: 'over60inc', label: '月60時間超（追加）', rate: R.over60Add, minutes: over60 });
    if (holidayMin > 0) c.push({ key: 'holiday', label: '法定休日', rate: R.holiday, minutes: holidayMin });
    return c;
  }

  // 詳細モード：排他7区分（各区分に総分を直接入力・率は全率）
  var DETAIL = [
    ['ot', '時間外（〜60h）', 'ot'], ['otNight', '時間外×深夜', 'otNight'],
    ['over60', '月60時間超', 'over60'], ['over60Night', '60h超×深夜', 'over60Night'],
    ['night', '所定内深夜', 'night'], ['holiday', '法定休日', 'holiday'], ['holidayNight', '法定休日×深夜', 'holidayNight']
  ];
  // seg: {ot,otNight,over60,over60Night,night,holiday,holidayNight} 各=総分
  // nightInc=深夜割増の増分(既定0.25=法定25%・会社が上げられる)。深夜が絡む区分は base率+nightInc。
  // rates上書き可。深夜が絡む区分は base率+night、60h超は ot+over60Add（合成式＝片方上げたら連動）
  function detailComponents(seg, rates) {
    seg = seg || {}; var R = resolveRates(rates);
    var r4 = function (x) { return Math.round(x * 10000) / 10000; }; // 合成のFP誤差を丸め
    var rateOf = { ot: r4(R.ot), otNight: r4(R.ot + R.night), over60: r4(R.ot + R.over60Add), over60Night: r4(R.ot + R.over60Add + R.night), night: r4(R.night), holiday: r4(R.holiday), holidayNight: r4(R.holiday + R.night) };
    return DETAIL.map(function (d) { return { key: d[0], label: d[1], rate: rateOf[d[0]], minutes: num(seg[d[0]]) }; });
  }
  function detail(opts) {
    // opts.unit(1時間あたり賃金額)を明示指定できる=時給/日給の労基則19条単価用(時給=時給額 / 日給=日給÷1日所定)。未指定は従来(月給=基礎÷月平均所定)。
    var unit = (opts.unit != null) ? han50Up(num(opts.unit)) : hourlyUnit(opts.base, monthlyStdHours(opts.annualHolidays, opts.dailyHours, opts.leap));
    var seg = opts.seg || {};
    if (num(opts.minashiMin) > 0) { // 固定残業(みなし)分を時間外(〜60h)区分から控除
      seg = Object.assign({}, seg); seg.ot = Math.max(0, num(seg.ot) - num(opts.minashiMin));
    }
    return calc(unit, detailComponents(seg, opts.rates));
  }

  // かんたん総合: 入力(時間/分)→ 割増合計。opts.rates で率上書き可。
  function easy(opts) {
    // opts.unit(1時間あたり賃金額)を明示指定できる=時給/日給の労基則19条単価用。未指定は従来(月給=基礎÷月平均所定)。
    var unit = (opts.unit != null) ? han50Up(num(opts.unit)) : hourlyUnit(opts.base, monthlyStdHours(opts.annualHolidays, opts.dailyHours, opts.leap));
    var comps = easyComponents(hm2min(opts.otH, opts.otM), hm2min(opts.nightH, opts.nightM), hm2min(opts.holidayH, opts.holidayM), opts.rates, num(opts.minashiMin));
    return calc(unit, comps);
  }

  // ── 歩合給(出来高払) ──
  // 歩合の1時間単価 = 歩合給総額 ÷ "総"労働時間(所定+時間外含む)。固定給(÷所定×1.25)とは別。
  function commissionUnit(commissionTotal, totalWorkMin) {
    var h = num(totalWorkMin) / 60; return h > 0 ? num(commissionTotal) / h : 0;
  }
  // 歩合の割増は割増"部分のみ": 時間外+0.25 / 深夜+0.25 / 法定休日+0.35 (1.0は歩合総額に含むため)。
  //  ★会社の率上書き(rates)を反映=増分は基本率から導出(時間外=R.ot-1 / 深夜=R.night / 法定休日=R.holiday-1)。
  //   未指定は法定下限(resolveRates既定 ot1.25/night0.25/holiday1.35 → 0.25/0.25/0.35)=回帰ゼロ。固定給easy/detailと同じrates系統。
  function commissionComponents(seg, rates) {
    seg = seg || {}; var R = resolveRates(rates);
    var inc = function (v) { return r4(Math.max(0, v)); }; // 増分は非負にクランプ(率<1.0の不正入力で残業が賃金を減らす負の割増を防ぐ)
    return [
      { key: 'ot', label: '歩合 時間外', rate: inc(R.ot - 1), minutes: num(seg.ot) },
      { key: 'night', label: '歩合 深夜', rate: inc(R.night), minutes: num(seg.night) },
      { key: 'holiday', label: '歩合 法定休日', rate: inc(R.holiday - 1), minutes: num(seg.holiday) }
    ];
  }
  // 歩合の割増合計(端数は各区分50銭→合算)。opts.rates で率上書き可(会社が上げられる)。
  function commission(opts) {
    var unit = commissionUnit(opts.commissionTotal, opts.totalWorkMin);
    return calc(unit, commissionComponents(opts.seg || {}, opts.rates));
  }
  // 保障給/「高い方」: 歩合実績 と 時間給ベース保障(時給×総労働時間) の高い方
  function higherOf(a, b) { return Math.max(num(a), num(b)); }
  function guaranteePay(hourlyGuarantee, totalWorkMin) { return Math.round(num(hourlyGuarantee) * num(totalWorkMin) / 60); }
  // 歩合の基本給 = 歩合実績 と 保障給(保障時給×総労働時間) の高い方(労基27条)。app配線の単一ソース
  function commissionBasePay(commissionTotal, hourlyGuarantee, totalWorkMin) { return higherOf(commissionTotal, guaranteePay(hourlyGuarantee, totalWorkMin)); }
  // 最低賃金チェック: (賃金合計 ÷ 総労働時間) ≧ 地域別最賃 か(割増/通勤は分子から除く前提で呼ぶ)
  function minWageHourly(basePayTotal, totalWorkMin) { var h = num(totalWorkMin) / 60; return h > 0 ? num(basePayTotal) / h : 0; }
  function minWageOk(basePayTotal, totalWorkMin, minWage) { return minWageHourly(basePayTotal, totalWorkMin) >= num(minWage) - 1e-9; }

  return {
    num: num, han50: han50, han50Up: han50Up, hm2min: hm2min,
    commissionUnit: commissionUnit, commissionComponents: commissionComponents, commission: commission,
    higherOf: higherOf, guaranteePay: guaranteePay, commissionBasePay: commissionBasePay, minWageHourly: minWageHourly, minWageOk: minWageOk,
    monthlyStdHours: monthlyStdHours, hourlyUnit: hourlyUnit,
    RATE: RATE, resolveRates: resolveRates, belowLegalRates: belowLegalRates, annualHoursCheck: annualHoursCheck, overtimeLimitLevel: overtimeLimitLevel, overtime36Check: overtime36Check, hydrate: hydrate, calc: calc, easyComponents: easyComponents, easy: easy,
    DETAIL: DETAIL, detailComponents: detailComponents, detail: detail
  };
});
