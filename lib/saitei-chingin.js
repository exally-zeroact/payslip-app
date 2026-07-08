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
    hokkaido:  { name: '北海道', chingin: 1075 },
    aomori:    { name: '青森県', chingin: 1029 },
    iwate:     { name: '岩手県', chingin: 1031 },
    miyagi:    { name: '宮城県', chingin: 1038 },
    akita:     { name: '秋田県', chingin: 1031 },
    yamagata:  { name: '山形県', chingin: 1032 },
    fukushima: { name: '福島県', chingin: 1033 },
    ibaraki:   { name: '茨城県', chingin: 1074 },
    tochigi:   { name: '栃木県', chingin: 1068 },
    gunma:     { name: '群馬県', chingin: 1063 },
    saitama:   { name: '埼玉県', chingin: 1141 },
    chiba:     { name: '千葉県', chingin: 1140 },
    tokyo:     { name: '東京都', chingin: 1226 },
    kanagawa:  { name: '神奈川県', chingin: 1225 },
    niigata:   { name: '新潟県', chingin: 1050 },
    toyama:    { name: '富山県', chingin: 1062 },
    ishikawa:  { name: '石川県', chingin: 1054 },
    fukui:     { name: '福井県', chingin: 1053 },
    yamanashi: { name: '山梨県', chingin: 1052 },
    nagano:    { name: '長野県', chingin: 1061 },
    gifu:      { name: '岐阜県', chingin: 1065 },
    shizuoka:  { name: '静岡県', chingin: 1097 },
    aichi:     { name: '愛知県', chingin: 1140 },
    mie:       { name: '三重県', chingin: 1087 },
    shiga:     { name: '滋賀県', chingin: 1080 },
    kyoto:     { name: '京都府', chingin: 1122 },
    osaka:     { name: '大阪府', chingin: 1177 },
    hyogo:     { name: '兵庫県', chingin: 1116 },
    nara:      { name: '奈良県', chingin: 1051 },
    wakayama:  { name: '和歌山県', chingin: 1045 },
    tottori:   { name: '鳥取県', chingin: 1030 },
    shimane:   { name: '島根県', chingin: 1033 },
    okayama:   { name: '岡山県', chingin: 1047 },
    hiroshima: { name: '広島県', chingin: 1085 },
    yamaguchi: { name: '山口県', chingin: 1043 },
    tokushima: { name: '徳島県', chingin: 1046 },
    kagawa:    { name: '香川県', chingin: 1036 },
    ehime:     { name: '愛媛県', chingin: 1033 },
    kochi:     { name: '高知県', chingin: 1023 },
    fukuoka:   { name: '福岡県', chingin: 1057 },
    saga:      { name: '佐賀県', chingin: 1030 },
    nagasaki:  { name: '長崎県', chingin: 1031 },
    kumamoto:  { name: '熊本県', chingin: 1034 },
    oita:      { name: '大分県', chingin: 1035 },
    miyazaki:  { name: '宮崎県', chingin: 1023 },
    kagoshima: { name: '鹿児島県', chingin: 1026 },
    okinawa:   { name: '沖縄県', chingin: 1023 },
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
    if (data.todofuken && typeof data.todofuken === 'object' && Object.keys(data.todofuken).length >= 40) this.todofuken = data.todofuken;
    if (data.zenkoku_heikin) this.ZENKOKU_HEIKIN = data.zenkoku_heikin;
  },
  // 都道府県名から最低賃金を取得。ym は将来の年度別テーブル用の器(現状は令和7のみ収録なので常に現行値を返す=捏造しない)
  getChingin: function(prefCode, ym) {
    var pref = this.todofuken[prefCode];
    return pref ? pref.chingin : null;
  }

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SAITEI_CHINGIN;
}
