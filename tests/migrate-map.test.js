/* migrate-map.test.js — 他社エクスポートの一括取込マッパ(純関数)を実データで検証 */
'use strict';
var M = require('../lib/migrate-map.js');

// ── 列判定 classify（優先順・表記ゆれ） ──
T('classify: 氏名/番号/生年月日', function () {
  eq(M.classify('氏名'), 'name');
  eq(M.classify('従業員名'), 'name');
  eq(M.classify('従業員番号'), 'no');   // 番号は氏名より先
  eq(M.classify('社員コード'), 'no');
  eq(M.classify('生年月日'), 'birth');
});
T('classify: 基本給/手当/通勤は別タグ(基本給は手当に落ちない)', function () {
  eq(M.classify('基本給'), 'base');
  eq(M.classify('本給'), 'base');
  eq(M.classify('住宅手当'), 'allowance');
  eq(M.classify('役職手当'), 'allowance');
  eq(M.classify('資格手当'), 'allowance');
  eq(M.classify('歩合給'), 'allowance');
  eq(M.classify('通勤手当'), 'commute'); // 通勤は手当でなくcommute
  eq(M.classify('交通費'), 'commute');
});
T('classify: 先月の合計/差引/各控除は手当より先に判定', function () {
  eq(M.classify('総支給'), 'prevGross');
  eq(M.classify('支給合計'), 'prevGross');
  eq(M.classify('差引支給額'), 'prevNet');
  eq(M.classify('手取り'), 'prevNet');
  eq(M.classify('控除合計'), 'prevDeductTotal');
  eq(M.classify('健康保険'), 'prevHealth');
  eq(M.classify('介護保険'), 'prevKaigo');
  eq(M.classify('厚生年金'), 'prevPension');
  eq(M.classify('雇用保険'), 'prevEmploy');
  eq(M.classify('所得税'), 'prevTax');
  eq(M.classify('住民税'), 'residentTax');
});
T('classify: 従業員設定と未知列', function () {
  eq(M.classify('扶養親族数'), 'fuyou');
  eq(M.classify('都道府県'), 'pref');
  eq(M.classify('時給'), 'hourly');
  eq(M.classify('部署'), null);   // 未知はnull
  eq(M.classify(''), null);
});

// ── 生年月日/数値の正規化 ──
T('toYmd: 各種書式→YYYY-MM-DD、不明は空(勝手に埋めない)', function () {
  eq(M.toYmd('1980/5/15'), '1980-05-15');
  eq(M.toYmd('1980-05-15'), '1980-05-15');
  eq(M.toYmd('1980.5.15'), '1980-05-15');
  eq(M.toYmd('1980年5月15日'), '1980-05-15');
  eq(M.toYmd('19800515'), '1980-05-15');
  eq(M.toYmd('昭和55年'), '');   // 和暦は空
  eq(M.toYmd(''), '');
});
T('numStr: 全角/カンマ/非数/会計負数を正規化', function () {
  eq(M.numStr('250,000'), '250000');
  eq(M.numStr('２５００'), '2500');
  eq(M.numStr(''), '');
  eq(M.numStr('abc'), '');
  eq(M.numStr('(1,000)'), '-1000'); // 会計式の括弧は負数
});

// ── 対立監査の修正(誤分類の回帰防止) ──
T('監査: 介護手当/介護休業手当 は保険料でなく手当(allowance)', function () {
  eq(M.classify('介護保険'), 'prevKaigo');
  eq(M.classify('介護手当'), 'allowance');
  eq(M.classify('介護休業手当'), 'allowance');
  eq(M.classify('介護職員処遇改善手当'), 'allowance');
});
T('監査: 所得税調整/年末調整過不足 は先月所得税に混ぜない', function () {
  eq(M.classify('所得税'), 'prevTax');
  eq(M.classify('源泉所得税'), 'prevTax');
  ok(M.classify('所得税調整') !== 'prevTax', '所得税調整はprevTaxでない');
  ok(M.classify('年末調整過不足') !== 'prevTax', '年末調整過不足はprevTaxでない');
});
T('監査: 都道府県民税 は県(pref)でなく住民税(residentTax)', function () {
  eq(M.classify('都道府県民税'), 'residentTax');
  eq(M.classify('特別区民税'), 'residentTax');
  eq(M.classify('都道府県'), 'pref'); // 「民税」を含まない県列はprefのまま
});
T('監査: タイトル行付きでも見出し行(氏名を含む行)を自動検出', function () {
  const csv = '2026年6月 給与明細一覧,,,\n発行日 2026/7/10,,,\n氏名,基本給,差引支給額\n山田 太郎,250000,212128';
  const r = M.parseCsv(csv);
  eq(r.rows.length, 1, 'タイトル2行を飛ばして1名');
  eq(r.rows[0].name, '山田 太郎');
  eq(r.rows[0].shikyu[0].value, '250000');
});

