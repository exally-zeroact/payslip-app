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

/* 空入力は0 */
T('空入力 → 割増0', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8 });
  eq(r.total, 0); eq(r.lines.length, 0);
});
