/* juminzei.test.js — 住民税 特別徴収の月割・退職時徴収(地方税法20条の4の2/321条の5) */
'use strict';
var J = require('../lib/juminzei.js');

/* ── 12分割の端数(20条の4の2 第6項+第8項=100円読替) ── */
T('12分割: 年10万→base8300・6月8700(端数合算)・他8300', function () {
  eq(J.juminMonthly(100000, 6), 8700); // 6月=100000-8300*11
  eq(J.juminMonthly(100000, 7), 8300);
  eq(J.juminMonthly(100000, 5), 8300); // 翌5月
  eq(J.juminMonthly(100000, 12), 8300);
  // 検算: 8700 + 8300*11 = 100000
  eq(8700 + 8300 * 11, 100000);
});
T('12分割: 年182,500→各15,200・6月15,300(税理士例と一致)', function () {
  eq(J.juminMonthly(182500, 7), 15200); // floor(182500/12/100)*100=15200
  eq(J.juminMonthly(182500, 6), 15300); // 182500-15200*11=15300
});
T('12分割: 年税額0/空→0', function () { eq(J.juminMonthly(0, 6), 0); eq(J.juminMonthly('', 7), 0); });

/* ── 徴収順(6月起算) ── */
T('collectionIndex: 6→0,7→1,12→6,1→7,5→11', function () {
  eq(J.collectionIndex(6), 0); eq(J.collectionIndex(7), 1); eq(J.collectionIndex(12), 6);
  eq(J.collectionIndex(1), 7); eq(J.collectionIndex(5), 11);
});

/* ── 残額(fromMonth〜翌5月) ── */
T('juminRemaining: 年10万 1月から→41,500(1-5月=5×8300)', function () {
  eq(J.juminRemaining(100000, 1), 41500);
});
T('juminRemaining: 年10万 9月から→74,700(9-5月=9×8300)', function () {
  eq(J.juminRemaining(100000, 9), 74700);
});
T('juminRemaining: 年10万 6月から→全額100,000', function () {
  eq(J.juminRemaining(100000, 6), 100000);
});

/* ── juminForMonth: 退職なし=通常月割 ── */
T('退職なし: 2026-06→8700 / 2026-07→8300', function () {
  eq(J.juminForMonth({ annualTax: 100000, ym: '2026-06', retireYmd: '' }), 8700);
  eq(J.juminForMonth({ annualTax: 100000, ym: '2026-07', retireYmd: '' }), 8300);
});

/* ── 退職: 1〜4月退職=残額一括(義務・321条の5第2項) ── */
T('1月退職: 退職月2027-01→残額一括41,500 / 前月2026-12は通常8300 / 翌2027-02は0', function () {
  eq(J.juminForMonth({ annualTax: 100000, ym: '2027-01', retireYmd: '2027-01-20' }), 41500);
  eq(J.juminForMonth({ annualTax: 100000, ym: '2026-12', retireYmd: '2027-01-20' }), 8300);
  eq(J.juminForMonth({ annualTax: 100000, ym: '2027-02', retireYmd: '2027-01-20' }), 0);
});
T('3月退職: 2027-03→残額一括(3-5月=3×8300=24,900)', function () {
  eq(J.juminForMonth({ annualTax: 100000, ym: '2027-03', retireYmd: '2027-03-31' }), 24900);
});

/* ── 退職: 5月退職=当月分のみ ── */
T('5月退職: 2027-05→当月8300のみ', function () {
  eq(J.juminForMonth({ annualTax: 100000, ym: '2027-05', retireYmd: '2027-05-15' }), 8300);
});

/* ── 退職: 6〜12月退職=原則普通徴収(退職月分のみ)・申出で一括 ── */
T('9月退職 ikkatsu無: 退職月2026-09→当月8300のみ / 10月以降0', function () {
  eq(J.juminForMonth({ annualTax: 100000, ym: '2026-09', retireYmd: '2026-09-30', ikkatsu: false }), 8300);
  eq(J.juminForMonth({ annualTax: 100000, ym: '2026-10', retireYmd: '2026-09-30', ikkatsu: false }), 0);
});
T('9月退職 ikkatsu有: 退職月2026-09→残額一括74,700', function () {
  eq(J.juminForMonth({ annualTax: 100000, ym: '2026-09', retireYmd: '2026-09-30', ikkatsu: true }), 74700);
});

/* ── 年税額0や未指定 ── */
T('年税額0→0(全月)', function () {
  eq(J.juminForMonth({ annualTax: 0, ym: '2026-06', retireYmd: '' }), 0);
});
