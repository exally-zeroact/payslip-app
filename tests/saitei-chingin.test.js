/* saitei-chingin.test.js — 地域別最低賃金(令和7年度)の公式値ロック
 * 出典: 厚生労働省「令和7年度 地域別最低賃金 全国一覧」公式PDF(001571192.pdf)を機械抽出して照合(2026-07)
 * ★年度依存の法定数値は自己参照でなく"公式の実数値"をassertしてロックする(据え置き・推定の再発防止)★ */
'use strict';
var SC = require('../lib/saitei-chingin.js');

/* 47都道府県の令和7確定額(厚労省公式・改定後) */
var R7 = {
  hokkaido:1075, aomori:1029, iwate:1031, miyagi:1038, akita:1031, yamagata:1032, fukushima:1033,
  ibaraki:1074, tochigi:1068, gunma:1063, saitama:1141, chiba:1140, tokyo:1226, kanagawa:1225,
  niigata:1050, toyama:1062, ishikawa:1054, fukui:1053, yamanashi:1052, nagano:1061, gifu:1065,
  shizuoka:1097, aichi:1140, mie:1087, shiga:1080, kyoto:1122, osaka:1177, hyogo:1116,
  nara:1051, wakayama:1045, tottori:1030, shimane:1033, okayama:1047, hiroshima:1085, yamaguchi:1043,
  tokushima:1046, kagawa:1036, ehime:1033, kochi:1023, fukuoka:1057, saga:1030, nagasaki:1031,
  kumamoto:1034, oita:1035, miyazaki:1023, kagoshima:1026, okinawa:1023
};

T('最賃: 47都道府県すべて存在', function () {
  eq(Object.keys(SC.todofuken).length, 47);
  eq(Object.keys(R7).length, 47);
});
T('最賃 令和7 公式値ロック(厚労省・全47県)', function () {
  Object.keys(R7).forEach(function (p) {
    eq(SC.getChingin(p), R7[p], p + ' 最賃=' + SC.getChingin(p) + ' 期待' + R7[p]);
  });
});
T('最賃 全国加重平均=1121(令和7・公式)', function () {
  eq(SC.ZENKOKU_HEIKIN, 1121);
});
T('最賃 最高=東京1226 / 最低=高知・宮崎・沖縄1023(令和7)', function () {
  var vals = Object.keys(SC.todofuken).map(function (k) { return SC.todofuken[k].chingin; });
  eq(Math.max.apply(null, vals), 1226);
  eq(Math.min.apply(null, vals), 1023);
});

/* ── 年度追従(最賃は毎年10月改定=会計年度)。値は令和7のまま・未収録年度を検知して暫定警告する仕組み ── */
T('最賃 最賃年度(10月改定境界): 2025-10/2026-09→2025年度 / 2026-10→2026年度', function () {
  eq(SC.saiteiNendoOf('2025-10'), 2025);
  eq(SC.saiteiNendoOf('2026-09'), 2025);   // 令和7年度最賃は2026-09まで有効
  eq(SC.saiteiNendoOf('2026-10'), 2026);   // 令和8年度最賃(2026-10発効)
  eq(SC.saiteiNendoOf('2026-06'), 2025);
});
T('最賃 未収録年度の検知 saiteiStale(収録=令和7年度2025のみ)', function () {
  eq(SC.NENDO_YEAR, 2025);
  eq(SC.saiteiStale('2026-06'), false);    // 令和7年度=収録済
  eq(SC.saiteiStale('2025-11'), false);
  eq(SC.saiteiStale('2026-10'), true);     // 令和8年度=未収録→暫定(要更新)
  eq(SC.saiteiStale('2025-06'), true);     // 令和6年度=未収録
  eq(SC.saiteiStale(''), false);           // 未指定=従来互換(暫定でない)
});
T('最賃 getChingin は ym を渡しても現行(令和7)値を返す(値は捏造しない)', function () {
  eq(SC.getChingin('tokyo', '2026-10'), 1226);
  eq(SC.getChingin('tokyo'), 1226);
});
