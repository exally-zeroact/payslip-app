/* zengin.test.js — 全銀協 総合振込 固定長(120バイト)の項目位置・桁埋め・半角カナ・Shift-JIS・トレーラ合計をロック。
 * 期待値は公式レイアウト(桁数)から手構成(自己参照でない)。★120"文字"かつ120"バイト"=2バイト文字混入(=銀行が弾く)を検出★ */
'use strict';
var Z = require('../lib/zengin.js');

var committer = { code: '0123456789', name: 'カ)ゼロアクト', torikumiMMDD: '0725', bankNo: '0001', bankName: 'ﾐｽﾞﾎ', branchNo: '001', branchName: 'ﾎﾝﾃﾝ', yokin: '普通', account: '1234567' };
var t1 = { bankNo: '0005', bankName: 'ﾐﾂﾋﾞｼ', branchNo: '012', branchName: 'ｼﾌﾞﾔ', yokin: '普通', account: '7654321', name: 'ヤマダ ハナコ', amount: 328710 };

/* --- 桁埋め(N=右詰0埋 / C=左詰スペース) --- */
T('zengin padN: 数字右詰・前0埋・超過は下位桁', function () {
  eq(Z.padN(328710, 10), '0000328710'); eq(Z.padN(5, 3), '005'); eq(Z.padN(12345678, 7), '2345678'); eq(Z.padN('', 4), '0000');
});
T('zengin padC: 半角化して左詰・後スペース・超過切詰', function () {
  eq(Z.padC('ABC', 5), 'ABC  '); eq(Z.padC('ゼロ', 6), 'ｾﾞﾛ   '); // ゼ→ｾﾞ(2)+ﾛ(1)=3 → +3space
  eq(Z.padC('ABCDEF', 4), 'ABCD');
});
T('zengin 全角→半角カナ(濁点分解・ひらがな・全角英数)', function () {
  eq(Z.toHankaku('ヤマダ ハナコ'), 'ﾔﾏﾀﾞ ﾊﾅｺ'); // ダ→ﾀﾞ
  eq(Z.toHankaku('ゼロアクト'), 'ｾﾞﾛｱｸﾄ');
  eq(Z.toHankaku('やまだ'), 'ﾔﾏﾀﾞ');            // ひらがな→半角カナ
  eq(Z.toHankaku('ＡＢ１２'), 'AB12');            // 全角英数→半角
  eq(Z.toHankaku('カ）'), 'ｶ)');                 // 全角括弧→半角
});
T('zengin 科目コード: 普通1/当座2/貯蓄4/その他9', function () {
  eq(Z.yokinCode('普通'), 1); eq(Z.yokinCode('当座'), 2); eq(Z.yokinCode('貯蓄'), 4); eq(Z.yokinCode('2'), 2); eq(Z.yokinCode('xxx'), 1);
});

/* --- ヘッダーレコード(120) 項目位置 --- */
T('zengin ヘッダー: 120文字・区分1種別21・各項目が正位置', function () {
  var h = Z.header(committer);
  eq(h.length, 120, 'ヘッダー120文字');
  eq(h.slice(0, 4), '1210', '区分1+種別21+コード区分0');
  eq(h.slice(4, 14), '0123456789', '委託者コード10N');
  eq(h.slice(14, 54).slice(0, 8), 'ｶ)ｾﾞﾛｱｸﾄ', '委託者名40C(半角カナ)');
  eq(h.slice(14, 54).length, 40);
  eq(h.slice(54, 58), '0725', '取組日MMDD');
  eq(h.slice(58, 62), '0001', '仕向銀行番号4N');
  eq(h.slice(62, 77).slice(0, 4), 'ﾐｽﾞﾎ', '仕向銀行名15C');
  eq(h.slice(77, 80), '001', '仕向支店番号3N');
  eq(h.slice(95, 96), '1', '預金種目1N');
  eq(h.slice(96, 103), '1234567', '口座番号7N');
});

/* --- データレコード(120) 項目位置 --- */
T('zengin データ: 120文字・区分2・各項目が正位置・金額右詰', function () {
  var d = Z.dataRec(t1);
  eq(d.length, 120, 'データ120文字');
  eq(d.slice(0, 1), '2', '区分2');
  eq(d.slice(1, 5), '0005', '被仕向銀行番号4N');
  eq(d.slice(5, 20).slice(0, 5), 'ﾐﾂﾋﾞｼ', '被仕向銀行名15C');
  eq(d.slice(20, 23), '012', '被仕向支店番号3N');
  eq(d.slice(42, 43), '1', '預金種目1N(普通)');
  eq(d.slice(43, 50), '7654321', '口座番号7N');
  eq(d.slice(50, 80).slice(0, 8), 'ﾔﾏﾀﾞ ﾊﾅｺ', '受取人名30C(半角カナ)');
  eq(d.slice(80, 90), '0000328710', '振込金額10N');
  eq(d.slice(111, 112), '7', '振込区分7(電信)');
});

/* --- ★120"バイト"(Shift-JIS)=2バイト文字混入検出★ --- */
T('zengin Shift-JIS: 半角カナ→0xA1..0xDF・レコードは120バイト', function () {
  eq(Z.toShiftJisBytes('ｱ')[0], 0xB1); // ｱ=U+FF71→0xB1
  eq(Z.toShiftJisBytes('ｦ')[0], 0xA6);
  eq(Array.from(Z.toShiftJisBytes('A0')).join(','), '65,48');
  eq(Z.toShiftJisBytes(Z.header(committer)).length, 120, 'ヘッダー120バイト(2バイト文字なし)');
  eq(Z.toShiftJisBytes(Z.dataRec(t1)).length, 120, 'データ120バイト');
});

/* --- build 総合: ヘッダ+データ+トレーラ(合計)+エンド・0円除外 --- */
T('zengin build: 5レコード・トレーラ合計件数/金額・改行CRLF', function () {
  var t2 = { bankNo: '0009', bankName: 'ﾐﾂｲ', branchNo: '100', branchName: 'ｼﾝｼﾞｭｸ', yokin: '当座', account: '0011223', name: 'サトウ タロウ', amount: 250000 };
  var r = Z.build(committer, [t1, t2]);
  eq(r.count, 2); eq(r.total, 578710);
  eq(r.records.length, 5, 'ヘッダ+2データ+トレーラ+エンド');
  var tr = r.records[3]; // トレーラー
  eq(tr.length, 120); eq(tr.slice(0, 1), '8'); eq(tr.slice(1, 7), '000002'); eq(tr.slice(7, 19), '000000578710'); eq(tr.slice(19).trim(), '');
  eq(r.records[4].slice(0, 1), '9'); eq(r.records[4].length, 120);
  ok(r.text.indexOf('\r\n') > 0, 'CRLF区切り');
  eq(r.bytes.length, 120 * 5 + 2 * 5, '120×5レコード + CRLF×5'); // 各行末CRLF(末尾含む)
});
T('zengin build: 金額0以下は除外', function () {
  var r = Z.build(committer, [t1, { bankNo: '0009', account: '1', name: 'ゼロ', amount: 0 }]);
  eq(r.count, 1); eq(r.total, 328710);
});
T('zengin build: 負の金額は符号を保持して除外(正額に化けない)', function () {
  var r = Z.build(committer, [t1, { bankNo: '0009', branchNo: '001', account: '1', name: 'ﾏｲﾅｽ', amount: -500 }]);
  eq(r.count, 1); eq(r.total, 328710); // -500 が +500 として通らない
});
