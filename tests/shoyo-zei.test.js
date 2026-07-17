/* shoyo-zei.test.js — 賞与の源泉所得税(算出率表 甲・令和8)＋賞与社保(年金機構) */
'use strict';
var SZ = require('../lib/shoyo-zei.js');

/* ── 算出率表(甲・令和8)の率選択：前月の社保控除後給与×扶養人数 ── */
T('賞与率 甲: 前月課税29万・扶養0 → 6.126%(260千円≤29万<309千円)', function () {
  eq(SZ.bonusRate(290000, 0, { year: 2026 }).rate, 6.126);
});
T('賞与率 甲: 前月課税29万・扶養2 → 4.084%(276≤290<321千円)', function () {
  eq(SZ.bonusRate(290000, 2, { year: 2026 }).rate, 4.084);
});
T('賞与率 甲: 下限未満は0%(扶養0・8万円<82千円)', function () {
  eq(SZ.bonusRate(80000, 0, { year: 2026 }).rate, 0);
});
T('賞与率 甲: 高額は45.945%(扶養0・400万≥3,495千円)', function () {
  eq(SZ.bonusRate(4000000, 0, { year: 2026 }).rate, 45.945);
});
T('賞与率 甲: 扶養>7は7人扱い・しきい境界(扶養7・前月317千円ちょうど→2.042%)', function () {
  eq(SZ.bonusRate(317000, 9, { year: 2026 }).rate, 2.042); // 9→7扱い・317千円以上
  eq(SZ.bonusRate(316999, 7, { year: 2026 }).rate, 0);     // 317千円未満は0%
});
T('賞与率 乙(令和8・公式PDF): 前月課税で5段階', function () {
  eq(SZ.bonusRate(100000, 0, { taxClass: 'otsu', year: 2026 }).rate, 10.210); // <224千円
  eq(SZ.bonusRate(290000, 0, { taxClass: 'otsu', year: 2026 }).rate, 20.420); // 224〜295
  eq(SZ.bonusRate(400000, 0, { taxClass: 'otsu', year: 2026 }).rate, 30.630); // 295〜527
  eq(SZ.bonusRate(800000, 0, { taxClass: 'otsu', year: 2026 }).rate, 38.798); // 527〜1118
  eq(SZ.bonusRate(1200000, 0, { taxClass: 'otsu', year: 2026 }).rate, 45.945); // ≥1118
  ok(SZ.bonusRate(290000, 0, { taxClass: 'otsu', year: 2026 }).otsu === true);
});
T('範囲外年は直近年+stale', function () {
  var r = SZ.bonusRate(290000, 0, { year: 2099 });
  eq(r.rate, 6.126); eq(r.stale, true); eq(r.year, 2026);
});

