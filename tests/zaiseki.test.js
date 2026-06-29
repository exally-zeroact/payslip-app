/* zaiseki.test.js — 在籍判定・入社/退職月の日割・社保徴収可否(純関数) */
'use strict';
var Z = require('../lib/zaiseki.js');
var PayslipCalc = require('../lib/calc.js');

/* ── 在籍判定 ── */
T('在籍: 日付未設定は常に在籍(従来どおり)', function () {
  eq(Z.isActiveInMonth({}, '2026-06'), true);
});
T('在籍: retired(日付なし)は除外(旧来の即除外運用)', function () {
  eq(Z.isActiveInMonth({ retired: true }, '2026-06'), false);
});
T('在籍: 入社月より前は対象外', function () {
  eq(Z.isActiveInMonth({ joinYmd: '2026-06-15' }, '2026-05'), false);
  eq(Z.isActiveInMonth({ joinYmd: '2026-06-15' }, '2026-06'), true);
});
T('在籍: 退職月の翌月以降は対象外(退職月は対象に残す)', function () {
  eq(Z.isActiveInMonth({ taishokuYmd: '2026-06-15' }, '2026-06'), true);
  eq(Z.isActiveInMonth({ taishokuYmd: '2026-06-15' }, '2026-07'), false);
});

/* ── 日割(暦日) ── */
T('日割: 月給・1月(31日)・15日入社→在籍17日/31', function () {
  var p = Z.prorateInfo({ payType: '月給', joinYmd: '2026-01-15' }, '2026-01');
  eq(p.dim, 31); eq(p.zd, 17); ok(Math.abs(p.factor - 17 / 31) < 1e-9); eq(p.isJoin, true); eq(p.shahoMonth, true);
});
T('日割: 月給・6月(30日)・10日退職→在籍10日/30・月中退職で社保なし', function () {
  var p = Z.prorateInfo({ payType: '月給', taishokuYmd: '2026-06-10' }, '2026-06');
  eq(p.zd, 10); eq(p.dim, 30); eq(p.shahoMonth, false); eq(p.mid, true);
});
T('日割: 時給/役員は日割しない(prorate=false)', function () {
  eq(Z.prorateInfo({ payType: '時給', joinYmd: '2026-01-15' }, '2026-01').prorate, false);
  eq(Z.prorateInfo({ payType: '役員', taishokuYmd: '2026-06-10' }, '2026-06').prorate, false);
});
T('日割: 通常月(入社/退職月でない)は日割なし・社保あり', function () {
  var p = Z.prorateInfo({ payType: '月給', joinYmd: '2026-01-15', taishokuYmd: '2026-12-31' }, '2026-06');
  eq(p.prorate, false); eq(p.factor, 1); eq(p.shahoMonth, true);
});

/* ── 退職月の社保(月末判定) ── */
T('社保: 月末退職(6/30)→退職月も社保あり', function () {
  eq(Z.prorateInfo({ payType: '月給', taishokuYmd: '2026-06-30' }, '2026-06').shahoMonth, true);
});
T('社保: 月中退職(6/15)→退職月は社保なし', function () {
  eq(Z.prorateInfo({ payType: '月給', taishokuYmd: '2026-06-15' }, '2026-06').shahoMonth, false);
});
T('社保: 2月末(28日)退職→社保あり(末日判定)', function () {
  eq(Z.prorateInfo({ payType: '月給', taishokuYmd: '2026-02-28' }, '2026-02').shahoMonth, true);
});
T('社保: 同月得喪(入社月に退職・月中)→社保あり(免除しない)', function () {
  var p = Z.prorateInfo({ payType: '月給', joinYmd: '2026-06-05', taishokuYmd: '2026-06-20' }, '2026-06');
  eq(p.isJoin, true); eq(p.isLeave, true); eq(p.shahoMonth, true);
});

/* ── computePayslip: shahoMonth=false で健保厚年介護=0・雇用は残る ── */
T('社保月割: shahoMonth=false→健保/厚年/介護=0・雇用保険は実支払×率で残る', function () {
  var full = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 0 });
  var leave = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 0, shahoMonth: false });
  eq(leave.si.health, 0); eq(leave.si.pension, 0); eq(leave.si.kaigo, 0);
  eq(leave.si.employ, full.si.employ); ok(leave.si.employ > 0, '雇用保険は残る');
  ok(full.si.health > 0 && full.si.pension > 0, '通常月は社保あり');
});
T('社保月割: shahoMonth=trueは従来どおり(回帰)', function () {
  var a = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 0 });
  var b = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 0, shahoMonth: true });
  eq(a.net, b.net); eq(a.si.total, b.si.total);
});
