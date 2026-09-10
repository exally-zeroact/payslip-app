/* shirase-iro.test.js — ★知らせの 箱を 濃い色で 塗らない★（2026-09-10）
 *
 *  ★司さん（2026-09-10）★
 *    「全アプリで こんな 濃い色 使うなって 言うてなかったか？」
 *    「色が 濃いすぎるし ★背景ボックスの 使い方★が 悪くないか？」
 *    直した 形を 見て →「★絶対 これが ええ★」
 *    ⇒「Exally や 他の アプリで ★前みたいな 重たい感じに なってる所★ あったら ★先に 直せ★」
 *
 *  ★何を 守るか★
 *    ★お客さんの 画面に かぶせる 知らせは ★白地★★（濃い色は ★左の 帯★だけ）
 *    ⇒★色を 禁じて いません＝★大きく 塗る のを 禁じて います★★
 *
 *  ★実測（Exally の 同じ 箱で 絵を 撮って 点を 数えた）★
 *    箱の 中の 暗い 点 … 88% → ★6%★（★14.8分の1★）
 *    手本＝exally `book.html` の `#toast`（PR #64）
 *
 *  ★★見て いない 範囲（★書かない 見張りは「全部 守った」と 読まれる★）★★
 *    ・★ボタン・選ばれている タブは 見て いません★（小さい／実Excel も 塗る）
 *    ・★この repo に 知らせが 在る ファイルは admin.html だけ★（★数えて 書いた★）
 *    ・★禁止色 #1A4A2E は 別の 見張り★（ここは ★塗る 広さ★ の 話）
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

/* ★この repo で 知らせの 規則を 持つ ファイル（★数えて 書いた★・写しで ない）★ */
var 見る = ['admin.html'];

function 明るさ(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

/* ★色は ★文字で 探さず 値に 直す★★（2026-08-10 の 決まり） */
function 色に直す(v) {
  var h = /#([0-9a-fA-F]{6})\b/.exec(v);
  if (h) {
    var x = h[1];
    return { c: [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)], a: 1 };
  }
  var r = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(v);
  if (r) return { c: [+r[1], +r[2], +r[3]], a: r[4] === undefined ? 1 : parseFloat(r[4]) };
  return null;
}

function 知らせの規則(文) {
  var 出 = [], re = /(^|[\s}])((?:#toast|\.toast)[^{}]{0,60})\{([^{}]{0,900})\}/g, m;
  while ((m = re.exec(文)) !== null) {
    出.push({ 名: m[2].trim(), 中: m[3], 位置: 文.slice(0, m.index).split(String.fromCharCode(10)).length });
  }
  return 出;
}

var 全 = 見る.map(function (f) {
  var p = path.join(ROOT, f);
  if (!fs.existsSync(p)) throw new Error('★見る はずの ' + f + ' が 無い★');
  return { 名: f, 字: fs.readFileSync(p, 'utf-8') };
});

T('★知らせの 箱を 見つけて いる（★空振りして いない★）★', function () {
  var n = 全.reduce(function (s, f) { return s + 知らせの規則(f.字).length; }, 0);
  ok(n >= 1, '★知らせの 規則が ' + n + '本しか 見つからない★');
});

T('★★知らせの 箱を 濃い色で 塗って いない（★これが 本体★）★★', function () {
  var 悪い = [];
  全.forEach(function (f) {
    知らせの規則(f.字).forEach(function (r) {
      var n = /background(?:-color)?\s*:\s*([^;}]+)/.exec(r.中);
      if (!n) return;
      var v = 色に直す(n[1]);
      if (!v || v.a < 0.5) return;
      var 明 = 明るさ(v.c[0], v.c[1], v.c[2]);
      if (明 < 170) 悪い.push(f.名 + ':' + r.位置 + ' ' + r.名 + ' → ' + n[1].trim() + '（明るさ ' + 明.toFixed(1) + '）');
    });
  });
  ok(悪い.length === 0, '★' + 悪い.length + 'か所が 濃い色で 塗って いる★ ' + 悪い.join(' / ')
    + ' ⇒★白地に して 濃い色は 左の 帯だけに★');
});

