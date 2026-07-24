/* warimashi.test.js — 割増賃金エンジン検証（労基法37条/施行規則19条/基発150号） */
'use strict';
var W = require('../lib/warimashi.js');

/* 1か月平均所定労働時間 */
T('月平均所定: (365−120)×8÷12 = 163.33h', function () {
  var h = W.monthlyStdHours(120, 8, false);
  ok(Math.abs(h - 163.3333) < 0.001, '163.33');
});
T('月平均所定: 閏年は366で計算', function () {
  ok(W.monthlyStdHours(120, 8, true) > W.monthlyStdHours(120, 8, false), '閏年の方が大きい');
});

/* 1時間単価（50銭以上切上） */
T('単価: 260,000÷163.33=1,591.84 → 1,592（50銭以上切上）', function () {
  eq(W.hourlyUnit(260000, W.monthlyStdHours(120, 8, false)), 1592);
});
T('単価: ちょうど.5未満は切捨', function () {
  // 1000.4 → 1000
  eq(W.han50(1000.4), 1000); eq(W.han50(1000.5), 1000); eq(W.han50(1000.51), 1001);
});
T('単価: ちょうど50銭は切上(基発150号・hourlyUnitはhan50Up)', function () {
  // 3001÷2=1500.50 → 1501(切上)。社保han50を流用していると1500で過少(1円)だった
  eq(W.hourlyUnit(3001, 2), 1501);
  // 50銭未満は切捨のまま: 3000÷2=1500.00→1500 / 3000.9÷2=1500.45→1500
  eq(W.hourlyUnit(3000, 2), 1500);
});

/* かんたん：残業45h・深夜2h → 90,346（検算一致） */
T('かんたん: 残業45h+深夜2h → 89,550+796=90,346', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 45, otM: 0, nightH: 2, nightM: 0, holidayH: 0, holidayM: 0 });
  eq(r.unit, 1592);
  var ot = r.lines.find(function (l) { return l.key === 'ot'; });
  var ni = r.lines.find(function (l) { return l.key === 'night'; });
  eq(ot.amount, 89550, '残業 1592×1.25×45'); eq(ni.amount, 796, '深夜 1592×0.25×2');
  eq(r.total, 90346, '合計');
});

/* 詳細の排他区分（時間外43h + 時間外深夜2h）= かんたんと同額 */
T('詳細: 時間外43h(1.25)+時間外深夜2h(1.5)=90,346（かんたんと一致）', function () {
  var r = W.calc(1592, [
    { key: 'ot', label: '時間外', rate: W.RATE.ot, minutes: 43 * 60 },
    { key: 'otNight', label: '時間外深夜', rate: W.RATE.otNight, minutes: 2 * 60 }
  ]);
  eq(r.total, 90346);
});

/* 月60時間超の自動分割（増分0.25） */
T('かんたん: 残業70h → 60h超10hに+0.25(1.5)が乗る', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 70, otM: 0, nightH: 0, nightM: 0, holidayH: 0, holidayM: 0 });
  var ot = r.lines.find(function (l) { return l.key === 'ot'; });
  var o60 = r.lines.find(function (l) { return l.key === 'over60inc'; });
  eq(ot.minutes, 70 * 60, '残業全70hは1.25');
  eq(o60.minutes, 10 * 60, '60h超=10hに追加0.25');
  // 検算: 1592*1.25*70 + 1592*0.25*10 = 139300 + 3980 = 143280
  eq(r.total, 143280);
});

/* 1分単位（30分=0.5h を正しく扱う） */
T('1分単位: 残業1時間30分 → 1592×1.25×1.5=2,985', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 1, otM: 30, nightH: 0, nightM: 0, holidayH: 0, holidayM: 0 });
  eq(r.total, 2985);
});

/* 全率テーブルの妥当性 */
T('率テーブル: 1.25/1.5/1.5/1.75/0.25/1.35/1.6', function () {
  eq(W.RATE.ot, 1.25); eq(W.RATE.otNight, 1.5); eq(W.RATE.over60, 1.5);
  eq(W.RATE.over60Night, 1.75); eq(W.RATE.night, 0.25); eq(W.RATE.holiday, 1.35); eq(W.RATE.holidayNight, 1.6);
});

