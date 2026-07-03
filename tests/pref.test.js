/* pref.test.js — 都道府県別 健康保険料率が正しく適用されるか（協会けんぽ折半・府県別） */
'use strict';
var PayslipCalc = require('../lib/calc.js');
var SH = require('../lib/shakaihoken-hyo.js');

/* データ整合 */
T('KENKO_RITSU: 47都道府県すべて存在', function () {
  eq(Object.keys(SH.KENKO_RITSU).length, 47);
});
T('各府県: name/total/jugyoin を持ち、従業員負担=全体÷2（折半）', function () {
  Object.keys(SH.KENKO_RITSU).forEach(function (k) {
    var p = SH.KENKO_RITSU[k];
    ok(p.name && typeof p.total === 'number' && typeof p.jugyoin === 'number', k + ' フィールド欠落');
    ok(Math.abs(p.jugyoin - p.total / 2) < 1e-6, k + ' 折半でない (' + p.jugyoin + ' vs ' + p.total / 2 + ')');
    ok(p.total > 0.09 && p.total < 0.11, k + ' 全体料率が異常: ' + p.total);
  });
});

/* app.js prefRate と同じ参照（bare）で府県別に取れる */
T('府県別に料率が異なる: 大阪 > 東京（同一標準報酬で健保が変わる）', function () {
  ok(SH.KENKO_RITSU.osaka.jugyoin > SH.KENKO_RITSU.tokyo.jugyoin, '大阪>東京');
});

/* 計算適用：標準報酬を固定し、府県の料率で健保が変わることを実額で確認 */
function healthOf(prefCode) {
  var r = PayslipCalc.computePayslip({
    shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1990-01-01', payYm: '2026-06',
    fuyou: 0, healthRate: SH.KENKO_RITSU[prefCode].jugyoin, hyojunBase: 300000
  });
  return r.si.health;
}
T('東京: 標準報酬300,000 × 0.04955 = 14,865', function () {
  eq(SH.KENKO_RITSU.tokyo.jugyoin, 0.04955);
  eq(healthOf('tokyo'), SH.han50(300000 * SH.KENKO_RITSU.tokyo.jugyoin));
  eq(healthOf('tokyo'), 14865);
});
T('大阪: 標準報酬300,000 × 大阪料率 = 表どおり・東京と異なる', function () {
  eq(healthOf('osaka'), SH.han50(300000 * SH.KENKO_RITSU.osaka.jugyoin));
  ok(healthOf('osaka') > healthOf('tokyo'), '大阪の健保 > 東京');
});
T('全47府県: 健保=han50(標準報酬×その府県のjugyoin) と一致', function () {
  Object.keys(SH.KENKO_RITSU).forEach(function (k) {
    eq(healthOf(k), SH.han50(300000 * SH.KENKO_RITSU[k].jugyoin), k + ' で計算不一致');
  });
});

/* 標準報酬月額 上限/下限の公式値ロック(厚年32等級=88,000〜650,000 / 健保50等級=〜1,390,000) */
T('標準報酬 上限/下限(厚年650,000・健保1,390,000・最低88,000)', function () {
  eq(SH.getHyojunPension(700000), 650000); // 厚年 上限32等級
  eq(SH.getHyojunPension(650000), 650000);
  eq(SH.getHyojunPension(50000), 88000);   // 厚年 下限1等級
  eq(SH.getHyojunHealth(1500000), 1390000); // 健保 上限50等級
  eq(SH.getHyojunHealth(1400000), 1390000);
});

/* 不正コードはフォールバックで落ちない（東京等の既定） */
T('未知の府県コードでも例外なく数値（フォールバック）', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, hyojunBase: 300000 });
  eq(typeof r.si.health, 'number'); ok(r.si.health > 0);
});