// ── CSV 一括パース（1ファイルで全員） ──
var CSV = [
  '氏名,従業員番号,生年月日,基本給,住宅手当,通勤手当,扶養,総支給,差引支給額,健康保険,厚生年金',
  '山田 太郎,1001,1980/5/15,250000,10000,8400,1,268400,212128,13104,23790',
  '佐藤 花子,1002,1990-03-02,200000,0,6000,0,206000,170000,10100,18300'
].join('\n');

T('parseCsv: 2名を一括取込・氏名/番号/生年月日/扶養', function () {
  var r = M.parseCsv(CSV);
  eq(r.rows.length, 2);
  eq(r.rows[0].name, '山田 太郎');
  eq(r.rows[0].no, '1001');
  eq(r.rows[0].birthYmd, '1980-05-15');
  eq(r.rows[0].fuyou, '1');
  eq(r.rows[1].name, '佐藤 花子');
  eq(r.rows[1].birthYmd, '1990-03-02');
  eq(r.rows[1].fuyou, '0');
});
T('parseCsv: 支給行(基本給/手当/通勤)を組み立て・0の手当は入れない', function () {
  var r = M.parseCsv(CSV);
  var s0 = r.rows[0].shikyu;
  eq(s0.length, 3); // 基本給/住宅手当/通勤手当
  eq(s0[0].label, '基本給'); eq(s0[0].value, '250000');
  eq(s0[1].label, '住宅手当'); eq(s0[1].value, '10000');
  eq(s0[2].label, '通勤手当'); eq(s0[2].value, '8400');
  var s1 = r.rows[1].shikyu;
  eq(s1.length, 2); // 住宅手当=0 は除外 → 基本給+通勤手当
  eq(s1[0].label, '基本給'); eq(s1[1].label, '通勤手当');
});
T('parseCsv: 先月の突合値(総支給/差引/各控除)を抽出', function () {
  var r = M.parseCsv(CSV);
  var p = r.rows[0].prev;
  ok(p, '先月データあり');
  eq(p.gross, '268400');
  eq(p.net, '212128');
  eq(p.kojo.length, 2);
  eq(p.kojo[0].label, '健康保険'); eq(p.kojo[0].value, '13104');
  eq(p.kojo[1].label, '厚生年金'); eq(p.kojo[1].value, '23790');
});
T('parseCsv: カンマ入り金額・全角も吸収', function () {
  var r = M.parseCsv('氏名,基本給,差引支給額\n田中 一,"300,000",２４００００');
  eq(r.rows[0].shikyu[0].value, '300000');
  eq(r.rows[0].prev.net, '240000');
});
T('parseCsv: 氏名列が無ければ警告', function () {
  var r = M.parseCsv('番号,基本給\n1,250000');
  ok(r.warnings.some(function (w) { return /氏名/.test(w); }));
  eq(r.rows.length, 0);
});

// ── 列訂正 overrides（AI/手動でこの列は○○、と上書き） ──
T('overrides: 未知/誤判定の列をタグ上書き・"" は使わない', function () {
  // 見出し「支給1」は未知(null)→override で allowance 扱いにする
  var csv = '氏名,支給1,メモ\n山田 太郎,15000,foo';
  var head = M.parseCsv(csv).headers; // ['氏名','支給1','メモ']
  var r = M.parseCsv(csv, { overrides: { 1: 'allowance', 2: '' } });
  eq(r.rows[0].shikyu.length, 1);
  eq(r.rows[0].shikyu[0].label, '支給1');
  eq(r.rows[0].shikyu[0].value, '15000');
});

// ── Excel(AOA) 経由も同じ結果 ──
T('parseAoa: 2次元配列(Excel)からも同じ取込', function () {
  var aoa = [
    ['氏名', '基本給', '通勤手当', '差引支給額'],
    ['山田 太郎', 250000, 8400, 212128],
    ['', '', '', ''] // 空行は無視
  ];
  var r = M.parseAoa(aoa);
  eq(r.rows.length, 1);
  eq(r.rows[0].name, '山田 太郎');
  eq(r.rows[0].shikyu[0].value, '250000');
  eq(r.rows[0].shikyu[1].label, '通勤手当');
  eq(r.rows[0].prev.net, '212128');
});
