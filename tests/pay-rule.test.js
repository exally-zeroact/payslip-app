/* pay-rule.test.js — 給与の決め方(ロジック型)評価エンジン。固定+変動{none/one/max}・「AかBの高い方」 */
'use strict';
var P = require('../lib/pay-rule.js');

/* ── 部品の評価 ── */
T('evalPart 時給×時間: 1200×160h(9600分)=192000', function () {
  eq(P.evalPart({ type: 'hourly', amount: 1200 }, { workMin: 9600 }), 192000);
});
T('evalPart 日給×日数: 10000×22日=220000', function () {
  eq(P.evalPart({ type: 'daily', amount: 10000 }, { workDays: 22 }), 220000);
});
T('evalPart 歩合(当月ctx) / 固定(spec)', function () {
  eq(P.evalPart({ type: 'commission' }, { commission: 250000 }), 250000); // 歩合額は当月値
  eq(P.evalPart({ type: 'fixed', amount: 180000 }, {}), 180000);
});
T('evalPart 売上×率: 売上100万×35%=350000', function () {
  eq(P.evalPart({ type: 'rate', amount: 35 }, { sales: 1000000 }), 350000);
  eq(P.evalPart({ type: 'rate', amount: 3.5 }, { sales: 1000000 }), 35000); // 3.5%
});

/* ── 基本給(固定+変動) ── */
T('月給: 固定250000・変動なし', function () {
  var r = P.basePay({ fixed: 250000, variable: { mode: 'none' } }, {});
  eq(r.base, 250000); eq(r.fixedForWari, 250000); eq(r.pieceworkForWari, 0);
});
T('時給制: 変動one[hourly]・固定0', function () {
  var r = P.basePay({ fixed: 0, variable: { mode: 'one', parts: [{ type: 'hourly', amount: 1200 }] } }, { workMin: 9600 });
  eq(r.base, 192000); eq(r.chosenType, 'hourly'); eq(r.fixedForWari, 192000); eq(r.pieceworkForWari, 0); // 時給は通常割増側
});

/* ── ★AかBの高い方(業界空白)★ ── */
T('歩合 vs 保障(時給×時間) の高い方: 保障が勝つ月', function () {
  // 歩合15万 vs 時給1200×160h=192000 → 高い方192000(保障給)
  var r = P.basePay({ fixed: 0, variable: { mode: 'max', parts: [{ type: 'commission' }, { type: 'hourly', amount: 1200 }] } }, { workMin: 9600, commission: 150000 });
  eq(r.base, 192000); eq(r.chosenType, 'hourly'); eq(r.pieceworkForWari, 0); // 保障(時給)採用=通常割増側
});
T('歩合 vs 保障 の高い方: 歩合が勝つ月', function () {
  var r = P.basePay({ fixed: 0, variable: { mode: 'max', parts: [{ type: 'commission' }, { type: 'hourly', amount: 1200 }] } }, { workMin: 9600, commission: 250000 });
  eq(r.base, 250000); eq(r.chosenType, 'commission'); eq(r.pieceworkForWari, 250000); eq(r.fixedForWari, 0); // 歩合採用=歩合割増側
});

/* ── 固定給+歩合(加算・割増は分解) ── */
T('固定給+歩合: 固定18万+歩合10万=28万・割増基礎は分解', function () {
  var r = P.basePay({ fixed: 180000, variable: { mode: 'one', parts: [{ type: 'commission' }] } }, { commission: 100000 });
  eq(r.base, 280000); eq(r.fixed, 180000); eq(r.variable, 100000);
  eq(r.fixedForWari, 180000); eq(r.pieceworkForWari, 100000); // 固定18万=通常割増 / 歩合10万=歩合上乗せ
});

/* ── ★司さんの例: 固定18万 +(売上35% か 時給1200 の高い方)★ ── */
T('司さん例: 売上が多い月は歩合(売上×率)採用', function () {
  // 売上100万×35%=35万 vs 時給1200×160h=19.2万 → 高い方35万。base=18万+35万=53万
  var r = P.basePay({ fixed: 180000, variable: { mode: 'max', parts: [{ type: 'rate', amount: 35 }, { type: 'hourly', amount: 1200 }] } }, { sales: 1000000, workMin: 9600 });
  eq(r.base, 530000); eq(r.chosenType, 'rate'); eq(r.fixedForWari, 180000); eq(r.pieceworkForWari, 350000);
});
T('司さん例: 売上が少ない月は時給保障が採用', function () {
  // 売上40万×35%=14万 vs 時給1200×160h=19.2万 → 高い方19.2万(保障)。base=18万+19.2万=37.2万
  var r = P.basePay({ fixed: 180000, variable: { mode: 'max', parts: [{ type: 'rate', amount: 35 }, { type: 'hourly', amount: 1200 }] } }, { sales: 400000, workMin: 9600 });
  eq(r.base, 372000); eq(r.chosenType, 'hourly'); eq(r.fixedForWari, 372000); eq(r.pieceworkForWari, 0); // 保障(時給)採用=固定側に合算し通常割増
});

/* ── 無効/空 ── */
T('空/無効specは0・落ちない', function () {
  eq(P.basePay({}, {}).base, 0);
  eq(P.basePay(null, null).base, 0);
  eq(P.basePay({ fixed: 0, variable: { mode: 'max', parts: [] } }, {}).base, 0);
});
