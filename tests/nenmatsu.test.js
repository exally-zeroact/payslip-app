/* nenmatsu.test.js — 年末調整の所得控除(まず生命保険料控除・地震保険料控除)。国税庁 No.1140/No.1145 の恒久算式(令和8非依存)。
 * ★実数リテラルでロック(自己参照でない)。算式を取り違えたら検知される。 */
'use strict';
var N = require('../lib/nenmatsu.js');

/* ── 生命保険料控除(新制度・各区分 上限4万) No.1140 ──
   新: 〜20,000=全額 / 〜40,000=×1/2+10,000 / 〜80,000=×1/4+20,000 / 80,001〜=40,000 */
T('新制度 各段: 15000→15000 / 30000→25000 / 60000→35000 / 100000→40000', function () {
  eq(N.seimeiNew(15000), 15000);
  eq(N.seimeiNew(30000), 25000);   // 30000/2+10000
  eq(N.seimeiNew(60000), 35000);   // 60000/4+20000
  eq(N.seimeiNew(100000), 40000);  // 上限
});
/* 旧制度(一般/個人年金・各上限5万): 〜25,000=全額 / 〜50,000=×1/2+12,500 / 〜100,000=×1/4+25,000 / 100,001〜=50,000 */
T('旧制度 各段: 20000→20000 / 40000→32500 / 80000→45000 / 120000→50000', function () {
  eq(N.seimeiOld(20000), 20000);
  eq(N.seimeiOld(40000), 32500);   // 40000/2+12500
  eq(N.seimeiOld(80000), 45000);   // 80000/4+25000
  eq(N.seimeiOld(120000), 50000);  // 上限
});

/* 一般/個人年金の新旧併用: max(旧のみ(上限5万), 新旧合算(上限4万)) */
T('一般 新旧併用: 旧のみが有利なら旧、合算4万上限が有利ならそちら', function () {
  // 旧8万(=45000) vs 新3万(25000)+旧8万(45000)→70000だが上限40000 → 45000採用
  eq(N.seimeiCategory(30000, 80000), 45000);
  // 旧2万(=20000) vs 新3万(25000)+旧2万(20000)=45000→上限40000 → 40000採用
  eq(N.seimeiCategory(30000, 20000), 40000);
  // 新のみ: 新6万→35000
  eq(N.seimeiCategory(60000, 0), 35000);
  // 旧のみ: 旧12万→50000
  eq(N.seimeiCategory(0, 120000), 50000);
});

/* 生命保険料控除 合計(一般＋介護医療＋個人年金・総上限12万)。介護医療は新のみ */
T('生保控除 合計: 3区分合算・総上限120,000', function () {
  // 一般 新旧併用45000 + 介護医療 新10万→40000 + 個人年金 旧12万→50000 = 135000 → 上限120000
  eq(N.seimeiKojo({ generalNew: 30000, generalOld: 80000, kaigo: 100000, pensionNew: 0, pensionOld: 120000 }), 120000);
  // 一般 新3万(25000)+介護医療 新3万(25000)+個人年金 新6万(35000)=85000(上限内)
  eq(N.seimeiKojo({ generalNew: 30000, kaigo: 30000, pensionNew: 60000 }), 85000);
  // 空=0
  eq(N.seimeiKojo({}), 0);
});

/* ── 給与所得控除(令和8・9年分) 国税庁 令和8年4月改正あらまし(p1・目視照合2026-07) ──
   収入≤220万→74万(最低保障) / 220万超は改正なし速算(×30%+8万→×20%+44万→×10%+110万→上限195万) */
T('給与所得控除R8: ≤220万は74万(220万で既存式と連続)', function () {
  eq(N.kyuyoKojoR8(1500000), 740000);
  eq(N.kyuyoKojoR8(2200000), 740000);           // 2200000*0.3+80000=740000 と連続(段差なし)
  ok(Math.abs(N.kyuyoKojoR8(2200001) - 740000) <= 1, '220万直後も約74万(切上+1円以内)');
});
T('給与所得控除R8: 220万超 各ブラケット', function () {
  eq(N.kyuyoKojoR8(3000000), 980000);           // ×30%+8万
  eq(N.kyuyoKojoR8(3600000), 1160000);
  eq(N.kyuyoKojoR8(5000000), 1440000);          // ×20%+44万
  eq(N.kyuyoKojoR8(6600000), 1760000);
  eq(N.kyuyoKojoR8(7000000), 1800000);          // ×10%+110万
  eq(N.kyuyoKojoR8(8500000), 1950000);
  eq(N.kyuyoKojoR8(12000000), 1950000);         // 上限
});
T('給与所得(令和8) = 収入 − 給与所得控除', function () {
  eq(N.kyuyoShotokuR8(5000000), 5000000 - 1440000); // 3,560,000
  eq(N.kyuyoShotokuR8(1500000), 1500000 - 740000);  // 760,000
  eq(N.kyuyoShotokuR8(700000), 0);                  // 収入<控除→0
});

