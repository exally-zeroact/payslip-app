// integration.mjs — ★RC1対策★ app.js層(配線/UI/状態/描画)の自動統合テスト。
//  本物の index.html + 全lib + js/app.js を jsdom に読み込み、__PAYSLIP_TEST API を通して
//  「lib緑では捕まらない配線バグ(未配線/二重実装/凍結/マージ)」を回帰テストする。
//  依存: jsdom(devDependency)。使い方: node tests/integration.mjs (jsdom未導入なら SKIP=exit0)
//  ※これは tests/run.js(依存なし・lib単体)とは別ランナー。両方をCIで回す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=統合テストをスキップ(npm i jsdom で有効化)。'); process.exit(0); }

let pass = 0, fail = 0;
function T(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }

// ── 本物のアプリを jsdom に読み込む ──
function loadApp() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // ローカルscriptの順序を index.html から取得(外部CDN/supabase/認証は除外=ログイン無しローカルモード)
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
    .filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  // 全script除去したDOMだけのHTMLを作る
  const domHtml = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(domHtml, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network in test')); // hydrateStatutoryは.catchで握る
  ok(/jsdom/i.test(win.navigator.userAgent), 'jsdom UA (テストAPI露出条件)');
  for (const src of srcs) {
    const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
    const el = win.document.createElement('script');
    el.textContent = code;
    win.document.body.appendChild(el); // 実行(app.jsは末尾で即init)
  }
  ok(win.__PAYSLIP_TEST, '__PAYSLIP_TEST API が露出している(app.js init成功)');
  return win;
}

const win = loadApp();
const A = win.__PAYSLIP_TEST;
const num = v => { const n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; };

console.log('\n[integration] app.js層 統合テスト');

// ── compute配線: 全給与形態で 差引=支給-控除・NaNなし ──
T('compute配線: 月給/時給/日給/歩合/役員/カスタム で差引=支給-控除・有限値', function () {
  const cases = [
    { payType: '月給', base: '250000' },
    { payType: '時給', hourly: '1200' },
    { payType: '日給', base: '12000' },
    { payType: '歩合', commissionAmt: '300000', hourlyGuarantee: '1200' },
    { payType: '役員', base: '500000' },
    { payType: 'カスタム', payRule: { fixed: '180000', variable: { mode: 'max', parts: [{ type: 'rate', amount: '35' }, { type: 'hourly', amount: '1200' }] } }, salesAmt: '1000000' },
  ];
  cases.forEach(function (c) {
    const e = Object.assign(A.defEmp('T'), c);
    const r = A.compute(e);
    ok(isFinite(r.net) && isFinite(r.shikyuTotal) && isFinite(r.kojoTotal), c.payType + ' 有限値');
    ok(Math.abs(r.net - (r.shikyuTotal - r.kojoTotal)) <= 2, c.payType + ' 差引一致');
    ok(r.kojoTotal >= 0, c.payType + ' 控除非負');
  });
});

// ── D1: 確定=凍結。自動保存は確定済をスキップ・確定ボタン(force)は書く ──
T('D1: 確定済みは自動保存で凍結・force保存は書く', function () {
  const st = A.state;
  const writes = [];
  win.Store = win.Store || {};
  win.Store.savePayslip = function (ym, id) { writes.push(id); };
  const e0 = A.defEmp('確定'); e0.id = 'z1'; const e1 = A.defEmp('未確定'); e1.id = 'z2';
  st.employees = [e0, e1]; st.month = '2026-04'; st.confirmed = {};
  A.setConfirm('z1', true); e0.base = '999999'; // 昇給
  writes.length = 0; A.saveMonthlyPayslips(false); // 自動保存
  ok(writes.indexOf('z1') < 0 && writes.indexOf('z2') >= 0, '確定z1は凍結・未確定z2は保存: ' + writes.join(','));
  writes.length = 0; A.saveMonthlyPayslips(true); // 確定ボタン
  ok(writes.indexOf('z1') >= 0 && writes.indexOf('z2') >= 0, 'forceは両方保存');
});