/* 法定休日(1.35) */
T('かんたん: 法定休日8h → 1592×1.35×8=17,194', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, holidayH: 8, holidayM: 0 });
  var h = r.lines.find(function (l) { return l.key === 'holiday'; });
  eq(h.rate, 1.35); eq(h.amount, 17194); eq(r.total, 17194);
});
/* 分のみ入力 */
T('1分単位: 残業0時間30分 → 1592×1.25×0.5=995', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 0, otM: 30 });
  eq(r.total, 995);
});

/* 詳細7区分：各率で計算・かんたんと整合 */
T('詳細: 時間外43h+時間外深夜2h=90,346（かんたん45h/深夜2hと一致）', function () {
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { ot: 43 * 60, otNight: 2 * 60 } });
  eq(r.total, 90346);
});
T('詳細: 全7区分の率が正しく乗る', function () {
  var seg = { ot: 60, otNight: 60, over60: 60, over60Night: 60, night: 60, holiday: 60, holidayNight: 60 }; // 各1h
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: seg });
  // 単価1592・各1h。割増はhan50Up(基発150号)で: ot1990/otNight2388/over60 2388/over60Night2786/night398/holiday2149(2149.2切捨)/holidayNight2547(2547.2切捨)
  // ★実数リテラルで固定(被テストと同じhan50/han50Upを使う自己参照にしない)。han50(社保用)と取り違えたら検知される
  eq(r.total, 1990 + 2388 + 2388 + 2786 + 398 + 2149 + 2547); // = 14646
  eq(r.total, 14646);
  eq(r.lines.length, 7);
});
T('詳細: 法定休日×深夜は1.6', function () {
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { holidayNight: 60 } });
  eq(r.lines[0].rate, 1.6); eq(r.total, W.han50(1592 * 1.6));
});
T('detailComponents: 0分は率0でも行は出る(検算表示用)・calcはfilterで0除外', function () {
  eq(W.detailComponents({ ot: 120 }).length, 7); // 全区分の枠
  eq(W.calc(1592, W.detailComponents({ ot: 120 })).lines.length, 1); // 実額は0除外で1行
});

/* ── 率オーバーライド(法定は最低・会社は上げられる・合成式) ── */
T('既定(rates無し)は法定下限のまま不変', function () {
  var R = W.resolveRates();
  eq(R.ot, 1.25); eq(R.holiday, 1.35); eq(R.night, 0.25); eq(R.over60Add, 0.25);
});
T('残業率を1.3に上げると60h超も連動(合成式 1.3+0.25=1.55)', function () {
  var c = W.detailComponents({ ot: 60, over60: 60, otNight: 60, holidayNight: 60 }, { ot: 1.3 });
  var by = {}; c.forEach(function (x) { by[x.key] = x.rate; });
  eq(by.ot, 1.3); eq(by.over60, 1.55); eq(by.otNight, 1.55); eq(by.holidayNight, 1.6); // 休日は未変更1.35+深夜0.25
});
T('深夜率を0.3に上げると深夜系が連動', function () {
  var c = W.detailComponents({ night: 60, otNight: 60, holidayNight: 60 }, { night: 0.3 });
  var by = {}; c.forEach(function (x) { by[x.key] = x.rate; });
  eq(by.night, 0.3); eq(by.otNight, 1.55); eq(by.holidayNight, 1.65);
});
T('かんたんも率上書きが効く(残業1.3)', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 10, rates: { ot: 1.3 } });
  // 1592*1.3*10=20696
  eq(r.total, 20696);
});

