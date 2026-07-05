/**
 * payroll-calc.js - 給与の社会保険料・課税対象額・所得税の確定計算（純関数）
 * ================================================================
 * 【目的】
 *  kyuuryoumeisai.html 内に4箇所コピペされていた所得税計算を1本化する。
 *  - 表示プレビュー / Excel式出力 / Excel数値出力 / calcItemAmount 控除計算
 *  すべて本ファイルの純関数を呼ぶだけにし、計算の二重管理をなくす。
 *
 * 【正しい課税対象額】(shotokuzei-hyou.js のヘッダ仕様に準拠)
 *  課税対象額 = 支給合計 − 社会保険料合計（健保 + 厚生年金 + 介護 + 雇用）
 *  ※従来は介護保険料を引いておらず、40〜64歳で過大課税になっていた。
 *
 * 【介護保険 第2号被保険者の判定】(40歳以上65歳未満)
 *  業界標準（freee/マネフォ/弥生/ジンジャー等）に合わせ、生年月日から自動判定する。
 *  - 開始: 40歳の誕生日の「前日が属する月」分から
 *  - 終了: 65歳の誕生日の「前日が属する月」の前月分まで
 *  - 1日生まれ特例: 前日が前月末日になるため、開始/終了が1ヶ月早まる
 *
 * 【依存】shakaihoken-hyo.js（標準報酬・健保/介護料率）。所得税は lib/shotokuzei-densan.js（年度自動選択）が担当=本ファイルは社保のみ。
 * 【利用】ブラウザは window.PayrollCalc、Node(テスト)は require('./payroll-calc.js')
 * ================================================================
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./shakaihoken-hyo.js"), require("./koyo-hoken.js"));
  } else {
    // ブラウザ：依存 const SHAKAIHOKEN_HYO/KoyoHoken はトップレベル宣言(windowに付かない)→bare参照で解決
    root.PayrollCalc = factory(
      typeof SHAKAIHOKEN_HYO !== "undefined" ? SHAKAIHOKEN_HYO : root.SHAKAIHOKEN_HYO,
      typeof KoyoHoken !== "undefined" ? KoyoHoken : root.KoyoHoken
    );
  }
})(typeof self !== "undefined" ? self : this, function (SHAKAIHOKEN_HYO, KOYO_HOKEN) {
  "use strict";

  // 厚生年金(従業員負担・全国一律18.3%/折半9.15%)。単一ソース=shakaihoken-hyo(法改正時はそこだけ変更)。
  var KOSEI_NENKIN_RITSU = (SHAKAIHOKEN_HYO && SHAKAIHOKEN_HYO.KOSEI_NENKIN_RITSU_JUGYOIN != null) ? SHAKAIHOKEN_HYO.KOSEI_NENKIN_RITSU_JUGYOIN : 0.0915;

  // 'YYYY-MM-DD' / Date / {y,m,d} を {y,m,d} に正規化
  function parseYmd(v) {
    if (v == null || v === "") return null;
    if (typeof v === "object" && v.y) return { y: +v.y, m: +v.m, d: +v.d };
    var s = String(v).trim().replace(/\//g, "-");
    var p = s.split("-");
    if (p.length < 3) return null;
    var y = +p[0],
      m = +p[1],
      d = +p[2];
    if (!y || !m || !d) return null;
    return { y: y, m: m, d: d };
  }

  // 'YYYY-MM' / {y,m} を月インデックス(y*12+m-1)に
  function parseYmToIndex(v) {
    if (v == null || v === "") return null;
    if (typeof v === "object" && v.y) return +v.y * 12 + (+v.m - 1);
    var s = String(v).trim().replace(/\//g, "-");
    var p = s.split("-");
    var y = +p[0],
      m = +p[1];
    if (!y || !m) return null;
    return y * 12 + (m - 1);
  }

  // 生年月日 + addYears歳「到達」が属する月インデックス（到達日 = 誕生日の前日）
  function reachMonthIndex(birth, addYears) {
    if (birth.d === 1) {
      // 前日は前月末日 → 1ヶ月手前
      var y = birth.y + addYears,
        m = birth.m - 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
      return y * 12 + (m - 1);
    }
    return (birth.y + addYears) * 12 + (birth.m - 1);
  }

  /**
   * 介護保険 第2号被保険者か（生年月日と対象支給月から判定）
   * @returns {boolean} 生年月日 or 対象月が不正なら false（＝引かない安全側）
   */
  function isKaigoTarget(birthYmd, payYm) {
    var b = parseYmd(birthYmd);
    var pay = parseYmToIndex(payYm);
    if (!b || pay == null) return false;
    var start = reachMonthIndex(b, 40); // 40歳到達月から対象
    var endExclusive = reachMonthIndex(b, 65); // 65歳到達月からは対象外
    return pay >= start && pay < endExclusive;
  }

  /**
   * 社会保険料の各確定額。hasKaigo=true で介護保険料を加える。
   */
  function calcSocialInsurance(opts) {
    var payTotal = opts.payTotal || 0;
    // 健保従業員率: 明示healthRate最優先(=app.jsのprefRate結果=回帰ゼロ)。
    // 未指定でも pref+payYm があれば介護(getKaigo)と対称に lib単体で年度自己選択(子育て支援金込)。
    // pref も無い空呼び出しは従来どおり既定0.04955(令和7東京折半)=回帰ゼロ。
    var healthRate = opts.healthRate != null ? opts.healthRate
      : (opts.pref && SHAKAIHOKEN_HYO && SHAKAIHOKEN_HYO.getKenko
          ? SHAKAIHOKEN_HYO.getKenko(opts.pref, opts.payYm).jugyoin + (SHAKAIHOKEN_HYO.getShienkin ? SHAKAIHOKEN_HYO.getShienkin(opts.payYm) : 0)
          : 0.04955);
    // 雇用保険 従業員率: 明示employRate最優先(=app.jsが渡す年度別率=回帰ゼロ)。
    // 未指定でも gyoshu があれば koyo-hoken で労働保険年度(payYm)＋業種を自己選択(健保率の年度自己選択と同型・単一ソース)。
    // gyoshu も無い空呼び出しは従来どおり既定0.0055=回帰ゼロ。
    var employRate = opts.employRate != null ? opts.employRate
      : (opts.gyoshu && KOYO_HOKEN && KOYO_HOKEN.employRateByYm ? KOYO_HOKEN.employRateByYm(opts.gyoshu, opts.payYm) : 0.0055);
    var hasKaigo = !!opts.hasKaigo;
    // 無給(payTotal=0)でも、標準報酬(hyojunBase)が確定していれば 健保・厚年・介護 は標準報酬ベースで継続徴収する。
    // (産休・育休は呼び出し側 apply.health/pension/kaigo=false で免除。介護休・病気休職は免除でない=継続が正)
    // 雇用保険は実支給ベースなので payTotal=0 → employ=0 になる(下の han50(payTotal*employRate)で自動)。
    if (!SHAKAIHOKEN_HYO || (payTotal <= 0 && !(opts.hyojunBase > 0))) {
      return { hyojun: 0, health: 0, pension: 0, kaigo: 0, employ: 0, total: 0 };
    }
    // 標準報酬の基礎額：定時決定等で確定した「報酬月額(hyojunBase)」があればそれを使う(実務=原則1年固定)。
    // 無ければ当月支給合計から都度算定(簡易)。健保は上限1,390,000・厚年は上限650,000 で分離。
    var basis = (opts.hyojunBase != null && opts.hyojunBase > 0) ? opts.hyojunBase : payTotal;
    var hyHealth = SHAKAIHOKEN_HYO.getHyojunHealth ? SHAKAIHOKEN_HYO.getHyojunHealth(basis) : SHAKAIHOKEN_HYO.getHyojunHoshu(basis);
    var hyPension = SHAKAIHOKEN_HYO.getHyojunPension ? SHAKAIHOKEN_HYO.getHyojunPension(basis) : SHAKAIHOKEN_HYO.getHyojunHoshu(basis);
    // 端数：50銭以下切捨・超切上（Math.round=.5切上 は誤り）
    var han50 = SHAKAIHOKEN_HYO.han50 ? SHAKAIHOKEN_HYO.han50.bind(SHAKAIHOKEN_HYO) : function (x) { var n = Math.round(x * 100) / 100; var f = n - Math.floor(n); return f <= 0.5 ? Math.floor(n) : Math.ceil(n); };
    // 介護保険料率(対象月の社保年度で自動選択。getKaigo無ければ令和7スカラー→既定)
    var kaigoRate = SHAKAIHOKEN_HYO.getKaigo ? SHAKAIHOKEN_HYO.getKaigo(opts.payYm).jugyoin
      : (SHAKAIHOKEN_HYO.KAIGO_RITSU_JUGYOIN != null ? SHAKAIHOKEN_HYO.KAIGO_RITSU_JUGYOIN : 0.00795);
    var health = han50(hyHealth * healthRate);
    var kaigo = hasKaigo ? han50(hyHealth * kaigoRate) : 0;
    var pension = han50(hyPension * KOSEI_NENKIN_RITSU);
    var employ = han50(payTotal * employRate); // 雇用保険は総支給ベース（正しい）
    return {
      hyojun: hyPension,        // 後方互換（厚年標準報酬）
      hyojunHealth: hyHealth,
      hyojunPension: hyPension,
      health: health,
      pension: pension,
      kaigo: kaigo,
      employ: employ,
      total: health + pension + kaigo + employ,
    };
  }

  /**
   * 課税対象額 = 支給合計 − 社会保険料合計（介護を含む）。0未満は0。
   */
  function calcTaxableIncome(payTotal, si) {
    var k = (payTotal || 0) - (si ? si.total : 0);
    return k > 0 ? k : 0;
  }

  // ── 定時決定(算定基礎届)の月次履歴サポート ──
  var MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  // 月の暦日数(末日。閏年2月=29)。Date禁止環境でも動く
  function daysInMonth(y, m) { if (m === 2 && isLeap(y)) return 29; return MDAYS[m - 1] || 30; }
  // 'YYYY-MM' → その年の ['YYYY-04','YYYY-05','YYYY-06'](定時決定の算定対象3か月)
  function getTeijiYms(ym) { var y = String(ym == null ? '' : ym).slice(0, 4); return [y + '-04', y + '-05', y + '-06']; }
  // emp.kintai から正規表現一致の値(数値)。app.js kintaiVal と同等
  function kintaiNum(emp, re) {
    var k = (emp && emp.kintai) || [];
    for (var i = 0; i < k.length; i++) {
      if (re.test(k[i].label || '')) { var n = Number(String(k[i].value == null ? 0 : k[i].value).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
    }
    return 0;
  }
  /**
   * 支払基礎日数(算定基礎届)。定時決定の17日(短時間15日)判定に使う。
   * method: ''|'auto'=payTypeで自動 / 'calendar'=暦日数 / 'scheduled'=所定労働日数(欠勤あれば-欠勤) / 'worked'=出勤日数
   * 既定(日本年金機構): 月給・役員=その月の暦日数(欠勤があれば 所定労働日数−欠勤) / 日給・時給=出勤日数
   */
  function calcPaymentDays(emp, ym, method) {
    emp = emp || {};
    var y = +String(ym == null ? '' : ym).slice(0, 4), m = +String(ym == null ? '' : ym).slice(5, 7);
    var cal = (y && m) ? daysInMonth(y, m) : 30;
    var sched = (emp.scheduledDays != null && emp.scheduledDays !== '') ? (+emp.scheduledDays || 0) : cal;
    var kekkin = kintaiNum(emp, /欠勤/);
    var shukkin = kintaiNum(emp, /出勤/);
    var pt = emp.payType || '月給';
    function clamp(n) { n = Math.round(n); return n < 0 ? 0 : n; }
    if (method === 'calendar') return clamp(cal);
    if (method === 'worked') return clamp(shukkin);
    if (method === 'scheduled') return clamp(sched - kekkin);
    // 自動
    if (pt === '日給' || pt === '時給') return clamp(shukkin);
    if (kekkin > 0) return clamp(sched - kekkin);
    return clamp(cal);
  }

  // 欠勤控除(月給・日給月給制=ノーワークノーペイ)。月給の不就労分(欠勤日数+遅刻早退分)を控除する金額(円・正の値)を返す。
  //  完全月給制(控除しない)は呼び出し側でスキップ。1日あたり=月給÷分母 ×欠勤日数 / 遅刻早退=月給÷月平均所定労働時間 ×時間。
  //  method: ''|'avg'=1か月平均所定労働日数((暦日数-年間休日)/12) / 'calendar'=当月の暦日数 / 'scheduled'=当月所定労働日数(scheduledDays)
  //  根拠: 民法624条(ノーワーク・ノーペイ)・労基法24条。日給月給制が月給の標準。
  function calcKekkin(opts) {
    opts = opts || {};
    var num = function (v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; };
    var base = num(opts.base); if (!(base > 0)) return 0;
    var y = +String(opts.ym == null ? '' : opts.ym).slice(0, 4), m = +String(opts.ym == null ? '' : opts.ym).slice(5, 7);
    var leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    var yd = leap ? 366 : 365;
    var ah = num(opts.annualHolidays);
    var avgDays = (yd - ah) / 12;                 // 1か月平均所定労働日数
    var denom;
    if (opts.method === 'calendar') denom = (y && m) ? daysInMonth(y, m) : 30;
    else if (opts.method === 'scheduled' && num(opts.scheduledDays) > 0) denom = num(opts.scheduledDays);
    else denom = avgDays;
    var perDay = denom > 0 ? base / denom : 0;
    var dh = num(opts.dailyHours);
    var avgHours = (yd - ah) * dh / 12;           // 1か月平均所定労働時間(遅刻早退の時間単価用)
    var perHour = avgHours > 0 ? base / avgHours : 0;
    var deduct = perDay * num(opts.kekkinDays) + perHour * (num(opts.lateMin) / 60);
    deduct = Math.round(deduct);
    return deduct < 0 ? 0 : deduct;
  }

  return {
    isKaigoTarget: isKaigoTarget,
    calcSocialInsurance: calcSocialInsurance,
    calcTaxableIncome: calcTaxableIncome,
    daysInMonth: daysInMonth,
    getTeijiYms: getTeijiYms,
    calcPaymentDays: calcPaymentDays,
    calcKekkin: calcKekkin,
    _parseYmd: parseYmd,
    _reachMonthIndex: reachMonthIndex,
  };
});