/* ── 賞与の源泉所得税 = (賞与−賞与社保) × 率 ── */
T('賞与源泉: 賞与50万(社保0)・前月課税29万・扶養0 → floor(500000×6.126%)=30,630', function () {
  var r = SZ.calcBonusTax({ bonus: 500000, bonusSI: 0, prevSalary: 350000, prevSI: 60000, fuyou: 0, payYm: '2026-12' });
  eq(r.prevAfter, 290000); eq(r.rate, 6.126); eq(r.tax, 30630);
});
T('賞与源泉: 賞与の社保控除後に率を掛ける', function () {
  // 賞与60万・社保9万 → 課税賞与51万 × 6.126% = floor(31242.6)=31242
  var r = SZ.calcBonusTax({ bonus: 600000, bonusSI: 90000, prevSalary: 350000, prevSI: 60000, fuyou: 0, payYm: '2026-12' });
  eq(r.tax, Math.floor(510000 * 0.06126));
});
var Densan = require('../lib/shotokuzei-densan.js');
T('特例: 前月給与なし → 月額表で自動計算(手計算に投げない)', function () {
  // 大きめの賞与で非ゼロを確認: 賞与300万・扶養0・甲。式= 月額表(300万÷6)×6
  var r = SZ.calcBonusTax({ bonus: 3000000, prevSalary: 0, fuyou: 0, taxClass: 'ko', payYm: '2026-12' });
  eq(r.special, true); eq(r.specialComputed, true);
  var expect = Densan.calcByClass(Math.floor(3000000 / 6), 0, 'ko', { year: 2026 }) * 6;
  eq(r.tax, expect); ok(r.tax > 0, '前月なし特例が税0で投げられていない(' + r.tax + ')');
});
T('特例: 賞与が前月課税の10倍超 → 月額表で自動計算((A-B)×6)', function () {
  // 前月課税25万 → 10倍=250万。賞与300万>250万 → 特例
  var r = SZ.calcBonusTax({ bonus: 3000000, bonusSI: 0, prevSalary: 250000, prevSI: 0, fuyou: 1, taxClass: 'ko', payYm: '2026-12' });
  eq(r.special, true); eq(r.specialComputed, true);
  var A = Densan.calcByClass(250000 + Math.floor(3000000 / 6), 1, 'ko', { year: 2026 });
  var B = Densan.calcByClass(250000, 1, 'ko', { year: 2026 });
  eq(r.tax, (A - B) * 6); ok(r.tax > 0, '10倍超特例が計算される(' + r.tax + ')');
  // ちょうど10倍(250万)は特例でない(算出率表)
  ok(SZ.calcBonusTax({ bonus: 2500000, bonusSI: 0, prevSalary: 250000, prevSI: 0, fuyou: 1, payYm: '2026-12' }).special === false);
});
T('乙欄も自動計算: 賞与50万・前月課税29万 → 乙20.420% → floor(500000×20.42%)=102,100', function () {
  var r = SZ.calcBonusTax({ bonus: 500000, bonusSI: 0, prevSalary: 350000, prevSI: 60000, taxClass: 'otsu', payYm: '2026-12' });
  eq(r.otsu, true); eq(r.rate, 20.420); eq(r.tax, Math.floor(500000 * 0.2042)); eq(r.tax, 102100);
  // 乙は甲より高い(扶養0甲6.126% < 乙20.42%)
  ok(r.tax > SZ.calcBonusTax({ bonus: 500000, prevSalary: 350000, prevSI: 60000, fuyou: 0, payYm: '2026-12' }).tax);
});
T('乙でも特例(前月給与なし)はspecial', function () {
  eq(SZ.calcBonusTax({ bonus: 500000, prevSalary: 0, taxClass: 'otsu', payYm: '2026-12' }).special, true);
});

/* ── 賞与の社会保険料(年金機構) ── */
T('賞与社保: 標準賞与額=1,000円未満切捨(500,500→500,000)', function () {
  eq(SZ.calcBonusSI({ bonus: 500500 }).hyojun, 500000);
});
T('賞与社保: 健保=標準×率/2(東京令和8 4.955%)・厚年=標準×9.15%・雇用=総額×率', function () {
  var r = SZ.calcBonusSI({ bonus: 500500, healthRate: 0.04955, employRate: 0.0055 });
  eq(r.health, SZ.han50(500000 * 0.04955));   // 24775
  eq(r.pension, SZ.han50(500000 * 0.0915));    // 45750
  eq(r.employ, SZ.han50(500500 * 0.0055));     // 2753(総額ベース)
  eq(r.kaigo, 0);                              // hasKaigo未指定
  eq(r.total, r.health + r.pension + r.employ);
});
T('賞与社保: 厚年は1回150万上限', function () {
  var r = SZ.calcBonusSI({ bonus: 2000000, healthRate: 0.04955 });
  eq(r.koseiBase, 1500000); eq(r.pension, SZ.han50(1500000 * 0.0915));
  eq(r.kenpoBase, 2000000); // 健保は上限573万までなので200万はそのまま
});
T('賞与社保: 健保は年度累計573万上限(既往550万→残23万のみ対象)', function () {
  var r = SZ.calcBonusSI({ bonus: 1000000, healthRate: 0.04955, ytdKenpoBonus: 5500000 });
  eq(r.kenpoBase, 230000); eq(r.health, SZ.han50(230000 * 0.04955));
});
T('賞与社保: 介護対象は健保ベースに介護率', function () {
  var r = SZ.calcBonusSI({ bonus: 500000, healthRate: 0.04955, kaigoRate: 0.0081, hasKaigo: true });
  eq(r.kaigo, SZ.han50(500000 * 0.0081));
});
T('賞与社保: 賞与0は全0', function () {
  var r = SZ.calcBonusSI({ bonus: 0 });
  eq(r.total, 0); eq(r.hyojun, 0);
});

