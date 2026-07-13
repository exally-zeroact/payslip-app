/* A11y静的検査(依存なし) — アイコンのみボタンには必ず aria-label を要求する。
 * 目的: スクリーンリーダーで「×」「＋」「▲」等が意味のある名前で読み上げられるようにする。
 *  title だけでは読み上げが環境依存で不確実 → aria-label を正とする(見た目は不変)。
 *  将来 aria-label 無しのアイコンボタンを足したらこのテストが赤くなる(回帰ガード)。*/
'use strict';
var fs = require('fs');
var path = require('path');

var ICON = '×✕✖▲▼△▽↑↓＋➕🗑⚙‹›«»＜＞';
function isIconOnly(txt) {
  var t = (txt || '').trim();
  if (!t) return false;
  for (var i = 0; i < t.length; i++) {
    // サロゲートペア(絵文字)を1文字として飛ばす
    var code = t.codePointAt(i);
    var ch = String.fromCodePoint(code);
    if (code > 0xffff) i++;
    if (ICON.indexOf(ch) < 0) return false;
  }
  return true;
}

// js/app.js の <button ...>text</button> を走査(textに < を含まない=リテラル終端のもののみ)
var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
var re = /<button([^>]*)>([^<]*)<\/button>/g;
var m, offenders = [];
while ((m = re.exec(src))) {
  var attrs = m[1], text = m[2];
  if (isIconOnly(text) && !/\baria-label\s*=/.test(attrs)) {
    var line = src.slice(0, m.index).split('\n').length;
    offenders.push('L' + line + ' [' + text.trim() + ']');
  }
}

T('A11y: js/app.js のアイコンのみボタンは全て aria-label を持つ', function () {
  ok(offenders.length === 0, 'aria-label欠落のアイコンボタン: ' + offenders.join(', '));
});
