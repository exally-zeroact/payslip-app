/**
 * shakaihoken-hyo.js - 社会保険料（標準報酬月額・保険料率）
 * ================================================================
 * 【更新タイミング】
 *   健康保険料率：毎年3月（3月分＝4月納付分から適用）
 *   厚生年金料率：現在固定（変更時は法改正）
 *   介護保険料率：毎年3月（全国一律）
 * 【参照先】
 *   協会けんぽ https://www.kyoukaikenpo.or.jp/g7/cat330/sb3130/
 *   日本年金機構 https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/
 * 【最終確認】令和7年度（2025年3月〜2026年2月）
 * ================================================================
 * 【更新方法】
 *  1. 毎年2月頃に協会けんぽのサイトで翌年度料率を確認
 *  2. KENKO_RITSU の各都道府県の値を更新
 *  3. 介護保険料率（KAIGO_RITSU）も確認して更新
 *  4. NENDO を更新年度に変更
 * ================================================================
 * 【正しい計算方法】
 *  ① 支給合計から「標準報酬月額等級」を決定
 *  ② 標準報酬月額 × 保険料率 = 保険料（会社＋本人合計）
 *  ③ 従業員負担 = 保険料 ÷ 2（労使折半）
 *  ④ 端数処理：50銭以下切捨て、50銭超切上げ
 * ================================================================
 */

