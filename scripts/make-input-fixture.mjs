/* make-input-fixture.mjs — ★入力fixtureの凍結★（P1① オペ化の検証土台）
 *
 * なぜ必要か: ゴールデン(期待値)だけ固めても、入力が後から動いたら比較が無意味になる。
 *   入力とゴールデンを同じcommitで凍結し、両方のSHA256をCIで照合する。
 *
 * 決定性: uid()(Date.now/performance.now)を使わず id を明示。Math.random / new Date() を使わない。
 *   同じ入力から何度実行しても同一バイト列の JSON を出す。
 *
 * 使い方: node scripts/make-input-fixture.mjs   → tests/fixtures/payroll-input.json を書く
 *   （既定は「変更があれば書く」。--check を付けると差分検出のみ＝CIで凍結を確認できる）
 *
 * 【実データ(DB-test)について】
 *   本fixtureは (b)全パターン網羅ぶん。(a)DB-testの実データ1社1ヶ月は、匿名キーではRLSにより
 *   0件しか返らない(＝正しい保護挙動)ため未収録。テストアカウントでログインして読み取り、
 *   datasets に id:'dbtest-real-YYYY-MM' として【追記】する（既存datasetは書き換えない＝
 *   既存ゴールデンを無効化しない）。読み取り専用・DB-testへの書込/更新/削除は一切しない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'payroll-input.json');
const CHECK = process.argv.includes('--check');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入(npm i jsdom)。fixture生成には jsdom が必要です。'); process.exit(0); }

// 本物の app.js の既定値(defEmp/defCompany)でfixtureを作る＝アプリの実形と乖離させない
function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/\?.*$/, ''))
    .filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network in fixture build'));
  for (const src of srcs) {
    const el = win.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
    win.document.body.appendChild(el);
  }
  if (!win.__PAYSLIP_TEST) throw new Error('__PAYSLIP_TEST 未露出(app.js init失敗)');
  return win.__PAYSLIP_TEST;
}

const A = loadApp();

// ── 決定的な従業員ビルダ(idは必ず明示・uidを使わない) ──
function emp(id, name, o) {
  const base = A.defEmp(name);
  delete base.id;
  return Object.assign({ id, name, pref: 'tokyo', birthYmd: '1985-04-10' }, base, o, { id, name });
}
// defCompany は __PAYSLIP_TEST に露出していないため、初期化直後の state.company(=defCompany()の結果)を複製して使う
const DEF_COMPANY = JSON.parse(JSON.stringify(A.state.company));
function company(o) { return Object.assign(JSON.parse(JSON.stringify(DEF_COMPANY)), o); }
const wari = (o) => Object.assign({ mode: 'easy', otH: '', otM: '', nightH: '', nightM: '', holidayH: '', holidayM: '',
  detail: { ot: { h: '', m: '' }, otNight: { h: '', m: '' }, over60: { h: '', m: '' }, over60Night: { h: '', m: '' }, night: { h: '', m: '' }, holiday: { h: '', m: '' }, holidayNight: { h: '', m: '' } } }, o);
const kin = (shukkin, kekkin, yukyu) => [{ label: '出勤日数', value: String(shukkin) }, { label: '欠勤日数', value: String(kekkin) }, { label: '有給取得', value: String(yukyu) }];

// ══ dataset 1: 本体(全給与形態×税区分×年齢×在籍×警告) ══
const mainEmployees = [
  // ── 給与形態 ──
  emp('m01', '月給 甲 扶養1', { payType: '月給', base: '300000', fuyou: '1', commute: '12000' }),
  emp('m02', '月給 乙 扶養0 大阪', { payType: '月給', base: '280000', fuyou: '0', taxClass: 'otsu', pref: 'osaka' }),
  emp('m03', '時給 甲', { payType: '時給', hourly: '1500', workedH: '160', workedM: '0', fuyou: '0' }),
  emp('m04', '日給 甲', { payType: '日給', base: '13000', kintai: kin(20, 0, 1), fuyou: '2' }),
  emp('m05', '日給 丙 日雇い', { payType: '日給', base: '12000', taxClass: 'hei', kintai: kin(18, 0, 0), fuyou: '0' }),
  emp('m06', '歩合 保障給あり', { payType: '歩合', commissionAmt: '350000', hourlyGuarantee: '1300', workedH: '170', workedM: '0' }),
  emp('m07', '役員', { payType: '役員', base: '600000', fuyou: '2', apply: { employ: false } }),
  emp('m08', 'カスタム 固定+高い方', { payType: 'カスタム', salesAmt: '1200000', workedH: '168', workedM: '0',
    payRule: { fixed: '180000', variable: { mode: 'max', parts: [{ type: 'rate', amount: '35', label: '売上歩合' }, { type: 'hourly', amount: '1250', label: '時給保障' }] } } }),
  // ── 社会保険の年齢資格 ──
  emp('m09', '介護該当 45歳', { payType: '月給', base: '320000', birthYmd: '1981-02-20', fuyou: '1' }),
  emp('m10', '厚年喪失 71歳', { payType: '月給', base: '260000', birthYmd: '1955-01-15', fuyou: '0' }),
  emp('m11', '健保喪失 76歳', { payType: '月給', base: '200000', birthYmd: '1950-03-05', fuyou: '0' }),
  // ── 在籍(日割・社保) ──
  emp('m12', '入社月 日割', { payType: '月給', base: '300000', joinYmd: '2026-06-16', fuyou: '1' }),
  emp('m13', '退職月 月中', { payType: '月給', base: '300000', taishokuYmd: '2026-06-20', fuyou: '1' }),
  emp('m14', '退職月 月末', { payType: '月給', base: '300000', taishokuYmd: '2026-06-30', fuyou: '1' }),
  // ── 休暇 ──
  emp('m15', '産休 部分月', { payType: '月給', base: '300000', workStatus: 'sankyu', leaveStartYmd: '2026-06-11', leaveEndYmd: '2026-09-30', fuyou: '1' }),
  emp('m16', '育休 全月', { payType: '月給', base: '300000', workStatus: 'ikukyu', leaveStartYmd: '2026-01-01', leaveEndYmd: '2026-12-31', leavePay: '0', fuyou: '1' }),
  emp('m17', '休業手当ゼロ', { payType: '月給', base: '300000', workStatus: 'kyugyo', leavePay: '', fuyou: '0' }),
  emp('m18', '休業手当 低い', { payType: '月給', base: '300000', workStatus: 'kyugyo', leavePay: '90000', fuyou: '0' }),
  // ── 控除・税 ──
  emp('m19', '住民税 年額モード', { payType: '月給', base: '330000', residentTaxMode: 'annual', residentTaxAnnual: '180000', fuyou: '1' }),
  emp('m20', '法定外控除あり', { payType: '月給', base: '290000', extraKojo: [{ label: '社宅費', value: '25000' }, { label: '財形貯蓄', value: '10000' }], fuyou: '1' }),
  emp('m21', '差引マイナス', { payType: '月給', base: '150000', extraKojo: [{ label: '貸付金返済', value: '200000' }], fuyou: '0' }),
  emp('m22', '業務委託 代行(非該当)', { payType: '月給', base: '400000', employmentType: 'contractor', houshuKubun: 'none' }),
  emp('m23', '業務委託 原稿料(該当)', { payType: '月給', base: '300000', employmentType: 'contractor', houshuKubun: 'genkou' }),
  // ── 警告(最賃・労働時間・年少者・社保) ──
  emp('m24', '最賃割れ 時給', { payType: '時給', hourly: '1000', workedH: '160', workedM: '0', fuyou: '0' }),
  emp('m25', '歩合 保障給なし', { payType: '歩合', commissionAmt: '300000', hourlyGuarantee: '', workedH: '170', workedM: '0' }),
  emp('m26', '残業45h超', { payType: '月給', base: '300000', fuyou: '1', warimashi: wari({ otH: '50', otM: '0' }) }),
  emp('m27', '時間外+休日100h', { payType: '月給', base: '320000', fuyou: '1', warimashi: wari({ otH: '80', otM: '0', holidayH: '30', holidayM: '0' }) }),
  emp('m28', '年少者 深夜/時間外', { payType: '月給', base: '190000', birthYmd: '2010-08-01', fuyou: '0', warimashi: wari({ otH: '12', otM: '0', nightH: '6', nightM: '0' }) }),
  emp('m29', '社保オフ 常用', { payType: '月給', base: '300000', fuyou: '0', apply: { health: false, pension: false } }),
  emp('m30', '欠勤あり', { payType: '月給', base: '300000', fuyou: '1', kintai: kin(18, 3, 0) }),
  emp('m31', '固定残業みなし', { payType: '月給', base: '350000', fuyou: '1', minashiH: '20', warimashi: wari({ otH: '25', otM: '0' }) }),
  emp('m32', '割増 詳細モード', { payType: '月給', base: '310000', fuyou: '1',
    warimashi: wari({ mode: 'detail', detail: { ot: { h: '20', m: '30' }, otNight: { h: '3', m: '0' }, over60: { h: '0', m: '0' }, over60Night: { h: '0', m: '0' }, night: { h: '4', m: '0' }, holiday: { h: '8', m: '0' }, holidayNight: { h: '2', m: '0' } } }) }),
  emp('m33', '通勤 マイカー30km', { payType: '月給', base: '280000', fuyou: '1', commuteType: 'car', commuteKm: '30', commute: '20000' }),
  emp('m34', '通勤 高額(限度超)', { payType: '月給', base: '400000', fuyou: '1', commute: '170000' }),
  emp('m35', '短時間労働者(社保)', { payType: '時給', hourly: '1400', workedH: '90', workedM: '0', weeklyScheduledH: '22', shortTimeType: 'tanjikan', fuyou: '0' }),
  emp('m36', '年調 還付あり', { payType: '月給', base: '340000', fuyou: '1', nenchoAdj: { ym: '2026-06', amount: -42000 } }),
  emp('m37', '年調 不足徴収', { payType: '月給', base: '340000', fuyou: '1', nenchoAdj: { ym: '2026-06', amount: 18000 } }),
  emp('m38', '本人 障害者+ひとり親', { payType: '月給', base: '300000', fuyou: '1', honninShogai: true, honninKafuHitorioya: 'hitorioya' }),
];

// 36協定(複数月/年)の履歴。★過去11ヶ月ぶん＝avg80h超・年720h超・45h超が年6回超 を同時に満たす
const otHistoryMain = {
  m27: Array.from({ length: 11 }, () => ({ otMin: 5400, holidayMin: 600 })), // 90h + 10h
};

const datasets = [
  { id: 'main-2026-06', month: '2026-06', note: '本体: 全給与形態×税区分×年齢×在籍×控除×警告(38名)',
    company: company({ name: '株式会社 ゼロアクト', gyoshu: 'ippan', annualHolidays: '120', dailyWorkH: '8', dailyWorkM: '0' }),
    employees: mainEmployees, otHistory: otHistoryMain },

  { id: 'tokutei-2026-06', month: '2026-06', note: '特定適用事業所ON: 社保 加入判定(適用拡大)の警告',
    company: company({ name: '特定適用テスト社', shakaTokutei: true }),
    employees: [
      emp('t01', '週25h 月10万 非学生', { payType: '時給', hourly: '1300', workedH: '100', workedM: '0', weeklyScheduledH: '25', apply: { health: false, pension: false }, fuyou: '0' }),
      emp('t02', '週25h 学生(除外)', { payType: '時給', hourly: '1300', workedH: '100', workedM: '0', weeklyScheduledH: '25', honninKinrou: true, apply: { health: false, pension: false }, fuyou: '0' }),
      emp('t03', '週19h(非該当)', { payType: '時給', hourly: '1300', workedH: '76', workedM: '0', weeklyScheduledH: '19', apply: { health: false, pension: false }, fuyou: '0' }),
    ], otHistory: {} },

  { id: 'lowrate-2026-06', month: '2026-06', note: '割増率が法定下限割れ(労基37条)の会社設定',
    company: company({ name: '低率テスト社', rateOt: '20', rateHoliday: '30', rateNight: '20', rateOver60: '20' }),
    employees: [emp('l01', '残業あり', { payType: '月給', base: '300000', fuyou: '1', warimashi: wari({ otH: '10', otM: '0', nightH: '2', nightM: '0', holidayH: '8', holidayM: '0' }) })],
    otHistory: {} },

  { id: 'annualover-2026-06', month: '2026-06', note: '年間労働時間が週40h目安超(労基32条)',
    company: company({ name: '長時間所定テスト社', annualHolidays: '80', dailyWorkH: '8', dailyWorkM: '30' }),
    employees: [emp('a01', '所定長め', { payType: '月給', base: '300000', fuyou: '1' })], otHistory: {} },

  { id: 'stale-2027-06', month: '2027-06', note: '未収録年度=暫定計算の黄警告(silent-wrong防止)',
    company: company({ name: '未収録年度テスト社' }),
    employees: [emp('s01', '月給', { payType: '月給', base: '300000', fuyou: '1' })], otHistory: {} },

  // ── 版(年度)切替点: 同一人物・月だけ動かす ──
  ...['2026-02', '2026-03', '2026-04', '2025-09', '2025-10'].map(ym => ({
    id: 'boundary-' + ym, month: ym, note: '年度切替点の検証(健保R7→R8=3月起算 / 支援金=2026-04〜 / 雇用保険=4月起算 / 最賃=10月起算)',
    company: company({ name: '境界テスト社' }),
    employees: [
      emp('b01', '月給 東京', { payType: '月給', base: '300000', fuyou: '1' }),
      emp('b02', '介護該当', { payType: '月給', base: '300000', birthYmd: '1980-01-01', fuyou: '0' }),
      emp('b03', '時給 最賃近傍', { payType: '時給', hourly: '1230', workedH: '160', workedM: '0', fuyou: '0' }),
    ], otHistory: {},
  })),
];

const fixture = { schema: 1, generator: 'scripts/make-input-fixture.mjs', datasets };
const json = JSON.stringify(fixture, null, 2) + '\n';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
// ★改行を正規化して比較: git autocrlf でWindows作業ツリーがCRLFでもCI(LF)と同じ判定になる
const lf = (s) => (s == null ? null : String(s).replace(/\r\n/g, '\n'));
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
const same = lf(prev) === lf(json);
if (CHECK) {
  if (same) { console.log('✓ 入力fixtureは凍結どおり(差分なし):', path.relative(ROOT, OUT)); process.exit(0); }
  console.log('✗ 入力fixtureが生成結果と一致しません。凍結が壊れています。'); process.exit(1);
}
if (same) { console.log('（変更なし）', path.relative(ROOT, OUT)); }
else { fs.writeFileSync(OUT, json); console.log('書き出し:', path.relative(ROOT, OUT)); }
const n = datasets.reduce((a, d) => a + d.employees.length, 0);
console.log(`datasets=${datasets.length} / 従業員のべ=${n}名`);
