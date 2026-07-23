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
/* 段階制/スライド率(累進)=保守的に明確な2段だけ読む */
T('★段階制★「売上100万まで3%、超えたら5%」→ tiered[{0,3},{100万,5}]', function () {
  var r = PP.parse('売上100万まで3%、超えたら5%');
  eq(r.payType, 'カスタム');
  var v = r.fields.payRule.variable; eq(v.parts.length, 1); eq(v.parts[0].type, 'tiered');
  eq(v.parts[0].tiers.length, 2);
  eq(v.parts[0].tiers[0].from, '0'); eq(v.parts[0].tiers[0].rate, '3');
  eq(v.parts[0].tiers[1].from, '1000000'); eq(v.parts[0].tiers[1].rate, '5');
});
T('段階制: 「50万までは2割、それ以上4割」(割表記)', function () {
  var r = PP.parse('50万までは2割、それ以上4割');
  var t = r.fields.payRule.variable.parts[0]; eq(t.type, 'tiered');
  eq(t.tiers[0].rate, '20'); eq(t.tiers[1].from, '500000'); eq(t.tiers[1].rate, '40');
});
T('段階制: 固定給と併用「固定20万＋売上80万まで3%超5%」', function () {
  var r = PP.parse('固定20万＋売上80万まで3%超5%');
  eq(r.fields.payRule.fixed, '200000');
  var t = r.fields.payRule.variable.parts[0]; eq(t.type, 'tiered');
  eq(t.tiers[1].from, '800000');
});
T('段階制でない単一率は従来どおりrate(誤検出しない)', function () {
  var r = PP.parse('売上35%'); eq(r.fields.payRule.variable.parts[0].type, 'rate');
});
/* 複合入力のバグ回帰(監査B1/B2) */
T('B1: 日給を含む複合で日給が消えない(高い方)', function () {
  var r = PP.parse('日給1万か歩合の高い方');
  eq(r.payType, 'カスタム'); var v = r.fields.payRule.variable;
  eq(v.mode, 'max'); var types = v.parts.map(function (p) { return p.type; });
  ok(types.indexOf('daily') >= 0, '日給(daily)が部品に残る: ' + types.join(','));
  ok(types.indexOf('commission') >= 0, '歩合も残る');
});
T('B1: 日給単独は従来どおり日給制', function () {
  var r = PP.parse('日給1万'); eq(r.payType, '日給'); eq(r.fields.base, '10000');
});
T('B1: 固定+日給の複合でも日給が残る', function () {
  var r = PP.parse('固定5万＋日給1万'); eq(r.payType, 'カスタム');
  var types = r.fields.payRule.variable.parts.map(function (p) { return p.type; });
  ok(types.indexOf('daily') >= 0, '日給が残る: ' + types.join(','));
});
T('B2: 「＋(両方)」で2変動部品は器で合算不可→自信低(low)で確認を促す', function () {
  var r = PP.parse('時給1200＋歩合');
  eq(r.payType, 'カスタム');
  eq(r.low, true); // ＋(合算)意図は none/one/max では表現できない=要確認フラグ
});
T('B2: 「高い方」明示は自信あり(low=false)', function () {
  var r = PP.parse('時給1200か歩合の高い方');
  eq(r.low, false);
});
T('空/意味不明→ ok:false(要手入力)', function () {
  eq(PP.parse('').ok, false); eq(PP.parse('あいうえお').ok, false);
});