/* ── 端数(基発150号): 割増はちょうど50銭で"切上"(社保とは逆) ── */
T('han50Up: ちょうど50銭は切上(795.5→796) / 未満は切捨', function () {
  eq(W.han50Up(795.5), 796); eq(W.han50Up(795.49), 795); eq(W.han50Up(795.0), 795);
});
T('割増calc: 50銭ちょうどの区分が切上される(社保han50なら795で過少だった)', function () {
  // 単価1591 × 0.25 × 2h = 795.5 → 切上796
  var r = W.calc(1591, [{ key: 'night', label: '深夜', rate: 0.25, minutes: 120 }]);
  eq(r.total, 796);
});

/* ── 歩合給(出来高払) ── */
T('歩合単価=歩合総額÷総労働時間(所定+時間外)', function () {
  // 歩合20万・総労働160h → 1250/h
  eq(W.commissionUnit(200000, 160 * 60), 1250);
});
T('歩合の割増は0.25のみ(時間外)・固定給1.25と別', function () {
  // 単価1250・時間外10h → han50(1250*0.25*10)=3125
  var r = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { ot: 10 * 60 } });
  eq(r.total, 3125);
});
T('歩合の深夜+0.25・法定休日+0.35', function () {
  var r = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { night: 2 * 60, holiday: 8 * 60 } });
  // 深夜 han50(1250*0.25*2)=625 / 休日 han50(1250*0.35*8)=3500
  eq(r.total, 625 + 3500);
});
T('保障給/高い方: 歩合 vs 時給×総時間 の高い方', function () {
  // 歩合15万 vs 時給1200×160h=192000 → 高い方192000
  eq(W.guaranteePay(1200, 160 * 60), 192000);
  eq(W.higherOf(150000, W.guaranteePay(1200, 160 * 60)), 192000);
  eq(W.higherOf(250000, W.guaranteePay(1200, 160 * 60)), 250000);
});
/* 歩合の基本給配線(app.js syncBasePay の単一ソース) */
T('commissionBasePay: 歩合<保障 → 保障給適用 / 歩合>保障 → 歩合実績', function () {
  eq(W.commissionBasePay(150000, 1200, 160 * 60), 192000); // 歩合15万 < 保障192000 → 保障給
  eq(W.commissionBasePay(250000, 1200, 160 * 60), 250000); // 歩合25万 > 保障192000 → 歩合実績
  eq(W.commissionBasePay(192000, 1200, 160 * 60), 192000); // 同額
});
T('commissionBasePay: 保障時給未設定(0)なら歩合実績がそのまま基本給', function () {
  eq(W.commissionBasePay(180000, '', 160 * 60), 180000);
  eq(W.commissionBasePay(0, '', 160 * 60), 0);
});
/* 対立監査H2(2026-07-05): 保障給が効く月は割増も保障給ベース(高い方)で算定=過小防止(労基37条) */
T('歩合の割増: 保障給>歩合実績の月は割増単価も保障給ベース(高い方)', function () {
  // 歩合10万・保障時給1500×総労働200h=30万(=基本給) ・残業20h。割増単価=30万÷200h=1500 → han50Up(1500*0.25*20h)=7500
  var base = W.commissionBasePay(100000, 1500, 200 * 60); eq(base, 300000);
  var r = W.commission({ commissionTotal: base, totalWorkMin: 200 * 60, seg: { ot: 20 * 60 } });
  eq(r.total, 7500);
  // 旧バグ(生の歩合10万基準)なら単価500→ot=2500と過小だった
  var bad = W.commission({ commissionTotal: 100000, totalWorkMin: 200 * 60, seg: { ot: 20 * 60 } });
  eq(bad.total, 2500); ok(r.total > bad.total, '保障給ベースの方が大きい(過小でない)');
});
/* M2(2026-07-10): 会社の割増率上書きが歩合にも効く(silent-wrong修正・労基37条)。増分=R.ot-1/R.night/R.holiday-1 */
T('歩合の割増率上書き: 会社が残業率1.30なら歩合の時間外増分0.30', function () {
  // 単価1250・時間外10h。既定0.25→3125 / 上書き1.30→増分0.30→1250*0.30*10=3750
  var d = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { ot: 10 * 60 } });
  eq(d.total, 3125);
  var r = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { ot: 10 * 60 }, rates: { ot: 1.30 } });
  eq(r.total, 3750);
});
T('歩合の割増率上書き: 法定休日1.40=増分0.40・深夜0.30', function () {
  // 単価1250・休日8h・深夜2h。上書き holiday1.40→0.40→1250*0.40*8=4000 / night0.30→1250*0.30*2=750
  var r = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { holiday: 8 * 60, night: 2 * 60 }, rates: { holiday: 1.40, night: 0.30 } });
  eq(r.total, 4000 + 750);
});
T('歩合の割増率: rates未指定/空は法定下限(0.25/0.25/0.35)=回帰ゼロ', function () {
  var a = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { ot: 10 * 60, night: 2 * 60, holiday: 8 * 60 } });
  var b = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { ot: 10 * 60, night: 2 * 60, holiday: 8 * 60 }, rates: {} });
  eq(a.total, b.total);
  eq(a.total, 3125 + 625 + 3500); // 既定=時間外3125+深夜625+休日3500
});
T('歩合の割増率: 不正な率<1.0(残業100%等)は増分0にクランプ=負の割増を防ぐ', function () {
  var r = W.commission({ commissionTotal: 200000, totalWorkMin: 160 * 60, seg: { ot: 10 * 60, holiday: 8 * 60 }, rates: { ot: 1.00, holiday: 0.50 } });
  eq(r.total, 0); // 増分 max(0,0)=0 / max(0,-0.5)=0 → 割増ゼロ(負にならない)
});
T('最低賃金チェック: 賃金÷総時間 ≧ 地域別最賃', function () {
  // 時給換算 192000/160=1200 → 東京1163以上=OK / 1100基準割れ
  eq(W.minWageOk(192000, 160 * 60, 1163), true);
  eq(W.minWageOk(170000, 160 * 60, 1163), false); // 1062.5<1163
});

