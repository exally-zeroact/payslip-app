/* law-switchpoints.test.mjs — ★版(年度)の切替点が正しく効くか★
 *
 * この設計の肝。法令は領域ごとに年度の起算が違う:
 *   健保/介護 = 社保年度(3月起算) / 雇用保険 = 労働保険年度(4月起算)
 *   子ども・子育て支援金 = 2026-04 から / 最低賃金 = 最賃年度(10月起算)
 * 境界の【前後】を両方見る。期待値は公式一次情報の実数リテラル（自分の出力から作らない）。
 *
 * 出典（後で誰でも検算できるようにURLまで残す）:
 *  健保R8 都道府県別 / 介護1.62% … https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html
 *  厚年 18.3%(H29.9〜固定)      … https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf
 *  子ども・子育て支援金 0.23%    … https://www.cfa.go.jp/policies/kodomokosodateshienkinseido
 *  雇用保険 R8 一般 5/1000       … https://jsite.mhlw.go.jp/yamagata-roudoukyoku/koyouhoken-20260316.html
 *  最低賃金 R7 東京1,226円       … https://www.mhlw.go.jp/content/11200000/001571192.pdf
 *  R8最賃は目安答申のみ(未確定)  … https://www.mhlw.go.jp/stf/newpage_74920.html
 *  適用拡大の要件・撤廃予定      … https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const op = require(path.join(ROOT, 'ops/payroll.monthly.js'));
const SHH = require(path.join(ROOT, 'lib/shakaihoken-hyo.js'));
const KOYO = require(path.join(ROOT, 'lib/koyo-hoken.js'));
const SAI = require(path.join(ROOT, 'lib/saitei-chingin.js'));

let pass = 0, fail = 0;
function T(n, fn) { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } }
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + `expected ${b} got ${a}`); }
function near(a, b, tol, m) { if (Math.abs(a - b) > tol) throw new Error((m ? m + ': ' : '') + `expected≈${b} got ${a}`); }

const CO = { name: 'S', annualHolidays: '120', dailyWorkH: '8', dailyWorkM: '0', gyoshu: 'ippan', holidays: [0], ruleOn: {} };
const EMP = { id: 'b01', name: 'B', payType: '月給', base: '300000', fuyou: '1', pref: 'tokyo', birthYmd: '1985-04-10' };
const run = (ym, emp) => op.engine({ month: ym, company: CO, employees: [emp || EMP] });
const snap = (ym) => run(ym).provenance.statutory;

console.log('\n[law-switchpoints] 年度切替点（境界の前後）');

// ── 健康保険（社保年度=3月起算）: 令和7年度 → 令和8年度 ──
T('健保 東京: 2026-02 は令和7年度 9.91%(折半4.955%) / 2026-03 から令和8年度 9.85%(折半4.925%)', function () {
  eq(SHH.getKenko('tokyo', '2026-02').jugyoin, 0.0991 / 2, '2026-02(令和7年度)');
  eq(SHH.getKenko('tokyo', '2026-03').jugyoin, 0.0985 / 2, '2026-03(令和8年度)');
  eq(snap('2026-02').kenko.jugyoin, 0.0991 / 2, 'op経由 2026-02');
  eq(snap('2026-03').kenko.jugyoin, 0.0985 / 2, 'op経由 2026-03');
});
T('健保 都道府県差(令和8): 大阪10.13% / 佐賀10.55% / 新潟9.21%（協会けんぽ公式）', function () {
  eq(SHH.getKenko('osaka', '2026-06').jugyoin, 0.1013 / 2);
  eq(SHH.getKenko('saga', '2026-06').jugyoin, 0.1055 / 2);
  eq(SHH.getKenko('niigata', '2026-06').jugyoin, 0.0921 / 2);
});

// ── 介護保険（全国一律・社保年度） ──
T('介護: 令和7年度 1.59% → 令和8年度 1.62%（境界=3月）', function () {
  eq(SHH.getKaigo('2026-02').total, 0.0159);
  eq(SHH.getKaigo('2026-03').total, 0.0162);
  eq(SHH.getKaigo('2026-03').jugyoin, 0.0081);
});

// ── 子ども・子育て支援金（2026-04開始・労使折半） ──
T('★子育て支援金: 2026-03 は 0 / 2026-04 から 0.23%の折半=0.115%（こども家庭庁）', function () {
  eq(SHH.getShienkin('2026-03'), 0);
  eq(SHH.getShienkin('2026-04'), 0.0023 / 2);
  eq(snap('2026-03').shienkin.jugyoin, 0);
  eq(snap('2026-04').shienkin.jugyoin, 0.00115);
});
T('★健保の実控除に支援金が乗る: 2026-04は 2026-03 より高い（同じ標準報酬で）', function () {
  const a = run('2026-03').value.people[0], b = run('2026-04').value.people[0];
  eq(a.hyojun, b.hyojun, '標準報酬は同じ');
  if (!(b.si.health > a.si.health)) throw new Error(`支援金が乗っていない: 2026-03=${a.si.health} 2026-04=${b.si.health}`);
  near((b.si.health - a.si.health) * 2 / a.hyojun, 0.0023, 0.0002, '差分≒支援金率0.23%(折半前)');
});

// ── 厚生年金（固定） ──
T('厚年: 18.3%(折半9.15%)が年度をまたいでも不変（平成29年9月〜固定）', function () {
  eq(SHH.KOSEI_NENKIN_RITSU_TOTAL, 0.183);
  eq(SHH.KOSEI_NENKIN_RITSU_JUGYOIN, 0.0915);
  const p = run('2026-06').value.people[0];
  eq(p.si.pension, Math.round(p.hyojunPension * 0.183 / 2));
});

// ── 雇用保険（労働保険年度=4月起算） ──
T('★雇用保険 一般: 2026-03 は令和7年度 5.5/1000 / 2026-04 から令和8年度 5/1000（厚労省）', function () {
  eq(KOYO.employRate('ippan', KOYO.employYearOfYm('2026-03')), 0.0055);
  eq(KOYO.employRate('ippan', KOYO.employYearOfYm('2026-04')), 0.005);
  eq(snap('2026-03').koyo.rate, 0.0055);
  eq(snap('2026-04').koyo.rate, 0.005);
});
T('雇用保険の実控除=総支給×率（境界の前後で率が切り替わる）', function () {
  const a = run('2026-03').value.people[0], b = run('2026-04').value.people[0];
  eq(a.si.employ, Math.round(a.shikyuTotal * 0.0055));
  eq(b.si.employ, Math.round(b.shikyuTotal * 0.005));
});

// ── 最低賃金（最賃年度=10月起算） ──
T('★最賃: 収録は令和7年度(2025-10発効)。東京=1,226円（厚労省 全国一覧）', function () {
  eq(SAI.NENDO_YEAR, 2025);
  eq(SAI.getChingin('tokyo'), 1226);
});
T('★最賃年度の境界: 2025-09 は未収録年度=暫定(stale) / 2025-10 は収録年度', function () {
  eq(SAI.saiteiStale('2025-09'), true);
  eq(SAI.saiteiStale('2025-10'), false);
  eq(SAI.saiteiStale('2026-09'), false);
});
T('★令和8年度の最賃は書かない: 2026-10以降は stale=true で黄警告（目安答申のみ・実額未確定）', function () {
  eq(SAI.saiteiStale('2026-10'), true);
  const w = op.engine({ month: '2026-10', company: CO, employees: [EMP] }).warnings;
  const has = w.some(x => x.code === 'STATUTORY_STALE');
  if (!has) throw new Error('2026-10 で STATUTORY_STALE が出ていない（推測値で黙って計算してはいけない）');
});

// ── provenance に「実際に選ばれた年度」が出ること ──
T('provenance に実行時に選ばれた年度/率が出る（切替が効いているか出力で確認できる）', function () {
  const s = snap('2026-06');
  eq(s.kenko.nendo, '令和8年度');
  eq(s.koyo.fy, 2026);
  eq(s.saitei.chingin, 1226);
  eq(s.ym, '2026-06');
});

// ── 未反映の法改正が毎回出力に載ること（watch） ──
T('★watch: 8.8万円の撤廃予定(令和8年10月・施行日は政令)が provenance に出る＝見えない未対応を作らない', function () {
  const w = run('2026-06').provenance.watch;
  const t = w.find(x => /8\.8万/.test(x.item));
  if (!t) throw new Error('賃金要件の watch が無い');
  if (!/令和8年10月/.test(t.when)) throw new Error('撤廃予定時期が書かれていない: ' + t.when);
  if (!/未反映/.test(t.status)) throw new Error('未反映である旨が書かれていない: ' + t.status);
  if (!/2026-09-15/.test(t.deadline)) throw new Error('再照合の期限が書かれていない: ' + t.deadline);
  if (!/nenkin\.go\.jp/.test(t.source)) throw new Error('出典URLが無い: ' + t.source);
  const k = w.find(x => /企業規模/.test(x.item));
  if (!k || !/令和9年10月 36人以上/.test(k.when)) throw new Error('企業規模の段階引下げが書かれていない');
});
T('★現行の適用拡大要件が law に実数で書かれ、出典URLがある', function () {
  const t = op.law.tekiyoKakudai;
  if (!/週20時間以上/.test(t.current) || !/8\.8万円以上/.test(t.current) || !/51人以上/.test(t.current)) throw new Error('要件: ' + t.current);
  if (!/nenkin\.go\.jp/.test(t.source)) throw new Error('出典URL: ' + t.source);
});
T('★law は領域ごとに年度を持つ（1枚の札で貼らない）＋全領域に出典URLがある', function () {
  const L = op.law;
  eq(L.saiteiChingin.nendo, '令和7年度（2025-10-03 発効）');
  if (/令和8/.test(L.saiteiChingin.nendo)) throw new Error('未確定の令和8年度最賃を書いてはいけない');
  if (!/令和8年分/.test(L.incomeTax.nendo)) throw new Error('所得税: ' + L.incomeTax.nendo);
  if (!/令和8年度/.test(L.shahoKenko.nendo)) throw new Error('健保: ' + L.shahoKenko.nendo);
  for (const k of ['incomeTax', 'shahoKenko', 'shahoKosei', 'kaigo', 'shienkin', 'koyo', 'saiteiChingin', 'roukiho', 'tekiyoKakudai']) {
    if (!/^https:\/\//.test(L[k].source || '')) throw new Error(k + ' に出典URLが無い: ' + L[k].source);
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