// ── D2: 旧形式従業員(新項目欠落)を mergeEmp してもクラッシュせず計算成立 ──
T('D2: 旧形式従業員を既定マージ→compute成立', function () {
  const merged = A.mergeEmp({ id: 'o1', name: '旧', payType: 'カスタム', base: '200000' });
  ok(merged.warimashi && merged.warimashi.detail, 'warimashi.detail補完');
  ok(Array.isArray(merged.shaho.months) && Array.isArray(merged.kintai), 'shaho.months/kintai補完');
  const r = A.compute(merged); ok(isFinite(r.net), 'compute有限値');
});

// ── M2: 日払い全員=複数シート・空データは除外 ──
T('M2: 日払いスリップ 複数人=ページ分割・空データ除外', function () {
  const st = A.state; st.company.payCycle = 'weekly';
  const eA = A.defEmp('A'); eA.dailyEntries = [{ ymd: '2026-06-08', hm: '8:00', amount: '12000' }];
  const eB = A.defEmp('B'); eB.dailyEntries = [{ ymd: '2026-06-09', hm: '7:00', amount: '10000' }];
  const eC = A.defEmp('C空'); eC.dailyEntries = [];
  const list = [eA, eB, eC].map(A.buildDailyData).filter(d => d && d.days && d.days.length);
  const doc = A.dailySlipDoc(list, '1col');
  const m = doc.match(/class="sheet"/g);
  eq(m ? m.length : 0, 2, '2人分のシート(空Cは除外)');
  st.company.payCycle = 'monthly';
});

// ── B3/B4: 表の歩合欄(max構成で両方)・役員は割増欄なし ──
T('B3/B4: 表でmax(売上,歩合)は両欄・役員は割増欄なし', function () {
  const st = A.state;
  const e0 = A.defEmp('売上歩合'); e0.payType = 'カスタム'; e0.payRule = { fixed: '0', variable: { mode: 'max', parts: [{ type: 'rate', amount: '35' }, { type: 'commission' }] } }; e0.salesAmt = '1000000'; e0.commissionAmt = '300000';
  const e1 = A.defEmp('役員'); e1.payType = '役員';
  st.employees = [e0, e1]; st.month = '2026-06';
  const htmlT = A.renderInputTableHTML(false);
  const dom2 = new (win.DOMParser)();
  const doc = dom2.parseFromString('<table>' + htmlT.replace(/^[\s\S]*?<tbody>/, '<tbody>').replace(/<\/tbody>[\s\S]*$/, '</tbody>') + '</table>', 'text/html');
  const row0 = doc.querySelector('.trow[data-i="0"]');
  const cmfs = [...row0.querySelectorAll('[data-cmf]')].map(x => x.getAttribute('data-cmf'));
  ok(cmfs.indexOf('salesAmt') >= 0 && cmfs.indexOf('commissionAmt') >= 0, 'B3: 売上と歩合の両欄: ' + cmfs.join(','));
  const row1 = doc.querySelector('.trow[data-i="1"]');
  eq(row1.querySelectorAll('[data-wk]').length, 0, 'B4: 役員は割増入力なし');
});

