/* taxable-total.test.js — 課税支給合計(非課税限度の超過分だけ課税)。年調/賃金台帳が通勤超過分を落とすバグの回帰ガード。 */
'use strict';
var PC = require('../lib/calc.js');

var BASE = { label: '基本給', value: 250000 };

T('通勤が非課税限度内なら全額非課税(課税は基本給のみ)', function () {
  var t = PC.taxableTotal([BASE, { label: '通勤手当', value: 8400, hikazei: true }]);
  eq(t, 250000);
});

T('公共交通の通勤が15万超なら超過分だけ課税(月次源泉と一致)', function () {
  var t = PC.taxableTotal([BASE, { label: '通勤手当', value: 160000, hikazei: true }]);
  eq(t, 250000 + 10000); // 160000-150000=10000 が課税
});

T('マイカー通勤(明示限度7,300)なら超過分7,700が課税', function () {
  var t = PC.taxableTotal([BASE, { label: '通勤手当', value: 15000, hikazei: true, nonTaxLimit: 7300 }]);
  eq(t, 250000 + 7700);
});

/* ★名称一致の手当も明示hikazei:false なら課税に戻せる(日当/出張手当は課税もあるため強制しない)★ */
T('名称一致でも hikazei:false は課税(日当を課税にできる)', function () {
  eq(PC.taxableTotal([BASE, { label: '日当', value: 5000, hikazei: false }]), 250000 + 5000);
  eq(PC.taxableTotal([BASE, { label: '出張手当', value: 8000, hikazei: false }]), 250000 + 8000);
});
T('明示なし(未指定)は従来どおり名称で非課税=後方互換', function () {
  eq(PC.taxableTotal([BASE, { label: '日当', value: 5000 }]), 250000);       // hikazei未指定→名称で非課税
});
T('明示 hikazei:true は名称に依らず非課税', function () {
  eq(PC.taxableTotal([BASE, { label: '特別手当', value: 5000, hikazei: true }]), 250000);
});

T('限度なしの非課税(旅費等)は全額非課税・課税手当は全額課税', function () {
  var t = PC.taxableTotal([BASE, { label: '出張旅費', value: 5000 }, { label: '役職手当', value: 20000 }]);
  eq(t, 250000 + 20000); // 旅費はラベル自動判定で全額非課税、役職手当は課税
});

T('空/未定義でも0でクラッシュしない', function () {
  eq(PC.taxableTotal([]), 0);
  eq(PC.taxableTotal(null), 0);
  eq(PC.taxableTotal([{ label: '基本給', value: 'abc' }]), 0);
});
