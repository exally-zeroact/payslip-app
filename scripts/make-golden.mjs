/* make-golden.mjs — ★移設前の真値を凍結する(ゴールデン生成)★
 *
 * なぜ必要か: オペ化では js/app.js の計算を lib へ「移設」する。移設後に
 *   「app.js経由 vs op経由」を比べても、両者は同じコードを呼ぶ＝常に緑＝何も証明しない(自己参照)。
 *   よって【移設前のコミット(1c128e1)の出力】を先に凍結し、以後はそれを唯一の正とする。
 *
 * 真値の採り方(app.jsを1文字も改変しない):
 *   ・お金      … __PAYSLIP_TEST.compute(e) の返り値をそのまま
 *   ・警告      … 本物のUIを描画して .cr-warn/.sh-warn/⚠tooltip を DOM から採取
 *                 (＝ユーザーに実際に見えている文言。1従業員ずつ隔離して属人化)
 *   ・Excel     … 実際の書き出しボタン #b-xlsx をクリックし、PayslipXlsx.download に
 *                 渡る people(=buildPeopleの出力)と AOA を捕捉
 *
 * 使い方: node scripts/make-golden.mjs        → tests/fixtures/golden-<commit>.json を書く
 *         node scripts/make-golden.mjs --check → 既存ゴールデンと一致するかだけ見る(書かない)
 * ★実行は必ず BASE_COMMIT のツリーで行うこと(スクリプト側でも検証し、違えば止まる)。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE_COMMIT = '1c128e1'; // ★移設前★ ここを書き換えるのは新しいゴールデンを作る時だけ
const INPUT = path.join(ROOT, 'tests', 'fixtures', 'payroll-input.json');
const OUT = path.join(ROOT, 'tests', 'fixtures', `golden-${BASE_COMMIT}.json`);
const CHECK = process.argv.includes('--check');
const FORCE = process.argv.includes('--force-tree'); // 検証用にツリー検証を外す(通常使わない)

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入(npm i jsdom)。ゴールデン生成には jsdom が必要です。'); process.exit(0); }

// ★改行を正規化してからハッシュ: git autocrlf で作業ツリーがCRLFでも CI(LF) と同じ値になる
export function sha256(s) { return crypto.createHash('sha256').update(String(s).replace(/\r\n/g, '\n'), 'utf8').digest('hex'); }

// ── ツリー検証: 計算に関わるファイルが BASE_COMMIT と同一か ──
const GUARDED = ['js/app.js', 'index.html'];
function verifyTree() {
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
  const dirty = [];
  // 改行コードは正規化して比較(Windowsの作業ツリーはCRLF・gitのblobはLFのことがある)
  const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
  for (const f of GUARDED) {
    const now = lf(fs.readFileSync(path.join(ROOT, f)));
    let at;
    try { at = lf(execFileSync('git', ['show', `${BASE_COMMIT}:${f}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })); }
    catch { throw new Error(`${BASE_COMMIT}:${f} を取得できません`); }
    if (now !== at) dirty.push(f);
  }
  const libDiff = execFileSync('git', ['diff', '--name-only', BASE_COMMIT, '--', 'lib/'], { cwd: ROOT }).toString().trim();
  if (libDiff) dirty.push(...libDiff.split('\n'));
  if (dirty.length) {
    throw new Error(`★ゴールデンは ${BASE_COMMIT} のツリーでのみ生成できます。差分のあるファイル: ${dirty.join(', ')}\n` +
      `  移設後に作り直すのは禁止です(期待値を自分の出力から作ることになる)。\n` +
      `  git worktree add ../payslip-base ${BASE_COMMIT} してそちらで実行してください。`);
  }
  return head;
}

// ── 本物のアプリを jsdom に読み込む ──
function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/\?.*$/, ''))
    .filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network in golden build'));
  for (const src of srcs) {
    const el = win.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
    win.document.body.appendChild(el);
  }
  if (!win.__PAYSLIP_TEST) throw new Error('__PAYSLIP_TEST 未露出(app.js init失敗)');
  return win;
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').replace(/^[⚠\s]+/, '').replace(/[。\s]+$/, '').trim();

function collectWarnings(win, sel) {
  const D = win.document, out = new Set();
  D.querySelectorAll(`${sel} .cr-warn, ${sel} .sh-warn`).forEach(el => out.add(norm(el.textContent)));
  D.querySelectorAll(`${sel} .tmw[title], ${sel} .tlw[title]`).forEach(el => out.add(norm(el.getAttribute('title'))));
  return [...out].filter(Boolean);
}

// 1従業員ずつ隔離して描画→その人に紐づく警告だけを採る
function warningsForEmployee(win, A, empObj) {
  const D = win.document, set = new Set();
  A.state.employees = [empObj];
  A.state.open = new Proxy({}, { get: () => true, has: () => true }); // 全アコーディオンを開く
  A.state.empFilter = 'all';                                          // 休暇/退職も表示
  for (const h of ['#input-list', '#emp-list']) { const el = D.querySelector(h); if (el) el.innerHTML = ''; }
  for (const view of ['card', 'table']) {
    A.state.inputView = view;
    try { A.renderInput(); } catch (e) { set.add('ERR:renderInput:' + e.message); }
    collectWarnings(win, '#input-list').forEach(x => set.add(x));
  }
  try { A.renderEmpMaster(); } catch (e) { set.add('ERR:renderEmpMaster:' + e.message); }
  collectWarnings(win, '#emp-list').forEach(x => set.add(x));
  return [...set].sort();
}

// お金: compute() の返り値をまるごと(中間値 si まで)
function moneyOf(A, empObj) {
  const r = A.compute(empObj);
  return {
    shikyu: (r.shikyu || []).map(x => ({ label: x.label, value: x.value, hikazei: !!x.hikazei })),
    shikyuTotal: r.shikyuTotal, nonTaxable: r.nonTaxable,
    hyojun: r.hyojun, hyojunHealth: r.hyojunHealth, hyojunPension: r.hyojunPension,
    hasKaigo: !!r.hasKaigo, kazei: r.kazei,
    si: { health: r.si.health, kaigo: r.si.kaigo, pension: r.si.pension, employ: r.si.employ, total: r.si.total,
      hyojun: r.si.hyojun, hyojunHealth: r.si.hyojunHealth, hyojunPension: r.si.hyojunPension },
    incomeTax: r.incomeTax, residentTax: r.residentTax,
    kojo: (r.kojo || []).map(x => ({ label: x.label, value: x.value })),
    kojoTotal: r.kojoTotal, net: r.net, netNegative: !!r.netNegative,
  };
}

// Excel: 実際の書き出しボタンを押して buildPeople の出力と AOA を捕捉
function excelOf(win, A, employees) {
  const D = win.document;
  A.state.employees = employees;
  let cap = null;
  const orig = win.PayslipXlsx.download;
  win.PayslipXlsx.download = (people, opts) => { cap = { people, opts }; return true; };
  const sel = D.querySelector('#p-emp');
  if (sel) { sel.innerHTML = '<option value="__all">全員</option>'; sel.value = '__all'; }
  A.state.printMode = 'monthly';
  try { D.querySelector('#b-xlsx').click(); } catch (e) { win.PayslipXlsx.download = orig; throw new Error('Excel出力クリック失敗: ' + e.message); }
  win.PayslipXlsx.download = orig;
  if (!cap) throw new Error('PayslipXlsx.download が呼ばれませんでした');
  const X = win.PayslipXlsx;
  const used = {};
  return {
    opts: cap.opts,
    people: cap.people,
    shukei: X.shukeiAOA(cap.people, cap.opts),
    meishi: cap.people.map(p => Object.assign({ sheetName: X.sheetName(p.name, used) }, X.meishiAOA(p, cap.opts))),
  };
}

// ══ main ══
const head = FORCE ? '(tree-check skipped)' : verifyTree();
const inputRaw = fs.readFileSync(INPUT, 'utf8');
const inputSha256 = sha256(inputRaw);
const input = JSON.parse(inputRaw);
const win = loadApp();
const A = win.__PAYSLIP_TEST;

const datasets = [];
for (const ds of input.datasets) {
  A.state.month = ds.month;
  A.state.company = JSON.parse(JSON.stringify(ds.company));
  A.state._otHist = JSON.parse(JSON.stringify(ds.otHistory || {}));
  A.state.nencho = {};
  A.state.confirmed = {};

  const people = [];
  for (const e of ds.employees) {
    const empObj = A.mergeEmp(JSON.parse(JSON.stringify(e)));   // 保存形→実行形(app.jsのマージ規則そのまま)
    const money = moneyOf(A, empObj);                            // ★computeより先に描画すると状態が進むので順序固定
    const warnings = warningsForEmployee(win, A, empObj);
    people.push({ empId: e.id, name: e.name, money, warnings });
  }

  // 会社スコープの警告(割増率の法定下限・未収録年度)。従業員を全員載せた状態で1回だけ採る
  A.state.employees = ds.employees.map(e => A.mergeEmp(JSON.parse(JSON.stringify(e))));
  A.state.open = new Proxy({}, { get: () => true, has: () => true });
  A.state._ruleOpen = new Proxy({}, { get: () => true, has: () => true }); // 会社ルールの折りたたみも全部開く
  A.state.empFilter = 'all'; A.state.inputView = 'card';
  const D = win.document;
  for (const h of ['#input-list', '#emp-list']) { const el = D.querySelector(h); if (el) el.innerHTML = ''; }
  try { A.renderInput(); } catch { /* 会社スコープ採取は非致命 */ }
  // renderEmpMaster → fillCompany → renderCompanyRules が会社設定の黄警告(割増率の法定下限・年間労働時間)を描く
  try { A.renderEmpMaster(); } catch { /* 同上 */ }
  const companyWarnings = collectWarnings(win, 'body').filter(w =>
    /未収録の年度|割増の率|法定下限|年間の労働時間/.test(w)).sort();

  const excel = excelOf(win, A, ds.employees.map(e => A.mergeEmp(JSON.parse(JSON.stringify(e)))));

  datasets.push({ id: ds.id, month: ds.month, companyWarnings, people, excel });
}

