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
