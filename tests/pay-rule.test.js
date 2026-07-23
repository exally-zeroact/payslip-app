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
T('evalPart 件数×単価: 1件1500円×80件=120000', function () {
  eq(P.evalPart({ type: 'piece', amount: 1500 }, { count: 80 }), 120000);
  eq(P.evalPart({ type: 'piece', amount: 1500 }, { count: 0 }), 0);
});
T('件数×単価は出来高性=歩合割増側(固定+件数×単価)', function () {
  // 固定8万 + 件数×単価(1500×80=12万)=20万。件数分は歩合上乗せ側・固定は通常割増側
  var r = P.basePay({ fixed: 80000, variable: { mode: 'one', parts: [{ type: 'piece', amount: 1500 }] } }, { count: 80 });
  eq(r.base, 200000); eq(r.chosenType, 'piece'); eq(r.fixedForWari, 80000); eq(r.pieceworkForWari, 120000);
});
T('件数×単価 vs 時給保障 の高い方', function () {
  // 件数1500×80=12万 vs 時給1200×160h=19.2万 → 高い方19.2万(保障)
  var r = P.basePay({ fixed: 0, variable: { mode: 'max', parts: [{ type: 'piece', amount: 1500 }, { type: 'hourly', amount: 1200 }] } }, { count: 80, workMin: 9600 });
  eq(r.base, 192000); eq(r.chosenType, 'hourly'); eq(r.pieceworkForWari, 0);
});

/* ── 段階制/スライド率(売上に応じ率アップ・超過分だけ=累進) ── */
T('tiered 累進: 100万まで3%/超5% → 売上120万=40,000', function () {
  var p = { type: 'tiered', tiers: [{ from: 0, rate: 3 }, { from: 1000000, rate: 5 }] };
  eq(P.evalPart(p, { sales: 1200000 }), 40000); // 100万×3%(30000)+20万×5%(10000)
});
T('tiered 累進: しきい未満は最下段のみ / しきいちょうどは超過0', function () {
  var p = { type: 'tiered', tiers: [{ from: 0, rate: 3 }, { from: 1000000, rate: 5 }] };
  eq(P.evalPart(p, { sales: 500000 }), 15000);  // 50万×3%
  eq(P.evalPart(p, { sales: 1000000 }), 30000); // 全部3%・5%帯は0
  eq(P.evalPart(p, { sales: 0 }), 0);
});
T('tiered 3段・順不同でも内部でソート', function () {
  var p = { type: 'tiered', tiers: [{ from: 1000000, rate: 6 }, { from: 0, rate: 2 }, { from: 500000, rate: 4 }] };
  // 50万×2%(10000)+50万×4%(20000)+20万×6%(12000)=42000
  eq(P.evalPart(p, { sales: 1200000 }), 42000);
});
T('tiered 空/不正は0・端数四捨五入', function () {
  eq(P.evalPart({ type: 'tiered', tiers: [] }, { sales: 1000000 }), 0);
  eq(P.evalPart({ type: 'tiered' }, { sales: 1000000 }), 0);
  // 3.333%相当: 30万×1.111%…端数四捨五入(r0)で確認
  eq(P.evalPart({ type: 'tiered', tiers: [{ from: 0, rate: 3.333 }] }, { sales: 300001 }), Math.round(300001 * 3.333 / 100));
});
T('tiered は出来高性=歩合割増側(固定+段階制)', function () {
  var r = P.basePay({ fixed: 100000, variable: { mode: 'one', parts: [{ type: 'tiered', tiers: [{ from: 0, rate: 3 }, { from: 1000000, rate: 5 }] }] } }, { sales: 1200000 });
  eq(r.base, 140000); eq(r.chosenType, 'tiered'); eq(r.fixedForWari, 100000); eq(r.pieceworkForWari, 40000);
});
T('tiered vs 固定歩合 の高い方(max)', function () {
  // 段階制(売上120万→40000) vs 固定率4%(売上120万→48000) → 高い方48000
  var r = P.basePay({ fixed: 0, variable: { mode: 'max', parts: [
    { type: 'tiered', tiers: [{ from: 0, rate: 3 }, { from: 1000000, rate: 5 }] },
    { type: 'rate', amount: 4 }
  ] } }, { sales: 1200000 });
  eq(r.base, 48000); eq(r.chosenType, 'rate');
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

/* ── ★労基法27条 保障給チェック(lacksGuarantee)★ ── */
T('27条: 完全歩合・無保障(固定0・売上×率のみ)=違反の恐れ=true', function () {
  ok(P.lacksGuarantee({ fixed: 0, variable: { mode: 'one', parts: [{ type: 'rate', amount: 35 }] } }) === true);
  ok(P.lacksGuarantee({ fixed: 0, variable: { mode: 'one', parts: [{ type: 'commission' }] } }) === true);
  // 「高い方」でも候補が出来高だけ(rate と commission)で時給保障が無ければ無保障
  ok(P.lacksGuarantee({ fixed: 0, variable: { mode: 'max', parts: [{ type: 'rate', amount: 35 }, { type: 'commission' }] } }) === true);
});
T('27条: 時給保障つき「高い方」は保障あり=false', function () {
  ok(P.lacksGuarantee({ fixed: 0, variable: { mode: 'max', parts: [{ type: 'rate', amount: 35 }, { type: 'hourly', amount: 1200 }] } }) === false);
  ok(P.lacksGuarantee({ fixed: 0, variable: { mode: 'max', parts: [{ type: 'commission' }, { type: 'daily', amount: 8000 }] } }) === false);
});
T('27条: 固定給がある(固定18万+歩合上乗せ)は保障あり=false', function () {
  ok(P.lacksGuarantee({ fixed: 180000, variable: { mode: 'one', parts: [{ type: 'commission' }] } }) === false);
});
T('27条: 出来高が無い(固定のみ/時給のみ/空)は対象外=false', function () {
  ok(P.lacksGuarantee({ fixed: 250000, variable: { mode: 'none', parts: [] } }) === false);
  ok(P.lacksGuarantee({ fixed: 0, variable: { mode: 'one', parts: [{ type: 'hourly', amount: 1500 }] } }) === false);
  ok(P.lacksGuarantee({}) === false);
  ok(P.lacksGuarantee(null) === false);
});