/* ── 基礎控除(令和8年分) 国税庁「令和8年4月 源泉所得税の改正のあらまし」p1 表 ──
   出典PDF: nta.go.jp/publication/pamph/gensen/2026kaisei.pdf。改正後 令和8・9年分列(基礎額62万+加算)。
   合計所得: ≤132万→104万(62+42) / 132超〜489万→99万(62+37) / 489超〜655万→67万(62+5) / 655超〜2350万→62万(基礎)
   / 2350超は改正なし=48/32/16/0万。★≤132と132-489は別段(以前は≤489一律104万で132-489が+5万過大だった)★ */
T('基礎控除R8: ≤132万=104万 / 132超-489万=99万 / 489-655=67万 / 655-2350=62万', function () {
  eq(N.kisoKojoR8(1000000), 1040000);  // ≤132万
  eq(N.kisoKojoR8(1320000), 1040000);  // 132万ちょうど
  eq(N.kisoKojoR8(1320001), 990000);   // 132万超→99万
  eq(N.kisoKojoR8(4000000), 990000);   // 一般的な正社員帯(合計所得400万)=99万
  eq(N.kisoKojoR8(4890000), 990000);   // 489万ちょうど
  eq(N.kisoKojoR8(4890001), 670000);   // 489万超→67万
  eq(N.kisoKojoR8(6550000), 670000);
  eq(N.kisoKojoR8(6550001), 620000);   // 655万超→62万
  eq(N.kisoKojoR8(23500000), 620000);
});
T('基礎控除R8: 2350万超は改正なし(48/32/16/0万)', function () {
  eq(N.kisoKojoR8(23600000), 480000);
  eq(N.kisoKojoR8(24100000), 320000);
  eq(N.kisoKojoR8(24600000), 160000);
  eq(N.kisoKojoR8(25100000), 0);
});

/* ── 扶養控除(令和8・恒久額) ── */
T('扶養控除: 一般38万/特定63万/老人48万/同居老親58万', function () {
  eq(N.fuyoKojo('ippan'), 380000);
  eq(N.fuyoKojo('tokutei'), 630000);
  eq(N.fuyoKojo('roujin'), 480000);
  eq(N.fuyoKojo('doukyo'), 580000);
  eq(N.fuyoKojo('x'), 0);
});

/* ── 配偶者控除(令和8)。本人所得 900以下/900-950/950-1000 → 38/26/13万(老人48/32/16) ── */
T('配偶者控除: 本人所得別・老人配偶者', function () {
  eq(N.haiguushaKojo(8000000, false), 380000);
  eq(N.haiguushaKojo(9200000, false), 260000);
  eq(N.haiguushaKojo(9800000, false), 130000);
  eq(N.haiguushaKojo(10000001, false), 0);         // 本人1000万超
  eq(N.haiguushaKojo(8000000, true), 480000);      // 老人配偶者
  eq(N.haiguushaKojo(9800000, true), 160000);
});

/* ── 配偶者特別控除(令和8・9・国税庁改正あらまし目視/テキスト照合) 配偶者所得×本人所得 ── */
T('配偶者特別控除: 62超95万=38/26/13・逓減・133万超0', function () {
  eq(N.haiguushaTokubetsuKojo(800000, 8000000), 380000);   // 配偶者80万(62超95)・本人900以下
  eq(N.haiguushaTokubetsuKojo(800000, 9200000), 260000);   // 本人900-950
  eq(N.haiguushaTokubetsuKojo(970000, 8000000), 360000);   // 95超100
  eq(N.haiguushaTokubetsuKojo(1220000, 8000000), 110000);  // 120超125
  eq(N.haiguushaTokubetsuKojo(1310000, 8000000), 30000);   // 130超133
  eq(N.haiguushaTokubetsuKojo(1400000, 8000000), 0);       // 133万超
  eq(N.haiguushaTokubetsuKojo(600000, 8000000), 0);        // 62万以下=配偶者控除の範囲
  eq(N.haiguushaTokubetsuKojo(800000, 10000001), 0);       // 本人1000万超
});