const goldenSha256 = sha256(JSON.stringify(datasets));
const golden = {
  meta: {
    baseCommit: BASE_COMMIT,
    headAtGeneration: head,
    generator: 'scripts/make-golden.mjs',
    generatedAt: new Date().toISOString(),
    inputFixture: 'tests/fixtures/payroll-input.json',
    inputSha256,
    goldenSha256,
    note: '★移設前(1c128e1)の真値。オペ化後の出力はこれと1円まで一致すること。作り直し禁止(sha照合で検知)。',
  },
  datasets,
};
const json = JSON.stringify(golden, null, 2) + '\n';

if (CHECK) {
  if (!fs.existsSync(OUT)) { console.log('✗ ゴールデンが存在しません:', path.relative(ROOT, OUT)); process.exit(1); }
  const cur = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const ok = cur.meta.goldenSha256 === goldenSha256 && cur.meta.inputSha256 === inputSha256;
  console.log(ok ? '✓ ゴールデンは再現します(sha一致)' : '✗ ゴールデンが再現しません(sha不一致)');
  process.exit(ok ? 0 : 1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json);
const nPeople = datasets.reduce((a, d) => a + d.people.length, 0);
const nWarn = datasets.reduce((a, d) => a + d.people.reduce((b, p) => b + p.warnings.length, 0) + d.companyWarnings.length, 0);
console.log('書き出し:', path.relative(ROOT, OUT));
console.log(`baseCommit=${BASE_COMMIT} / datasets=${datasets.length} / 人=${nPeople} / 警告=${nWarn}件`);
console.log(`inputSha256=${inputSha256}`);
console.log(`goldenSha256=${goldenSha256}`);
