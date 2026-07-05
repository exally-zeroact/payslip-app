/* leave-partial.test.js — 産休/育休が月途中の月の給与(就労分)計算チェーンの通しテスト。
 * 実務標準(出典 jinjer/freee): 就労日数分は日割で支払い・社保は月末基準で免除・所得税/雇用保険は支給分に発生。
 * 実装は既存の欠勤控除エンジン(calcKekkin・会社method準拠)に「産休の不就労所定日数」を流す(freee公式運用と同型)。
 * app.jsの配線(syncBasePay→compute)はDOM依存で実機検証。本テストは lib合成でチェーン(日数→控除→明細)をロック。
 */
'use strict';
var H = require('../lib/holidays.js');
var PC = require('../lib/payroll-calc.js');
var Calc = require('../lib/calc.js');

function kojoOf(r, label) { var x = (r.kojo || []).filter(function (k) { return k.label === label; })[0]; return x ? x.value : null; }

/* 例: 月給30万・2026-06(所定22日・土日休)・6/15〜6/30産休(不就労所定12日=就労10日)・所定method */
T('産休月途中(通し): 不就労所定12日→欠勤控除163636→基本給136364', function () {
  var ym = '2026-06', rest = [0, 6], comp = [];
  var total = H.scheduledWorkdays(ym, rest, comp);
  var noWork = H.scheduledWorkdaysBetween(ym, rest, comp, '2026-06-15', '2026-06-30');
  eq(total, 22); eq(noWork, 12);
  var kekkin = PC.calcKekkin({ base: 300000, ym: ym, kekkinDays: noWork, method: 'scheduled', scheduledDays: total });
  eq(kekkin, Math.round(300000 / 22 * 12)); // 163636
  var basePaid = 300000 - kekkin;
  eq(basePaid, 136364);
});

T('産休月途中(通し): 社保は免除(0)・所得税と雇用保険は就労分に発生', function () {
  var basePaid = 136364;
  var r = Calc.computePayslip({
    shikyu: [{ label: '基本給', value: basePaid }], birthYmd: '1990-05-15', payYm: '2026-06',
    fuyou: 0, taxClass: '甲', pref: 'tokyo', employRate: 0.0055, hyojunBase: 300000,
    apply: { health: false, pension: false, kaigo: false }, extraKojo: [] // 産休=月末在籍で社保免除
  });
  eq(r.shikyuTotal, basePaid);
  eq(kojoOf(r, '健康保険'), null); // 免除→控除に出ない
  eq(kojoOf(r, '厚生年金'), null);
  ok(kojoOf(r, '雇用保険') > 0, '雇用保険は支給ベースで発生すべき');
  ok(kojoOf(r, '所得税') > 0, '産休でも就労分は課税されるべき(免除なし)');
});

T('全月産休(不就労=所定全部)は就労0→leavePay運用に委ねる(noWork>=total)', function () {
  var ym = '2026-06', rest = [0, 6], comp = [];
  var total = H.scheduledWorkdays(ym, rest, comp);
  var noWork = H.scheduledWorkdaysBetween(ym, rest, comp, '2026-06-01', '2026-06-30');
  eq(noWork, total); // 全月=部分月でない→app側はleavePay(手入力)にフォールバック
});

T('産休が当月の所定に掛からない月(不就労0)は満額就労=控除なし', function () {
  var ym = '2026-06', rest = [0, 6], comp = [];
  // 産休開始が翌月(7/1〜)→当月6月は不就労0
  eq(H.scheduledWorkdaysBetween(ym, rest, comp, '2026-07-01', '2026-07-31'), 0);
});