// ── はじめかたガイド(ライブToDo): 各ステップの達成判定 ──
T('オンボーディング: 達成判定(会社名✓/サンプルemp未/確定で入力✓/出力flag✓)', function () {
  const st = A.state;
  st.company = Object.assign(st.company, { name: '株式会社 ゼロアクト' }); // 既定サンプル名
  st.employees = [A.defEmp('山田 太郎')]; st.month = '2026-06'; st.confirmed = {}; st.onboardOutput = false;
  let s = A.onboardSteps();
  eq(s[0].done, false, '既定サンプル会社名→①未完(従業員と対称)');
  eq(s[1].done, false, 'サンプルのみ→②未完');
  eq(s[2].done, false, '未確定→③未完');
  eq(s[3].done, false, '未出力→④未完');
  // 自社名に変更→①完了
  st.company.name = '有限会社サンプル商店';
  eq(A.onboardSteps()[0].done, true, '実名に変更→①完了');
  // 本物の従業員を追加→②完了
  st.employees.push(A.defEmp('佐藤 花子'));
  eq(A.onboardSteps()[1].done, true, '本物emp追加→②完了');
  // 当月を確認→③完了
  A.setConfirm(st.employees[0].id, true);
  eq(A.onboardSteps()[2].done, true, '確認済→③完了');
  // 出力→④完了
  st.onboardOutput = true;
  eq(A.onboardSteps()[3].done, true, '出力flag→④完了');
});

// ── UX#8 空状態: 在籍0名で「次の一手」CTAが出る ──
T('UX#8: 入力タブ 在籍0名→従業員追加CTA', function () {
  const st = A.state; st.employees = []; st.month = '2026-06';
  A.renderInput();
  const host = win.document.querySelector('#input-list');
  ok(/data-goto-empmaster/.test(host.innerHTML), '従業員追加CTAが出る');
  ok(/従業員がいません/.test(host.textContent), '空状態の文言');
});

// ── UX#7 月の状態バッジ: 全員確認で「確定済」、未確認で「下書き」 ──
T('UX#7: 月の状態バッジ 下書き↔確定済', function () {
  const st = A.state; const e = A.defEmp('状態'); e.id = 'ms1'; st.employees = [e]; st.month = '2026-06'; st.confirmed = {};
  A.renderInput();
  ok(/mstate-draft/.test(win.document.querySelector('#input-list').innerHTML), '未確認→下書き');
  A.setConfirm('ms1', true);
  A.renderInput();
  ok(/mstate-fixed/.test(win.document.querySelector('#input-list').innerHTML), '全員確認→確定済');
});

// ── UX#9 氏名検索: 一致しない従業員カードを隠す ──
T('UX#9: 氏名検索でカードを絞り込む', function () {
  const st = A.state; st.employees = [A.defEmp('山田 太郎'), A.defEmp('佐藤 花子'), A.defEmp('鈴木 次郎')]; st.empFilter = 'all';
  A.renderEmpMaster();
  const search = win.document.querySelector('#emp-search'); search.value = '佐藤';
  A.filterEmpSearch();
  const cards = [...win.document.querySelectorAll('#emp-list .mco')];
  const visible = cards.filter(c => c.style.display !== 'none');
  eq(visible.length, 1, '佐藤のみ表示');
  ok(/佐藤/.test(visible[0].querySelector('.mco-nm').textContent), '佐藤が残る');
  search.value = ''; A.filterEmpSearch(); // クリアで全表示に戻る
  eq([...win.document.querySelectorAll('#emp-list .mco')].filter(c => c.style.display !== 'none').length, 3, 'クリアで全員');
});

// ── UX#10 最賃割れ警告に「直す→」ジャンプ導線が出る ──
T('UX#10: 最賃割れの入力カード警告に data-fix-emp(直すリンク)', function () {
  const st = A.state; const e = A.defEmp('低賃金'); e.payType = '時給'; e.hourly = '300'; e.pref = 'tokyo';
  st.employees = [e]; st.month = '2026-06'; st.inputView = 'card'; st.confirmed = {};
  A.renderInput();
  const html = win.document.querySelector('#input-list').innerHTML;
  ok(/最低賃金/.test(html), '最賃警告が出る');
  ok(/data-fix-emp/.test(html) && /を直す/.test(html), '該当従業員へのジャンプ導線がある');
});

