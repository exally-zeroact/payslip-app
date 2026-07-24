/* payroll-calc.test.js — 定時決定の月次履歴サポート(getTeijiYms / calcPaymentDays) */
'use strict';
var P = require('../lib/payroll-calc.js');

/* getTeijiYms: 対象年の4・5・6月 */
T('getTeijiYms: 2026-09 → 4・5・6月', function () {
  var a = P.getTeijiYms('2026-09');
  eq(a.length, 3); eq(a[0], '2026-04'); eq(a[1], '2026-05'); eq(a[2], '2026-06');
});
T('getTeijiYms: 月に関係なくその年の4-6月', function () {
  eq(P.getTeijiYms('2025-01')[2], '2025-06');
});

/* daysInMonth: 暦日数(閏年) */
T('daysInMonth: 4月30 / 5月31 / 平年2月28 / 閏2月29', function () {
  eq(P.daysInMonth(2026, 4), 30); eq(P.daysInMonth(2026, 5), 31);
  eq(P.daysInMonth(2026, 2), 28); eq(P.daysInMonth(2024, 2), 29);
});

/* calcPaymentDays: 月給=暦日数 */
T('支払基礎日数: 月給は暦日数(4月30/5月31/平年2月28/閏2月29)', function () {
  var e = { payType: '月給' };
  eq(P.calcPaymentDays(e, '2026-04'), 30);
  eq(P.calcPaymentDays(e, '2026-05'), 31);
  eq(P.calcPaymentDays(e, '2026-02'), 28);
  eq(P.calcPaymentDays(e, '2024-02'), 29);
});
T('支払基礎日数: 月給+欠勤2(所定22) → 20(所定−欠勤)', function () {
  var e = { payType: '月給', scheduledDays: 22, kintai: [{ label: '出勤', value: '20' }, { label: '欠勤', value: '2' }] };
  eq(P.calcPaymentDays(e, '2026-04'), 20);
});
T('支払基礎日数: 日給は出勤日数(18)', function () {
  var e = { payType: '日給', kintai: [{ label: '出勤', value: '18' }] };
  eq(P.calcPaymentDays(e, '2026-04'), 18);
});
T('支払基礎日数: 時給も出勤日数', function () {
  var e = { payType: '時給', kintai: [{ label: '出勤', value: '15' }] };
  eq(P.calcPaymentDays(e, '2026-04'), 15);
});
T('支払基礎日数: method明示(calendar=30 / worked=出勤18)で会社カスタム可', function () {
  var e = { payType: '日給', scheduledDays: 22, kintai: [{ label: '出勤', value: '18' }, { label: '欠勤', value: '1' }] };
  eq(P.calcPaymentDays(e, '2026-04', 'calendar'), 30);
  eq(P.calcPaymentDays(e, '2026-04', 'worked'), 18);
  eq(P.calcPaymentDays(e, '2026-04', 'scheduled'), 21); // 22-1
});
T('支払基礎日数: 役員は月給扱い(暦日数)', function () {
  eq(P.calcPaymentDays({ payType: '役員' }, '2026-05'), 31);
});

/* 欠勤控除(日給月給制・ノーワークノーペイ) */
T('欠勤控除: 月給25万・年間休日120・欠勤10日(月平均所定日数)→約122,449', function () {
  // 月平均所定日数=(365-120)/12=20.4167 → 1日12,244.9 ×10 = 122,449
  eq(P.calcKekkin({ base: 250000, ym: '2026-06', kekkinDays: 10, annualHolidays: 120, dailyHours: 8 }), 122449);
});
T('欠勤控除: method=calendar は当月暦日数が分母(2026-06=30日)', function () {
  eq(P.calcKekkin({ base: 250000, ym: '2026-06', kekkinDays: 10, annualHolidays: 120, dailyHours: 8, method: 'calendar' }), 83333);
});
/* ★P1 欠勤控除の分母デグレ防止: annualHolidays未入力(空/0)でも暦日365/12(30.42)に退化させず標準120で計算 */
T('欠勤控除: annualHolidays未入力は暦日でなく標準120相当(過少控除デグレ防止)', function () {
  // 未入力(空)→ 年間休日120と同じ分母(20.4167日)で計算=退化しない
  eq(P.calcKekkin({ base: 250000, ym: '2026-06', kekkinDays: 10, dailyHours: 8 }),
     P.calcKekkin({ base: 250000, ym: '2026-06', kekkinDays: 10, annualHolidays: 120, dailyHours: 8 }));
  eq(P.calcKekkin({ base: 250000, ym: '2026-06', kekkinDays: 10, annualHolidays: '', dailyHours: 8 }), 122449);
  // 明示的な年間休日は尊重(105日→分母20.83で122,449より小さい1日単価)
  ok(P.calcKekkin({ base: 250000, ym: '2026-06', kekkinDays: 10, annualHolidays: 105, dailyHours: 8 }) < 122449);
});
T('欠勤控除: 欠勤0なら0 / base0なら0', function () {
  eq(P.calcKekkin({ base: 250000, ym: '2026-06', kekkinDays: 0, annualHolidays: 120, dailyHours: 8 }), 0);
  eq(P.calcKekkin({ base: 0, ym: '2026-06', kekkinDays: 10, annualHolidays: 120, dailyHours: 8 }), 0);
});
T('欠勤控除: 遅刻早退(分)も時間単価で控除(月平均所定時間ベース)', function () {
  // 月平均所定時間=(365-120)*8/12=163.33h → 時給1530.6 ×1h(60分) ≈ 1531
  var d = P.calcKekkin({ base: 250000, ym: '2026-06', kekkinDays: 0, lateMin: 60, annualHolidays: 120, dailyHours: 8 });
  ok(d >= 1520 && d <= 1540, '遅刻1時間≈1,531 (' + d + ')');
});
