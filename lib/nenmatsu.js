/* nenmatsu.js — 年末調整の所得控除(生命保険料控除・地震保険料控除ほか)。
 * 【一次情報】国税庁 No.1140 生命保険料控除 / No.1145 地震保険料控除(平成24年/平成19年〜の恒久算式・令和8非依存)。
 *   生保: 新旧3区分(一般/介護医療/個人年金)・介護医療は新のみ・各区分と総額に上限・新旧併用は有利側。
 *   地震: 地震保険料(上限5万)＋旧長期損害(経過措置・上限1.5万)、合算上限5万。
 * 端数: 控除額に1円未満が出る算式は円未満切上(国税庁様式の計算欄に準拠)。
 * ★令和8の数値表(給与所得控除/基礎控除/扶養/配偶者/配偶者特別/特定親族/障害者/速算表)はパラメータ P に集約。
 *   既定=ハードコード=フォールバック。hydrate(year,data)で中央(Supabase statutory kind=nenmatsu)から上書き可(式ロジック不変)。
 *   生保/地震は恒久算式のためコードのまま(数値表でない)。
 * 【利用】ブラウザ window.Nenmatsu / Node require('./nenmatsu.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Nenmatsu = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  function ceil1(x) { return Math.ceil(x - 1e-9); } // 1円未満切上

  // ── 令和8 数値表パラメータ(既定=ハードコード=フォールバック) ──
  //  bracket: X<=upto の段で flat(定額) または ceil1(X*rate+add)。
  var P = {
    // 給与所得控除(令和8・9年分) 国税庁 令和8年4月改正あらまし(2026kaisei.pdf p1)。最低保障74万(収入≤220万)。
    kyuyoKojo: [
      { upto: 2200000, flat: 740000 },
      { upto: 3600000, rate: 0.30, add: 80000 },
      { upto: 6600000, rate: 0.20, add: 440000 },
      { upto: 8500000, rate: 0.10, add: 1100000 },
      { upto: Infinity, flat: 1950000 }
    ],
    // 基礎控除(令和8年分・改正後) 合計所得金額別。出典=国税庁「令和8年4月 源泉所得税の改正のあらまし」p1表(2026kaisei.pdf)。
    //  基礎額62万(改正前58万)+加算42/37/5万 → ≤132万=104万 / 132超〜489万=99万 / 489超〜655万=67万 / 655超〜2350万=62万 / 2350超は改正なし48/32/16/0。
    //  ★≤132と132-489は別段(旧実装は≤489一律104万で132-489が+5万過大=年調で過少税だった)★
    kisoKojo: [
      { upto: 1320000, flat: 1040000 }, { upto: 4890000, flat: 990000 }, { upto: 6550000, flat: 670000 }, { upto: 23500000, flat: 620000 },
      { upto: 24000000, flat: 480000 }, { upto: 24500000, flat: 320000 }, { upto: 25000000, flat: 160000 }, { upto: Infinity, flat: 0 }
    ],
    // 扶養控除(令和8・恒久額)。ippan一般38/tokutei特定63/roujin老人48/doukyo同居老親58万。
    fuyoKojo: { ippan: 380000, tokutei: 630000, roujin: 480000, doukyo: 580000 },
    // 配偶者控除(令和8)。tier0/1/2 = 本人所得≤900万/≤950/≤1000。normal=一般, rojin=老人配偶者。
    haiguusha: { normal: [380000, 260000, 130000], rojin: [480000, 320000, 160000] },
    // 配偶者特別控除(令和8)。配偶者の合計所得 s<=upto の段で row[col](col=本人所得帯)。row=null は控除0。
    haiTokubetsu: [
      { upto: 620000, row: null }, { upto: 950000, row: [380000, 260000, 130000] }, { upto: 1000000, row: [360000, 240000, 120000] },
      { upto: 1050000, row: [310000, 210000, 110000] }, { upto: 1100000, row: [260000, 180000, 90000] }, { upto: 1150000, row: [210000, 140000, 70000] },
      { upto: 1200000, row: [160000, 110000, 60000] }, { upto: 1250000, row: [110000, 80000, 40000] }, { upto: 1300000, row: [60000, 40000, 20000] }, { upto: 1330000, row: [30000, 20000, 10000] }
    ],
    // 特定親族特別控除(令和8新設)。特定親族の合計所得 s<=upto の段で val。
    tokuteiShinzoku: [
      { upto: 620000, val: 0 }, { upto: 850000, val: 630000 }, { upto: 900000, val: 610000 }, { upto: 950000, val: 510000 }, { upto: 1000000, val: 410000 },
      { upto: 1050000, val: 310000 }, { upto: 1100000, val: 210000 }, { upto: 1150000, val: 110000 }, { upto: 1200000, val: 60000 }, { upto: 1230000, val: 30000 }
    ],
    // 障害者控除(恒久額)。ippan一般27/tokubetsu特別40/doukyo同居特別75万。
    shougai: { ippan: 270000, tokubetsu: 400000, doukyo: 750000 },
    // 算出所得税額の速算表(標準所得税率)。A<=upto の段で floor(A*rate - sub)。
    sanshutu: [
      { upto: 1950000, rate: 0.05, sub: 0 }, { upto: 3300000, rate: 0.10, sub: 97500 }, { upto: 6950000, rate: 0.20, sub: 427500 },
      { upto: 9000000, rate: 0.23, sub: 636000 }, { upto: 18000000, rate: 0.33, sub: 1536000 }, { upto: Infinity, rate: 0.40, sub: 2796000 }
    ],
    fukkoRate: 1.021 // 復興特別所得税(2037年まで)
  };
  function evalBracket(X, table) {
    for (var i = 0; i < table.length; i++) { var b = table[i]; if (X <= b.upto) { return b.flat != null ? b.flat : ceil1(X * b.rate + b.add); } }
    return 0;
  }

  // 新制度(一般/介護医療/個人年金 共通・各上限40,000)★恒久算式
  function seimeiNew(paid) {
    paid = num(paid); if (paid <= 0) return 0;
    if (paid <= 20000) return paid;
    if (paid <= 40000) return ceil1(paid / 2 + 10000);
    if (paid <= 80000) return ceil1(paid / 4 + 20000);
    return 40000;
  }
  // 旧制度(一般/個人年金・各上限50,000)★恒久算式
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

  // 給与所得控除(令和8)。最低保障74万(収入≤220万)。
  function kyuyoKojoR8(shunyu) { var s = num(shunyu); if (s <= 0) return 0; return evalBracket(s, P.kyuyoKojo); }
  // 給与所得(令和8) = 給与収入 − 給与所得控除(0未満は0)
  function kyuyoShotokuR8(shunyu) { var s = num(shunyu); return Math.max(0, s - kyuyoKojoR8(s)); }
  // 基礎控除(令和8)。合計所得金額別。
  function kisoKojoR8(goukeiShotoku) { return evalBracket(num(goukeiShotoku), P.kisoKojo); }

  // 扶養控除(令和8・恒久額)。ippan/tokutei/roujin/doukyo
  function fuyoKojo(type) { return P.fuyoKojo[type] || 0; }

  // 配偶者控除(令和8)。本人1,000万超は0。
  function haiguushaKojo(honninShotoku, rojin) {
    var h = num(honninShotoku); if (h > 10000000) return 0;
    var tier = h <= 9000000 ? 0 : (h <= 9500000 ? 1 : 2);
    return (rojin ? P.haiguusha.rojin : P.haiguusha.normal)[tier];
  }

  // 配偶者特別控除(令和8・9年分)。本人1,000万超 or 配偶者133万超は0。62万以下は配偶者控除の範囲。
  function haiguushaTokubetsuKojo(haiShotoku, honninShotoku) {
    var h = num(honninShotoku); if (h > 10000000) return 0;
    var col = h <= 9000000 ? 0 : (h <= 9500000 ? 1 : 2);
    var s = num(haiShotoku);
    for (var i = 0; i < P.haiTokubetsu.length; i++) { var e = P.haiTokubetsu[i]; if (s <= e.upto) return e.row ? e.row[col] : 0; }
    return 0; // 133万超
  }

  // 特定親族特別控除(令和8新設)。62万以下は特定扶養控除63万の範囲・123万超は0。
  function tokuteiShinzokuKojo(shinzokuShotoku) {
    var s = num(shinzokuShotoku);
    for (var i = 0; i < P.tokuteiShinzoku.length; i++) { var e = P.tokuteiShinzoku[i]; if (s <= e.upto) return e.val; }
    return 0;
  }

  // 地震保険料控除。o={jishin, kyuChoki}(旧長期損害保険料=経過措置)。合算上限50,000 ★恒久算式
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

  // 障害者控除等(恒久額)。
  function shougaiKojo(type) { return P.shougai[type] || 0; }
  var KAFU = 270000, HITORIOYA = 350000, KINROU = 270000;

  // 算出所得税額の速算表(年調・課税給与所得金額A→算出所得税額)。Aは1,000円未満切捨。
  function sanshutuShotokuZei(kazeiKyuyoShotoku) {
    var a = Math.floor(num(kazeiKyuyoShotoku) / 1000) * 1000; if (a <= 0) return 0;
    for (var i = 0; i < P.sanshutu.length; i++) { var b = P.sanshutu[i]; if (a <= b.upto) return Math.floor(a * b.rate - b.sub); }
    return 0;
  }
  // 年調年税額 = (算出所得税額 − 住宅借入金等特別控除) × 102.1%、100円未満切捨。
  function nenchouNenzei(kazeiKyuyoShotoku, jutakuLoan) {
    var afterLoan = Math.max(0, sanshutuShotokuZei(kazeiKyuyoShotoku) - num(jutakuLoan));
    return Math.floor(afterLoan * P.fukkoRate / 100) * 100;
  }

  // ── 年末調整 総合計算 ──
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
    var nenzei = Math.floor(afterLoan * P.fukkoRate / 100) * 100;
    return {
      kyuyoShotoku: kyuyoShotoku, goukeiShotoku: goukeiShotoku, kojoList: kojoList, kojoGoukei: kojoGoukei,
      kazeiKyuyoShotoku: kazei, sanshutuZei: sanshutu, nenchouShotokuZei: afterLoan, nenchouNenzei: nenzei,
      kabusoku: nenzei - num(o.genzenZumi), // +追加徴収 / −還付
    };
  }

  // 中央(Supabase statutory kind=nenmatsu)の令和8数値表で上書き。不正/部分は無視=フォールバック維持。
  //  data={kyuyoKojo[],kisoKojo[],fuyoKojo{},haiguusha{normal[],rojin[]},haiTokubetsu[],tokuteiShinzoku[],shougai{},sanshutu[],fukkoRate}
  //  年度は令和8エラのみ(現行モデル・year<2026 は no-op)。生保/地震(恒久算式)は対象外。
  function hydrate(year, data) {
    if (!data || typeof data !== 'object') return;
    if (year && year < 2026) return;
    // 各フィールドは行/キー単位で検証し、1つでも不正なら「その表ごと破棄」=部分汚染や既存キー消失を防ぎフォールバック維持。
    if (validRows(data.kyuyoKojo, 'kojo')) P.kyuyoKojo = normUpto(data.kyuyoKojo);
    if (validRows(data.kisoKojo, 'kojo')) P.kisoKojo = normUpto(data.kisoKojo);
    if (objNums(data.fuyoKojo, ['ippan', 'tokutei', 'roujin', 'doukyo'])) P.fuyoKojo = data.fuyoKojo;
    if (data.haiguusha && numArr(data.haiguusha.normal, 3) && numArr(data.haiguusha.rojin, 3)) P.haiguusha = data.haiguusha;
    if (validRows(data.haiTokubetsu, 'hai')) P.haiTokubetsu = normUpto(data.haiTokubetsu);
    if (validRows(data.tokuteiShinzoku, 'tok')) P.tokuteiShinzoku = normUpto(data.tokuteiShinzoku);
    if (objNums(data.shougai, ['ippan', 'tokubetsu', 'doukyo'])) P.shougai = data.shougai;
    if (validRows(data.sanshutu, 'san')) P.sanshutu = normUpto(data.sanshutu);
    if (isNum(data.fukkoRate) && data.fukkoRate > 0) P.fukkoRate = data.fukkoRate;
  }
  function isNum(v) { return typeof v === 'number' && !isNaN(v); }
  function numArr(a, len) { if (!Array.isArray(a) || a.length !== len) return false; for (var i = 0; i < len; i++) if (!isNum(a[i])) return false; return true; }
  function objNums(o, keys) { if (!o || typeof o !== 'object') return false; for (var i = 0; i < keys.length; i++) if (!isNum(o[keys[i]])) return false; return true; }
  // ブラケット/表の各行を検証。1行でも不正なら false=表ごと破棄。
  //  kojo: upto(数値かnull)＋(flat or rate+add) / tok: upto＋val / hai: upto＋(row===null or 数値3要素) / san: upto＋rate＋sub
  function validRows(arr, kind) {
    if (!Array.isArray(arr) || !arr.length) return false;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      if (!b || typeof b !== 'object') return false;
      if (!(b.upto == null || isNum(b.upto))) return false;
      if (kind === 'kojo') { if (!(isNum(b.flat) || (isNum(b.rate) && isNum(b.add)))) return false; }
      else if (kind === 'tok') { if (!isNum(b.val)) return false; }
      else if (kind === 'hai') { if (!(b.row === null || numArr(b.row, 3))) return false; }
      else if (kind === 'san') { if (!isNum(b.rate) || !isNum(b.sub)) return false; }
    }
    return true;
  }
  // JSON化でInfinityがnullになるため、upto==null を Infinity に復元。
  function normUpto(arr) { return arr.map(function (b) { var o = {}; for (var k in b) o[k] = b[k]; if (o.upto == null) o.upto = Infinity; return o; }); }

  return {
    num: num, seimeiNew: seimeiNew, seimeiOld: seimeiOld, seimeiCategory: seimeiCategory,
    seimeiKojo: seimeiKojo, jishinKojo: jishinKojo,
    shougaiKojo: shougaiKojo, KAFU: KAFU, HITORIOYA: HITORIOYA, KINROU: KINROU,
    sanshutuShotokuZei: sanshutuShotokuZei, nenchouNenzei: nenchouNenzei, computeNencho: computeNencho,
    kyuyoKojoR8: kyuyoKojoR8, kyuyoShotokuR8: kyuyoShotokuR8, kisoKojoR8: kisoKojoR8,
    fuyoKojo: fuyoKojo, haiguushaKojo: haiguushaKojo,
    haiguushaTokubetsuKojo: haiguushaTokubetsuKojo, tokuteiShinzokuKojo: tokuteiShinzokuKojo,
    P: P, hydrate: hydrate
  };
});
