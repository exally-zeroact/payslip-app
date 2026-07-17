/* zuiji.test.js — 随時改定(月額変更届)の該当判定 + 標準報酬等級 */
'use strict';
var PC = require('../lib/payroll-calc.js');
var SH = require('../lib/shakaihoken-hyo.js');

T('gradeOf: 報酬月額→標準報酬等級(厚年32等級)', function () {
  var g = SH.gradeOf(200000); eq(g.hyojun, 200000); eq(g.tokyu, 14); // 195,000〜210,000=14等級
  ok(SH.gradeOf(300000).tokyu > SH.gradeOf(200000).tokyu, '高い報酬は上位等級');
});

T('随時改定: 固定給変動+3か月17日以上+2等級差 → 該当', function () {
  var r = PC.zuijiKaitei({ months: [{ pay: 280000, days: 20 }, { pay: 285000, days: 21 }, { pay: 282000, days: 19 }], prevHyojun: 200000, fixedChanged: true, henkoYm: '2026-06' });
  eq(r.eligible, true);
  ok(r.gradeDiff >= 2, '2等級以上差');
  eq(r.applyYm, '2026-09'); // 変動月6月の4か月目=9月
  ok(r.newHyojun > 0, '新標準報酬');
});

T('随時改定: 2等級差に満たない → 非該当(理由あり)', function () {
  var r = PC.zuijiKaitei({ months: [{ pay: 205000, days: 20 }, { pay: 206000, days: 20 }, { pay: 204000, days: 20 }], prevHyojun: 200000, fixedChanged: true });
  eq(r.eligible, false);
  ok(r.reasons.some(function (x) { return /2等級/.test(x); }), '理由=2等級不足');
});

T('随時改定: 1か月でも17日未満 → 非該当', function () {
  var r = PC.zuijiKaitei({ months: [{ pay: 280000, days: 20 }, { pay: 285000, days: 16 }, { pay: 282000, days: 20 }], prevHyojun: 200000, fixedChanged: true });
  eq(r.eligible, false);
  eq(r.allDays, false);
  ok(r.reasons.some(function (x) { return /17日/.test(x); }), '理由=日数不足');
});

T('随時改定: 固定的賃金の変動なし → 非該当', function () {
  var r = PC.zuijiKaitei({ months: [{ pay: 280000, days: 20 }, { pay: 285000, days: 21 }, { pay: 282000, days: 19 }], prevHyojun: 200000, fixedChanged: false });
  eq(r.eligible, false);
  ok(r.reasons.some(function (x) { return /固定的賃金/.test(x); }), '理由=固定給変動なし');
});

T('随時改定: 高額帯(厚年32等級で頭打ち)でも健保の等級差で該当', function () {
  // 従前62万→平均90万: 厚年は上限付近で1等級差、健保は50等級で2等級以上動く
  var r = PC.zuijiKaitei({ months: [{ pay: 900000, days: 20 }, { pay: 905000, days: 21 }, { pay: 895000, days: 19 }], prevHyojun: 620000, fixedChanged: true, henkoYm: '2026-06' });
  eq(r.eligible, true);
  ok(r.pensionDiff < 2, '厚年は頭打ちで2等級未満(' + r.pensionDiff + ')');
  ok(r.healthDiff >= 2, '健保は2等級以上(' + r.healthDiff + ')');
  eq(r.which, '健康保険');
  // 保険ごとの答えが両方出る(厚年=対象外・健保=該当)
  eq(r.pension.eligible, false); ok(r.pension.prevGrade > 0 && r.pension.newGrade > 0, '厚年の等級が出る');
  eq(r.health.eligible, true); ok(r.health.prevGrade > 0 && r.health.newGrade > 0, '健保の等級が出る');
});

T('随時改定: 通常帯は厚年・健保とも該当(両方の答えが出る)', function () {
  var r = PC.zuijiKaitei({ months: [{ pay: 280000, days: 20 }, { pay: 285000, days: 21 }, { pay: 282000, days: 19 }], prevHyojun: 200000, fixedChanged: true, henkoYm: '2026-06' });
  eq(r.eligible, true);
  eq(r.pension.eligible, true); eq(r.health.eligible, true);
  ok(r.pension.diff >= 2 && r.health.diff >= 2, '両保険2等級以上');
});

T('随時改定: 従前標準報酬 未入力 → 非該当', function () {
  var r = PC.zuijiKaitei({ months: [{ pay: 280000, days: 20 }, { pay: 285000, days: 21 }, { pay: 282000, days: 19 }], prevHyojun: 0, fixedChanged: true });
  eq(r.eligible, false);
  ok(r.reasons.some(function (x) { return /従前/.test(x); }), '理由=従前未入力');
});