/* ── 統合(賞与ビューの合成: 社保→源泉→手取り) ── */
T('統合: 賞与50万/前月社保後29万/扶養0/東京令和8(健保5.04%支援金込)/介護対象 → 手取り396,618', function () {
  // 東京令和8 健保従業員率=(9.85+0.23)/2=5.04% / 介護令和8=0.81% / 雇用令和8一般=0.5%
  var si = SZ.calcBonusSI({ bonus: 500000, healthRate: 0.0504, kaigoRate: 0.0081, hasKaigo: true, employRate: 0.005 });
  eq(si.health, 25200); eq(si.kaigo, 4050); eq(si.pension, 45750); eq(si.employ, 2500); eq(si.total, 77500);
  var tax = SZ.calcBonusTax({ bonus: 500000, bonusSI: si.total, prevSalary: 290000, prevSI: 0, fuyou: 0, payYm: '2026-12' });
  eq(tax.rate, 6.126); eq(tax.tax, Math.floor((500000 - 77500) * 0.06126)); // 25,882
  eq(500000 - si.total - tax.tax, 396618);
});
T('統合: 前月給与が無い(0)と源泉はspecialフラグ=自動算出しない(UIは黄警告で手入力)', function () {
  var tax = SZ.calcBonusTax({ bonus: 500000, bonusSI: 77500, prevSalary: 0, prevSI: 0, fuyou: 0, payYm: '2026-12' });
  eq(tax.special, true); eq(tax.tax, 0);
});