// ── 出勤クランプ: 出勤マイナスで負支給にならない ──
T('出勤クランプ: 日給 出勤-5 → effShukkin=0・支給非負', function () {
  const e = A.defEmp('日給'); e.payType = '日給'; e.base = '12000';
  e.kintai = [{ label: '出勤日数', value: '-5' }, { label: '欠勤日数', value: '0' }, { label: '有給取得', value: '0' }];
  eq(A.effShukkin(e), 0, 'effShukkin=0');
  ok(A.compute(e).shikyuTotal >= 0, '支給非負');
});

// ── A11y: 見た目ラベルが入力の aria-label に伝播する(SR読み上げ用) ──
T('A11y: 従業員マスタの入力に見た目ラベル由来のaria-labelが付く', function () {
  const st = A.state; const e = A.defEmp('山田 太郎'); st.employees = [e]; st.empFilter = 'all';
  st.open = st.open || {}; st.open[e.id] = true; // カードを開いて基本フィールドを描画
  A.renderEmpMaster();
  A.labelInputsA11y(win.document);
  const host = win.document.querySelector('#emp-list') || win.document;
  const q = sel => host.querySelector(sel);
  eq(q('input[data-f="name"]').getAttribute('aria-label'), '氏名', '氏名フィールド');
  eq(q('select[data-f="pref"]').getAttribute('aria-label'), '都道府県', '都道府県セレクト(hint2除外)');
  eq(q('input[data-f="commute"]').getAttribute('aria-label'), '通勤手当', '通勤手当(hint2/💡除外)');
  // .frow>.flabel を持つ入力はその見た目ラベルを名前に(placeholderより優先)
  const parse = q('input.parse-in');
  eq(parse && parse.getAttribute('aria-label'), '雑に書いて作る', '雑入力欄は見出しラベル由来の名前');
  // 数字のみplaceholderの入力に「数字だけ」の無意味なaria-labelを付けない
  const allInputs = [...host.querySelectorAll('input[aria-label]')];
  ok(allInputs.every(el => !/^[\s0-9%.,＋+\-〜()円]*$/.test(el.getAttribute('aria-label'))), '無意味な数字ラベルを付けない');
});

// ── A11y: 既存ボタンの aria-label を入力用ヘルパーが壊さない ──
T('A11y: ボタンのaria-labelは維持(labelInputsA11yはinput/selectのみ対象)', function () {
  const st = A.state; st.employees = [A.defEmp('山田 太郎'), A.defEmp('佐藤 花子')]; st.empFilter = 'all';
  A.renderEmpMaster();
  A.labelInputsA11y(win.document);
  const up = win.document.querySelector('button[data-moveup]');
  ok(!up || up.getAttribute('aria-label') === '上へ移動', '並べ替えボタンのaria-label不変');
});

// ── 警告一貫性: 表ビューの最賃⚠ tooltip がカードと同じ情報(県/時給/下回り)を持つ ──
T('警告一貫性: 表ビューの最賃⚠は「素っ気ない一言」でなく具体的な内容を伝える', function () {
  const st = A.state; const e = A.defEmp('低賃金'); e.payType = '時給'; e.hourly = '300'; e.pref = 'tokyo';
  st.employees = [e]; st.month = '2026-06'; st.confirmed = {};
  const htmlT = A.renderInputTableHTML(false);
  const dom3 = new (win.DOMParser)();
  const doc = dom3.parseFromString('<table>' + htmlT.replace(/^[\s\S]*?<tbody>/, '<tbody>').replace(/<\/tbody>[\s\S]*$/, '</tbody>') + '</table>', 'text/html');
  const mw = doc.querySelector('.tmw');
  ok(mw, '最賃⚠(.tmw)が表示される');
  const title = mw.getAttribute('title') || '';
  ok(/最低賃金/.test(title), 'tooltipに「最低賃金」');
  ok(/下回/.test(title), 'tooltipに「下回っています」(具体的説明・素っ気ない一言でない)');
  ok(/円/.test(title), 'tooltipに金額(円)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