/* ── 固定残業(みなし): みなし時間は時間外(ot)の基本割増から控除・超過分のみ支払う ── */
T('みなし: 残業45h・みなし20h → 時間外は25h分のみ(深夜はみなし控除しない)', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 45, otM: 0, nightH: 2, nightM: 0, minashiMin: 20 * 60 });
  var ot = r.lines.find(function (l) { return l.key === 'ot'; });
  var ni = r.lines.find(function (l) { return l.key === 'night'; });
  eq(ot.minutes, 25 * 60, '45-20=25hのみ時間外割増');
  eq(ni.minutes, 2 * 60, '深夜はみなし対象外');
});
T('みなし≥残業 → 時間外割増0(固定残業代が充当)', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 15, minashiMin: 20 * 60 });
  eq(r.lines.filter(function (l) { return l.key === 'ot'; }).length, 0, '時間外0');
});
T('みなし: 60h超増分は実残業で計算(固定残業代は60h超割増を充当不可)', function () {
  // 残業70h・みなし45h → 時間外25h@1.25 + 60h超10h@0.25(実70hベース)
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 70, minashiMin: 45 * 60 });
  var ot = r.lines.find(function (l) { return l.key === 'ot'; });
  var o60 = r.lines.find(function (l) { return l.key === 'over60inc'; });
  eq(ot.minutes, 25 * 60, '70-45=25h'); eq(o60.minutes, 10 * 60, '60h超は実残業70hで10h');
  eq(r.total, W.han50Up(1592 * 1.25 * 25) + W.han50Up(1592 * 0.25 * 10));
});
T('みなし0/未指定は従来どおり全額(回帰)', function () {
  eq(W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 45, nightH: 2, minashiMin: 0 }).total, 90346);
  eq(W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 45, nightH: 2 }).total, 90346);
});
/* ★P0-② unit明示指定(時給/日給の労基則19条単価)。日給12,000/8h→単価1,500で残業が正しく計算される */
T('easy: unit明示で単価直接指定(日給1,500円/h・残業5h=1,500×1.25×5=9,375)', function () {
  var r = W.easy({ unit: 1500, otH: 5, otM: 0 });
  eq(r.unit, 1500); eq(r.total, W.han50Up(1500 * 1.25 * 5));
});
T('easy: unit明示は月給算式(base÷月平均所定)を上書きする', function () {
  // baseを渡してもunitがあればunit優先(=日給者がbase(月間総額)で過小にならない)
  var r = W.easy({ unit: 1500, base: 216000, annualHolidays: 120, dailyHours: 8, otH: 5 });
  eq(r.unit, 1500, 'unit優先(baseの216000÷163.33≈1,322にならない)');
});
T('easy: unit未指定は従来の月給算式(回帰ゼロ)', function () {
  var a = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 10 });
  var b = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 10, unit: null });
  eq(a.total, b.total); ok(a.unit === W.han50Up(260000 / W.monthlyStdHours(120, 8, false)), '基礎÷月平均所定');
});
T('detail: unit明示でも単価override(日給の詳細区分)', function () {
  var r = W.detail({ unit: 1500, seg: { ot: 5 * 60 } });
  eq(r.unit, 1500);
});
T('easy: unit明示は基発150号どおりhan50Up丸め(手当加算の端数)', function () {
  eq(W.easy({ unit: 1500.4, otH: 5 }).unit, 1500);  // .5未満切捨
  eq(W.easy({ unit: 1500.6, otH: 5 }).unit, 1501);  // .5以上切上
});
T('詳細モードでもみなしは時間外(ot)区分から控除', function () {
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { ot: 45 * 60 }, minashiMin: 20 * 60 });
  eq(r.lines.find(function (l) { return l.key === 'ot'; }).minutes, 25 * 60);
});

