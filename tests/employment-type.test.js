/* employment-type.test.js — K1 雇用形態フラグ（従業員/業務委託）
 *   業務委託(contractor)=法定控除を単一ソース(calc.js)で全オフ=控除ゼロの報酬明細。
 *   従業員(既定/'employee')=従来どおり（回帰ゼロ）。emp.apply は変異させない（戻すと復元）。 */
'use strict';
var PayslipCalc = require('../lib/calc.js');

// 実データ相当の従業員(社保・所得税・住民税が発生する構成)
function baseEmp(extra) {
  var e = {
    shikyu: [{ label: '基本給', value: 300000 }, { label: '通勤手当', value: 10000, hikazei: true }],
    birthYmd: '1985-04-01', payYm: '2026-06', fuyou: 1, taxClass: 'ko',
    pref: 'tokyo', residentTax: 12000, apply: {}
  };
  if (extra) for (var k in extra) e[k] = extra[k];
  return e;
}

T('従業員(employmentType未指定)=法定控除が発生する(基準)', function () {
  var r = PayslipCalc.computePayslip(baseEmp());
  ok(r.si.total > 0, '社保>0');
  ok(r.incomeTax > 0, '所得税>0');
  ok(r.kojo.some(function (k) { return k.label === '住民税' && k.value === 12000; }), '住民税あり');
  ok(r.net < r.shikyuTotal, '控除で手取り<支給');
});

T('従業員 = "employee"明示は未指定と完全一致(回帰ゼロ)', function () {
  var a = PayslipCalc.computePayslip(baseEmp());
  var b = PayslipCalc.computePayslip(baseEmp({ employmentType: 'employee' }));
  eq(JSON.stringify(b), JSON.stringify(a), 'employee明示=未指定と同一');
});

T('業務委託(contractor) = 控除ゼロ・支給=支払額', function () {
  var r = PayslipCalc.computePayslip(baseEmp({ employmentType: 'contractor' }));
  eq(r.si.total, 0, '社保0');
  eq(r.si.health, 0, '健保0'); eq(r.si.pension, 0, '厚年0'); eq(r.si.kaigo, 0, '介護0'); eq(r.si.employ, 0, '雇用0');
  eq(r.incomeTax, 0, '所得税0');
  eq(r.kojoTotal, 0, '控除合計0');
  eq(r.kojo.length, 0, '法定控除の行なし');
  eq(r.net, r.shikyuTotal, '手取り=支給合計');
  eq(r.net, 310000, '手取り=支払額(30万+通勤1万)');
});

T('業務委託は emp.apply を変異させない(従業員に戻すと復元)', function () {
  var e = baseEmp({ employmentType: 'contractor' });
  PayslipCalc.computePayslip(e);
  eq(JSON.stringify(e.apply), '{}', 'applyは空のまま(不変)');
  // 同じオブジェクトを従業員に戻す→控除が復活
  e.employmentType = 'employee';
  var r = PayslipCalc.computePayslip(e);
  ok(r.si.total > 0 && r.incomeTax > 0, '従業員に戻すとフル控除に回帰');
});

T('K3 業務委託の源泉(contractorGensen)=控除に「源泉徴収税」で載る・非該当は控除ゼロ', function () {
  // 該当区分=源泉あり(app側がShiharaiChoshoで算出しcontractorGensenで渡す)
  var r = PayslipCalc.computePayslip(baseEmp({ employmentType: 'contractor', contractorGensen: 5105,
    shikyu: [{ label: '原稿料', value: 50000 }] }));
  eq(r.si.total, 0, '社保は0のまま(業務委託)');
  ok(r.kojo.some(function (k) { return k.label === '源泉徴収税' && k.value === 5105; }), '源泉徴収税5,105が控除に');
  eq(r.kojoTotal, 5105, '控除計=源泉のみ');
  eq(r.net, 50000 - 5105, '手取り=報酬−源泉');
  // 非該当(contractorGensen未指定/0)=控除ゼロ回帰
  var r0 = PayslipCalc.computePayslip(baseEmp({ employmentType: 'contractor', shikyu: [{ label: '報酬', value: 50000 }] }));
  eq(r0.kojoTotal, 0, '非該当=控除ゼロ'); eq(r0.net, 50000, '非該当=支給=支払額');
});

T('業務委託でも extraKojo(任意の手動控除)は尊重=法定だけオフ', function () {
  var r = PayslipCalc.computePayslip(baseEmp({ employmentType: 'contractor', extraKojo: [{ label: '材料費相殺', value: 5000 }] }));
  eq(r.si.total, 0, '法定社保は0');
  eq(r.incomeTax, 0, '所得税0');
  eq(r.kojoTotal, 5000, '手動控除のみ残る');
  eq(r.kojo.length, 1, '手動1行だけ');
  eq(r.net, 305000, '手取り=支給-手動控除');
});