T('★★塗りを 持つ 知らせは 左の 帯も 持つ（★色を 消した わけでは ない★）★★', function () {
  /* ★★数を 書き込みません★★＝「帯が◯か所」では なく ★塗りと 帯が 対★かを 見る
     （2026-09-10 に Exally の 数 2 を 焼き込んで 給与で 誤って 赤に した） */
  var 悪い = [], 帯 = 0;
  全.forEach(function (f) {
    知らせの規則(f.字).forEach(function (r) {
      if (!/background(?:-color)?\s*:/.test(r.中)) return;
      var b = /border-left\s*:\s*(\d+)px\s+solid\s+([^;}]+)/.exec(r.中);
      if (!b) { 悪い.push(f.名 + ':' + r.位置 + ' ★帯が 無い★'); return; }
      if (+b[1] > 8) { 悪い.push(f.名 + ':' + r.位置 + ' ★帯が 太すぎる（' + b[1] + 'px）★'); return; }
      if (!色に直す(b[2])) { 悪い.push(f.名 + ':' + r.位置 + ' 帯の 色が 読めない'); return; }
      帯++;
    });
  });
  ok(悪い.length === 0, 悪い.join(' / '));
  ok(帯 >= 1, '★帯が 1つも 無い★＝★色が 消えて しまって いる★');
});

T('★白地に 薄い 字を 置いて いない（★読めなく なって いない★）★', function () {
  var 悪い = [];
  全.forEach(function (f) {
    知らせの規則(f.字).forEach(function (r) {
      var n = /background(?:-color)?\s*:\s*([^;}]+)/.exec(r.中);
      var c = /(?:^|[;\s])color\s*:\s*([^;}]+)/.exec(r.中);
      if (!n || !c) return;
      var bv = 色に直す(n[1]), cv = 色に直す(c[1]);
      if (!bv || !cv) return;
      if (明るさ(bv.c[0], bv.c[1], bv.c[2]) > 200 && 明るさ(cv.c[0], cv.c[1], cv.c[2]) > 200) {
        悪い.push(f.名 + ':' + r.位置 + ' ' + r.名);
      }
    });
  });
  ok(悪い.length === 0, '★白地に 薄い 字が ' + 悪い.length + 'か所★ ' + 悪い.join(' / '));
});

/* ══ ★自己試験（★壊すのは 写し★＝ファイルは 1バイトも 触らない）★ ══ */
function 判じ(字) {
  var 見つけた = false;
  知らせの規則(字).forEach(function (r) {
    var n = /background(?:-color)?\s*:\s*([^;}]+)/.exec(r.中);
    if (!n) return;
    var v = 色に直す(n[1]);
    if (v && v.a >= 0.5 && 明るさ(v.c[0], v.c[1], v.c[2]) < 170) 見つけた = true;
  });
  return 見つけた;
}

T('★★前の 塗り（#2E7D54）に 戻すと 赤に なる★★', function () {
  var 写し = 全[0].字.replace('background:#fff;color:#333333;', 'background:#2E7D54;color:#fff;');
  ok(写し !== 全[0].字, '★写しを 壊せて いない★＝★この 自己試験は 何も 見て いない★');
  ok(判じ(写し), '★前の 塗りに 戻しても 赤に ならない★');
});

T('★★薄い 覆い（alpha 0.4）は 赤に しない（★狼少年に しない★）★★', function () {
  ok(!判じ('.toast{position:fixed;background:rgba(0,0,0,0.4);color:#fff;}'), '★薄い 覆いまで 赤に して いる★');
});

T('★★色を 文字で 探して いない（値に 直して いる）★★', function () {
  ['#2E7D54', 'rgb(46,125,84)', 'rgba(46, 125, 84, 0.94)', '#2e7d54'].forEach(function (書き方) {
    ok(判じ('.toast{position:fixed;background:' + 書き方 + ';color:#fff;}'), '★' + 書き方 + ' を 見落とした★');
  });
});