/* ── 60時間 ちょうどの境界(off-by-one防止) ── */
T('60h境界: 残業ちょうど60h→60h超は無し(over60inc行が出ない)', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 60, otM: 0 });
  eq(r.lines.filter(function (l) { return l.key === 'over60inc'; }).length, 0, '3600分ちょうどは超過0');
  eq(r.total, W.han50Up(1592 * 1.25 * 60)); // = 119400 (残業のみ)
  eq(r.total, 119400);
});
T('60h境界: 60h1分→60h超は1分だけ計上', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 60, otM: 1 });
  var o60 = r.lines.find(function (l) { return l.key === 'over60inc'; });
  ok(o60 && o60.minutes === 1, '3601分→超過1分');
});

/* ── かんたん(増分方式) ≡ 詳細(排他区分) の同値ロック: 60h超×深夜が重なる複合ケース ──
   easyは残業全体×1.25＋深夜/60h超を+0.25上乗せ。detailは排他区分の合成率。
   夜勤が「通常帯」でも「60h超帯」でも raw合計は同じ=144,076 になることを固定(将来の式変更でズレたら検知)。 */
T('同値: 残業70h+深夜2h → かんたん=144,076', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 70, otM: 0, nightH: 2, nightM: 0 });
  // ot 1592*1.25*70=139300 / 深夜 1592*0.25*2=796 / 60h超 1592*0.25*10=3980
  eq(r.total, 139300 + 796 + 3980);
  eq(r.total, 144076);
});
T('同値: 詳細で夜勤を「通常帯」に割付(ot58h+otNight2h+over60 10h)=144,076', function () {
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { ot: 58 * 60, otNight: 2 * 60, over60: 10 * 60 } });
  eq(r.total, 144076);
});
T('同値: 詳細で夜勤を「60h超帯」に割付(ot60h+over60 8h+over60Night2h)=144,076', function () {
  var r = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { ot: 60 * 60, over60: 8 * 60, over60Night: 2 * 60 } });
  eq(r.total, 144076);
});

