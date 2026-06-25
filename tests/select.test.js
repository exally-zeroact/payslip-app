/* select.test.js — テンプレ自動選択の検証 */
'use strict';
var Sel = require('../lib/select.js');
function mkp(n, m) { return { shikyu: new Array(n).fill(0), kojo: new Array(m).fill(0) }; }

T('1人・少項目 → cols(横並び)・収まる', function () {
  var r = Sel.choose([mkp(5, 5)], 'auto');
  eq(r.builder, 'cols'); eq(r.fits, true);
});

T('1人・超多項目(支給100) → cols だが収まらない(警告)', function () {
  var r = Sel.choose([mkp(100, 10)], 'auto');
  eq(r.builder, 'cols'); eq(r.fits, false);
});

T('1人・支給40/控除40 → cols・収まる(業界最大)', function () {
  var r = Sel.choose([mkp(40, 40)], 'auto');
  eq(r.builder, 'cols'); eq(r.fits, true);
});

T('2人・少項目(各 支給10/控除8) → cols(A4縦)・収まる', function () {
  var r = Sel.choose([mkp(10, 8), mkp(10, 8)], 'auto');
  eq(r.builder, 'cols'); eq(r.fits, true);
});

T('2人・多項目(各 支給30/控除30) → cols不可→strips、strips も超過で fits=false', function () {
  var r = Sel.choose([mkp(30, 30), mkp(30, 30)], 'auto');
  eq(r.builder, 'strips'); eq(r.fits, false);
});

T('3人 → strips、各人 支給8/控除8 は収まる', function () {
  var r = Sel.choose([mkp(8, 8), mkp(8, 8), mkp(8, 8)], 'auto');
  eq(r.builder, 'strips'); eq(r.fits, true);
});

T('4人 → strips、各人 支給14/控除12 は収まる(段=7+6=13≤17)', function () {
  var r = Sel.choose([mkp(14, 12), mkp(14, 12), mkp(14, 12), mkp(14, 12)], 'auto');
  eq(r.builder, 'strips'); eq(r.fits, true);
});

T('4人・各 支給20/控除20 は strips 超過(10+10=20>17) fits=false', function () {
  var r = Sel.choose([mkp(20, 20), mkp(20, 20), mkp(20, 20), mkp(20, 20)], 'auto');
  eq(r.builder, 'strips'); eq(r.fits, false);
});

T('prefer=vstack(1人) → vstack', function () {
  var r = Sel.choose([mkp(10, 8)], 'vstack');
  eq(r.builder, 'vstack'); eq(r.fits, true);
});

T('prefer=strips(1人) → strips を許容', function () {
  var r = Sel.choose([mkp(8, 8)], 'strips');
  eq(r.builder, 'strips');
});

T('vstack 1人 上限: 支給20/控除16(段10+8=18) 収まる / 支給22/控除18(11+9=20) 超過', function () {
  eq(Sel.capacity('vstack', [mkp(20, 16)]), true);
  eq(Sel.capacity('vstack', [mkp(22, 18)]), false);
});
