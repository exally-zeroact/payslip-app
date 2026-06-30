/* warimashi.test.js — 割増賃金エンジン検証（労基法37条/施行規則19条/基発150号） */
'use strict';
var W = require('../lib/warimashi.js');

/* 1か月平均所定労働時間 */
T('月平均所定: (365−120)×8÷12 = 163.33h', function () {
  var h = W.monthlyStdHours(120, 8, false);
  ok(Math.abs(h - 163.3333) < 0.001, '163.33');
});
T('月平均所定: 閏年は366で計算', function () {
  ok(W.monthlyStdHours(120, 8, true) > W.monthlyStdHours(120, 8, false), '閏年の方が大きい');
});

/* 1時間単価（50銭以上切上） */
T('単価: 260,000÷163.33=1,591.84 → 1,592（50銭以上切上）', function () {
  eq(W.hourlyUnit(260000, W.monthlyStdHours(120, 8, false)), 1592);
});
T('単価: ちょうど.5未満は切捨', function () {
  // 1000.4 → 1000
  eq(W.han50(1000.4), 1000); eq(W.han50(1000.5), 1000); eq(W.han50(1000.51), 1001);
});
T('単価: ちょうど50銭は切上(基発150号・hourlyUnitはhan50Up)', function () {
  // 3001÷2=1500.50 → 1501(切上)。社保han50を流用していると1500で過少(1円)だった
  eq(W.hourlyUnit(3001, 2), 1501);
  // 50銭未満は切捨のまま: 3000÷2=1500.00→1500 / 3000.9÷2=1500.45→1500
  eq(W.hourlyUnit(3000, 2), 1500);
});

/* かんたん：残業45h・深夜2h → 90,346（検算一致） */
T('かんたん: 残業45h+深夜2h → 89,550+796=90,346', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 45, otM: 0, nightH: 2, nightM: 0, holidayH: 0, holidayM: 0 });
  eq(r.unit, 1592);
  var ot = r.lines.find(function (l) { return l.key === 'ot'; });
  var ni = r.lines.find(function (l) { return l.key === 'night'; });
  eq(ot.amount, 89550, '残業 1592×1.25×45'); eq(ni.amount, 796, '深夜 1592×0.25×2');
  eq(r.total, 90346, '合計');
});

/* 詳細の排他区分（時間外43h + 時間外深夜2h）= かんたんと同額 */
T('詳細: 時間外43h(1.25)+時間外深夜2h(1.5)=90,346（かんたんと一致）', function () {
  var r = W.calc(1592, [
    { key: 'ot', label: '時間外', rate: W.RATE.ot, minutes: 43 * 60 },
    { key: 'otNight', label: '時間外深夜', rate: W.RATE.otNight, minutes: 2 * 60 }
  ]);
  eq(r.total, 90346);
});

/* 月60時間超の自動分割（増分0.25） */
T('かんたん: 残業70h → 60h超10hに+0.25(1.5)が乗る', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 70, otM: 0, nightH: 0, nightM: 0, holidayH: 0, holidayM: 0 });
  var ot = r.lines.find(function (l) { return l.key === 'ot'; });
  var o60 = r.lines.find(function (l) { return l.key === 'over60inc'; });
  eq(ot.minutes, 70 * 60, '残業全70hは1.25');
  eq(o60.minutes, 10 * 60, '60h超=10hに追加0.25');
  // 検算: 1592*1.25*70 + 1592*0.25*10 = 139300 + 3980 = 143280
  eq(r.total, 143280);
});

/* 1分単位（30分=0.5h を正しく扱う） */
T('1分単位: 残業1時間30分 → 1592×1.25×1.5=2,985', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 1, otM: 30, nightH: 0, nightM: 0, holidayH: 0, holidayM: 0 });
  eq(r.total, 2985);
});

/* 全率テーブルの妥当性 */
T('率テーブル: 1.25/1.5/1.5/1.75/0.25/1.35/1.6', function () {
  eq(W.RATE.ot, 1.25); eq(W.RATE.otNight, 1.5); eq(W.RATE.over60, 1.5);
  eq(W.RATE.over60Night, 1.75); eq(W.RATE.night, 0.25); eq(W.RATE.holiday, 1.35); eq(W.RATE.holidayNight, 1.6);
});

