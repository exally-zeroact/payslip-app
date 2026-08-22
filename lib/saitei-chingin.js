/**
 * saitei-chingin.js - 都道府県別最低賃金
 * ================================================================
 * 【更新タイミング】毎年10月（一部の県は翌年3月まで年またぎ）
 * 【参照先】厚生労働省
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/
 * 【最終確認】令和7年度（2025年10月〜2026年3月順次発効）
 * 全国加重平均：1,121円（前年比+66円・過去最大の引き上げ）
 * 全都道府県で初めて1,000円超え達成
 * ================================================================
 * 【更新方法】
 *  1. 毎年8〜9月頃に厚生労働省サイトで答申額を確認
 *  2. 10月以降に順次発効するので、発効日も確認
 *  3. 各都道府県の chingin 値を更新
 *  4. NENDO と ZENKOKU_HEIKIN を更新
 * ================================================================
 * 【注意】
 *  ・事業所の所在地（勤務地）の最低賃金が適用される
 *  ・従業員の住所地や本社所在地ではない
 * ================================================================
 */

const SAITEI_CHINGIN = {

  NENDO: '令和7年度（2025年度）',
  NENDO_YEAR: 2025,      // 収録している最賃の年度(会計年度・令和7年度=2025-10〜2026-09発効)。★次年度を足したらここも更新★
  HATSUKO_KIKAN: '2025年10月1日〜2026年3月31日（順次）',
  ZENKOKU_HEIKIN: 1121,  // 全国加重平均

  // ----------------------------------------------------------------
  // 都道府県別最低賃金（時給・円）
  // 出典：厚生労働省「令和7年度地域別最低賃金 全国一覧」公式PDF(001571192.pdf)を機械抽出して照合(2026-07)
  // ----------------------------------------------------------------
  todofuken: {
    hokkaido:  { name: "北海道", chingin: 1075, prev: 1010, hatsuko: '2025-10-04' },
    aomori:    { name: "青森県", chingin: 1029, prev: 953, hatsuko: '2025-11-21' },
    iwate:     { name: "岩手県", chingin: 1031, prev: 952, hatsuko: '2025-12-01' },
    miyagi:    { name: "宮城県", chingin: 1038, prev: 973, hatsuko: '2025-10-04' },
    akita:     { name: "秋田県", chingin: 1031, prev: 951, hatsuko: '2026-03-31' },
    yamagata:  { name: "山形県", chingin: 1032, prev: 955, hatsuko: '2025-12-23' },
    fukushima: { name: "福島県", chingin: 1033, prev: 955, hatsuko: '2026-01-01' },
    ibaraki:   { name: "茨城県", chingin: 1074, prev: 1005, hatsuko: '2025-10-12' },
    tochigi:   { name: "栃木県", chingin: 1068, prev: 1004, hatsuko: '2025-10-01' },
    gunma:     { name: "群馬県", chingin: 1063, prev: 985, hatsuko: '2026-03-01' },
    saitama:   { name: "埼玉県", chingin: 1141, prev: 1078, hatsuko: '2025-11-01' },
    chiba:     { name: "千葉県", chingin: 1140, prev: 1076, hatsuko: '2025-10-03' },
    tokyo:     { name: "東京都", chingin: 1226, prev: 1163, hatsuko: '2025-10-03' },
    kanagawa:  { name: "神奈川県", chingin: 1225, prev: 1162, hatsuko: '2025-10-04' },
    niigata:   { name: "新潟県", chingin: 1050, prev: 985, hatsuko: '2025-10-02' },
    toyama:    { name: "富山県", chingin: 1062, prev: 998, hatsuko: '2025-10-12' },
    ishikawa:  { name: "石川県", chingin: 1054, prev: 984, hatsuko: '2025-10-08' },
    fukui:     { name: "福井県", chingin: 1053, prev: 984, hatsuko: '2025-10-08' },
    yamanashi: { name: "山梨県", chingin: 1052, prev: 988, hatsuko: '2025-12-01' },
    nagano:    { name: "長野県", chingin: 1061, prev: 998, hatsuko: '2025-10-03' },
    gifu:      { name: "岐阜県", chingin: 1065, prev: 1001, hatsuko: '2025-10-18' },
    shizuoka:  { name: "静岡県", chingin: 1097, prev: 1034, hatsuko: '2025-11-01' },
    aichi:     { name: "愛知県", chingin: 1140, prev: 1077, hatsuko: '2025-10-18' },
    mie:       { name: "三重県", chingin: 1087, prev: 1023, hatsuko: '2025-11-21' },
    shiga:     { name: "滋賀県", chingin: 1080, prev: 1017, hatsuko: '2025-10-05' },
    kyoto:     { name: "京都府", chingin: 1122, prev: 1058, hatsuko: '2025-11-21' },
    osaka:     { name: "大阪府", chingin: 1177, prev: 1114, hatsuko: '2025-10-16' },
    hyogo:     { name: "兵庫県", chingin: 1116, prev: 1052, hatsuko: '2025-10-04' },
    nara:      { name: "奈良県", chingin: 1051, prev: 986, hatsuko: '2025-11-16' },
    wakayama:  { name: "和歌山県", chingin: 1045, prev: 980, hatsuko: '2025-11-01' },
    tottori:   { name: "鳥取県", chingin: 1030, prev: 957, hatsuko: '2025-10-04' },
    shimane:   { name: "島根県", chingin: 1033, prev: 962, hatsuko: '2025-11-17' },
    okayama:   { name: "岡山県", chingin: 1047, prev: 982, hatsuko: '2025-12-01' },
    hiroshima: { name: "広島県", chingin: 1085, prev: 1020, hatsuko: '2025-11-01' },
    yamaguchi: { name: "山口県", chingin: 1043, prev: 979, hatsuko: '2025-10-16' },
    tokushima: { name: "徳島県", chingin: 1046, prev: 980, hatsuko: '2026-01-01' },
    kagawa:    { name: "香川県", chingin: 1036, prev: 970, hatsuko: '2025-10-18' },
    ehime:     { name: "愛媛県", chingin: 1033, prev: 956, hatsuko: '2025-12-01' },
    kochi:     { name: "高知県", chingin: 1023, prev: 952, hatsuko: '2025-12-01' },
    fukuoka:   { name: "福岡県", chingin: 1057, prev: 992, hatsuko: '2025-11-16' },
    saga:      { name: "佐賀県", chingin: 1030, prev: 956, hatsuko: '2025-11-21' },
    nagasaki:  { name: "長崎県", chingin: 1031, prev: 953, hatsuko: '2025-12-01' },
    kumamoto:  { name: "熊本県", chingin: 1034, prev: 952, hatsuko: '2026-01-01' },
    oita:      { name: "大分県", chingin: 1035, prev: 954, hatsuko: '2026-01-01' },
    miyazaki:  { name: "宮崎県", chingin: 1023, prev: 952, hatsuko: '2025-11-16' },
    kagoshima: { name: "鹿児島県", chingin: 1026, prev: 953, hatsuko: '2025-11-01' },
    okinawa:   { name: "沖縄県", chingin: 1023, prev: 952, hatsuko: '2025-12-01' },
  },

  // ----------------------------------------------------------------
  // ヘルパー関数
  // ----------------------------------------------------------------
  // 最賃年度(会計年度・毎年10月改定): 対象月の月>=10→その年, <10→前年。(令和7年度=2025-10〜2026-09)
  saiteiNendoOf: function(ym) {
    ym = String(ym || ''); var y = parseInt(ym.slice(0, 4), 10) || 0, m = parseInt(ym.slice(5, 7), 10) || 0;
    if (!y) return this.NENDO_YEAR;
    return m >= 10 ? y : y - 1;
  },
  // 対象月の最賃年度が未収録(=収録年度と不一致)なら true。true時は直近収録値で暫定=公式公表後に更新が必要。
  saiteiStale: function(ym) { if (!ym) return false; return this.saiteiNendoOf(ym) !== this.NENDO_YEAR; },
  // 中央(Supabase statutory)の値で上書き。取れない/不正なら何もしない=ハードコードのまま(フォールバック)。
  hydrate: function (data) {
    if (!data || typeof data !== 'object') return;
    if (data.todofuken && typeof data.todofuken === 'object' && Object.keys(data.todofuken).length >= 40) {
      // ★中央は発効日を和暦(令和8年3月31日)で持つ。判定は日付比較なので ISO に直して取り込む。
      //   直さずに入れると chinginOn/monthSplit の比較が壊れる＝発効日が効かなくなる。
      var self = this, out = {};
      Object.keys(data.todofuken).forEach(function (k) {
        var c = data.todofuken[k] || {};
        out[k] = { name: c.name, chingin: c.chingin, prev: c.prev,
          hatsuko: self.toIsoHatsuko(c.hatsuko) || (self.todofuken[k] ? self.todofuken[k].hatsuko : null) };
      });
      this.todofuken = out;
    }
    if (data.zenkoku_heikin) this.ZENKOKU_HEIKIN = data.zenkoku_heikin;
  },
  // 和暦(令和8年3月31日) ⇄ ISO(2026-03-31)。中央は和暦・libはISO（判定に使うため）。
  toIsoHatsuko: function (s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return String(s);
    var m = /^令和(\d+)年(\d+)月(\d+)日$/.exec(String(s));
    if (!m) return null;
    return (2018 + (+m[1])) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  },
  toWarekiHatsuko: function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return iso || null;
    return '令和' + ((+m[1]) - 2018) + '年' + (+m[2]) + '月' + (+m[3]) + '日';
  },
  // 都道府県名から最低賃金を取得。ym は将来の年度別テーブル用の器(現状は令和7のみ収録なので常に現行値を返す=捏造しない)
  getChingin: function(prefCode, ym) {
    var pref = this.todofuken[prefCode];
    return pref ? pref.chingin : null;
  },

  /* ══ ★発効日で判定する（2026-08-03 新設） ══════════════════════════
   * 最低賃金は「発効日以降の労働」に効く。発効日は県ごとに違い、令和7年度は
   * 令和7年10月3日〜令和8年3月31日に【順次】＝10月中に発効しない県が27ある。
   * ★以前は saiteiNendoOf(全県10月一律)で額を選んでいたため、発効前の月に新しい
   *   (高い)額で判定し、秋田・群馬などで5ヶ月続けて誤警告を出していた。
   * ★saiteiNendoOf は「年度の器」（収録年度かどうか＝stale判定）専用。
   *   ★金額の判定には使わない。★ 金額は必ず下の3つを通す。
   * ★値(名前/額/前年額/発効日)は【中央 statutory が唯一の正】。
   *   この表は scripts/pull-statutory.mjs --write が中央から機械で書き戻した写しで、
   *   ★手で編集しない。★ ズレていないことは scripts/pull-statutory.mjs --check と
   *   scripts/verify-statutory.mjs がCIで見張る。
   */
  hatsukoOf: function (prefCode) { var p = this.todofuken[prefCode]; return p ? (p.hatsuko || null) : null; },

  // その日(YYYY-MM-DD)に効力のある額。発効日より前なら前年額。
  chinginOn: function (prefCode, ymd) {
    var p = this.todofuken[prefCode]; if (!p) return null;
    if (!ymd || !p.hatsuko) return p.chingin;
    return (String(ymd) >= p.hatsuko) ? p.chingin : (p.prev != null ? p.prev : p.chingin);
  },

  // 対象月(YYYY-MM)の中で額がいくつあるか。
  //  月内に発効日が【入らない】 → { split:false, chingin }
  //  月内に発効日が【入る】     → { split:true, hatsukoYmd, before, after }
  //  ★月の途中で発効する月を片方に丸めない。丸めるとどちらでも嘘になる
  //    （新に寄せる=誤警告 / 旧に寄せる=本物の割れを見逃す）。
  monthSplit: function (prefCode, ym) {
    var p = this.todofuken[prefCode]; if (!p) return null;
    var m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    if (!m || !p.hatsuko) return { split: false, chingin: p.chingin };
    var first = m[1] + '-' + m[2] + '-01';
    var last = m[1] + '-' + m[2] + '-' + String(new Date(+m[1], +m[2], 0).getDate()).padStart(2, '0');
    if (p.hatsuko <= first) return { split: false, chingin: p.chingin };          // 月初から新額
    if (p.hatsuko > last) return { split: false, chingin: (p.prev != null ? p.prev : p.chingin) }; // 月末まで旧額
    return { split: true, hatsukoYmd: p.hatsuko, before: (p.prev != null ? p.prev : p.chingin), after: p.chingin };
  }

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SAITEI_CHINGIN;
}
