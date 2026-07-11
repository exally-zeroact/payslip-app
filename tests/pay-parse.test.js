/* pay-parse.test.js — 雑入力→給与spec 解釈エンジン(ルールベース) */
'use strict';
var PP = require('../lib/pay-parse.js');

/* 数値ヘルパー */
T('yen: 18万→180000 / 1,200→1200 / 25万→250000', function () {
  eq(PP._yen('18万'), 180000); eq(PP._yen('1,200'), 1200); eq(PP._yen('25万'), 250000); eq(PP._yen('1.5万'), 15000);
});
T('pct: 3.5割→35 / 35%→35 / 3割→30', function () {
  eq(PP._pct('3.5割'), 35); eq(PP._pct('35%'), 35); eq(PP._pct('3割'), 30);
});

/* 単純形 */
T('「時給1200」→ 時給制', function () {
  var r = PP.parse('時給1200'); eq(r.payType, '時給'); eq(r.fields.hourly, '1200');
});
T('「月給25万」→ 月給', function () {
  var r = PP.parse('月給25万'); eq(r.payType, '月給'); eq(r.fields.base, '250000');
});
T('「日給1万」→ 日給', function () {
  var r = PP.parse('日給1万'); eq(r.payType, '日給'); eq(r.fields.base, '10000');
});

/* カスタム(固定+歩合/高い方) */
T('★司さん例★「売上の3.5割か時給1200の高い方」→ カスタム max[rate35, hourly1200]', function () {
  var r = PP.parse('売上の3.5割か時給1200の高い方');
  eq(r.payType, 'カスタム'); var v = r.fields.payRule.variable;
  eq(v.mode, 'max'); eq(v.parts.length, 2);
  eq(v.parts[0].type, 'hourly'); eq(v.parts[0].amount, '1200'); // 時給
  eq(v.parts[1].type, 'rate'); eq(v.parts[1].amount, '35');      // 売上×率
});
T('「固定18万＋歩合」→ カスタム 固定18万 + 歩合(毎月入力)', function () {
  var r = PP.parse('固定18万＋歩合');
  eq(r.payType, 'カスタム'); eq(r.fields.payRule.fixed, '180000');
  var v = r.fields.payRule.variable; eq(v.parts.length, 1); eq(v.parts[0].type, 'commission');
});
T('「1件1500円」→ カスタム 件数×単価1500', function () {
  var r = PP.parse('1件1500円'); eq(r.payType, 'カスタム');
  var v = r.fields.payRule.variable; eq(v.parts[0].type, 'piece'); eq(v.parts[0].amount, '1500');
});
T('「売上35%」→ カスタム 売上×率35', function () {
  var r = PP.parse('売上35%'); eq(r.payType, 'カスタム');
  var v = r.fields.payRule.variable; eq(v.parts[0].type, 'rate'); eq(v.parts[0].amount, '35');
});
T('★複合★「固定18万＋売上3.5割か時給1200のいい方」→ 固定+max[rate,hourly]', function () {
  var r = PP.parse('固定18万＋売上3.5割か時給1200のいい方');
  eq(r.payType, 'カスタム'); eq(r.fields.payRule.fixed, '180000');
  var v = r.fields.payRule.variable; eq(v.mode, 'max'); eq(v.parts.length, 2);
});
T('空/意味不明→ ok:false(要手入力)', function () {
  eq(PP.parse('').ok, false); eq(PP.parse('あいうえお').ok, false);
});
