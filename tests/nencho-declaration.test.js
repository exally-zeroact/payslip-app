/* nencho-declaration.test.js — 年末調整 従業員セルフ申告の中核ロジック */
'use strict';
var ND = require('../lib/nencho-declaration.js');

T('normalize: 型を正しく整える(人数/金額/真偽/選択)', function () {
  var d = ND.normalize({ fuyoIppan: '2', seiGeneralNew: '80,000', haiEnabled: 'on', shougai: 'tokubetsu', kinrou: true });
  eq(d.fuyoIppan, 2); eq(d.seiGeneralNew, 80000); eq(d.haiEnabled, true); eq(d.shougai, 'tokubetsu'); eq(d.kinrou, true);
});

T('normalize: 不正値は安全側(0/false/空)', function () {
  var d = ND.normalize({ fuyoIppan: 'abc', seiGeneralNew: '-500', shougai: '存在しない', haiShotoku: 'x' });
  eq(d.fuyoIppan, 0); eq(d.seiGeneralNew, 0); eq(d.shougai, ''); eq(d.haiShotoku, 0);
});

T('normalize: 人数は0以上の整数・金額は0以上', function () {
  var d = ND.normalize({ fuyoIppan: '-3', fuyoTokutei: '1.9', seiKaigo: '-100' });
  eq(d.fuyoIppan, 0); eq(d.fuyoTokutei, 1); eq(d.seiKaigo, 0);
});

T('normalize: 配偶者なしなら配偶者関連をクリア(整合)', function () {
  var d = ND.normalize({ haiEnabled: false, haiShotoku: '300000', haiRojin: true });
  eq(d.haiShotoku, 0); eq(d.haiRojin, false);
});

T('normalize: 同居老親は老人扶養を超えない(整合)', function () {
  var d = ND.normalize({ fuyoRoujin: '1', fuyoDoukyo: '3' });
  eq(d.fuyoDoukyo, 1);
});

T('applyToNencho: 申告を年調(n)へ1:1反映(従業員の申告を正とする)', function () {
  var n = { fuyoIppan: 9, seiGeneralNew: 0, memo: '残す' }; // 既存値は上書き・関係ない項目は残る
  ND.applyToNencho(n, { fuyoIppan: '2', seiGeneralNew: '80000', kafu: true });
  eq(n.fuyoIppan, 2); eq(n.seiGeneralNew, 80000); eq(n.kafu, true); eq(n.memo, '残す');
});

T('summarize: 入力を平易な文にまとめる', function () {
  var lines = ND.summarize({ haiEnabled: true, haiShotoku: '0', fuyoIppan: '2', fuyoTokutei: '1', hitorioya: true, seiGeneralNew: '80000' });
  ok(lines.some(function (x) { return /配偶者：あり/.test(x); }), '配偶者行');
  ok(lines.some(function (x) { return /扶養：2人/.test(x); }), '扶養行');
  ok(lines.some(function (x) { return /ひとり親/.test(x); }), '本人行');
  ok(lines.some(function (x) { return /生命保険料/.test(x); }), '保険行');
});

T('isEmpty: 何も申告が無ければ true・1つでも入れば false', function () {
  eq(ND.isEmpty({}), true);
  eq(ND.isEmpty(ND.blank()), true);
  eq(ND.isEmpty({ fuyoIppan: '1' }), false);
  eq(ND.isEmpty({ kafu: true }), false);
});

T('FIELDS/GROUPS: 画面用のメタが揃う(質問・型・グループ)', function () {
  ok(ND.FIELDS.length >= 15, '申告項目が十分ある');
  ok(ND.FIELDS.every(function (f) { return f.key && f.q && f.type && f.group; }), '各項目に key/q/type/group');
  ok(ND.GROUPS.every(function (g) { return g.id && g.title; }), '各グループに id/title');
  // 全FIELDSのgroupがGROUPSに存在する
  var gids = ND.GROUPS.map(function (g) { return g.id; });
  ok(ND.FIELDS.every(function (f) { return gids.indexOf(f.group) >= 0; }), 'group整合');
});
