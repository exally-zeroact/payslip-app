/* shiharai-chosho.test.js — K3 源泉徴収(204条)＋支払調書。
 *   ★docs/SPEC_gensen_shiharai_tax_K3.md（国税庁 一次情報照合）の公式計算例と1円一致を実数値でロック。自己参照禁止。 */
'use strict';
var SC = require('../lib/shiharai-chosho.js');

T('A 一般・士業: 国税庁 No.2795 の計算例と1円一致', function () {
  eq(SC.gensenA(1500000), 204200, '150万→204,200（(150万−100万)×20.42%+102,100）');
  eq(SC.gensenA(1000000), 102100, '境界 100万→102,100（100万×10.21%）');
  eq(SC.gensenA(990000), 101079, '99万→101,079（99万×10.21%）');
  eq(SC.gensenA(50000), 5105, '5万→5,105（5万×10.21%・控除なし）');
  eq(SC.gensenA(0), 0, '0→0');
  eq(SC.gensenFor('ippan', 1500000), 204200, 'gensenFor(ippan)経由も一致');
});

T('B 司法書士等: (額−1万)×10.21% ・No.2801', function () {
  eq(SC.gensenB(50000), 4084, '5万→4,084（(5万−1万)×10.21%）');
  eq(SC.gensenB(10000), 0, '1万ちょうど→0');
  eq(SC.gensenB(5000), 0, '1万以下→0');
  eq(SC.gensenB(110000), 10210, '11万→10,210（(11万−1万)×10.21%）');
  eq(SC.gensenFor('shihou', 50000), 4084, 'gensenFor(shihou)経由も一致');
});

T('C 外交員等: (月報酬−(12万−給与))×10.21% ・No.2804', function () {
  eq(SC.gensenC(200000, 0), 8168, '月20万・給与0→8,168（(20万−12万)×10.21%）');
  eq(SC.gensenFor('gaikou', 200000, { monthlySalary: 0 }), 8168, 'gensenFor(gaikou)経由も一致');
  eq(SC.gensenC(100000, 0), 0, '月10万・給与0→控除後0以下=0');
  eq(SC.gensenC(200000, 50000), 13273, '給与併給5万→控除額=12万−5万=7万→(20万−7万)×10.21%=floor(130000×0.1021)=13,273');
  eq(SC.gensenC(50000, 50000), 0, '報酬5万・給与5万→控除残7万>報酬=0');
  eq(SC.gensenC(200000, 130000), 20420, '給与13万(>12万)→控除残0→20万×10.21%=20,420');
});

T('★不可侵: 非該当(代行/運送)とその他は源泉0・支払調書対象外', function () {
  eq(SC.gensenFor('none', 500000), 0, '代行=源泉0（全業務委託に源泉を掛けない）');
  eq(SC.gensenFor('sonota', 500000), 0, 'その他(要確認)=源泉0');
  eq(SC.gensenFor(undefined, 500000), 0, '未指定=非該当=0');
  ok(!SC.meetsThreshold('none', 99999999), '代行は基準判定で常に対象外');
  ok(!SC.meetsThreshold('sonota', 99999999), 'その他も対象外');
});

T('支払調書 提出基準: 士業/原稿5万超・外交員50万超(No.7431)', function () {
  ok(SC.meetsThreshold('ippan', 50001), '士業5万超で対象');
  ok(!SC.meetsThreshold('ippan', 50000), '5万ちょうどは対象外(超で)');
  ok(SC.meetsThreshold('shihou', 50001), '司法書士5万超で対象');
  ok(SC.meetsThreshold('gaikou', 500001), '外交員50万超で対象');
  ok(!SC.meetsThreshold('gaikou', 500000), '50万ちょうどは対象外');
});

T('choshoRows: 該当は対象・代行/基準未満は対象外(理由つき)', function () {
  var rows = SC.choshoRows([
    { name: '税理士A', kubun: 'ippan', annualPay: 600000, annualGensen: 61260 },
    { name: '外交員B', kubun: 'gaikou', annualPay: 400000, annualGensen: 20000 }, // 50万未満=対象外
    { name: '代行C', kubun: 'none', annualPay: 3000000, annualGensen: 0 }
  ]);
  eq(rows[0].target, true, '税理士60万=対象'); eq(rows[0].annualGensen, 61260, '源泉は入力の年間合計をそのまま');
  eq(rows[1].target, false, '外交員40万=基準未満で対象外'); ok(/未満/.test(rows[1].reason), '理由=基準未満');
  eq(rows[2].target, false, '代行=対象外'); ok(/非該当/.test(rows[2].reason), '理由=204条非該当');
});
