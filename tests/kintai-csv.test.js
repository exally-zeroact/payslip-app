/* kintai-csv.test.js — 勤怠CSVパーサ: 列名の柔軟マッチ・時間パース・行解釈・表記ゆれ・氏名欠落警告 */
'use strict';
var K = require('../lib/kintai-csv.js');

T('kintai classify: 見出し→正準フィールド(表記ゆれ)', function () {
  eq(K.classify('氏名'), 'name'); eq(K.classify('従業員名'), 'name'); eq(K.classify('名 前'), 'name');
  eq(K.classify('従業員番号'), 'no'); eq(K.classify('社員コード'), 'no');
  eq(K.classify('出勤日数'), 'shukkin'); eq(K.classify('欠勤日数'), 'kekkin'); eq(K.classify('有給取得'), 'yukyu');
  eq(K.classify('労働時間'), 'worked'); eq(K.classify('実労働時間'), 'worked');
  eq(K.classify('残業時間'), 'ot'); eq(K.classify('時間外'), 'ot');
  eq(K.classify('深夜'), 'night'); eq(K.classify('深夜労働'), 'night');
  eq(K.classify('法定休日'), 'holiday'); eq(K.classify('休日出勤'), 'holiday');
  eq(K.classify('備考'), null);
});
T('kintai toMinutes: 時:分 / 小数時 / 整数時 / 全角', function () {
  eq(K.toMinutes('160:30'), 9630); eq(K.toMinutes('160.5'), 9630); eq(K.toMinutes('160'), 9600);
  eq(K.toMinutes('10:00'), 600); eq(K.toMinutes(''), 0); eq(K.toMinutes('１０：３０'), 630); // 全角
});
T('kintai parse: 見出し認識+行の値', function () {
  var csv = '氏名,出勤日数,欠勤日数,有給,労働時間,残業,深夜,休日\n山田太郎,21,0,1,160:00,10:30,2:00,8:00\n田中花子,20,1,0,152.5,5,0,0\n';
  var r = K.parse(csv);
  eq(r.rows.length, 2);
  eq(r.warnings.length, 0);
  var a = r.rows[0];
  eq(a.name, '山田太郎'); eq(a.shukkin, 21); eq(a.kekkin, 0); eq(a.yukyu, 1);
  eq(a.workedMin, 9600); eq(a.otMin, 630); eq(a.nightMin, 120); eq(a.holidayMin, 480);
  var b = r.rows[1];
  eq(b.name, '田中花子'); eq(b.shukkin, 20); eq(b.workedMin, 9150); eq(b.otMin, 300);
});
T('kintai parse: 氏名列なし→警告 / 空行・氏名空はスキップ / BOM・クオート', function () {
  var r = K.parse('日付,時間\n2026-06-01,8:00');
  ok(r.warnings.join('').indexOf('氏名') >= 0, '氏名列なし警告');
  var r2 = K.parse('﻿氏名,出勤日数\n"山田, 太郎",21\n,5\n\n田中,20');
  eq(r2.rows.length, 2, '氏名空とnull行はスキップ');
  eq(r2.rows[0].name, '山田, 太郎'); // クオート内カンマ
  eq(r2.rows[0].shukkin, 21);
  eq(r2.rows[1].name, '田中');
});
T('kintai parse: 認識した列だけ・未指定はnull(既存値を保持できる)', function () {
  var r = K.parse('氏名,残業\n山田,12:00');
  eq(r.recognized.sort().join(','), 'name,ot');
  eq(r.rows[0].otMin, 720); eq(r.rows[0].shukkin, null); eq(r.rows[0].workedMin, null);
});
