/* shotokuzei-nichi.test.js — 所得税 日額表 甲欄/乙欄(継続雇用の日払い/週払い)の公式値ロック
 * 出典: 国税庁 給与所得の源泉徴収税額表(令和8年分) 日額表 08-14.xls を機械抽出した実値(2026-07照合)
 * 甲=扶養0〜7人の実リテラルでロック(自己参照でなく公式表の実値)。乙も実値。 */
'use strict';
var N = require('../lib/shotokuzei-nichi.js');

function kou(amt, deps) { return N.nichiTax(amt, { taxClass: 'ko', deps: deps || 0 }); }
function otsu(amt) { return N.nichiTax(amt, { taxClass: 'otsu' }); }

/* ── 甲欄 表引き 実値ロック(扶養0〜7人) ── */
T('甲: 3,500円未満は全員0', function () {
  [0, 1, 3, 5, 7].forEach(function (d) { eq(kou(0, d), 0); eq(kou(3499, d), 0); });
});
T('甲 3,500: [5,0,0,0,0,0,0,0]', function () {
  var exp = [5, 0, 0, 0, 0, 0, 0, 0];
  for (var d = 0; d < 8; d++) eq(kou(3500, d), exp[d], 'deps=' + d);
  for (var d2 = 0; d2 < 8; d2++) eq(kou(3599, d2), exp[d2], 'band内 deps=' + d2); // 同一バンド
});
T('甲 3,600: [10,0,...] / 4,500: [55,5,0,...]', function () {
  eq(kou(3600, 0), 10); eq(kou(3600, 1), 0);
  eq(kou(4500, 0), 55); eq(kou(4500, 1), 5); eq(kou(4500, 2), 0);
});
T('甲 10,000: [265,210,160,100,50,0,0,0]', function () {
  var exp = [265, 210, 160, 100, 50, 0, 0, 0];
  for (var d = 0; d < 8; d++) eq(kou(10000, d), exp[d], 'deps=' + d);
});
T('甲 20,000: [1515,1300,1085,870,660,550,445,330]', function () {
  var exp = [1515, 1300, 1085, 870, 660, 550, 445, 330];
  for (var d = 0; d < 8; d++) eq(kou(20000, d), exp[d], 'deps=' + d);
});
T('甲 23,900(表の最終段): [2240,2025,1810,1590,1380,1165,950,730]', function () {
  var exp = [2240, 2025, 1810, 1590, 1380, 1165, 950, 730];
  for (var d = 0; d < 8; d++) { eq(kou(23900, d), exp[d]); eq(kou(23999, d), exp[d]); }
});

/* ── 扶養7人超=7人の税額から1人ごと50円控除・0未満は0 ── */
T('甲 扶養7人超: 20,000で 8人=280 / 9人=230, 3,500の8人は0止まり', function () {
  eq(kou(20000, 8), 280); // 330-50
  eq(kou(20000, 9), 230); // 330-100
  eq(kou(3500, 8), 0);    // 0-50→0
  eq(kou(3500, 20), 0);
});

/* ── 甲 24,000円超=段階算式(24000/26500/32500/57500で区切り) ── */
T('甲 24,000ちょうど=境界の基準額 [2250,...740]', function () {
  var exp = [2250, 2035, 1820, 1600, 1390, 1175, 960, 740];
  for (var d = 0; d < 8; d++) eq(kou(24000, d), exp[d], 'deps=' + d);
});
T('甲 25,000(seg1 20.42%) deps0=2454', function () {
  eq(kou(25000, 0), 2454); // 2250 + floor(1000*0.2042)
});
T('甲 27,000(seg2 26,500基準 23.483%) deps0=2877', function () {
  eq(kou(27000, 0), 2877); // 2760 + floor(500*0.23483)
});
T('甲 40,000(seg3 32,500基準 33.693%) deps0=6696', function () {
  eq(kou(40000, 0), 6696); // 4170 + floor(7500*0.33693)
});
T('甲 60,000(seg4 57,500基準 40.84%) deps0=13616', function () {
  eq(kou(60000, 0), 13616); // 12595 + floor(2500*0.4084)
});
T('甲 段階境界: 26,500ちょうど=2760 / 32,500ちょうど=4170 / 57,500ちょうど=12595(deps0)', function () {
  eq(kou(26500, 0), 2760); eq(kou(32500, 0), 4170); eq(kou(57500, 0), 12595);
});

/* ── 乙欄 ── */
T('乙: 3,500円未満=金額×3.063%(円未満切捨)', function () {
  eq(otsu(3000), 91);   // floor(3000*0.03063)=91
  eq(otsu(3499), 107);  // floor(3499*0.03063)=107
  eq(otsu(0), 0);
});
T('乙 表引き: 3,500=120 / 3,600=130 / 10,000=1800 / 20,000=6530 / 23,900=8250', function () {
  eq(otsu(3500), 120); eq(otsu(3599), 120);
  eq(otsu(3600), 130);
  eq(otsu(10000), 1800);
  eq(otsu(20000), 6530);
  eq(otsu(23900), 8250); eq(otsu(23999), 8250);
});
T('乙 24,000超: 24,000=8300 / 25,000=8708 / 57,500ちょうど=21980 / 60,000=23128', function () {
  eq(otsu(24000), 8300);
  eq(otsu(25000), 8708);  // 8300 + floor(1000*0.4084)
  eq(otsu(57500), 21980); // 境界=次帯の起点(公式行295)
  eq(otsu(60000), 23128); // 21980 + floor(2500*0.45945)
});

/* ── 表構造の健全性 ── */
T('日額表: 205段・start3500/step100・甲は各段8列・乙205', function () {
  var T8 = N.TABLE_R8;
  eq(T8.start, 3500); eq(T8.step, 100);
  eq(T8.ko.length, 205); eq(T8.otsu.length, 205);
  ok(T8.ko.every(function (row) { return row.length === 8; }), '甲は8列');
});
T('nichiTax: taxClass別名(甲/乙)も受ける', function () {
  eq(N.nichiTax(10000, { taxClass: '甲', deps: 0 }), 265);
  eq(N.nichiTax(10000, { taxClass: '乙' }), 1800);
});
T('hydrate: 中央データ(seed形状)で年分上書き→正値・不正は拒否', function () {
  var t = N.TABLE_R8;
  var data = { start: t.start, step: t.step, ko: t.ko, otsu: t.otsu, koOver: t.koOver, otsuLowRate: t.otsuLowRate, otsuOver: t.otsuOver };
  eq(N.hydrate(2099, data), true);
  eq(N.nichiTax(10000, { taxClass: 'ko', deps: 0, year: 2099 }), 265); // 上書き年分でも表引き成立
  eq(N.nichiTax(20000, { taxClass: 'otsu', year: 2099 }), 6530);
  eq(N.hydrate(2098, { start: 0 }), false);          // start不正
  eq(N.hydrate(2098, { start: 3500, step: 100, ko: [[1, 2]], otsu: [1] }), false); // 甲が8列でない
});