/* ── 特定親族特別控除(令和8新設)。特定親族の合計所得 62超123万で逓減・63万〜3万 ── */
T('特定親族特別控除: 62超85万=63万・逓減・123万超0', function () {
  eq(N.tokuteiShinzokuKojo(700000), 630000);   // 62超85
  eq(N.tokuteiShinzokuKojo(880000), 610000);   // 85超90
  eq(N.tokuteiShinzokuKojo(920000), 510000);   // 90超95
  eq(N.tokuteiShinzokuKojo(980000), 410000);   // 95超100
  eq(N.tokuteiShinzokuKojo(1030000), 310000);  // 100超105
  eq(N.tokuteiShinzokuKojo(1080000), 210000);  // 105超110
  eq(N.tokuteiShinzokuKojo(1130000), 110000);  // 110超115
  eq(N.tokuteiShinzokuKojo(1180000), 60000);   // 115超120
  eq(N.tokuteiShinzokuKojo(1220000), 30000);   // 120超123
  eq(N.tokuteiShinzokuKojo(600000), 0);        // 62万以下=特定扶養控除63万の範囲
  eq(N.tokuteiShinzokuKojo(1240000), 0);       // 123万超
});

/* ── ④ 障害者控除等(恒久額) ── */
T('障害者控除 一般27/特別40/同居特別75万・寡婦27/ひとり親35/勤労学生27万', function () {
  eq(N.shougaiKojo('ippan'), 270000);
  eq(N.shougaiKojo('tokubetsu'), 400000);
  eq(N.shougaiKojo('doukyo'), 750000);
  eq(N.KAFU, 270000); eq(N.HITORIOYA, 350000); eq(N.KINROU, 270000);
});

/* ── ⑤ 算出所得税額の速算表(年調・標準税率・課税給与所得A→算出税額)。Aは1000円未満切捨 ── */
T('算出所得税額: 各ブラケット(標準速算表)', function () {
  eq(N.sanshutuShotokuZei(1730000), 86500);         // 5%
  eq(N.sanshutuShotokuZei(1950000), 97500);         // 5%境界
  eq(N.sanshutuShotokuZei(3000000), 202500);        // 10%-97500
  eq(N.sanshutuShotokuZei(5000000), 572500);        // 20%-427500
  eq(N.sanshutuShotokuZei(8000000), 1204000);       // 23%-636000
  eq(N.sanshutuShotokuZei(10000000), 1764000);      // 33%-1536000
  eq(N.sanshutuShotokuZei(1734500), 86700);         // 1000円未満切捨: 1,734,500→1,734,000×5%=86,700
});
T('年調年税額: 復興税込1.021・100円未満切捨', function () {
  // 課税173万→算出86,500→×1.021=88,316.5→100円未満切捨=88,300
  eq(N.nenchouNenzei(1730000, 0), 88300);
  // 住宅ローン控除(税額控除)5万→(86500-50000)=36500→×1.021=37,266.5→37,200
  eq(N.nenchouNenzei(1730000, 50000), 37200);
});

/* ── 年末調整 総合計算(worked example) ── */
T('年調 総合: 給与500万・社保75万・生保新10万・基礎99万・源泉9万→追徴', function () {
  var r = N.computeNencho({ kyuyoShunyu: 5000000, shakaiHoken: 750000, seimei: { generalNew: 100000 }, genzenZumi: 90000 });
  eq(r.kyuyoShotoku, 3560000);                 // 500万-給与所得控除144万
  eq(r.kojoList.kiso, 990000);                 // 合計所得356万(132超〜489万)→基礎99万
  eq(r.kojoList.seimei, 40000);                // 新10万→控除4万
  eq(r.kojoGoukei, 990000 + 750000 + 40000);   // 178万
  eq(r.kazeiKyuyoShotoku, 1780000);            // 356万-178万=178万
  eq(r.sanshutuZei, 89000);                    // 178万×5%
  eq(r.nenchouNenzei, 90800);                  // 89000×1.021=90869→百円未満切捨
  eq(r.kabusoku, 90800 - 90000);               // +800(追徴800)。※旧実装(基礎104万)は還付1700=約2,500円/年 過少税だった
});

/* ── 地震保険料控除 No.1145 ──
   地震: 〜50,000=全額 / 50,001〜=50,000。旧長期損害(経過措置): 〜10,000=全額 / 〜20,000=×1/2+5,000 / 20,001〜=15,000。合算上限5万 */