/* ── 率上書きも かんたん≡詳細 で一致(合成式が両モードで整合) ── */
T('同値(率上書き): 残業1.3で かんたん(残業50h+深夜0)=詳細(ot50h)一致', function () {
  var e = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8, otH: 50, rates: { ot: 1.3 } });
  var d = W.detail({ base: 260000, annualHolidays: 120, dailyHours: 8, seg: { ot: 50 * 60 }, rates: { ot: 1.3 } });
  eq(e.total, d.total);
  eq(e.total, W.han50Up(1592 * 1.3 * 50)); // = 103480
});

/* 空入力は0 */
T('空入力 → 割増0', function () {
  var r = W.easy({ base: 260000, annualHolidays: 120, dailyHours: 8 });
  eq(r.total, 0); eq(r.lines.length, 0);
});

/* ── hydrate(中央データで法定率を上書き=将来の法改正配信) ── */
T('hydrate: 正常データ(ot:1.30)でRATE/resolveRates/detailに反映→復元', function () {
  eq(W.RATE.ot, 1.25); // 上書き前
  W.hydrate({ ot: 1.30 });
  eq(W.RATE.ot, 1.30, 'RATE.otが上書き');
  eq(W.resolveRates().ot, 1.30, 'resolveRates既定もRATE参照で1.30');
  // detailの時間外区分にも反映(合成式ot=RATE.ot)
  var c = W.detailComponents({ ot: 60 });
  var otLine = c.find(function (x) { return x.key === 'ot'; });
  eq(otLine.rate, 1.30, 'detailComponentsのot率も1.30');
  W.hydrate({ ot: 1.25 }); // 復元
  eq(W.RATE.ot, 1.25); eq(W.resolveRates().ot, 1.25);
});
T('hydrate: 基本率(ot/holiday/night/over60Add)上書き→合成率は派生で追従→復元', function () {
  W.hydrate({ ot: 1.5, night: 0.3, holiday: 1.4, over60Add: 0.35 });
  eq(W.RATE.ot, 1.5); eq(W.RATE.night, 0.3); eq(W.RATE.holiday, 1.4); eq(W.RATE.over60Add, 0.35);
  // 合成率は基本率から派生(単独設定でなく計算)
  eq(W.RATE.otNight, 1.8, 'otNight=ot+night=1.5+0.3');
  eq(W.RATE.over60, 1.85, 'over60=ot+over60Add=1.5+0.35');
  eq(W.RATE.over60Night, 2.15, 'over60Night=ot+over60Add+night');
  eq(W.RATE.holidayNight, 1.7, 'holidayNight=holiday+night=1.4+0.3');
  eq(W.resolveRates().over60Add, 0.35, 'over60Add既定もRATE参照');
  W.hydrate({ ot: 1.25, night: 0.25, holiday: 1.35, over60Add: 0.25 }); // 復元
  eq(W.RATE.ot, 1.25); eq(W.RATE.otNight, 1.5); eq(W.RATE.over60, 1.5); eq(W.RATE.over60Night, 1.75); eq(W.RATE.holidayNight, 1.6);
});
T('hydrate: 部分上書き(otだけ)でも合成率が計算値と乖離しない(P1修正)', function () {
  W.hydrate({ ot: 1.30 });
  eq(W.RATE.otNight, 1.55, '表示RATE.otNightがot+nightに追従=1.55');
  var c = W.detailComponents({ otNight: 60 }); // ratesは既定=RATE参照
  var by = {}; c.forEach(function (x) { by[x.key] = x.rate; });
  eq(by.otNight, W.RATE.otNight, '表示RATE.otNight = 実計算otNight(乖離ゼロ)');
  W.hydrate({ ot: 1.25 }); eq(W.RATE.otNight, 1.5); // 復元
});
T('hydrate: 合成率キー(otNight/over60等)を直接渡しても無視=基本率から派生(不整合防止)', function () {
  W.hydrate({ otNight: 9.9, over60: 9.9, over60Night: 9.9, holidayNight: 9.9 });
  eq(W.RATE.otNight, 1.5, 'otNight直接指定は無視'); eq(W.RATE.over60, 1.5); eq(W.RATE.over60Night, 1.75); eq(W.RATE.holidayNight, 1.6);
});
T('hydrate: 不正データ(null/非object/非数値/NaN/文字列)はフォールバック=RATE不変', function () {
  W.hydrate(null); eq(W.RATE.ot, 1.25);
  W.hydrate(undefined); eq(W.RATE.ot, 1.25);
  W.hydrate('bad'); eq(W.RATE.ot, 1.25);
  W.hydrate(42); eq(W.RATE.ot, 1.25);
  W.hydrate({ ot: '1.30' }); eq(W.RATE.ot, 1.25, '文字列は非数値で無視');
  W.hydrate({ ot: NaN }); eq(W.RATE.ot, 1.25, 'NaNは無視');
  W.hydrate({ ot: null, holiday: 1.40 }); // 混在: 不正なotは無視・正常なholidayのみ適用
  eq(W.RATE.ot, 1.25, '不正キーは維持'); eq(W.RATE.holiday, 1.40, '正常キーは適用');
  W.hydrate({ holiday: 1.35 }); eq(W.RATE.holiday, 1.35); // 復元
});
T('hydrate: 未知キーは無視(RATEに存在するキーのみ)', function () {
  W.hydrate({ bogus: 99, ot: 1.28 });
  eq(W.RATE.ot, 1.28); eq(W.RATE.bogus, undefined, '未知キーは追加されない');
  W.hydrate({ ot: 1.25 }); eq(W.RATE.ot, 1.25); // 復元
});

