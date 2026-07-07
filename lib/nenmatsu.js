/* nenmatsu.js — 年末調整の所得控除(生命保険料控除・地震保険料控除ほか)。
 * 【一次情報】国税庁 No.1140 生命保険料控除 / No.1145 地震保険料控除(平成24年/平成19年〜の恒久算式・令和8非依存)。
 *   生保: 新旧3区分(一般/介護医療/個人年金)・介護医療は新のみ・各区分と総額に上限・新旧併用は有利側。
 *   地震: 地震保険料(上限5万)＋旧長期損害(経過措置・上限1.5万)、合算上限5万。
 * 端数: 控除額に1円未満が出る算式は円未満切上(国税庁様式の計算欄に準拠)。
 * 【利用】ブラウザ window.Nenmatsu / Node require('./nenmatsu.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Nenmatsu = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  function ceil1(x) { return Math.ceil(x - 1e-9); } // 1円未満切上

  // 新制度(一般/介護医療/個人年金 共通・各上限40,000)
  function seimeiNew(paid) {
    paid = num(paid); if (paid <= 0) return 0;
    if (paid <= 20000) return paid;
    if (paid <= 40000) return ceil1(paid / 2 + 10000);
    if (paid <= 80000) return ceil1(paid / 4 + 20000);
    return 40000;
  }
  // 旧制度(一般/個人年金・各上限50,000)
  function seimeiOld(paid) {
    paid = num(paid); if (paid <= 0) return 0;
    if (paid <= 25000) return paid;
    if (paid <= 50000) return ceil1(paid / 2 + 12500);
    if (paid <= 100000) return ceil1(paid / 4 + 25000);
    return 50000;
  }
  // 一般 or 個人年金 の区分控除額: 新のみ/旧のみ/新旧併用は「旧のみ(上限5万)」と「新旧合算(上限4万)」の有利側
  function seimeiCategory(paidNew, paidOld) {
    paidNew = num(paidNew); paidOld = num(paidOld);
    var vNew = seimeiNew(paidNew), vOld = seimeiOld(paidOld);
    if (paidNew > 0 && paidOld > 0) return Math.max(vOld, Math.min(40000, vNew + vOld)); // 併用
    return paidOld > 0 ? vOld : vNew; // 旧のみ / 新のみ(または0)
  }
  // 生命保険料控除 合計(総上限120,000)。o={generalNew,generalOld,kaigo,pensionNew,pensionOld}
  function seimeiKojo(o) {
    o = o || {};
    var general = seimeiCategory(o.generalNew, o.generalOld);
    var kaigo = seimeiNew(o.kaigo);              // 介護医療は新制度のみ(上限4万)
    var pension = seimeiCategory(o.pensionNew, o.pensionOld);
    return Math.min(120000, general + kaigo + pension);
  }

  // ── 給与所得控除(令和8・9年分) 国税庁 令和8年4月「源泉所得税の改正のあらまし」(2026kaisei.pdf p1・PDF目視照合2026-07) ──
  //  最低保障74万(収入≤220万・改正前65万)。220万で既存式×30%+8万=74万と連続。220万超は改正なし(令和2〜の速算)。
  //  ※年調の正式は「給与所得控除後の給与等の金額の表」(収入を階級化して端数処理)。本関数は速算式(中小の実務許容・微差は表側丸め)。
  function kyuyoKojoR8(shunyu) {
    var s = num(shunyu); if (s <= 0) return 0;
    if (s <= 2200000) return 740000;
    if (s <= 3600000) return ceil1(s * 0.30 + 80000);
    if (s <= 6600000) return ceil1(s * 0.20 + 440000);
    if (s <= 8500000) return ceil1(s * 0.10 + 1100000);
    return 1950000;
  }
  // 給与所得(令和8) = 給与収入 − 給与所得控除(0未満は0)
  function kyuyoShotokuR8(shunyu) { var s = num(shunyu); return Math.max(0, s - kyuyoKojoR8(s)); }

  // ── 基礎控除(令和8・9年分) 国税庁 令和8年4月改正あらまし(2026kaisei.pdf p1・PDF目視照合2026-07) ──
  //  合計所得金額別: ≤489万→104万 / 489超〜655万→67万 / 655超〜2,350万→62万 / 2,350万超は所得税法86条(改正なし)48/32/16/0。
  //  (改正前令和8=58万+37/30/10/5→95/88/68/63/58。改正後は62万本則+措置法加算で嵩上げ)
  function kisoKojoR8(goukeiShotoku) {
    var a = num(goukeiShotoku);
    if (a <= 4890000) return 1040000;
    if (a <= 6550000) return 670000;
    if (a <= 23500000) return 620000;
    if (a <= 24000000) return 480000;
    if (a <= 24500000) return 320000;
    if (a <= 25000000) return 160000;
    return 0;
  }

  // ── 扶養控除(令和8・恒久額)。所得要件は令和8で合計所得62万以下に改正(額は不変) ──
  //  type: ippan(一般16歳以上38万)/tokutei(特定19〜22歳63万)/roujin(老人70歳以上48万)/doukyo(同居老親等58万)
  function fuyoKojo(type) { return ({ ippan: 380000, tokutei: 630000, roujin: 480000, doukyo: 580000 })[type] || 0; }

  // ── 配偶者控除(令和8)。honninShotoku=本人の合計所得, rojin=老人配偶者(70歳以上)。本人1,000万超は0 ──
  function haiguushaKojo(honninShotoku, rojin) {
    var h = num(honninShotoku); if (h > 10000000) return 0;
    var tier = h <= 9000000 ? 0 : (h <= 9500000 ? 1 : 2);
    return (rojin ? [480000, 320000, 160000] : [380000, 260000, 130000])[tier];
  }

  // ── 配偶者特別控除(令和8・9年分) 国税庁 令和8年4月改正あらまし(参考表・目視/テキスト照合2026-07) ──
  //  行=配偶者の合計所得金額, 列=本人の合計所得(900万以下/900超950/950超1000)。本人1,000万超 or 配偶者133万超は0。62万以下は配偶者控除の範囲。
  function haiguushaTokubetsuKojo(haiShotoku, honninShotoku) {
    var h = num(honninShotoku); if (h > 10000000) return 0;
    var col = h <= 9000000 ? 0 : (h <= 9500000 ? 1 : 2);
    var s = num(haiShotoku), row;
    if (s <= 620000) return 0;
    else if (s <= 950000) row = [380000, 260000, 130000];   // 62超95万
    else if (s <= 1000000) row = [360000, 240000, 120000];  // 95超100
    else if (s <= 1050000) row = [310000, 210000, 110000];  // 100超105
    else if (s <= 1100000) row = [260000, 180000, 90000];   // 105超110
    else if (s <= 1150000) row = [210000, 140000, 70000];   // 110超115
    else if (s <= 1200000) row = [160000, 110000, 60000];   // 115超120
    else if (s <= 1250000) row = [110000, 80000, 40000];    // 120超125
    else if (s <= 1300000) row = [60000, 40000, 20000];     // 125超130
    else if (s <= 1330000) row = [30000, 20000, 10000];     // 130超133
    else return 0;
    return row[col];
  }

  // ── 特定親族特別控除(令和8新設) 国税庁 令和8年4月改正あらまし(参考表・目視/テキスト照合2026-07) ──
  //  特定親族(19〜22歳)の合計所得が62万超123万以下のとき逓減控除(63万〜3万)。62万以下は特定扶養控除63万の範囲(fuyoKojo'tokutei')・123万超は0。
  function tokuteiShinzokuKojo(shinzokuShotoku) {
    var s = num(shinzokuShotoku);
    if (s <= 620000) return 0;
    if (s <= 850000) return 630000;    // 62超85
    if (s <= 900000) return 610000;    // 85超90
    if (s <= 950000) return 510000;    // 90超95
    if (s <= 1000000) return 410000;   // 95超100
    if (s <= 1050000) return 310000;   // 100超105
    if (s <= 1100000) return 210000;   // 105超110
    if (s <= 1150000) return 110000;   // 110超115
    if (s <= 1200000) return 60000;    // 115超120
    if (s <= 1230000) return 30000;    // 120超123
    return 0;
  }

  // 地震保険料控除。o={jishin, kyuChoki}(旧長期損害保険料=経過措置)。合算上限50,000
  function jishinKojo(o) {
    o = o || {};
    var jishin = Math.min(num(o.jishin), 50000);
    var k = num(o.kyuChoki), kyu;
    if (k <= 0) kyu = 0;
    else if (k <= 10000) kyu = k;
    else if (k <= 20000) kyu = ceil1(k / 2 + 5000);
    else kyu = 15000;
    return Math.min(50000, jishin + kyu);
  }

  // ── ④ 障害者控除等(恒久額) ──
  //  障害者: ippan一般27万/tokubetsu特別40万/doukyo同居特別障害者75万。寡婦27万・ひとり親35万・勤労学生27万。
  function shougaiKojo(type) { return ({ ippan: 270000, tokubetsu: 400000, doukyo: 750000 })[type] || 0; }
  var KAFU = 270000, HITORIOYA = 350000, KINROU = 270000;

  // ── ⑤ 算出所得税額の速算表(年調・課税給与所得金額A→算出所得税額) ──
  //  国税庁「年末調整のしかた」算出所得税額の速算表(標準所得税率・年調は課税所得18,050,000まで)。復興特別所得税は最後に×1.021。
  //  Aは1,000円未満切捨。
  function sanshutuShotokuZei(kazeiKyuyoShotoku) {
    var a = Math.floor(num(kazeiKyuyoShotoku) / 1000) * 1000; if (a <= 0) return 0;
    if (a <= 1950000) return Math.floor(a * 0.05);
    if (a <= 3300000) return Math.floor(a * 0.10 - 97500);
    if (a <= 6950000) return Math.floor(a * 0.20 - 427500);
    if (a <= 9000000) return Math.floor(a * 0.23 - 636000);
    if (a <= 18000000) return Math.floor(a * 0.33 - 1536000);
    return Math.floor(a * 0.40 - 2796000); // 年調上限18,050,000(超は年調対象外)
  }
  // 年調年税額 = (算出所得税額 − 住宅借入金等特別控除) × 102.1%、100円未満切捨。
  function nenchouNenzei(kazeiKyuyoShotoku, jutakuLoan) {
    var afterLoan = Math.max(0, sanshutuShotokuZei(kazeiKyuyoShotoku) - num(jutakuLoan));
    return Math.floor(afterLoan * 1.021 / 100) * 100;
  }

  // ── 年末調整 総合計算 ──
  //  o={ kyuyoShunyu:給与収入(年), otherShotoku:給与以外の合計所得(既定0), shakaiHoken:社保料控除,
  //      seimei:{生保premium}, jishin:{地震premium}, shokibo:小規模企業共済等,
  //      haiguushaKojo/haiguushaTokubetsuKojo/fuyoKojo/tokuteiShinzokuKojo/shougaiKojo/kafuHitorioyaKojo/kinrougakuseiKojo:各控除額(呼出側で解決),
  //      jutakuLoan:住宅借入金等特別控除(税額控除), genzenZumi:源泉徴収済合計 }
  //  生保・地震は premium から自動計算、その他控除は解決済み額を受ける。基礎控除は合計所得から自動。
  function computeNencho(o) {
    o = o || {};
    var shunyu = num(o.kyuyoShunyu);
    var kyuyoShotoku = kyuyoShotokuR8(shunyu);
    var goukeiShotoku = kyuyoShotoku + num(o.otherShotoku);
    var kojoList = {
      kiso: kisoKojoR8(goukeiShotoku),
      shakaiHoken: num(o.shakaiHoken),
      seimei: seimeiKojo(o.seimei || {}),
      jishin: jishinKojo(o.jishin || {}),
      shokibo: num(o.shokibo),
      haiguusha: num(o.haiguushaKojo),
      haiTokubetsu: num(o.haiguushaTokubetsuKojo),
      fuyo: num(o.fuyoKojo),
      tokuteiShinzoku: num(o.tokuteiShinzokuKojo),
      shougai: num(o.shougaiKojo),
      kafuHitorioya: num(o.kafuHitorioyaKojo),
      kinrou: num(o.kinrougakuseiKojo),
    };
    var kojoGoukei = 0; for (var k in kojoList) { if (kojoList.hasOwnProperty(k)) kojoGoukei += kojoList[k]; }
    var kazei = Math.max(0, Math.floor((goukeiShotoku - kojoGoukei) / 1000) * 1000);
    var sanshutu = sanshutuShotokuZei(kazei);
    var afterLoan = Math.max(0, sanshutu - num(o.jutakuLoan));
    var nenzei = Math.floor(afterLoan * 1.021 / 100) * 100;
    return {
      kyuyoShotoku: kyuyoShotoku, goukeiShotoku: goukeiShotoku, kojoList: kojoList, kojoGoukei: kojoGoukei,
      kazeiKyuyoShotoku: kazei, sanshutuZei: sanshutu, nenchouShotokuZei: afterLoan, nenchouNenzei: nenzei,
      kabusoku: nenzei - num(o.genzenZumi), // +追加徴収 / −還付
    };
  }

  return {
    num: num, seimeiNew: seimeiNew, seimeiOld: seimeiOld, seimeiCategory: seimeiCategory,
    seimeiKojo: seimeiKojo, jishinKojo: jishinKojo,
    shougaiKojo: shougaiKojo, KAFU: KAFU, HITORIOYA: HITORIOYA, KINROU: KINROU,
    sanshutuShotokuZei: sanshutuShotokuZei, nenchouNenzei: nenchouNenzei, computeNencho: computeNencho,
    kyuyoKojoR8: kyuyoKojoR8, kyuyoShotokuR8: kyuyoShotokuR8, kisoKojoR8: kisoKojoR8,
    fuyoKojo: fuyoKojo, haiguushaKojo: haiguushaKojo,
    haiguushaTokubetsuKojo: haiguushaTokubetsuKojo, tokuteiShinzokuKojo: tokuteiShinzokuKojo
  };
});
