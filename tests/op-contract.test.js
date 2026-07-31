/* op-contract.test.js — オペレーション契約(型/必須/範囲/enum)のテスト。tests/run.js から実行。
 * 狙い: 境界で弾けること、そして【嘘の成功を返さない】こと。
 */
'use strict';
var OC = require('../lib/op-contract.js');
var op = require('../ops/payroll.monthly.js');

var SPEC = [
  { key: 'month', type: 'ym', required: true },
  { key: 'n', type: 'int', min: 0, max: 10 },
  { key: 'mode', type: 'enum', values: ['a', 'b'] },
  { key: 'items', type: 'array', minLength: 1, of: { id: { type: 'string', required: true } } },
];

T('必須が無い→REQUIRED（pathつき）', function () {
  var r = OC.validateInputs({}, SPEC);
  eq(r.ok, false);
  eq(r.errors[0].path, 'month'); eq(r.errors[0].code, 'REQUIRED');
});
T('ym形式: 2026-13 は PATTERN で弾く', function () {
  eq(OC.validateInputs({ month: '2026-13' }, SPEC).errors[0].code, 'PATTERN');
});
T('ym形式: 2026-06 は通る', function () {
  eq(OC.validateInputs({ month: '2026-06' }, SPEC).ok, true);
});
T('int: 小数は TYPE / 範囲外は RANGE', function () {
  eq(OC.validateInputs({ month: '2026-06', n: 1.5 }, SPEC).errors[0].code, 'TYPE');
  eq(OC.validateInputs({ month: '2026-06', n: 99 }, SPEC).errors[0].code, 'RANGE');
  eq(OC.validateInputs({ month: '2026-06', n: -1 }, SPEC).errors[0].code, 'RANGE');
});
T('enum: 一覧外は ENUM', function () {
  eq(OC.validateInputs({ month: '2026-06', mode: 'z' }, SPEC).errors[0].code, 'ENUM');
});
T('array: 空は RANGE / 要素の必須欠けは path に添字が出る', function () {
  eq(OC.validateInputs({ month: '2026-06', items: [] }, SPEC).errors[0].code, 'RANGE');
  var r = OC.validateInputs({ month: '2026-06', items: [{ id: 'a' }, {}] }, SPEC);
  eq(r.errors[0].path, 'items[1].id');
});
T('数値は文字列でも通る（アプリは文字列で持っている）', function () {
  eq(OC.validateInputs({ month: '2026-06', n: '3' }, SPEC).ok, true);
  eq(OC.validateInputs({ month: '2026-06', n: '3,000' }, SPEC).errors.length, 1); // 3000は上限10超=RANGE
});

// ── ★嘘の成功を返さない ──
T('★検証NGなら計算せず value=null と errors を返す（0円の結果を黙って返さない）', function () {
  var r = op.engine({ month: '2026-13', company: {}, employees: [] });
  eq(r.value, null);
  ok(r.errors.length >= 3, 'errors: ' + JSON.stringify(r.errors));
  eq(r.provenance.validated, false);
});
T('★従業員の必須(id/name)欠けは path つきで弾く', function () {
  var r = op.engine({ month: '2026-06', company: { name: 'X' }, employees: [{ id: 'a', name: 'A' }, { id: 'b' }] });
  eq(r.value, null);
  ok(r.errors.some(function (e) { return e.path === 'employees[1].name' && e.code === 'REQUIRED'; }), JSON.stringify(r.errors));
});
T('都道府県コード/税区分/雇用形態/給与形態は enum で弾く', function () {
  var base = { id: 'a', name: 'A' };
  function err(o) { return op.engine({ month: '2026-06', company: { name: 'X' }, employees: [Object.assign({}, base, o)] }).errors; }
  ok(err({ pref: 'tokio' }).some(function (e) { return e.code === 'ENUM'; }), '都道府県');
  ok(err({ taxClass: 'kou' }).some(function (e) { return e.code === 'ENUM'; }), '税区分');
  ok(err({ employmentType: 'gyomu' }).some(function (e) { return e.code === 'ENUM'; }), '雇用形態');
  ok(err({ payType: '年俸' }).some(function (e) { return e.code === 'ENUM'; }), '給与形態');
});
T('正しい入力なら value が出て errors は空', function () {
  var r = op.engine({ month: '2026-06', company: { name: 'X' },
    employees: [{ id: 'a', name: 'A', payType: '月給', base: '300000', pref: 'tokyo', birthYmd: '1990-01-01', fuyou: '1' }] });
  ok(r.value, 'value');
  eq(r.errors.length, 0);
  eq(r.value.count, 1);
  ok(r.value.people[0].net > 0, '手取り>0');
});
T('★engineが1人で落ちても、その人をerrorsに出し value.partial=true にする(黙って0円にしない)', function () {
  var r = op.engine({ month: '2026-06', company: { name: 'X' },
    employees: [{ id: 'a', name: 'A', payType: '月給', base: '300000', pref: 'tokyo' },
                { id: 'b', name: 'B', payType: '月給', base: '300000', pref: 'tokyo', shaho: { mode: 'teiji', months: 'こわれた' } }] });
  ok(r.value, 'value は部分結果として返る');
  ok(r.errors.length >= 1 && /employees\[1\]/.test(r.errors[0].path), '落ちた人が errors に出る: ' + JSON.stringify(r.errors));
  eq(r.value.partial, true);
  eq(r.value.count, 1);
});
T('オペの記述子が契約の形をしている(id/title/inputs/engine/law/excel/tests)', function () {
  eq(op.id, 'payroll.monthly');
  ok(op.title && op.desc, 'title/desc');
  ok(Array.isArray(op.inputs) && op.inputs.length >= 5, 'inputs');
  eq(typeof op.engine, 'function');
  eq(typeof op.excel.export, 'function');
  ok(op.law && op.law.incomeTax && op.law.saiteiChingin, 'law');
  ok(Array.isArray(op.tests) && op.tests.length >= 3, 'tests');
});
