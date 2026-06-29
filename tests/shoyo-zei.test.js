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
T('賞与率 乙はotsuフラグ(本実装は手入力)', function () {
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
T('特例: 前月給与なし → special(自動算出せず・月額表案件)', function () {
  var r = SZ.calcBonusTax({ bonus: 500000, prevSalary: 0, payYm: '2026-12' });
  eq(r.special, true); eq(r.tax, 0);
});
T('特例: 賞与(社保後)が前月課税の10倍超 → special', function () {
  // 前月課税29万 → 10倍=290万。賞与300万>290万 → special
  var r = SZ.calcBonusTax({ bonus: 3000000, bonusSI: 0, prevSalary: 350000, prevSI: 60000, fuyou: 0, payYm: '2026-12' });
  eq(r.special, true);
  // ちょうど10倍(290万)は特例でない
  ok(SZ.calcBonusTax({ bonus: 2900000, bonusSI: 0, prevSalary: 350000, prevSI: 60000, fuyou: 0, payYm: '2026-12' }).special === false);
});
T('乙欄は otsu フラグ・税0(手入力)', function () {
  var r = SZ.calcBonusTax({ bonus: 500000, prevSalary: 350000, prevSI: 60000, taxClass: 'otsu', payYm: '2026-12' });
  eq(r.otsu, true); eq(r.tax, 0);
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