/* ★手当の一括雑入力(強化)★ */
T('yen 千対応: 5千→5000 / 1.5千→1500', function () {
  eq(PP._yen('5千'), 5000); eq(PP._yen('1.5千'), 1500);
});
T('時間給の表記ゆれ→ 時給', function () {
  var r = PP.parse('時間給1300'); eq(r.payType, '時給'); eq(r.fields.hourly, '1300');
});
T('「月給25万 役職手当2万 通勤1万 皆勤5千」→ 月給＋手当(通勤はcommute)', function () {
  var r = PP.parse('月給25万 役職手当2万 通勤1万 皆勤5千');
  eq(r.ok, true); eq(r.payType, '月給'); eq(r.fields.base, '250000');
  eq(r.fields.commute, '10000'); // 通勤はcommuteへ
  var yaku = (r.fields.shikyu || []).find(function (x) { return x.label === '役職手当'; });
  var kaikin = (r.fields.shikyu || []).find(function (x) { return x.label === '皆勤手当'; });
  ok(yaku && yaku.value === '20000', '役職手当2万: ' + JSON.stringify(yaku));
  ok(kaikin && kaikin.value === '5000', '皆勤手当5千: ' + JSON.stringify(kaikin));
  ok(!(r.fields.shikyu || []).some(function (x) { return x.label === '通勤手当'; }), '通勤はshikyuでなくcommuteへ');
});
T('手当だけ「役職手当3万」→ payType=null(給与形態据え置き)＋手当反映', function () {
  var r = PP.parse('役職手当3万');
  eq(r.ok, true); eq(r.payType, null);
  var yaku = (r.fields.shikyu || []).find(function (x) { return x.label === '役職手当'; });
  ok(yaku && yaku.value === '30000', '役職手当3万を反映: ' + JSON.stringify(yaku));
});
T('手当が給与形態の金額を誤吸収しない(時給1200＋役職手当2万)', function () {
  var r = PP.parse('時給1200 役職手当2万');
  eq(r.payType, '時給'); eq(r.fields.hourly, '1200'); // 時給は1200のまま(2万を吸わない)
  var yaku = (r.fields.shikyu || []).find(function (x) { return x.label === '役職手当'; });
  ok(yaku && yaku.value === '20000', '役職手当2万は別に: ' + JSON.stringify(yaku));
});
T('住宅手当15000(円直書き)＋一般「◯◯手当」', function () {
  var r = PP.parse('月給20万 住宅手当15000 資格手当3千');
  var jutaku = (r.fields.shikyu || []).find(function (x) { return x.label === '住宅手当'; });
  var shikaku = (r.fields.shikyu || []).find(function (x) { return x.label === '資格手当'; });
  ok(jutaku && jutaku.value === '15000', '住宅手当15000: ' + JSON.stringify(jutaku));
  ok(shikaku && shikaku.value === '3000', '資格手当3千=3000: ' + JSON.stringify(shikaku));
});
T('接続詞を名前に吸わない(「時給1200の高い方役職手当2万」→ 役職手当・「方」を吸わない)', function () {
  var r = PP.parse('時給1200の高い方役職手当2万');
  var sh = r.fields.shikyu || [];
  var yaku = sh.find(function (x) { return x.label === '役職手当'; });
  ok(yaku && yaku.value === '20000', '役職手当2万に正しく切出: ' + JSON.stringify(sh));
  ok(!sh.some(function (x) { return /方/.test(x.label); }), '「方役職手当」等の接続詞混入なし: ' + JSON.stringify(sh));
});
T('高い方(カスタム)＋手当が両立(「固定18万 売上の3.5割か時給1200の高い方 役職手当2万」)', function () {
  var r = PP.parse('固定18万 売上の3.5割か時給1200の高い方 役職手当2万');
  var sh = r.fields.shikyu || [];
  var yaku = sh.find(function (x) { return x.label === '役職手当'; });
  ok(yaku && yaku.value === '20000', '高い方と併記でも役職手当を反映: ' + JSON.stringify(sh));
  ok(!sh.some(function (x) { return /方/.test(x.label); }), '接続詞混入なし: ' + JSON.stringify(sh));
});
T('単位直後の手当を単位ごと吸わない(「月給25万役職手当2万」→ base25万＋役職手当2万)', function () {
  var r = PP.parse('月給25万役職手当2万');
  eq(r.payType, '月給', 'payType=月給');
  eq(r.fields.base, '250000', 'base=25万(役職手当に万を吸われない)');
  var yaku = (r.fields.shikyu || []).find(function (x) { return x.label === '役職手当'; });
  ok(yaku && yaku.value === '20000', '役職手当2万: ' + JSON.stringify(yaku));
});