/* ── hydrate(中央データ上書き・不正はフォールバック・回帰ゼロ) ── */
T('hydrate rates: 率ラダー差替でbonusRateに反映・restoreで戻る', function () {
  var base = SZ.bonusRate(290000, 0, { year: 2026 }).rate; // 6.126
  eq(base, 6.126);
  // idx=3 の率だけ 99.999 に差替(他の全率は不変にして境界維持)
  var changed = [0.000, 2.042, 4.084, 99.999, 8.168, 10.210, 12.252, 14.294, 16.336, 18.378, 20.420, 22.462, 24.504, 26.546, 28.588, 30.630, 32.672, 35.735, 38.798, 41.861, 45.945];
  var official = [0.000, 2.042, 4.084, 6.126, 8.168, 10.210, 12.252, 14.294, 16.336, 18.378, 20.420, 22.462, 24.504, 26.546, 28.588, 30.630, 32.672, 35.735, 38.798, 41.861, 45.945];
  SZ.hydrate(2026, { rates: changed });
  eq(SZ.bonusRate(290000, 0, { year: 2026 }).rate, 99.999); // idx=3 (260≤290<309)
  SZ.hydrate(2026, { rates: official }); // restore
  eq(SZ.bonusRate(290000, 0, { year: 2026 }).rate, 6.126); // 戻った
});
T('hydrate kou: 年度別扶養テーブル差替→率選択が変わる・restore', function () {
  var origF0 = [0, 82, 94, 260, 309, 342, 372, 402, 433, 520, 605, 684, 715, 752, 795, 854, 922, 1318, 1521, 2621, 3495];
  // 前月290千円で idx=3(6.126%)を、しきい値を上げて idx=2(4.084%)にする
  var newKou = { 0: [0, 82, 94, 999, 309, 342, 372, 402, 433, 520, 605, 684, 715, 752, 795, 854, 922, 1318, 1521, 2621, 3495],
    1: origF0, 2: origF0, 3: origF0, 4: origF0, 5: origF0, 6: origF0, 7: origF0 };
  SZ.hydrate(2027, { kou: newKou });
  eq(SZ.bonusRate(290000, 0, { year: 2027 }).rate, 4.084); // 94≤290<999
  eq(SZ.bonusRate(290000, 0, { year: 2026 }).rate, 6.126); // 2026は不変
});
T('hydrate otsu: 乙欄テーブル差替・restore', function () {
  SZ.hydrate(2028, { otsu: [[0, 11.111], [500, 22.222]] });
  eq(SZ.bonusRate(100000, 0, { taxClass: 'otsu', year: 2028 }).rate, 11.111);
  eq(SZ.bonusRate(600000, 0, { taxClass: 'otsu', year: 2028 }).rate, 22.222);
  eq(SZ.bonusRate(100000, 0, { taxClass: 'otsu', year: 2026 }).rate, 10.210); // 2026不変
});
T('hydrate caps: kenpo_year_cap/kosei_per_cap 差替→calcBonusSIに反映・restore', function () {
  SZ.hydrate(null, { kenpo_year_cap: 1000000, kosei_per_cap: 800000 });
  var r = SZ.calcBonusSI({ bonus: 2000000, healthRate: 0.04955 });
  eq(r.koseiBase, 800000);   // 上限差替
  eq(r.kenpoBase, 1000000);  // 上限差替
  // restore 公式値
  SZ.hydrate(null, { kenpo_year_cap: 5730000, kosei_per_cap: 1500000 });
  var r2 = SZ.calcBonusSI({ bonus: 2000000, healthRate: 0.04955 });
  eq(r2.koseiBase, 1500000); eq(r2.kenpoBase, 2000000);
});
T('hydrate 不正/部分欠落はフォールバック(回帰ゼロ)', function () {
  var before = SZ.bonusRate(290000, 0, { year: 2026 }).rate;
  SZ.hydrate(2026, { rates: 'nope' });            // 非配列→skip
  SZ.hydrate(2026, { rates: [1, 'x', 3] });        // 要素非number→skip
  SZ.hydrate(2026, { kou: { 0: 'bad' } });         // 扶養1..7欠落→skip
  SZ.hydrate(2026, { otsu: [[0]] });               // 2要素でない→skip
  SZ.hydrate(2026, null);                          // null→no-op
  SZ.hydrate(2026, { kenpo_year_cap: 'x' });       // 非number→skip
  eq(SZ.bonusRate(290000, 0, { year: 2026 }).rate, before); // 不変
  var r = SZ.calcBonusSI({ bonus: 2000000, healthRate: 0.04955 });
  eq(r.kenpoBase, 2000000); eq(r.koseiBase, 1500000); // 上限フォールバック維持
});
T('hydrate kosei_ritsu_jugyoin: 上書き可・既定は0.0915のまま(shakaihoken-hyoロック維持)', function () {
  // 既定確認(公式値ロック)
  var d = SZ.calcBonusSI({ bonus: 500000, healthRate: 0.04955 });
  eq(d.pension, SZ.han50(500000 * 0.0915));
  // 上書き可能
  SZ.hydrate(null, { kosei_ritsu_jugyoin: 0.10 });
  eq(SZ.calcBonusSI({ bonus: 500000, healthRate: 0.04955 }).pension, SZ.han50(500000 * 0.10));
  // restore 公式値
  SZ.hydrate(null, { kosei_ritsu_jugyoin: 0.0915 });
  eq(SZ.calcBonusSI({ bonus: 500000, healthRate: 0.04955 }).pension, SZ.han50(500000 * 0.0915));
});