const SHAKAIHOKEN_HYO = {

  NENDO: '令和7年度（2025年3月〜2026年2月）',

  // ----------------------------------------------------------------
  // 厚生年金保険料率（全国一律・固定）
  // 2017年9月以降18.3%固定
  // 従業員負担：9.15%（折半）
  // ----------------------------------------------------------------
  KOSEI_NENKIN_RITSU_TOTAL: 0.183,
  KOSEI_NENKIN_RITSU_JUGYOIN: 0.0915,

  // ----------------------------------------------------------------
  // 介護保険料率（40歳以上65歳未満に適用・全国一律）
  // ----------------------------------------------------------------
  KAIGO_RITSU_TOTAL: 0.0159,         // 令和7年度：1.59%
  KAIGO_RITSU_JUGYOIN: 0.00795,      // 従業員負担：0.795%

  // ----------------------------------------------------------------
  // 協会けんぽ 都道府県別 健康保険料率（令和7年度・全国）
  // ※労使折半のため、従業員負担 = 全体料率 ÷ 2
  // ※組合健保は各健康保険組合で異なる（要確認）
  // ----------------------------------------------------------------
  KENKO_RITSU: {
    // 全体料率（%）→ 従業員負担は ÷ 2
    hokkaido:  { name: '北海道', total: 0.1031, jugyoin: 0.05155 },
    aomori:    { name: '青森県', total: 0.0985, jugyoin: 0.04925 },
    iwate:     { name: '岩手県', total: 0.0962, jugyoin: 0.0481 },
    miyagi:    { name: '宮城県', total: 0.1011, jugyoin: 0.05055 },
    akita:     { name: '秋田県', total: 0.1001, jugyoin: 0.05005 },
    yamagata:  { name: '山形県', total: 0.0975, jugyoin: 0.04875 },
    fukushima: { name: '福島県', total: 0.0962, jugyoin: 0.0481 },
    ibaraki:   { name: '茨城県', total: 0.0967, jugyoin: 0.04835 },
    tochigi:   { name: '栃木県', total: 0.0982, jugyoin: 0.0491 },
    gunma:     { name: '群馬県', total: 0.0977, jugyoin: 0.04885 },
    saitama:   { name: '埼玉県', total: 0.0976, jugyoin: 0.0488 },
    chiba:     { name: '千葉県', total: 0.0979, jugyoin: 0.04895 },
    tokyo:     { name: '東京都', total: 0.0991, jugyoin: 0.04955 },
    kanagawa:  { name: '神奈川県', total: 0.0992, jugyoin: 0.0496 },
    niigata:   { name: '新潟県', total: 0.0955, jugyoin: 0.04775 },
    toyama:    { name: '富山県', total: 0.0965, jugyoin: 0.04825 },
    ishikawa:  { name: '石川県', total: 0.0988, jugyoin: 0.0494 },
    fukui:     { name: '福井県', total: 0.0994, jugyoin: 0.0497 },
    yamanashi: { name: '山梨県', total: 0.0989, jugyoin: 0.04945 },
    nagano:    { name: '長野県', total: 0.0969, jugyoin: 0.04845 },
    gifu:      { name: '岐阜県', total: 0.0993, jugyoin: 0.04965 },
    shizuoka:  { name: '静岡県', total: 0.0980, jugyoin: 0.049 },
    aichi:     { name: '愛知県', total: 0.1003, jugyoin: 0.05015 },
    mie:       { name: '三重県', total: 0.0999, jugyoin: 0.04995 },
    shiga:     { name: '滋賀県', total: 0.0997, jugyoin: 0.04985 },
    kyoto:     { name: '京都府', total: 0.1003, jugyoin: 0.05015 },
    osaka:     { name: '大阪府', total: 0.1024, jugyoin: 0.0512 },
    hyogo:     { name: '兵庫県', total: 0.1016, jugyoin: 0.0508 },
    nara:      { name: '奈良県', total: 0.1002, jugyoin: 0.0501 },
    wakayama:  { name: '和歌山県', total: 0.1019, jugyoin: 0.05095 },
    tottori:   { name: '鳥取県', total: 0.0993, jugyoin: 0.04965 },
    shimane:   { name: '島根県', total: 0.0994, jugyoin: 0.0497 },
    okayama:   { name: '岡山県', total: 0.1017, jugyoin: 0.05085 },
    hiroshima: { name: '広島県', total: 0.0997, jugyoin: 0.04985 },
    yamaguchi: { name: '山口県', total: 0.1036, jugyoin: 0.0518 },
    tokushima: { name: '徳島県', total: 0.1047, jugyoin: 0.05235 },
    kagawa:    { name: '香川県', total: 0.1021, jugyoin: 0.05105 },
    ehime:     { name: '愛媛県', total: 0.1018, jugyoin: 0.0509 },
    kochi:     { name: '高知県', total: 0.1013, jugyoin: 0.05065 },
    fukuoka:   { name: '福岡県', total: 0.1031, jugyoin: 0.05155 },
    saga:      { name: '佐賀県', total: 0.1078, jugyoin: 0.0539 },
    nagasaki:  { name: '長崎県', total: 0.1041, jugyoin: 0.05205 },
    kumamoto:  { name: '熊本県', total: 0.1012, jugyoin: 0.0506 },
    oita:      { name: '大分県', total: 0.1025, jugyoin: 0.05125 },
    miyazaki:  { name: '宮崎県', total: 0.1009, jugyoin: 0.05045 },
    kagoshima: { name: '鹿児島県', total: 0.1031, jugyoin: 0.05155 },
    okinawa:   { name: '沖縄県', total: 0.0944, jugyoin: 0.0472 },
  },

  // ----------------------------------------------------------------
  // 【年度自動切替】健保料率・介護・子育て支援金 を対象月(payYm)の社保年度で選択
  // 令和8(2026)健保料率(折半前)=協会けんぽ公式PDF(R8_*.pdf)を機械抽出して照合済。従業員=÷2。
  // 令和7(2025)は上の KENKO_RITSU(★2026-07公式照合済=協会けんぽ rate_prefectures/r07・47県)。社保年度=3月起算。
  // 出典: https://www.kyoukaikenpo.or.jp/ (都道府県別保険料額表 R8)
  // ----------------------------------------------------------------
  KENKO_2026: {
    hokkaido:0.1028, aomori:0.0985, iwate:0.0951, miyagi:0.1010, akita:0.1001, yamagata:0.0975,
    fukushima:0.0950, ibaraki:0.0952, tochigi:0.0982, gunma:0.0968, saitama:0.0967, chiba:0.0973,
    tokyo:0.0985, kanagawa:0.0992, niigata:0.0921, toyama:0.0959, ishikawa:0.0970, fukui:0.0971,
    yamanashi:0.0955, nagano:0.0963, gifu:0.0980, shizuoka:0.0961, aichi:0.0993, mie:0.0977,
    shiga:0.0988, kyoto:0.0989, osaka:0.1013, hyogo:0.1012, nara:0.0991, wakayama:0.1006,
    tottori:0.0986, shimane:0.0994, okayama:0.1005, hiroshima:0.0978, yamaguchi:0.1015, tokushima:0.1024,
    kagawa:0.1002, ehime:0.0998, kochi:0.1005, fukuoka:0.1011, saga:0.1055, nagasaki:0.1006,
    kumamoto:0.1008, oita:0.1008, miyazaki:0.0977, kagoshima:0.1013, okinawa:0.0944,
  },
  // 介護保険料率(全国一律・折半前) 年度別。出典=協会けんぽ公式(kyoukaikenpo.or.jp)で照合済:
  //  令和7年度(2025)=1.59%(従業員0.795%) / 令和8年度(2026)=1.62%(従業員0.81%・R8で1.59%→1.62%引上げ)。従業員=÷2。
  KAIGO_NENDO: { 2025: { total: 0.0159, jugyoin: 0.00795 }, 2026: { total: 0.0162, jugyoin: 0.0081 } },
  // 子ども・子育て支援金率(折半前・令和8年4月分〜・健保に追加)
  SHIENKIN_TOTAL_FROM_2026_04: 0.0023,
  // 社保年度(3月起算): 'YYYY-MM' で month>=3→その年, <3→前年(令和8年度=2026年3月〜2027年2月)
  shahoYearOf: function (ym) { ym = String(ym || ''); var y = parseInt(ym.slice(0, 4), 10) || 2026, m = parseInt(ym.slice(5, 7), 10) || 1; return m >= 3 ? y : y - 1; },
  // 健保料率(対象月の社保年度で選択)。{name,total,jugyoin(=total/2),nendo,stale}
  getKenko: function (pref, ym) {
    var y = this.shahoYearOf(ym); var base = this.KENKO_RITSU[pref] || this.KENKO_RITSU.tokyo; var total, nendo, stale = false;
    if (y >= 2026) { var t = this.KENKO_2026[pref]; total = (t != null ? t : this.KENKO_2026.tokyo); nendo = '令和' + (y - 2018) + '年度'; if (y > 2026) stale = true; }
    else { total = base.total; nendo = '令和7年度'; if (y < 2025) stale = true; }
    return { name: base.name, total: total, jugyoin: total / 2, nendo: nendo, stale: stale };
  },
  // 介護保険料率(対象月の社保年度で選択)。{total,jugyoin,stale}
  getKaigo: function (ym) { var y = this.shahoYearOf(ym); var k = this.KAIGO_NENDO[y]; var stale = false; if (!k) { k = this.KAIGO_NENDO[2026]; stale = true; } return { total: k.total, jugyoin: k.jugyoin, stale: stale }; },
  // 子育て支援金 従業員負担率(令和8年4月分〜=total/2。月<4や令和7以前は0)
  getShienkin: function (ym) { ym = String(ym || ''); return (ym >= '2026-04') ? this.SHIENKIN_TOTAL_FROM_2026_04 / 2 : 0; },
  // 中央(Supabase statutory kind=shakaihoken)の値で年度別に上書き。健保はtotalのみ(jugyoin=total/2はgetKenkoが都度計算)。
  // 47県そろってる時だけ上書き=壊れた部分データで既存を潰さない。不正なら何もしない=ハードコードのまま(フォールバック)。
  hydrate: function (year, data) {
    if (!data || typeof data !== 'object') return;
    var kt = data.kenko_total;
    if (kt && typeof kt === 'object' && Object.keys(kt).length >= 40) {
      var self = this;
      if (year >= 2026) { Object.keys(kt).forEach(function (p) { self.KENKO_2026[p] = kt[p]; }); }
      else { Object.keys(kt).forEach(function (p) { if (self.KENKO_RITSU[p]) self.KENKO_RITSU[p].total = kt[p]; }); }
    }
    if (data.kaigo_total != null && this.KAIGO_NENDO[year]) { this.KAIGO_NENDO[year].total = data.kaigo_total; this.KAIGO_NENDO[year].jugyoin = data.kaigo_total / 2; }
  },

  // ----------------------------------------------------------------
  // 標準報酬月額等級テーブル（厚生年金：32等級）
  // 支給合計からこのテーブルで等級を決定し、標準報酬月額を使用
  // ----------------------------------------------------------------
  // { min: 以上（円）, max: 未満（円）, hyojun: 標準報酬月額（円）, tokyu: 等級 }
  HYOJUN_HOSHU_HYO: [
    { min: 0,      max: 93000,  hyojun: 88000,  tokyu: 1  },
    { min: 93000,  max: 101000, hyojun: 98000,  tokyu: 2  },
    { min: 101000, max: 107000, hyojun: 104000, tokyu: 3  },
    { min: 107000, max: 114000, hyojun: 110000, tokyu: 4  },
    { min: 114000, max: 122000, hyojun: 118000, tokyu: 5  },
    { min: 122000, max: 130000, hyojun: 126000, tokyu: 6  },
    { min: 130000, max: 138000, hyojun: 134000, tokyu: 7  },
    { min: 138000, max: 146000, hyojun: 142000, tokyu: 8  },
    { min: 146000, max: 155000, hyojun: 150000, tokyu: 9  },
    { min: 155000, max: 165000, hyojun: 160000, tokyu: 10 },
    { min: 165000, max: 175000, hyojun: 170000, tokyu: 11 },
    { min: 175000, max: 185000, hyojun: 180000, tokyu: 12 },
    { min: 185000, max: 195000, hyojun: 190000, tokyu: 13 },
    { min: 195000, max: 210000, hyojun: 200000, tokyu: 14 },
    { min: 210000, max: 230000, hyojun: 220000, tokyu: 15 },
    { min: 230000, max: 250000, hyojun: 240000, tokyu: 16 },
    { min: 250000, max: 270000, hyojun: 260000, tokyu: 17 },
    { min: 270000, max: 290000, hyojun: 280000, tokyu: 18 },
    { min: 290000, max: 310000, hyojun: 300000, tokyu: 19 },
    { min: 310000, max: 330000, hyojun: 320000, tokyu: 20 },
    { min: 330000, max: 350000, hyojun: 340000, tokyu: 21 },
    { min: 350000, max: 370000, hyojun: 360000, tokyu: 22 },
    { min: 370000, max: 395000, hyojun: 380000, tokyu: 23 },
    { min: 395000, max: 425000, hyojun: 410000, tokyu: 24 },
    { min: 425000, max: 455000, hyojun: 440000, tokyu: 25 },
    { min: 455000, max: 485000, hyojun: 470000, tokyu: 26 },
    { min: 485000, max: 515000, hyojun: 500000, tokyu: 27 },
    { min: 515000, max: 545000, hyojun: 530000, tokyu: 28 },
    { min: 545000, max: 575000, hyojun: 560000, tokyu: 29 },
    { min: 575000, max: 605000, hyojun: 590000, tokyu: 30 },
    { min: 605000, max: 635000, hyojun: 620000, tokyu: 31 },
    { min: 635000, max: Infinity, hyojun: 650000, tokyu: 32 }, // 上限等級
  ],

  // ----------------------------------------------------------------
  // 健康保険 標準報酬月額（50等級・上限1,390,000）※健保は厚年(上限650,000)より上限が高い
  // 報酬月額の範囲で標準報酬月額を決定（協会けんぽ 保険料額表 準拠）
  // ----------------------------------------------------------------
  HEALTH_HYOJUN_HYO: [
    { min:0,       max:63000,   hyojun:58000   },{ min:63000,   max:73000,   hyojun:68000   },{ min:73000,   max:83000,   hyojun:78000   },
    { min:83000,   max:93000,   hyojun:88000   },{ min:93000,   max:101000,  hyojun:98000   },{ min:101000,  max:107000,  hyojun:104000  },
    { min:107000,  max:114000,  hyojun:110000  },{ min:114000,  max:122000,  hyojun:118000  },{ min:122000,  max:130000,  hyojun:126000  },
    { min:130000,  max:138000,  hyojun:134000  },{ min:138000,  max:146000,  hyojun:142000  },{ min:146000,  max:155000,  hyojun:150000  },
    { min:155000,  max:165000,  hyojun:160000  },{ min:165000,  max:175000,  hyojun:170000  },{ min:175000,  max:185000,  hyojun:180000  },
    { min:185000,  max:195000,  hyojun:190000  },{ min:195000,  max:210000,  hyojun:200000  },{ min:210000,  max:230000,  hyojun:220000  },
    { min:230000,  max:250000,  hyojun:240000  },{ min:250000,  max:270000,  hyojun:260000  },{ min:270000,  max:290000,  hyojun:280000  },
    { min:290000,  max:310000,  hyojun:300000  },{ min:310000,  max:330000,  hyojun:320000  },{ min:330000,  max:350000,  hyojun:340000  },
    { min:350000,  max:370000,  hyojun:360000  },{ min:370000,  max:395000,  hyojun:380000  },{ min:395000,  max:425000,  hyojun:410000  },
    { min:425000,  max:455000,  hyojun:440000  },{ min:455000,  max:485000,  hyojun:470000  },{ min:485000,  max:515000,  hyojun:500000  },
    { min:515000,  max:545000,  hyojun:530000  },{ min:545000,  max:575000,  hyojun:560000  },{ min:575000,  max:605000,  hyojun:590000  },
    { min:605000,  max:635000,  hyojun:620000  },{ min:635000,  max:665000,  hyojun:650000  },{ min:665000,  max:695000,  hyojun:680000  },
    { min:695000,  max:730000,  hyojun:710000  },{ min:730000,  max:770000,  hyojun:750000  },{ min:770000,  max:810000,  hyojun:790000  },
    { min:810000,  max:855000,  hyojun:830000  },{ min:855000,  max:905000,  hyojun:880000  },{ min:905000,  max:955000,  hyojun:930000  },
    { min:955000,  max:1005000, hyojun:980000  },{ min:1005000, max:1055000, hyojun:1030000 },{ min:1055000, max:1115000, hyojun:1090000 },
    { min:1115000, max:1175000, hyojun:1150000 },{ min:1175000, max:1235000, hyojun:1210000 },{ min:1235000, max:1295000, hyojun:1270000 },
    { min:1295000, max:1355000, hyojun:1330000 },{ min:1355000, max:Infinity, hyojun:1390000 },
  ],

  // 端数処理：50銭以下切捨て・50銭超切上げ（法定）。FP誤差対策で銭まで丸めてから判定
  han50: function(x) { var n = Math.round(x * 100) / 100; var f = n - Math.floor(n); return f <= 0.5 ? Math.floor(n) : Math.ceil(n); },

  // 標準報酬月額：厚生年金(上限650,000) / 健康保険(上限1,390,000) を分離
  getHyojunPension: function(pay) {
    for (var i = 0; i < this.HYOJUN_HOSHU_HYO.length; i++) { var r = this.HYOJUN_HOSHU_HYO[i]; if (pay >= r.min && pay < r.max) return r.hyojun; }
    return 650000;
  },
  getHyojunHealth: function(pay) {
    for (var i = 0; i < this.HEALTH_HYOJUN_HYO.length; i++) { var r = this.HEALTH_HYOJUN_HYO[i]; if (pay >= r.min && pay < r.max) return r.hyojun; }
    return 1390000;
  },
  // 後方互換（=厚生年金の標準報酬）
  getHyojunHoshu: function(pay) { return this.getHyojunPension(pay); },

  // 報酬月額→標準報酬月額等級 {hyojun,tokyu}(厚年32等級表。随時改定の2等級差判定用。上限は最終等級)
  gradeOf: function(pay) {
    var t = this.HYOJUN_HOSHU_HYO || [];
    for (var i = 0; i < t.length; i++) { if (pay >= t[i].min && pay < t[i].max) return { hyojun: t[i].hyojun, tokyu: t[i].tokyu }; }
    var last = t[t.length - 1] || { hyojun: 650000, tokyu: 32 };
    return { hyojun: last.hyojun, tokyu: last.tokyu };
  },
  // 健康保険の等級(1〜50)。健保表は tokyu 列が無いので index+1 を等級とする(先頭58,000=1級)。随時改定は厚年32等級で頭打ちする高額帯を健保で拾うために使う。
  gradeOfHealth: function(pay) {
    var t = this.HEALTH_HYOJUN_HYO || [];
    for (var i = 0; i < t.length; i++) { if (pay >= t[i].min && pay < t[i].max) return { hyojun: t[i].hyojun, tokyu: i + 1 }; }
    return { hyojun: (t.length ? t[t.length - 1].hyojun : 1390000), tokyu: t.length || 50 };
  },

  // 健康保険料（従業員負担・介護込み可）：健保標準報酬 × 折半料率、50銭ルール
  calcKenkoHoken: function(pay, prefCode, hasKaigo) {
    var hy = this.getHyojunHealth(pay);
    var pref = this.KENKO_RITSU[prefCode] || this.KENKO_RITSU['tokyo'];
    var ritsu = pref.jugyoin + (hasKaigo ? this.KAIGO_RITSU_JUGYOIN : 0);
    return this.han50(hy * ritsu);
  },
  // 厚生年金保険料（従業員負担）：厚年標準報酬 × 折半料率、50銭ルール
  calcKoseiNenkin: function(pay) {
    return this.han50(this.getHyojunPension(pay) * this.KOSEI_NENKIN_RITSU_JUGYOIN);
  }

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHAKAIHOKEN_HYO;
}
