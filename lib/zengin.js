/* zengin.js — 全銀協規定形式「総合振込」固定長ファイル(120バイト/レコード)の生成(純関数)。
 * 【一次情報】全国銀行協会規定フォーマット(総合振込)。各行公式レイアウト照合(大分銀行/神奈川銀行/SMBC 2026-07)。
 *   レコード長=120バイト・半角文字(カナ/英大/数字/一部記号)。N=数字(右詰・前0埋)、C=半角文字(左詰・後スペース)。
 *   構成: ヘッダー(区分1)＋データ(区分2・件数分)＋トレーラー(区分8・合計件数/金額)＋エンド(区分9)。
 *   ヘッダー: 区分1(1)+種別"21"(2)+コード区分"0"(1)+委託者コード(10N)+委託者名(40C)+取組日MMDD(4N)+仕向銀行番号(4N)+仕向銀行名(15C)+仕向支店番号(3N)+仕向支店名(15C)+預金種目(1N)+口座番号(7N)+ダミー(17)=120
 *   データ: 区分2(1)+被仕向銀行番号(4N)+被仕向銀行名(15C)+被仕向支店番号(3N)+被仕向支店名(15C)+手形交換所(4N)+預金種目(1N)+口座番号(7N)+受取人名(30C)+振込金額(10N)+新規コード(1N)+顧客コード1(10C)+顧客コード2(10C)+振込区分(1N)+識別表示(1C)+ダミー(7)=120
 *   トレーラー: 区分8(1)+合計件数(6N)+合計金額(12N)+ダミー(101)=120  / エンド: 区分9(1)+ダミー(119)=120
 * 【出力】.text=120桁×行(CRLF区切り) / .bytes=Shift-JIS(Uint8Array)。実銀行に上げるのはbytes(Shift-JIS)。
 * 【利用】ブラウザ window.Zengin / Node require('./zengin.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Zengin = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 全角→半角カナ変換(受取人名・委託者名は半角カナで格納)。濁点/半濁点は独立文字に分解 ──
  var KANA = { 'ガ':'ｶﾞ','ギ':'ｷﾞ','グ':'ｸﾞ','ゲ':'ｹﾞ','ゴ':'ｺﾞ','ザ':'ｻﾞ','ジ':'ｼﾞ','ズ':'ｽﾞ','ゼ':'ｾﾞ','ゾ':'ｿﾞ','ダ':'ﾀﾞ','ヂ':'ﾁﾞ','ヅ':'ﾂﾞ','デ':'ﾃﾞ','ド':'ﾄﾞ','バ':'ﾊﾞ','ビ':'ﾋﾞ','ブ':'ﾌﾞ','ベ':'ﾍﾞ','ボ':'ﾎﾞ','パ':'ﾊﾟ','ピ':'ﾋﾟ','プ':'ﾌﾟ','ペ':'ﾍﾟ','ポ':'ﾎﾟ','ヴ':'ｳﾞ',
    'ア':'ｱ','イ':'ｲ','ウ':'ｳ','エ':'ｴ','オ':'ｵ','カ':'ｶ','キ':'ｷ','ク':'ｸ','ケ':'ｹ','コ':'ｺ','サ':'ｻ','シ':'ｼ','ス':'ｽ','セ':'ｾ','ソ':'ｿ','タ':'ﾀ','チ':'ﾁ','ツ':'ﾂ','テ':'ﾃ','ト':'ﾄ','ナ':'ﾅ','ニ':'ﾆ','ヌ':'ﾇ','ネ':'ﾈ','ノ':'ﾉ','ハ':'ﾊ','ヒ':'ﾋ','フ':'ﾌ','ヘ':'ﾍ','ホ':'ﾎ','マ':'ﾏ','ミ':'ﾐ','ム':'ﾑ','メ':'ﾒ','モ':'ﾓ','ヤ':'ﾔ','ユ':'ﾕ','ヨ':'ﾖ','ラ':'ﾗ','リ':'ﾘ','ル':'ﾙ','レ':'ﾚ','ロ':'ﾛ','ワ':'ﾜ','ヲ':'ｦ','ン':'ﾝ','ァ':'ｧ','ィ':'ｨ','ゥ':'ｩ','ェ':'ｪ','ォ':'ｫ','ッ':'ｯ','ャ':'ｬ','ュ':'ｭ','ョ':'ｮ','ー':'ｰ','　':' ','・':'･','（':'(','）':')' };
  // 全角英数記号→半角
  function z2hAscii(s) { return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); }
  // 銀行が受理する文字集合: 半角カナ・英大文字・数字・空白・一部記号。それ以外は空白に落とす(壊れた文字を送らない)。
  function toHankaku(str) {
    var s = z2hAscii(String(str == null ? '' : str));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (KANA[ch] != null) { out += KANA[ch]; continue; }
      // ひらがな→カナ→半角
      if (ch >= 'ぁ' && ch <= 'ん') { var k = String.fromCharCode(ch.charCodeAt(0) + 0x60); out += (KANA[k] != null ? KANA[k] : ' '); continue; }
      var code = ch.charCodeAt(0);
      if (code === 0x20) { out += ' '; continue; }
      if (code >= 0x30 && code <= 0x39) { out += ch; continue; }       // 0-9
      if (code >= 0x41 && code <= 0x5A) { out += ch; continue; }       // A-Z
      if (code >= 0x61 && code <= 0x7A) { out += ch.toUpperCase(); continue; } // a-z→大文字
      if (code >= 0xFF61 && code <= 0xFF9F) { out += ch; continue; }   // 既に半角カナ
      if ('().-/'.indexOf(ch) >= 0) { out += ch; continue; }           // 許容記号
      out += ' ';                                                       // 未対応文字は空白
    }
    return out;
  }

  function num(v) { var s = String(v == null ? '' : v).replace(/[^0-9\-]/g, ''); var n = parseInt(s, 10); return isNaN(n) ? 0 : n; } // 符号保持(負額が正の振込に化けるのを防ぐ)
  // N: 数字・右詰・前0埋・超過は下位len桁
  function padN(v, len) { var s = String(Math.max(0, num(v))); if (s.length > len) s = s.slice(s.length - len); while (s.length < len) s = '0' + s; return s; }
  // C: 半角文字・左詰・後スペース・超過はlen文字で切詰(半角=1文字1バイト前提)
  function padC(v, len) { var s = toHankaku(v); if (s.length > len) s = s.slice(0, len); while (s.length < len) s += ' '; return s; }
  function space(len) { var s = ''; while (s.length < len) s += ' '; return s; }

  // 科目名/コード。1=普通,2=当座,4=貯蓄,9=その他
  var YOKIN = { '普通': 1, '当座': 2, '貯蓄': 4, 'その他': 9, '1': 1, '2': 2, '4': 4, '9': 9 };
  function yokinCode(v) { return YOKIN[String(v == null ? '' : v).trim()] || 1; }

  // ヘッダー(120)。c=委託者{code,name,torikumiMMDD,bankNo,bankName,branchNo,branchName,yokin,account}
  function header(c) {
    c = c || {};
    var r = '1' + '21' + '0'
      + padN(c.code, 10) + padC(c.name, 40) + padN(c.torikumiMMDD, 4)
      + padN(c.bankNo, 4) + padC(c.bankName, 15) + padN(c.branchNo, 3) + padC(c.branchName, 15)
      + padN(yokinCode(c.yokin), 1) + padN(c.account, 7) + space(17);
    return r;
  }
  // データ(120)。d=受取{bankNo,bankName,branchNo,branchName,yokin,account,name,amount,customerCode}
  function dataRec(d) {
    d = d || {};
    var r = '2'
      + padN(d.bankNo, 4) + padC(d.bankName, 15) + padN(d.branchNo, 3) + padC(d.branchName, 15)
      + padN(0, 4)                                   // 手形交換所番号(未使用0)
      + padN(yokinCode(d.yokin), 1) + padN(d.account, 7) + padC(d.name, 30) + padN(d.amount, 10)
      + padN(d.newCode || 0, 1)                      // 新規コード(0=その他)
      + padC(d.customerCode || '', 10) + space(10)   // 顧客コード1/2
      + padN(7, 1)                                    // 振込区分(7=電信)
      + space(1) + space(7);                          // 識別表示 + ダミー
    return r;
  }
  function trailer(count, total) { return '8' + padN(count, 6) + padN(total, 12) + space(101); }
  function endRec() { return '9' + space(119); }

  // Shift-JIS(半角のみ)へエンコード。ASCII=そのまま/半角カナ(U+FF61..FF9F)=0xA1..0xDF。改行=CRLF。
  function toShiftJisBytes(text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code === 0x0D) { bytes.push(0x0D); continue; }
      if (code === 0x0A) { bytes.push(0x0A); continue; }
      if (code >= 0xFF61 && code <= 0xFF9F) { bytes.push(0xA1 + (code - 0xFF61)); continue; }
      if (code >= 0x00 && code <= 0x7F) { bytes.push(code); continue; }
      bytes.push(0x20); // 想定外はスペース
    }
    return new Uint8Array(bytes);
  }

  /** 総合振込ファイルを生成。
   * @param {object} committer 委託者 {code,name,torikumiMMDD,bankNo,bankName,branchNo,branchName,yokin,account}
   * @param {Array} transfers 明細 [{bankNo,bankName,branchNo,branchName,yokin,account,name,amount}]
   * @returns {object} {text, bytes, count, total, records[]}  (amount<=0の明細は除外)
   */
  function build(committer, transfers) {
    var list = (transfers || []).filter(function (t) { return num(t.amount) > 0; });
    var recs = [header(committer)];
    var total = 0;
    list.forEach(function (t) { recs.push(dataRec(t)); total += num(t.amount); });
    recs.push(trailer(list.length, total));
    recs.push(endRec());
    var text = recs.join('\r\n') + '\r\n';
    return { text: text, bytes: toShiftJisBytes(text), count: list.length, total: total, records: recs };
  }

  return {
    build: build, header: header, dataRec: dataRec, trailer: trailer, endRec: endRec,
    toHankaku: toHankaku, padN: padN, padC: padC, yokinCode: yokinCode, toShiftJisBytes: toShiftJisBytes
  };
});
