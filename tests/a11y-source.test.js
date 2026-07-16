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

// ---- コントラスト回帰ガード(WCAG AA) ----
// 白背景の本文セカンダリ色でAA(4.5:1)割れの既知色が再発したら赤くする。
// 装飾(SVGカレット %23..)・意図的にdimした状態色(除外月入力 #9cbbab / 無効チップ #9fb3aa)は対象外。
function lum(hex) {
  var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  function f(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  r = f(r); g = f(g); b = f(b); return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratioOnWhite(hex) { var l = lum(hex); return (1.05) / (l + 0.05); }
var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
// 過去にAA割れしていた本文色(社労士UX指摘 #7AA08C 等)。color: 宣言に再登場したら失格。
var BANNED = ['#7AA08C', '#7A8B83', '#8fa89a', '#9bb5a8'];
T('A11y: 既知のAA割れ本文色が color: 宣言に再発していない', function () {
  var bad = BANNED.filter(function (c) { return new RegExp('color:\\s*' + c + '\\b', 'i').test(css); });
  ok(bad.length === 0, 'AA割れ色が復活: ' + bad.join(', ') + '（#527A66 等 4.5:1以上へ）');
});
T('A11y: 置換後の #527A66 は白背景でAA(4.5:1)を満たす', function () {
  ok(ratioOnWhite('#527A66') >= 4.5, '#527A66 の比=' + ratioOnWhite('#527A66').toFixed(2));
});
