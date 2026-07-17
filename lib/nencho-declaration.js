/**
 * nencho-declaration.js — 年末調整の「従業員セルフ申告」の中核ロジック(UIから分離=テスト可能)。
 *  従業員がスマホで平易な質問に答える → 申告オブジェクト → 管理者の年調(nencho n.*)へ取り込む。
 *  ★方針: 平易・分かりやすさを崩さない。専門語は併記、質問は生活語。金額は控除証明書の数字を写すだけ。
 *  【利用】ブラウザ window.NenchoDecl / Node require。純関数のみ(DOM非依存)。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.NenchoDecl = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  function cnt(v) { return Math.max(0, Math.floor(num(v))); } // 人数=0以上整数

  // 申告できる項目(給与収入/源泉/社保は履歴から自動なので"含めない")。key は年調(nencho n.*)と同名=取り込みが1:1。
  //  group=画面のまとまり / q=生活語の質問 / help=補足 / type=bool|count|yen|select
  var FIELDS = [
    // 配偶者
    { key: 'haiEnabled', group: 'spouse', type: 'bool', q: '配偶者（夫・妻）はいますか？', help: 'あなたが扶養している配偶者。共働きでも該当し得ます。' },
    { key: 'haiShotoku', group: 'spouse', type: 'yen', q: '配偶者の去年の合計所得（およそ）', help: '給与だけなら「年収−55万円」がおよその所得。分からなければ会社へ相談。', when: 'haiEnabled' },
    { key: 'haiRojin', group: 'spouse', type: 'bool', q: '配偶者は70歳以上ですか？', help: '老人控除対象配偶者の判定に使います。', when: 'haiEnabled' },
    // 扶養している家族(配偶者以外)
    { key: 'fuyoIppan', group: 'fuyo', type: 'count', q: '扶養している16歳以上の家族（配偶者以外）は何人？', help: '子・親など。16歳未満は数えません。' },
    { key: 'fuyoTokutei', group: 'fuyo', type: 'count', q: 'そのうち19〜22歳は何人？（特定扶養）', help: '大学生年代など。控除が大きくなります。' },
    { key: 'fuyoRoujin', group: 'fuyo', type: 'count', q: 'そのうち70歳以上は何人？（老人扶養）', help: '70歳以上の親など。' },
    { key: 'fuyoDoukyo', group: 'fuyo', type: 'count', q: 'その70歳以上のうち、同居の親は何人？（同居老親）', help: '一緒に住む親はさらに控除。' },
    // 本人の事情
    { key: 'shougai', group: 'self', type: 'select', q: 'あなた自身は障害者に当たりますか？', help: '手帳の等級で決まります。分からなければ「なし」。',
      options: [['', '該当なし'], ['ippan', '一般の障害者'], ['tokubetsu', '特別障害者'], ['doukyo', '同居の特別障害者']] },
    { key: 'kafu', group: 'self', type: 'bool', q: 'あなたは寡婦（かふ）に当たりますか？', help: '夫と離別・死別した女性で一定要件。' },
    { key: 'hitorioya', group: 'self', type: 'bool', q: 'あなたはひとり親に当たりますか？', help: '子を扶養する未婚・離別・死別の親。' },
    { key: 'kinrou', group: 'self', type: 'bool', q: 'あなたは勤労学生ですか？', help: '働きながら学校に通う学生。' },
    // 生命保険料(控除証明書を写す)
    { key: 'seiGeneralNew', group: 'life', type: 'yen', q: '生命保険料（一般・新／平成24年以降の契約）', help: '保険会社の控除証明書の「新・一般」の申告額。' },
    { key: 'seiGeneralOld', group: 'life', type: 'yen', q: '生命保険料（一般・旧／平成23年以前の契約）', help: '控除証明書の「旧・一般」。' },
    { key: 'seiKaigo', group: 'life', type: 'yen', q: '介護医療保険料', help: '控除証明書の「介護医療」。' },
    { key: 'seiPensionNew', group: 'life', type: 'yen', q: '個人年金保険料（新）', help: '控除証明書の「新・個人年金」。' },
    { key: 'seiPensionOld', group: 'life', type: 'yen', q: '個人年金保険料（旧）', help: '控除証明書の「旧・個人年金」。' },
    // 地震保険料
    { key: 'jishinP', group: 'quake', type: 'yen', q: '地震保険料', help: '控除証明書の地震保険料。' },
    { key: 'jishinKyu', group: 'quake', type: 'yen', q: '旧長期損害保険料', help: '平成18年以前の長期損害保険。' },
    // その他
    { key: 'shokibo', group: 'other', type: 'yen', q: 'iDeCo・小規模企業共済などの掛金（年間）', help: '小規模企業共済等掛金。iDeCoの年間払込額。' },
    { key: 'jutakuLoan', group: 'other', type: 'yen', q: '住宅ローン控除の額（2年目以降・分かれば）', help: '税務署の「年末調整のための住宅借入金等特別控除証明書」の控除額。1年目は確定申告。' }
  ];
  var GROUPS = [
    { id: 'spouse', title: '配偶者について' },
    { id: 'fuyo', title: '扶養している家族（配偶者以外）' },
    { id: 'self', title: 'あなた自身のこと' },
    { id: 'life', title: '生命保険料（控除証明書の数字を写す）' },
    { id: 'quake', title: '地震保険料' },
    { id: 'other', title: 'その他（iDeCo・住宅ローンなど）' }
  ];

  function blank() { var d = {}; for (var i = 0; i < FIELDS.length; i++) d[FIELDS[i].key] = FIELDS[i].type === 'bool' ? false : (FIELDS[i].type === 'select' ? '' : ''); return d; }

  // 生入力→型に正規化(数値/人数/真偽/選択)。不正値は安全側(0/false/'')。
  function normalize(input) {
    input = input || {}; var out = {};
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i], v = input[f.key];
      if (f.type === 'bool') out[f.key] = (v === true || v === 'true' || v === 1 || v === '1' || v === 'on');
      else if (f.type === 'count') out[f.key] = cnt(v);
      else if (f.type === 'yen') out[f.key] = Math.max(0, Math.round(num(v)));
      else if (f.type === 'select') { var ok = (f.options || []).some(function (o) { return o[0] === v; }); out[f.key] = ok ? v : ''; }
    }
    // 配偶者なしなら配偶者関連はクリア(整合)
    if (!out.haiEnabled) { out.haiShotoku = 0; out.haiRojin = false; }
    // 同居老親は老人扶養を超えない(整合)
    if (out.fuyoDoukyo > out.fuyoRoujin) out.fuyoDoukyo = out.fuyoRoujin;
    return out;
  }

  // 申告 → 管理者の年調(nencho n.*)へ反映。n をその場で更新して返す(既存の入力を上書き=従業員の申告を正とする)。
  function applyToNencho(n, decl) {
    n = n || {}; var d = normalize(decl);
    for (var i = 0; i < FIELDS.length; i++) { var k = FIELDS[i].key; n[k] = d[k]; }
    return n;
  }

  // 管理者/従業員の確認用に、入力済みの主な項目を平易な文で要約。
  function summarize(decl) {
    var d = normalize(decl), lines = [];
    if (d.haiEnabled) lines.push('配偶者：あり（所得約' + d.haiShotoku.toLocaleString() + '円' + (d.haiRojin ? '・70歳以上' : '') + '）');
    var f = d.fuyoIppan; if (f > 0) lines.push('扶養：' + f + '人（特定' + d.fuyoTokutei + '／老人' + d.fuyoRoujin + '／同居老親' + d.fuyoDoukyo + '）');
    var self = []; if (d.shougai) self.push('障害者'); if (d.kafu) self.push('寡婦'); if (d.hitorioya) self.push('ひとり親'); if (d.kinrou) self.push('勤労学生');
    if (self.length) lines.push('本人：' + self.join('・'));
    var life = d.seiGeneralNew + d.seiGeneralOld + d.seiKaigo + d.seiPensionNew + d.seiPensionOld;
    if (life > 0) lines.push('生命保険料：合計' + life.toLocaleString() + '円');
    if (d.jishinP + d.jishinKyu > 0) lines.push('地震保険料：' + (d.jishinP + d.jishinKyu).toLocaleString() + '円');
    if (d.shokibo > 0) lines.push('iDeCo等：' + d.shokibo.toLocaleString() + '円');
    if (d.jutakuLoan > 0) lines.push('住宅ローン控除：' + d.jutakuLoan.toLocaleString() + '円');
    return lines;
  }

  // 何か入力されているか(未申告の判定用)
  function isEmpty(decl) { var d = normalize(decl); for (var i = 0; i < FIELDS.length; i++) { var k = FIELDS[i].key, v = d[k]; if (v && v !== '' && v !== 0) return false; } return true; }

  return { FIELDS: FIELDS, GROUPS: GROUPS, blank: blank, normalize: normalize, applyToNencho: applyToNencho, summarize: summarize, isEmpty: isEmpty };
});
