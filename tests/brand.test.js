/* brand.test.js — Kyuallyブランドの後戻り防止(旧「ZEROACT」表記の再発検知)。
 * 認証オーバーレイ(auth.js)はSupabase依存でUIスモーク対象外なので、ソース検査でロックする。 */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }

T('ブランド: auth.js のログインロゴが Kyually(旧ZEROACT表記なし)', function () {
  var src = read('js/auth.js');
  ok(/auth-logo">Kyually</.test(src), 'ログインロゴが Kyually');
  ok(!/ZEROACT/.test(src), 'auth.js に旧「ZEROACT」表記が残っていない');
});

T('ブランド: appbar とログインで Kyually 表記が一致', function () {
  ok(/class="logo">Kyually</.test(read('index.html')), 'appbar が Kyually');
});

T('ヘルプ: すべての data-help="X" に HELP[X] 定義がある(死んだ💡が無い)', function () {
  var app = read('js/app.js'), idx = read('index.html');
  var keys = {};
  (app.match(/([a-zA-Z]+):\{ ?t:'💡/g) || []).forEach(function (m) { keys[m.replace(/:\{.*/, '')] = 1; });
  var refs = [];
  (app + idx).replace(/data-help="([a-zA-Z]+)"/g, function (_, k) { refs.push(k); return _; });
  var missing = refs.filter(function (k, i) { return refs.indexOf(k) === i && !keys[k]; });
  ok(missing.length === 0, 'HELP未定義の💡: ' + missing.join(', '));
});