/* ── ★割増率 法定下限チェック(belowLegalRates・労基37条)★ ── */
T('割増率下限: 空欄/法定どおり/上げは違反なし', function () {
  eq(W.belowLegalRates({}).length, 0);                                   // 全部空=法定自動
  eq(W.belowLegalRates({ ot: 1.25, holiday: 1.35, night: 0.25, over60Add: 0.25 }).length, 0);
  eq(W.belowLegalRates({ ot: 1.5, holiday: 1.6, night: 0.3 }).length, 0); // 上げるのは合法
});
T('割増率下限: 時間外100%(割増ゼロ)・深夜0%を検知', function () {
  var low = W.belowLegalRates({ ot: 1.0, night: 0 });
  var keys = low.map(function (x) { return x.key; });
  ok(keys.indexOf('ot') >= 0, '時間外1.0<1.25を検知: ' + JSON.stringify(keys));
  ok(keys.indexOf('night') >= 0, '深夜0<0.25を検知: ' + JSON.stringify(keys));
});
T('割増率下限: 休日1.2・60h超+0.1の下回りを検知(floorを返す)', function () {
  var low = W.belowLegalRates({ holiday: 1.2, over60Add: 0.1 });
  var keys = low.map(function (x) { return x.key; });
  ok(keys.indexOf('holiday') >= 0 && keys.indexOf('over60Add') >= 0, JSON.stringify(keys));
  eq(low.find(function (x) { return x.key === 'holiday'; }).floor, 1.35);
});

/* ── ★年間所定労働時間 法定超チェック(annualHoursCheck・労基32条 週40h)★ ── */
T('年間時間: 週休2日8h(休104〜120日)は目安内=over false(誤警告しない)', function () {
  eq(W.annualHoursCheck(120, 8, false).over, false);                    // 245日×8=1960h
  eq(W.annualHoursCheck(104, 8, false).over, false);                    // 週40h相当=標準を警告しない
});
T('年間時間: 休日過少/長時間所定は over true', function () {
  eq(W.annualHoursCheck(80, 8, false).over, true);                      // 285日×8=2280h
  eq(W.annualHoursCheck(105, 10, false).over, true);                    // 260日×10=2600h
});
T('年間時間: 判定材料なし(所定0/休日空)はnull', function () {
  eq(W.annualHoursCheck(120, 0, false), null);
  eq(W.annualHoursCheck('', 8, false), null);
  eq(W.annualHoursCheck(null, 8, false), null);
});
T('年間時間: 閏年は366日基準で計算', function () {
  eq(W.annualHoursCheck(100, 8, true).annualHours, (366 - 100) * 8);
});
