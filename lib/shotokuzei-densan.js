/* shotokuzei-densan.js — 源泉所得税「電算機計算の特例」(甲欄/乙欄・年度自動選択)
 * 甲欄: 国税庁「月額表の甲欄…電算機計算の特例」 令和3〜7年分(denshi_10) / 令和8年分以降(denshi_01)
 * 乙欄: 国税庁「月額表の乙欄…電算機計算」 令和8年分以降(denshi_02)
 * 年度は給与の対象月(payYm)の年分で自動選択(令和8=2026〜)。料率表のハードコードでなく年度別に保持。
 * ★数値は年度別パラメータ(PARAMS/ZEI_KO/ZEI_OTSU)に集約。既定=ハードコード=フォールバック。
 *   hydrate(year,data)で中央(Supabase statutory kind=shotokuzei_densan)から上書き可(式ロジックは不変)。
 * A = その月の社会保険料等控除後の給与等の金額(円・整数)。fuyou = 扶養親族等の数(源泉控除対象配偶者含む)。
 * 【利用】ブラウザ window.ShotokuzeiDensan / Node require('./shotokuzei-densan.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.ShotokuzeiDensan = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function ceil1(x) { return Math.ceil(x - 1e-9); }        // 1円未満切上
  function round10(x) { return Math.round(x / 10) * 10; }  // 10円未満四捨五入
  function floor1(x) { return Math.floor(x + 1e-9); }      // 1円未満切捨
  // 50円未満切捨・50円以上100円未満→100円切上（乙欄用）
  function round100_50(x) { x = Math.round(x); var b = Math.floor(x / 100) * 100; return (x - b) < 50 ? b : b + 100; }

  // ── 年度別パラメータ(既定=ハードコード=フォールバック)。hydrateで年度別に上書き ──
  // 第1表 給与所得控除: X<=upto なら flat(定額) または ceil1(X*rate+add)。
  // 第3表 基礎控除    : A<=upto なら flat。
  // FUYOU_KOJO は第2表 配偶者/扶養 1人あたり(月)。
  var PARAMS = {
    2025: { // 令和7
      fuyouKojo: 31667,
      kyuyo: [
        { upto: 135416, flat: 45834 },
        { upto: 149999, rate: 0.40, add: -8333 },
        { upto: 299999, rate: 0.30, add: 6667 },
        { upto: 549999, rate: 0.20, add: 36667 },
        { upto: 708330, rate: 0.10, add: 91667 },
        { upto: Infinity, flat: 162500 }
      ],
      kiso: [
        { upto: 2162499, flat: 40000 },
        { upto: 2204166, flat: 26667 },
        { upto: 2245833, flat: 13334 },
        { upto: Infinity, flat: 0 }
      ]
    },
    2026: { // 令和8(給与所得控除・基礎控除 引上げ)
      fuyouKojo: 31667,
      kyuyo: [
        { upto: 158333, flat: 54167 },
        { upto: 299999, rate: 0.30, add: 6667 },
        { upto: 549999, rate: 0.20, add: 36667 },
        { upto: 708330, rate: 0.10, add: 91667 },
        { upto: Infinity, flat: 162500 }
      ],
      kiso: [
        { upto: 2120833, flat: 48334 },
        { upto: 2162499, flat: 40000 },
        { upto: 2204166, flat: 26667 },
        { upto: 2245833, flat: 13334 },
        { upto: Infinity, flat: 0 }
      ]
    }
  };
  // 第4表 甲欄(復興税1.021込み・令和7/8 同一)。B<=upto なら B*rate - sub、最後に round10。
  var ZEI_KO = [
    { upto: 162500, rate: 0.05105, sub: 0 },
    { upto: 275000, rate: 0.10210, sub: 8296 },
    { upto: 579166, rate: 0.20420, sub: 36374 },
    { upto: 750000, rate: 0.23483, sub: 54113 },
    { upto: 1500000, rate: 0.33693, sub: 130688 },
    { upto: 3333333, rate: 0.40840, sub: 237893 },
    { upto: Infinity, rate: 0.45945, sub: 408061 }
  ];
  // 乙欄 第3表 plain率(復興税は最後に×1.021)。B<=upto なら B*rate - sub。
  var ZEI_OTSU = [
    { upto: 162500, rate: 0.05, sub: 0 },
    { upto: 275000, rate: 0.10, sub: 8125 },
    { upto: 579166, rate: 0.20, sub: 35625 },
    { upto: 750000, rate: 0.23, sub: 53000 },
    { upto: 1500000, rate: 0.33, sub: 128000 },
    { upto: Infinity, rate: 0.40, sub: 233000 }
  ];

  var FUYOU_KOJO = 31667;                                  // 後方互換の公開値(令和7/8共通)

  // 給与の対象月の「年分」で令和8(2026〜)以降か
  function isR8(opts) { var y = (opts && opts.year) || 2026; return y >= 2026; }
  function paramsFor(r8) { return r8 ? PARAMS[2026] : PARAMS[2025]; }
  // ブラケット評価: X<=upto の段で flat か rate/add。
  function evalBracket(X, table) {
    for (var i = 0; i < table.length; i++) { var b = table[i]; if (X <= b.upto) { return b.flat != null ? b.flat : ceil1(X * b.rate + b.add); } }
    return 0;
  }
  // 税率表評価(raw): B<=upto の段で B*rate - sub。
  function evalTax(B, table) {
    for (var i = 0; i < table.length; i++) { var b = table[i]; if (B <= b.upto) { return B * b.rate - b.sub; } }
    return 0;
  }

  // 第1表 給与所得控除の額（X=社保控除後給与 or 乙の計算基準額×倍率）
  function kyuyoKojo(X, r8) { return evalBracket(X, paramsFor(r8).kyuyo); }
  // 第3表 基礎控除の額
  function kisoKojo(A, r8) { return evalBracket(A, paramsFor(r8).kiso); }
  // 第4表 甲欄・課税給与所得B→税額(10円四捨五入)
  function zeiFromB(B) { return round10(evalTax(B, ZEI_KO)); }
  // 乙欄 第3表 plain率(復興税は最後に×1.021)・課税給与所得B→税額(1円切捨は呼出側)
  function zeiOtsuPlain(B) { return evalTax(B, ZEI_OTSU); }

  // 甲欄
  function calc(A, fuyou, opts) {
    A = Math.floor(Math.max(0, A || 0)); if (A <= 0) return 0;
    var r8 = isR8(opts), f = Math.max(0, Math.floor(fuyou || 0));
    var B = A - kyuyoKojo(A, r8) - paramsFor(r8).fuyouKojo * f - kisoKojo(A, r8);
    if (B <= 0) return 0;
    return zeiFromB(B);
  }
  // 乙欄(令和8算式・denshi_02)。fuyouは原則0(従たる申告書ありなら1人1,610円控除)
  function calcOtsu(A, fuyou, opts) {
    A = Math.floor(Math.max(0, A || 0)); if (A <= 0) return 0;
    var tax;
    if (A < 105000) tax = floor1(A * 0.03063);
    else if (A > 740000) {
      tax = (A < 1710000) ? floor1(259200 + (A - 740000) * 0.4084) : floor1(655400 + (A - 1710000) * 0.45945);
    } else {
      var base;
      if (A === 740000) base = 740000;
      else if (A < 221000) base = 105000 + Math.floor((A - 105000) / 2000) * 2000;
      else base = 221000 + Math.floor((A - 221000) / 3000) * 3000;
      var kiso = paramsFor(true).kiso[0].flat; // A<=2,120,833 段の基礎控除(令和8=48334)
      var part = function (mult) {
        var X = base * mult;
        var Bp = X - kyuyoKojo(X, true) - kiso;
        if (Bp < 0) Bp = 0;
        return floor1(zeiOtsuPlain(Bp));
      };
      var C = round100_50(part(2.5) - part(1.5));
      tax = round100_50(C * 1.021);
    }
    var f = Math.max(0, Math.floor(fuyou || 0));
    tax = tax - 1610 * f;                                   // 従たる扶養控除(原則f=0)
    return tax > 0 ? tax : 0;
  }
  // 税区分で振り分け（甲='ko'/乙='otsu'。丙='hei'は別途 日額表 shotokuzei-hei）
  //  ★乙欄は甲欄の扶養数を加味しない(乙は申告書未提出=扶養控除なし)。従たる給与の扶養控除等申告書がある時のみ
  //   opts.jyuubetsuFuyou 人ぶん 1,610円/人 を控除。既定は0=毎月の過少徴収を防ぐ(P0修正)。
  function calcByClass(A, fuyou, taxClass, opts) {
    if (taxClass === 'otsu') return calcOtsu(A, (opts && opts.jyuubetsuFuyou) || 0, opts);
    return calc(A, fuyou, opts);                             // 甲(既定)
  }

  // 中央(Supabase statutory kind=shotokuzei_densan)の値で年度別に上書き。不正/部分は無視=フォールバック維持。
  // year=2025(令和7)/2026(令和8)の2エラ。data={fuyouKojo,kyuyo[],kiso[],zeiKo[]?,zeiOtsu[]?}。甲乙税率表は年度共通。
  function hydrate(year, data) {
    if (!data || typeof data !== 'object') return;
    var p = PARAMS[year]; if (!p) return; // 現行モデルは2025/2026のみ
    if (isNum(data.fuyouKojo)) p.fuyouKojo = data.fuyouKojo; // calcは paramsFor(r8).fuyouKojo を読む(export FUYOU_KOJOは既定値の参照専用)
    if (validBrackets(data.kyuyo, 'kojo')) p.kyuyo = normUpto(data.kyuyo);
    if (validBrackets(data.kiso, 'kojo')) p.kiso = normUpto(data.kiso);
    // 甲乙税率表は in-place で差替=export参照(ZEI_KO/ZEI_OTSU)も追従・evalTaxも同一配列を読む(stale export防止)
    if (validBrackets(data.zeiKo, 'zei')) { var nk = normUpto(data.zeiKo); ZEI_KO.length = 0; for (var i = 0; i < nk.length; i++) ZEI_KO.push(nk[i]); }
    if (validBrackets(data.zeiOtsu, 'zei')) { var no = normUpto(data.zeiOtsu); ZEI_OTSU.length = 0; for (var j = 0; j < no.length; j++) ZEI_OTSU.push(no[j]); }
  }
  function isNum(v) { return typeof v === 'number' && !isNaN(v); }
  // ブラケット配列の各行を検証。1行でも不正なら false=表ごと破棄(部分汚染を防ぎフォールバック維持)。
  //  kind='kojo': upto(数値かnull)＋(flat数値 or rate+add数値)。 kind='zei': upto(数値かnull)＋rate＋sub 数値。
  function validBrackets(arr, kind) {
    if (!Array.isArray(arr) || !arr.length) return false;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      if (!b || typeof b !== 'object') return false;
      if (!(b.upto == null || isNum(b.upto))) return false;
      if (kind === 'zei') { if (!isNum(b.rate) || !isNum(b.sub)) return false; }
      else { if (!(isNum(b.flat) || (isNum(b.rate) && isNum(b.add)))) return false; }
    }
    return true;
  }
  // JSON化でInfinityがnullになるため、upto==null を Infinity に復元。
  function normUpto(arr) { return arr.map(function (b) { var o = {}; for (var k in b) o[k] = b[k]; if (o.upto == null) o.upto = Infinity; return o; }); }

  return {
    calc: calc, calcOtsu: calcOtsu, calcByClass: calcByClass,
    kyuyoKojo: kyuyoKojo, kisoKojo: kisoKojo, zeiFromB: zeiFromB,
    FUYOU_KOJO: FUYOU_KOJO, isR8: isR8, NENDO: '令和7/令和8(年度自動選択)',
    PARAMS: PARAMS, ZEI_KO: ZEI_KO, ZEI_OTSU: ZEI_OTSU, hydrate: hydrate
  };
});
