/* 簡易テストランナー（依存なし・node tests/run.js） */
'use strict';
var assert = require('assert');
var pass = 0, fail = 0;
global.T = function (name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); } };
global.eq = function (a, b, m) { assert.strictEqual(a, b, m); };
global.ok = function (c, m) { assert.ok(c, m); };

['./calc.test.js', './warimashi.test.js', './pref.test.js', './shaho-year.test.js', './shoyo-zei.test.js', './zaiseki.test.js', './shotokuzei-hei.test.js', './juminzei.test.js', './holidays.test.js', './saitei-chingin.test.js', './chingin-daicho.test.js', './xlsx.test.js', './payroll-calc.test.js', './leave-partial.test.js', './koyo-hoken.test.js', './nenmatsu.test.js'].forEach(function (f) {
  console.log('\n' + f);
  require(f);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