/* 法定休日(1.35) */
T('かんたん: 法定休日8h → 1592×1.35×8=17,194', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, holidayH: 8, holidayM: 0 });
  var h = r.lines.find(function (l) { return l.key === 'holiday'; });
  eq(h.rate, 1.35); eq(h.amount, 17194); eq(r.total, 17194);
});
/* 分のみ入力 */
T('1分単位: 残業0時間30分 → 1592×1.25×0.5=995', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 0, otM: 30 });
  eq(r.total, 995);
});

/* 詳細7区分：各率で計算・かんたんと整合 */
T('詳細: 時間外43h+時間外深夜2h=90,346（かんたん45h/深夜2hと一致）', function () {
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { ot: 43 * 60, otNight: 2 * 60 } });
  eq(r.total, 90346);
});
T('詳細: 全7区分の率が正しく乗る', function () {
  var seg = { ot: 60, otNight: 60, over60: 60, over60Night: 60, night: 60, holiday: 60, holidayNight: 60 }; // 各1h
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: seg });
  var u = 1592;
  var exp = W.han50(u * 1.25) + W.han50(u * 1.5) + W.han50(u * 1.5) + W.han50(u * 1.75) + W.han50(u * 0.25) + W.han50(u * 1.35) + W.han50(u * 1.6);
  eq(r.total, exp);
  eq(r.lines.length, 7);
});
T('詳細: 法定休日×深夜は1.6', function () {
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { holidayNight: 60 } });
  eq(r.lines[0].rate, 1.6); eq(r.total, W.han50(1592 * 1.6));
});
T('detailComponents: 0分は率0でも行は出る(検算表示用)・calcはfilterで0除外', function () {
  eq(W.detailComponents({ ot: 120 }).length, 7); // 全区分の枠
  eq(W.calc(1592, W.detailComponents({ ot: 120 })).lines.length, 1); // 実額は0除外で1行
});

/* ── 率オーバーライド(法定は最低・会社は上げられる・合成式) ── */
T('既定(rates無し)は法定下限のまま不変', function () {
  var R = W.resolveRates();
  eq(R.ot, 1.25); eq(R.holiday, 1.35); eq(R.night, 0.25); eq(R.over60Add, 0.25);
});
T('残業率を1.3に上げると60h超も連動(合成式 1.3+0.25=1.55)', function () {
  var c = W.detailComponents({ ot: 60, over60: 60, otNight: 60, holidayNight: 60 }, { ot: 1.3 });
  var by = {}; c.forEach(function (x) { by[x.key] = x.rate; });
  eq(by.ot, 1.3); eq(by.over60, 1.55); eq(by.otNight, 1.55); eq(by.holidayNight, 1.6); // 休日は未変更1.35+深夜0.25
});
T('深夜率を0.3に上げると深夜系が連動', function () {
  var c = W.detailComponents({ night: 60, otNight: 60, holidayNight: 60 }, { night: 0.3 });
  var by = {}; c.forEach(function (x) { by[x.key] = x.rate; });
  eq(by.night, 0.3); eq(by.otNight, 1.55); eq(by.holidayNight, 1.65);
});
T('かんたんも率上書きが効く(残業1.3)', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 10, rates: { ot: 1.3 } });
  // 1592*1.3*10=20696
  eq(r.total, 20696);
});

/* ── 端数(基発150号): 割増はちょうど50銭で"切上"(社保とは逆) ── */
T('han50Up: ちょうど50銭は切上(795.5→796) / 未満は切捨', function () {
  eq(W.han50Up(795.5), 796); eq(W.han50Up(795.49), 795); eq(W.han50Up(795.0), 795);
});
T('割増calc: 50銭ちょうどの区分が切上される(社保han50なら795で過少だった)', function () {
  // 単価1591 × 0.25 × 2h = 795.5 → 切上796
  var r = W.calc(1591, [{ key: 'night', label: '深夜', rate: 0.25, minutes: 120 }]);
  eq(r.total, 796);
});

