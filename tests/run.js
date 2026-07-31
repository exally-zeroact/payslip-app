/* 簡易テストランナー（依存なし・node tests/run.js） */
'use strict';
var assert = require('assert');
var pass = 0, fail = 0;
global.T = function (name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); } };
global.eq = function (a, b, m) { assert.strictEqual(a, b, m); };
global.ok = function (c, m) { assert.ok(c, m); };

['./calc.test.js', './warimashi.test.js', './pref.test.js', './shaho-year.test.js', './shoyo-zei.test.js', './zaiseki.test.js', './shotokuzei-hei.test.js', './shotokuzei-nichi.test.js', './shotokuzei-densan.test.js', './zengin.test.js', './kintai-csv.test.js', './migrate-map.test.js', './juminzei.test.js', './holidays.test.js', './saitei-chingin.test.js', './chingin-daicho.test.js', './xlsx.test.js', './payroll-calc.test.js', './leave-partial.test.js', './koyo-hoken.test.js', './nenmatsu.test.js', './nencho-declaration.test.js', './pay-rule.test.js', './pay-parse.test.js', './daily-pay.test.js', './a11y-source.test.js', './warn-consistency.test.js', './access.test.js', './taishoku-shotoku.test.js', './zuiji.test.js', './brand.test.js', './jinteki.test.js', './taxable-total.test.js', './statutory-rows.test.js', './employment-type.test.js', './periods.test.js', './shiharai-chosho.test.js', './ledger-agg.test.js', './shaho-kanyu.test.js', './op-contract.test.js'].forEach(function (f) {
  console.log('\n' + f);
  require(f);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
