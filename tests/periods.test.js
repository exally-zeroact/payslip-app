/* periods.test.js — K2 期間分割(締め方)の純関数をロック。月末日/うるう年/グルーピングの実数検証。 */
'use strict';
var P = require('../lib/periods.js');

T('月1(monthly)=分割なし・1期間(1〜末)', function () {
  var ps = P.buildPeriods('2026-06', 'monthly');
  eq(ps.length, 1, '1期間');
  eq(ps[0].from, '2026-06-01'); eq(ps[0].to, '2026-06-30'); eq(ps[0].label, '1〜末'); eq(ps[0].days, 30);
});

T('10日締め=1〜10/11〜20/21〜末の3期間(6月=末30)', function () {
  var ps = P.buildPeriods('2026-06', 'ten');
  eq(ps.length, 3, '3期間');
  eq(ps.map(function (p) { return p.key; }).join(','), 'P1,P2,P3');
  eq(ps[0].from + '..' + ps[0].to, '2026-06-01..2026-06-10'); eq(ps[0].days, 10);
  eq(ps[1].from + '..' + ps[1].to, '2026-06-11..2026-06-20'); eq(ps[1].days, 10);
  eq(ps[2].from + '..' + ps[2].to, '2026-06-21..2026-06-30'); eq(ps[2].days, 10);
  eq(ps[2].label, '21〜末', '末表記');
});

T('半月(half)=1〜15/16〜末', function () {
  var ps = P.buildPeriods('2026-06', 'half');
  eq(ps.length, 2); eq(ps[0].to, '2026-06-15'); eq(ps[1].from, '2026-06-16'); eq(ps[1].to, '2026-06-30');
  eq(ps[0].label, '1〜15'); eq(ps[1].label, '16〜末');
});

T('月末日=うるう年/月長を正確に(2月)', function () {
  eq(P.buildPeriods('2026-02', 'ten')[2].to, '2026-02-28', '2026年2月=28日');
  eq(P.buildPeriods('2028-02', 'ten')[2].to, '2028-02-29', 'うるう年2月=29日');
  eq(P.buildPeriods('2026-02', 'ten')[2].days, 8, '21〜28=8日');
  eq(P.lastDayOf(2026, 2), 28); eq(P.lastDayOf(2028, 2), 29); eq(P.lastDayOf(2026, 4), 30); eq(P.lastDayOf(2026, 1), 31);
});

T('月末境界: 31日月(7月)は21〜31・30日月(4月)は21〜30・2月は21〜28', function () {
  eq(P.buildPeriods('2026-07', 'ten')[2].to, '2026-07-31', '7月末=31'); eq(P.buildPeriods('2026-07', 'ten')[2].days, 11, '21〜31=11日');
  eq(P.buildPeriods('2026-04', 'ten')[2].to, '2026-04-30', '4月末=30'); eq(P.buildPeriods('2026-04', 'ten')[2].days, 10, '21〜30=10日');
  eq(P.buildPeriods('2026-02', 'half')[1].to, '2026-02-28', '2月半月後半=末28');
});

T('任意N日(ndays)=N日ずつ・端数は末日まで', function () {
  var ps = P.buildPeriods('2026-06', 'ndays', 7); // 7日締め・6月30日
  eq(ps.map(function (p) { return p.from + '..' + p.to; }).join(' '),
    '2026-06-01..2026-06-07 2026-06-08..2026-06-14 2026-06-15..2026-06-21 2026-06-22..2026-06-28 2026-06-29..2026-06-30');
  eq(ps.length, 5, '5期間(端数2日含む)');
  eq(ps[4].days, 2, '最終期間=29,30の2日');
  eq(P.buildPeriods('2026-06', 'ndays', 0).length, 3, 'n=0/無効は既定10日締めにフォールバック(=3期間)'); // 防御: 不正Nは既定10
  eq(P.buildPeriods('2026-06', 'ndays', 1).length, 30, 'n=1は毎日締め(=30期間)');
});

T('hasSplit: monthlyは分割なし・他は分割あり', function () {
  ok(!P.hasSplit('monthly'), 'monthly=分割なし');
  ok(P.hasSplit('half') && P.hasSplit('ten') && P.hasSplit('ndays'), '他=分割');
});

T('entriesInPeriod: 日別を期間に振り分け(範囲内のみ)', function () {
  var ps = P.buildPeriods('2026-06', 'ten');
  var entries = [
    { ymd: '2026-06-05', amount: '10000' }, { ymd: '2026-06-10', amount: '8000' }, // P1
    { ymd: '2026-06-11', amount: '9000' }, // P2
    { ymd: '2026-06-30', amount: '7000' }, // P3
    { ymd: '2026-07-01', amount: '5000' }, // 範囲外(翌月)
    { ymd: '', amount: '1000' } // 日付なし=除外
  ];
  eq(P.entriesInPeriod(entries, ps[0]).length, 2, 'P1=5日と10日');
  eq(P.entriesInPeriod(entries, ps[1]).length, 1, 'P2=11日');
  eq(P.entriesInPeriod(entries, ps[2]).length, 1, 'P3=30日(翌月/空は除外)');
});

T('periodKeyOf: 日付→期間キー', function () {
  eq(P.periodKeyOf('2026-06-05', '2026-06', 'ten'), 'P1');
  eq(P.periodKeyOf('2026-06-15', '2026-06', 'ten'), 'P2');
  eq(P.periodKeyOf('2026-06-25', '2026-06', 'ten'), 'P3');
  eq(P.periodKeyOf('2026-07-01', '2026-06', 'ten'), null, '範囲外=null');
  eq(P.periodKeyOf('2026-06-05', '2026-06', 'monthly'), 'P1', '月1は全部P1');
});