/* ── 歩合給(出来高払) ── */
T('歩合単価=歩合総額÷総労働時間(所定+時間外)', function () {
  // 歩合20万・総労働160h → 1250/h
  eq(W.commissionUnit(200000, 160 * 60), 1250);
});
T('歩合の割増は0.25のみ(時間外)・固定給1.25と別', function () {
  // 単価1250・時間外10h → han50(1250*0.25*10)=3125
  var r = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { ot: 10 * 60 } });
  eq(r.total, 3125);
});
T('歩合の深夜+0.25・法定休日+0.35', function () {
  var r = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { night: 2 * 60, holiday: 8 * 60 } });
  // 深夜 han50(1250*0.25*2)=625 / 休日 han50(1250*0.35*8)=3500
  eq(r.total, 625 + 3500);
});
T('保障給/高い方: 歩合 vs 時給×総時間 の高い方', function () {
  // 歩合15万 vs 時給1200×160h=192000 → 高い方192000
  eq(W.guaranteePay(1200, 160 * 60), 192000);
  eq(W.higherOf(150000, W.guaranteePay(1200, 160 * 60)), 192000);
  eq(W.higherOf(250000, W.guaranteePay(1200, 160 * 60)), 250000);
});
/* 歩合の基本給配線(app.js syncBasePay の単一ソース) */
T('commissionBasePay: 歩合<保障 → 保障給適用 / 歩合>保障 → 歩合実績', function () {
  eq(W.commissionBasePay(150000, 1200, 160 * 60), 192000); // 歩合15万 < 保障192000 → 保障給
  eq(W.commissionBasePay(250000, 1200, 160 * 60), 250000); // 歩合25万 > 保障192000 → 歩合実績
  eq(W.commissionBasePay(192000, 1200, 160 * 60), 192000); // 同額
});
T('commissionBasePay: 保障時給未設定(0)なら歩合実績がそのまま基本給', function () {
  eq(W.commissionBasePay(180000, '', 160 * 60), 180000);
  eq(W.commissionBasePay(0, '', 160 * 60), 0);
});
T('最低賃金チェック: 賃金÷総時間 ≧ 地域別最賃', function () {
  // 時給換算 192000/160=1200 → 東京1163以上=OK / 1100基準割れ
  eq(W.minWageOk(192000, 160 * 60, 1163), true);
  eq(W.minWageOk(170000, 160 * 60, 1163), false); // 1062.5<1163
});

/* ── 固定残業(みなし): みなし時間は時間外(ot)の基本割増から控除・超過分のみ支払う ── */
T('みなし: 残業45h・みなし20h → 時間外は25h分のみ(深夜はみなし控除しない)', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 45, otM: 0, nightH: 2, nightM: 0, minashiMin: 20 * 60 });
  var ot = r.lines.find(function (l) { return l.key === 'ot'; });
  var ni = r.lines.find(function (l) { return l.key === 'night'; });
  eq(ot.minutes, 25 * 60, '45-20=25hのみ時間外割増');
  eq(ni.minutes, 2 * 60, '深夜はみなし対象外');
});
T('みなし≥残業 → 時間外割増0(固定残業代が充当)', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 15, minashiMin: 20 * 60 });
  eq(r.lines.filter(function (l) { return l.key === 'ot'; }).length, 0, '時間外0');
});
T('みなし: 60h超増分は実残業で計算(固定残業代は60h超割増を充当不可)', function () {
  // 残業70h・みなし45h → 時間外25h@1.25 + 60h超10h@0.25(実70hベース)
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 70, minashiMin: 45 * 60 });
  var ot = r.lines.find(function (l) { return l.key === 'ot'; });
  var o60 = r.lines.find(function (l) { return l.key === 'over60inc'; });
  eq(ot.minutes, 25 * 60, '70-45=25h'); eq(o60.minutes, 10 * 60, '60h超は実残業70hで10h');
  eq(r.total, W.han50Up(1592 * 1.25 * 25) + W.han50Up(1592 * 0.25 * 10));
});
T('みなし0/未指定は従来どおり全額(回帰)', function () {
  eq(W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 45, nightH: 2, minashiMin: 0 }).total, 90346);
  eq(W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 45, nightH: 2 }).total, 90346);
});
T('詳細モードでもみなしは時間外(ot)区分から控除', function () {
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { ot: 45 * 60 }, minashiMin: 20 * 60 });
  eq(r.lines.find(function (l) { return l.key === 'ot'; }).minutes, 25 * 60);
});

/* 空入力は0 */
T('空入力 → 割増0', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8 });
  eq(r.total, 0); eq(r.lines.length, 0);
});
