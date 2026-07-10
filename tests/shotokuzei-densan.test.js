/* shotokuzei-densan.test.js — 源泉所得税 電算機計算の特例(甲/乙)の法令リテラル固定 + 年度別param + hydrate
 * 期待値は国税庁の算式から手計算(自己参照でない・実数リテラル)。年度別paramへの抽出後も一致=回帰ゼロ。 */
'use strict';
var D = require('../lib/shotokuzei-densan.js');

/* --- 甲欄(実数リテラル・手計算) --- */
T('densan 甲 令和8: A=300000,扶養0 → 7910円(控除後B=154999×5.105%→10円丸め)', function () {
  eq(D.calc(300000, 0, { year: 2026 }), 7910);
});
T('densan 甲 令和7: A=300000,扶養0 → 8380円(基礎控除40000でR8より高い)', function () {
  eq(D.calc(300000, 0, { year: 2025 }), 8380);
});
T('densan 甲: A<=0 / B<=0 は税0', function () {
  eq(D.calc(0, 0, { year: 2026 }), 0);
  eq(D.calc(50000, 0, { year: 2026 }), 0); // 控除で課税所得0以下
});
T('densan 甲: 扶養1人で FUYOU_KOJO=31667 が引かれ税が下がる', function () {
  var f0 = D.calc(300000, 0, { year: 2026 });
  var f1 = D.calc(300000, 1, { year: 2026 });
  ok(f1 < f0, '扶養1人で税額減');
});

/* --- 乙欄(実数リテラル・手計算 令和8 denshi_02) --- */
T('densan 乙 令和8: A=300000,扶養0 → 53600円(part2.5-part1.5→100円丸め×1.021)', function () {
  eq(D.calcOtsu(300000, 0, { year: 2026 }), 53600);
});
T('densan 乙: A<105000 は A×3.063%(1円切捨)', function () {
  eq(D.calcOtsu(100000, 0, { year: 2026 }), Math.floor(100000 * 0.03063)); // 3063
});
T('densan calcByClass: taxClass=otsu→乙 / 既定→甲', function () {
  eq(D.calcByClass(300000, 0, 'otsu', { year: 2026 }), D.calcOtsu(300000, 0, { year: 2026 }));
  eq(D.calcByClass(300000, 0, 'ko', { year: 2026 }), D.calc(300000, 0, { year: 2026 }));
});

/* --- 給与所得控除・基礎控除 ブラケット境界(実数リテラル) --- */
T('densan 給与所得控除R8: X=158333→54167(定額) / X=158334→ceil1(X*0.3+6667)', function () {
  eq(D.kyuyoKojo(158333, true), 54167);
  eq(D.kyuyoKojo(158334, true), Math.ceil(158334 * 0.30 + 6667 - 1e-9)); // 54167.2→54168
});
T('densan 基礎控除R8: A=2120833→48334 / A=2120834→40000', function () {
  eq(D.kisoKojo(2120833, true), 48334);
  eq(D.kisoKojo(2120834, true), 40000);
});
T('densan 基礎控除R7: A=2162499→40000(R7は48334段が無い)', function () {
  eq(D.kisoKojo(2162499, false), 40000);
  eq(D.kisoKojo(2120833, false), 40000); // R7はここも40000
});

/* --- hydrate(中央上書き)→calc反映 / 不正はフォールバック / 未収録年no-op --- */
T('densan hydrate: 基礎控除を中央値で上書き→calc増、正規値で復元=回帰ゼロ', function () {
  var before = D.calc(300000, 0, { year: 2026 });
  eq(before, 7910);
  D.hydrate(2026, { kiso: [{ upto: null, flat: 0 }] }); // 基礎控除0(全域)
  ok(D.calc(300000, 0, { year: 2026 }) > before, '基礎控除0で税額増');
  // 正規の令和8 基礎控除で復元
  D.hydrate(2026, { kiso: [{ upto: 2120833, flat: 48334 }, { upto: 2162499, flat: 40000 }, { upto: 2204166, flat: 26667 }, { upto: 2245833, flat: 13334 }, { upto: null, flat: 0 }] });
  eq(D.calc(300000, 0, { year: 2026 }), before);
});
T('densan hydrate: 不正/部分/未収録年は無視=フォールバック維持', function () {
  var before = D.calc(300000, 0, { year: 2026 });
  D.hydrate(2026, { kiso: 'garbage' });
  D.hydrate(2026, { kyuyo: [] });
  D.hydrate(2026, null);
  D.hydrate(9999, { kiso: [{ upto: null, flat: 0 }] }); // 現行モデル外の年→no-op
  eq(D.calc(300000, 0, { year: 2026 }), before);
});
T('densan hydrate: 行の中身が不正(upto非数値/flat欠落/rate欠落)なら表ごと破棄=フォールバック維持', function () {
  var before = D.calc(300000, 0, { year: 2026 }); eq(before, 7910);
  D.hydrate(2026, { kyuyo: [{ upto: 158333, flat: 54167 }, { upto: 'garbage', rate: 0.3, add: 6667 }] }); // upto非数値の行
  eq(D.calc(300000, 0, { year: 2026 }), before, 'kyuyo不正行→破棄');
  D.hydrate(2026, { kiso: [{ upto: 2120833 }] }); // flat欠落(rate/addも無し)
  eq(D.calc(300000, 0, { year: 2026 }), before, 'kiso不正行→破棄');
  D.hydrate(2026, { zeiKo: [{ upto: null, rate: 0.5 }] }); // sub欠落
  eq(D.calc(300000, 0, { year: 2026 }), before, 'zeiKo不正行→破棄');
});