T('地震保険料控除: 地震のみ / 旧長期のみ / 併用(上限5万)', function () {
  eq(N.jishinKojo({ jishin: 40000 }), 40000);
  eq(N.jishinKojo({ jishin: 70000 }), 50000);            // 上限
  eq(N.jishinKojo({ kyuChoki: 8000 }), 8000);
  eq(N.jishinKojo({ kyuChoki: 16000 }), 13000);          // 16000/2+5000
  eq(N.jishinKojo({ kyuChoki: 30000 }), 15000);          // 旧長期上限
  eq(N.jishinKojo({ jishin: 40000, kyuChoki: 30000 }), 50000); // 40000+15000=55000→上限50000
  eq(N.jishinKojo({}), 0);
});

/* ── hydrate(中央上書き)→反映 / 不正はフォールバック / 令和8数値表のみ対象 ── */
T('nenmatsu hydrate: 基礎控除表を中央値で上書き→computeに反映、正規値で復元=回帰ゼロ', function () {
  var before = N.kisoKojoR8(3560000); // 356万(132超〜489万)→99万
  eq(before, 990000);
  N.hydrate(2026, { kisoKojo: [{ upto: null, flat: 0 }] }); // 全域 基礎控除0
  eq(N.kisoKojoR8(3560000), 0);
  // 正規の令和8 基礎控除で復元
  N.hydrate(2026, { kisoKojo: [{ upto: 1320000, flat: 1040000 }, { upto: 4890000, flat: 990000 }, { upto: 6550000, flat: 670000 }, { upto: 23500000, flat: 620000 }, { upto: 24000000, flat: 480000 }, { upto: 24500000, flat: 320000 }, { upto: 25000000, flat: 160000 }, { upto: null, flat: 0 }] });
  eq(N.kisoKojoR8(3560000), before);
});
T('nenmatsu hydrate: 速算表を上書き→sanshutuShotokuZeiに反映、復元', function () {
  var before = N.sanshutuShotokuZei(1730000); // 173万×5%=86500
  eq(before, 86500);
  N.hydrate(2026, { sanshutu: [{ upto: null, rate: 0.10, sub: 0 }] }); // 全域10%
  eq(N.sanshutuShotokuZei(1730000), Math.floor(1730000 * 0.10));
  N.hydrate(2026, { sanshutu: [{ upto: 1950000, rate: 0.05, sub: 0 }, { upto: 3300000, rate: 0.10, sub: 97500 }, { upto: 6950000, rate: 0.20, sub: 427500 }, { upto: 9000000, rate: 0.23, sub: 636000 }, { upto: 18000000, rate: 0.33, sub: 1536000 }, { upto: null, rate: 0.40, sub: 2796000 }] });
  eq(N.sanshutuShotokuZei(1730000), before);
});
T('nenmatsu hydrate: 不正/部分/令和7以前は無視=フォールバック維持', function () {
  var before = N.kisoKojoR8(3560000);
  N.hydrate(2026, { kisoKojo: 'garbage' });
  N.hydrate(2026, { kyuyoKojo: [] });
  N.hydrate(2026, null);
  N.hydrate(2025, { kisoKojo: [{ upto: null, flat: 0 }] }); // 令和7以前→no-op
  eq(N.kisoKojoR8(3560000), before);
});
T('nenmatsu hydrate: 不正オブジェクト表/短い配列/不正行は表ごと破棄=他キー保持=フォールバック維持', function () {
  var fuyoTok = N.fuyoKojo('tokutei');      // 630000
  var shougaiDoukyo = N.shougaiKojo('doukyo'); // 750000
  var hai = N.haiguushaKojo(9800000, false);   // tier2の値
  var san = N.sanshutuShotokuZei(1730000);     // 86500
  var kiso = N.kisoKojoR8(3560000);            // 990000(356万→99万)
  N.hydrate(2026, { fuyoKojo: { ippan: 'abc' } }); // 不正値+キー欠落→破棄(他キー消えない)
  eq(N.fuyoKojo('tokutei'), fuyoTok, 'fuyoKojo不正→破棄・他キー保持');
  eq(N.fuyoKojo('ippan'), 380000);
  N.hydrate(2026, { shougai: { ippan: 'x' } });
  eq(N.shougaiKojo('doukyo'), shougaiDoukyo, 'shougai不正→破棄');
  N.hydrate(2026, { haiguusha: { normal: [380000], rojin: [480000] } }); // 短い配列(tier2でOOB)
  eq(N.haiguushaKojo(9800000, false), hai, 'haiguusha短配列→破棄');
  N.hydrate(2026, { sanshutu: [{ upto: null, sub: 0 }] }); // rate欠落
  eq(N.sanshutuShotokuZei(1730000), san, 'sanshutu不正→破棄');
  N.hydrate(2026, { kisoKojo: [{ upto: 2120833 }] }); // flat欠落
  eq(N.kisoKojoR8(3560000), kiso, 'kisoKojo不正行→破棄');
});
