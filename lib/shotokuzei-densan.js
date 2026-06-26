/* shotokuzei-densan.js — 源泉所得税「電算機計算の特例」(甲欄/乙欄・年度自動選択)
 * 甲欄: 国税庁「月額表の甲欄…電算機計算の特例」 令和3〜7年分(denshi_10) / 令和8年分以降(denshi_01)
 * 乙欄: 国税庁「月額表の乙欄…電算機計算」 令和8年分以降(denshi_02)
 * 年度は給与の対象月(payYm)の年分で自動選択(令和8=2026〜)。料率表のハードコードでなく年度別に保持。
 * A = その月の社会保険料等控除後の給与等の金額(円・整数)。fuyou = 扶養親族等の数(源泉控除対象配偶者含む)。
 * 【利用】ブラウザ window.ShotokuzeiDensan / Node require('./shotokuzei-densan.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.ShotokuzeiDensan = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FUYOU_KOJO = 31667;                                  // 第2表: 配偶者/扶養 1人あたり(月)・令和7/8 共通
  function ceil1(x) { return Math.ceil(x - 1e-9); }        // 1円未満切上
  function round10(x) { return Math.round(x / 10) * 10; }  // 10円未満四捨五入
  function floor1(x) { return Math.floor(x + 1e-9); }      // 1円未満切捨
  // 50円未満切捨・50円以上100円未満→100円切上（乙欄用）
  function round100_50(x) { x = Math.round(x); var b = Math.floor(x / 100) * 100; return (x - b) < 50 ? b : b + 100; }

  // 給与の対象月の「年分」で令和8(2026〜)以降か
  function isR8(opts) { var y = (opts && opts.year) || 2026; return y >= 2026; }

  // 第1表 給与所得控除の額（X=社保控除後給与 or 乙の計算基準額×倍率）
  function kyuyoKojo(X, r8) {
    if (r8) {
      if (X <= 158333) return 54167;
      if (X <= 299999) return ceil1(X * 0.30 + 6667);
      if (X <= 549999) return ceil1(X * 0.20 + 36667);
      if (X <= 708330) return ceil1(X * 0.10 + 91667);
      return 162500;
    }
    if (X <= 135416) return 45834;                          // 令和7
    if (X <= 149999) return ceil1(X * 0.40 - 8333);
    if (X <= 299999) return ceil1(X * 0.30 + 6667);
    if (X <= 549999) return ceil1(X * 0.20 + 36667);
    if (X <= 708330) return ceil1(X * 0.10 + 91667);
    return 162500;
  }
  // 第3表 基礎控除の額
  function kisoKojo(A, r8) {
    if (r8) {
      if (A <= 2120833) return 48334;                       // 令和8: 基礎控除引上げ
      if (A <= 2162499) return 40000;
      if (A <= 2204166) return 26667;
      if (A <= 2245833) return 13334;
      return 0;
    }
    if (A <= 2162499) return 40000;                          // 令和7
    if (A <= 2204166) return 26667;
    if (A <= 2245833) return 13334;
    return 0;
  }
  // 第4表 甲欄(復興税1.021込み・令和7/8 同一)・課税給与所得B→税額(10円四捨五入)
  function zeiFromB(B) {
    var t;
    if (B <= 162500) t = B * 0.05105;
    else if (B <= 275000) t = B * 0.10210 - 8296;
    else if (B <= 579166) t = B * 0.20420 - 36374;
    else if (B <= 750000) t = B * 0.23483 - 54113;
    else if (B <= 1500000) t = B * 0.33693 - 130688;
    else if (B <= 3333333) t = B * 0.40840 - 237893;
    else t = B * 0.45945 - 408061;
    return round10(t);
  }
  // 乙欄 第3表 plain率(復興税は最後に×1.021)・課税給与所得B→税額(1円切捨は呼出側)
  function zeiOtsuPlain(B) {
    if (B <= 162500) return B * 0.05;
    if (B <= 275000) return B * 0.10 - 8125;
    if (B <= 579166) return B * 0.20 - 35625;
    if (B <= 750000) return B * 0.23 - 53000;
    if (B <= 1500000) return B * 0.33 - 128000;
    return B * 0.40 - 233000;
  }

  // 甲欄
  function calc(A, fuyou, opts) {
    A = Math.floor(Math.max(0, A || 0)); if (A <= 0) return 0;
    var r8 = isR8(opts), f = Math.max(0, Math.floor(fuyou || 0));
    var B = A - kyuyoKojo(A, r8) - FUYOU_KOJO * f - kisoKojo(A, r8);
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
      var kiso = 48334; // A<=2,120,833
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
  // 税区分で振り分け（甲='ko'/乙='otsu'。丙='hei'は未実装→甲扱いせず0でなく甲で暫定: ここでは甲）
  function calcByClass(A, fuyou, taxClass, opts) {
    if (taxClass === 'otsu') return calcOtsu(A, fuyou, opts);
    return calc(A, fuyou, opts);                             // 甲(既定)。丙は別途(日額表)未実装
  }

  return {
    calc: calc, calcOtsu: calcOtsu, calcByClass: calcByClass,
    kyuyoKojo: kyuyoKojo, kisoKojo: kisoKojo, zeiFromB: zeiFromB,
    FUYOU_KOJO: FUYOU_KOJO, isR8: isR8, NENDO: '令和7/令和8(年度自動選択)'
  };
});
