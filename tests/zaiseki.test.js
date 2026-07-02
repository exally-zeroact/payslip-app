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

/* ── 産育休 社保免除(月末在籍基準・令和4年改正)──────────────── */
T('産休: 開始4/10〜終了7/31。6月(末日休業中)→免除true', function () {
  eq(Z.shahoExemptMonthly({ leaveType: 'sankyu', startYmd: '2026-04-10', endYmd: '2026-07-31', ym: '2026-06' }), true);
});
T('産休: 開始月(4月末が休業中)→免除true / 終了翌月(8月)→false', function () {
  eq(Z.shahoExemptMonthly({ leaveType: 'sankyu', startYmd: '2026-04-10', endYmd: '2026-07-31', ym: '2026-04' }), true);
  eq(Z.shahoExemptMonthly({ leaveType: 'sankyu', startYmd: '2026-04-10', endYmd: '2026-07-31', ym: '2026-08' }), false);
});
T('終了月特例: 終了日が月末(7/31)→7月も免除 / 7/15終了は7月末非該当(産休14日無し)→false', function () {
  eq(Z.shahoExemptMonthly({ leaveType: 'sankyu', startYmd: '2026-04-10', endYmd: '2026-07-31', ym: '2026-07' }), true);
  eq(Z.shahoExemptMonthly({ leaveType: 'sankyu', startYmd: '2026-04-10', endYmd: '2026-07-15', ym: '2026-07' }), false);
});
T('育休14日ルール: 月末非該当の同一月短期育休 14日以上→true / 13日→false(令和4年10月改正)', function () {
  eq(Z.shahoExemptMonthly({ leaveType: 'ikukyu', startYmd: '2026-06-01', endYmd: '2026-06-14', ym: '2026-06', leaveDaysInMonth: 14 }), true);
  eq(Z.shahoExemptMonthly({ leaveType: 'ikukyu', startYmd: '2026-06-01', endYmd: '2026-06-13', ym: '2026-06', leaveDaysInMonth: 13 }), false);
});
T('産休には14日ルール無し: 月末非該当の短期産休14日でもfalse', function () {
  eq(Z.shahoExemptMonthly({ leaveType: 'sankyu', startYmd: '2026-06-01', endYmd: '2026-06-14', ym: '2026-06', leaveDaysInMonth: 14 }), false);
});
T('介護休/病休/通常は免除なし(false)', function () {
  eq(Z.shahoExemptMonthly({ leaveType: 'kaigokyu', startYmd: '2026-04-01', endYmd: '2026-08-31', ym: '2026-06' }), false);
  eq(Z.shahoExemptMonthly({ leaveType: 'byoukyu', startYmd: '2026-04-01', endYmd: '2026-08-31', ym: '2026-06' }), false);
  eq(Z.shahoExemptMonthly({ leaveType: 'normal', ym: '2026-06' }), false);
});
T('日付未設定→null(呼び出し側で従来=全月免除フォールバック)', function () {
  eq(Z.shahoExemptMonthly({ leaveType: 'sankyu', ym: '2026-06' }), null);
  eq(Z.shahoExemptMonthly({ leaveType: 'ikukyu', startYmd: '2026-06-01', ym: '2026-06' }), null);
});
T('賞与免除(育休): 連続1か月超(4/15〜5/31)・5月末休業中→true', function () {
  eq(Z.shahoExemptBonus({ leaveType: 'ikukyu', startYmd: '2026-04-15', endYmd: '2026-05-31', bonusYm: '2026-05' }), true);
});
T('賞与免除(育休): 1か月以下(6/1〜6/20・6月末休業中)→false', function () {
  eq(Z.shahoExemptBonus({ leaveType: 'ikukyu', startYmd: '2026-06-01', endYmd: '2026-06-20', bonusYm: '2026-06' }), false);
});
T('賞与免除(育休): ちょうど1か月(6/1〜6/30)→false / 1か月超(6/1〜7/1)→true', function () {
  eq(Z.shahoExemptBonus({ leaveType: 'ikukyu', startYmd: '2026-06-01', endYmd: '2026-06-30', bonusYm: '2026-06' }), false);
  eq(Z.shahoExemptBonus({ leaveType: 'ikukyu', startYmd: '2026-06-01', endYmd: '2026-07-01', bonusYm: '2026-06' }), true);
});
T('賞与免除(産休): 1か月超要件なし・賞与月末が産休中→true', function () {
  eq(Z.shahoExemptBonus({ leaveType: 'sankyu', startYmd: '2026-06-20', endYmd: '2026-08-10', bonusYm: '2026-06' }), true);
});
T('賞与免除: 賞与月末が休業外→false / 日付未設定→null', function () {
  eq(Z.shahoExemptBonus({ leaveType: 'ikukyu', startYmd: '2026-04-01', endYmd: '2026-05-15', bonusYm: '2026-06' }), false);
  eq(Z.shahoExemptBonus({ leaveType: 'ikukyu', bonusYm: '2026-06' }), null);
});
