/* jinteki.test.js — 甲欄「扶養親族等の数」への本人の人的加算 + 実税額への反映(統合) */
'use strict';
var PC = require('../lib/payroll-calc.js');
var Densan = require('../lib/shotokuzei-densan.js');

T('本人加算: 障害者/寡婦orひとり親/勤労学生ごとに+1', function () {
  eq(PC.honninJintekiCount({}), 0);
  eq(PC.honninJintekiCount({ shogai: true }), 1);
  eq(PC.honninJintekiCount({ kafuHitorioya: 'kafu' }), 1);
  eq(PC.honninJintekiCount({ kafuHitorioya: 'hitorioya' }), 1);
  eq(PC.honninJintekiCount({ kinrou: true }), 1);
  eq(PC.honninJintekiCount({ shogai: true, kafuHitorioya: 'hitorioya', kinrou: true }), 3);
  eq(PC.honninJintekiCount({ kafuHitorioya: 'invalid' }), 0); // 不正値は加算しない
});

T('統合: ひとり親(扶養0)は 扶養親族等の数=1 として甲欄税が下がる', function () {
  var A = 300000; // 社保控除後の給与
  var add = PC.honninJintekiCount({ kafuHitorioya: 'hitorioya' });
  eq(add, 1);
  var taxBase = Densan.calc(A, 0, { year: 2026 });      // 扶養0・加算なし
  var taxWith = Densan.calc(A, 0 + add, { year: 2026 }); // ひとり親で実質+1
  ok(taxWith < taxBase, 'ひとり親で甲欄税が下がる(' + taxBase + '→' + taxWith + ')');
});

T('統合: 3加算は 扶養3人ぶんと同じ税額(数え方が等価)', function () {
  var A = 400000;
  var addAll = PC.honninJintekiCount({ shogai: true, kafuHitorioya: 'kafu', kinrou: true });
  eq(addAll, 3);
  eq(Densan.calc(A, 0 + addAll, { year: 2026 }), Densan.calc(A, 3, { year: 2026 }));
});
