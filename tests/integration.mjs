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
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/\?.*$/, ''))
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

// ── 他ソフトから一括移行(CSV/Excel→従業員マスタ＋先月突合) ──
T('移行: MigrateMapがアプリに読み込まれ、テストAPIに露出', function () {
  ok(win.MigrateMap && typeof win.MigrateMap.parseCsv === 'function', 'window.MigrateMap.parseCsv');
  ok(typeof A.applyMigrationRows === 'function', 'applyMigrationRows露出');
  ok(typeof A.buildEmpFromRow === 'function', 'buildEmpFromRow露出');
});
T('移行: CSV1ファイルで複数名を一括追加・列自動マッピング・突合を実施', function () {
  const before = A.state.employees.length;
  const csv = '氏名,従業員番号,生年月日,基本給,住宅手当,通勤手当,扶養,総支給,差引支給額\n'
    + '移行 一郎,2001,1985/4/1,240000,15000,10000,2,265000,205000\n'
    + '移行 二郎,2002,1992/11/20,180000,0,5000,0,185000,150000';
  const r = win.MigrateMap.parseCsv(csv);
  eq(r.rows.length, 2, '2行パース');
  const savedMonth = A.state.month;
  const s = A.applyMigrationRows(r.rows);
  eq(s.added, 2, '2名追加');
  eq(A.state.employees.length, before + 2, 'employeesが2増える');
  eq(A.state.month, savedMonth, '突合後も state.month が復元されている(一時swapの副作用なし)');
  const e = A.state.employees[A.state.employees.length - 2]; // 移行 一郎
  eq(e.name, '移行 一郎'); eq(e.no, '2001'); eq(e.birthYmd, '1985-04-01'); eq(e.fuyou, '2'); eq(e.base, '240000');
  const labels = e.shikyu.map(x => x.label);
  ok(labels.indexOf('基本給') >= 0 && labels.indexOf('住宅手当') >= 0 && labels.indexOf('通勤手当') >= 0, '支給行=基本給/住宅手当/通勤手当');
  // 都道府県・住民税の列が無いCSV → 既定値での偽の突合をせず「要入力」に分類(監査(c)修正)
  eq(s.match + s.mismatch + s.needInput, 2, '全員を 突合 or 要入力 に分類(例外なく完了)');
  eq(s.needInput, 2, '都道府県・住民税が無いCSVは要入力(既定tokyo/12500で偽の突合をしない)');
});
T('移行: ★捏造禁止★ 読めない項目はサンプル値(山田太郎)を継承せず空にする', function () {
  const e = A.buildEmpFromRow({ name: '空 太郎', no: '', birthYmd: '', fuyou: '', hourly: '', base: '', commute: '', residentTax: '', pref: '', shikyu: [] });
  eq(e.name, '空 太郎');
  eq(e.birthYmd, '', '生年月日は空(サンプル1980-05-15を継承しない)');
  eq(e.base, '', '基本給は空(サンプル250000を継承しない)');
  eq(e.pref, '', '都道府県は空(tokyoを継承しない)');
  eq(e.residentTax, '', '住民税は空(12500を継承しない)');
  eq(e.shikyu.length, 0, '支給行は空(サンプル基本給/住宅手当を継承しない)');
});
T('移行: 都道府県・住民税・生年月日が揃えば実際に突合が走る', function () {
  const csv = '氏名,生年月日,都道府県,基本給,住民税,差引支給額\n突合 太郎,1980/1/1,東京都,250000,12500,190000';
  const r = win.MigrateMap.parseCsv(csv);
  const s = A.applyMigrationRows(r.rows);
  eq(s.needInput, 0, '必要項目が揃えば要入力にならない');
  eq(s.match + s.mismatch, 1, '実データが揃えば再計算して突合(一致 or 要確認)');
});

// ── K4: 台帳(pay_ledger)→明細 二度手間ゼロ。台帳ctxが compute の基本給まで通り、単一ソースで倍にならない ──
T('K4: 台帳取り込みで代行の基本給が売上×0.35 に置き換わる(ctx→basePay→compute)', function () {
  // 代行: 固定0 + max(売上35%, 時給1200保障)。従業員フィールドには売上を入れない=台帳から来ることを証明。
  const e = Object.assign(A.defEmp('代行太郎'), { id: 'led-e1', payType: 'カスタム',
    payRule: { fixed: '0', variable: { mode: 'max', parts: [{ type: 'rate', amount: '35' }, { type: 'hourly', amount: '1200' }] } },
    salesAmt: '', dailyEntries: [] });
  // 台帳: 当月に売上30万ぶんの行(uriage合計=300000・分は0) → max(30万×0.35=105,000, 時給1200×0h=0)=105,000
  const rows = [
    { employee_id: 'led-e1', ymd: '2026-07-03', data: { uriage: 150000 } },
    { employee_id: 'led-e1', ymd: '2026-07-20', data: { uriage: 150000 } }
  ];
  const r = A.applyLedgerToEmployees([e], rows);
  eq(r.matched, 1, '1人取り込み');
  eq(A.payRuleCtx(e).sales, 300000, '★ctx.sales が台帳の売上合計=300000(フィールドは空)');
  eq(A.payRuleCtx(e).workMin, 0, '★分は台帳由来=0(単一ソース。フィールドの標準160hを混ぜない)');
  eq(win.PayRule.basePay(e.payRule, A.payRuleCtx(e)).base, 105000, '★基本給=売上×0.35=105,000(ctx→basePay)');
  const after = A.compute(e);
  ok(isFinite(after.net) && Math.abs(after.net - (after.shikyuTotal - after.kojoTotal)) <= 2, 'compute整合(差引=支給-控除)');
});

T('K4 ★§5-2: 台帳と同じ日の dailyEntries を二重計上しない(commission)', function () {
  // commission型: 変動=commission(amount合計をそのまま基本給に)。
  const e = Object.assign(A.defEmp('歩合花子'), { id: 'led-e2', payType: 'カスタム',
    payRule: { fixed: '0', variable: { mode: 'max', parts: [{ type: 'commission', amount: '', label: '歩合' }] } },
    // dailyEntries: 台帳と同じ 2026-07-03 に 9999(★捨てられるべき)
    dailyEntries: [{ ymd: '2026-07-03', hm: '', amount: '9999' }] });
  const rows = [
    { employee_id: 'led-e2', ymd: '2026-07-03', data: { amount: 5000 } },
    { employee_id: 'led-e2', ymd: '2026-07-03', data: { amount: 3000 } }
  ];
  A.applyLedgerToEmployees([e], rows);
  eq(A.payRuleCtx(e).commission, 8000, '★台帳のみ=8000(9999を足して17999にしない=単一ソース)');
});

T('K4 §3: 台帳の非課税分(hikazei)は総支給・手取りに入り、課税(源泉)には入らない', function () {
  const e = Object.assign(A.defEmp('実費太郎'), { id: 'led-h1', payType: 'カスタム',
    payRule: { fixed: '200000', variable: { mode: 'none', parts: [] } }, dailyEntries: [] });
  const before = A.compute(e);
  // 台帳: 課税amount 0・非課税(実費)amount 3000 の行
  A.applyLedgerToEmployees([e], [{ employee_id: 'led-h1', ymd: '2026-07-03', data: { amount: 3000, hikazei: true } }]);
  const after = A.compute(e);
  eq(after.shikyuTotal - before.shikyuTotal, 3000, '★総支給が非課税3000ぶん増える');
  // ★核心(§3): 課税に混ぜない → 所得税は据え置き。
  eq(after.tax, before.tax, '★所得税は非課税3000では増えない(課税に混ぜない)');
  // 非課税でも社保/雇用保険は対象(通勤手当と同じ既存仕様) → 手取り増=3000−(増えた控除ぶん)。支給保存則で確認。
  const netD = after.net - before.net, kojoD = after.kojoTotal - before.kojoTotal;
  eq(netD + kojoD, 3000, '★支給保存: 手取り増+控除増=3000(非課税ぶんは所得税以外の社保/雇用のみ増)');
  ok(kojoD >= 0 && kojoD < 200, '控除増は雇用保険/社保ぶんの少額のみ(所得税は増えていない): kojoD=' + kojoD);
});

T('K4: 最賃判定の時給も台帳workMinを使う(基本給と同じソース=一貫性)', function () {
  const e = Object.assign(A.defEmp('最賃太郎'), { id: 'led-mw', payType: 'カスタム', pref: 'tokyo',
    payRule: { fixed: '200000', variable: { mode: 'none', parts: [] } }, dailyEntries: [] });
  // 台帳: 当月 100時間(6000分)を計上 → 最賃時給 = 200000 ÷ 100h = 2000円/h
  A.applyLedgerToEmployees([e], [
    { employee_id: 'led-mw', ymd: '2026-07-03', data: { minutes: 3000 } },
    { employee_id: 'led-mw', ymd: '2026-07-20', data: { minutes: 3000 } }
  ]);
  const mw = A.minWageInfo(e);
  ok(mw && mw.hourly === 2000, '★最賃時給=200000/100h=2000(台帳の分を分母に。before=' + (mw && mw.hourly) + ')');
});

T('K4: 台帳から外れた人の _ledgerCtx は次の取り込みで消える(stale防止)', function () {
  const e = Object.assign(A.defEmp('元太郎'), { id: 'led-e3', payType: 'カスタム',
    payRule: { fixed: '0', variable: { mode: 'max', parts: [{ type: 'rate', amount: '35' }] } } });
  A.applyLedgerToEmployees([e], [{ employee_id: 'led-e3', ymd: '2026-07-03', data: { uriage: 100000 } }]);
  ok(A.payRuleCtx(e).sales === 100000, '1回目=台帳ctx');
  A.applyLedgerToEmployees([e], []); // 台帳が空(この人の行が無くなった)
  ok(!e._ledgerCtx, '★_ledgerCtxが消える → フィールド由来ctxに戻る(stale売上を残さない)');
});

T('K4: 月範囲 monthYmdRange が月初〜月末を返す(うるう/月末差)', function () {
  eq(A.monthYmdRange('2026-07').from, '2026-07-01'); eq(A.monthYmdRange('2026-07').to, '2026-07-31', '7月=31日');
  eq(A.monthYmdRange('2026-02').to, '2026-02-28', '2026年2月=28日'); eq(A.monthYmdRange('2024-02').to, '2024-02-29', 'うるう年2月=29日');
  eq(A.monthYmdRange('2026-11').to, '2026-11-30', '11月=30日');
});

// ── ② 社保 加入判定（誤警告ゼロ最優先）: app.js配線（週所定→判定→警告HTML） ──
function empShaho(over) {
  // 健保・厚年をオフにしたパート(時給)を作る。over で上書き。
  return Object.assign(A.defEmp('パート'), { payType: '時給', hourly: '1500', weeklyScheduledH: '', honninKinrou: false,
    apply: { health: false, pension: false } }, over || {});
}
T('② 3/4基準: 週30h(=正社員40h×3/4)で社保オフ → 加入対象の警告が出る(規模不問)', function () {
  A.state.company.dailyWorkH = '8'; A.state.company.dailyWorkM = '0'; A.state.company.holidays = [0, 6]; // 週40h(月-金)
  A.state.company.shakaTokutei = false; // 小さい会社でも3/4は出る
  eq(A.fullTimeWeeklyH(), 40, '正社員週所定=8h×5日=40h');
  const w = A.shahoKanyuWarn(empShaho({ weeklyScheduledH: '30' }));
  ok(/加入対象の可能性/.test(w) && /3\/4/.test(w), '3/4警告が出る: ' + w.slice(0, 40));
});
T('★② 誤警告ゼロ: 特定適用OFF(小さい会社)は週25h・高月収でも適用拡大を出さない', function () {
  A.state.company.dailyWorkH = '8'; A.state.company.holidays = [0, 6]; A.state.company.shakaTokutei = false;
  // 週25h=3/4(30h)未満 → 3/4非該当。トグルOFF → 適用拡大も出さない → 警告なし。
  const w = A.shahoKanyuWarn(empShaho({ weeklyScheduledH: '25', hourly: '2000' }));
  eq(w, '', '★小さい会社では出さない(入らなくていいパートに誤警告しない)');
});
T('② 適用拡大: 特定適用ON+週25h(3/4未満)+月8.8万以上+非学生 → 加入対象の警告', function () {
  A.state.company.dailyWorkH = '8'; A.state.company.holidays = [0, 6]; A.state.company.shakaTokutei = true;
  // 時給2000×週25h×52/12 ≈ 216,666 ≥ 88,000
  const w = A.shahoKanyuWarn(empShaho({ weeklyScheduledH: '25', hourly: '2000' }));
  ok(/加入対象の可能性/.test(w) && /適用拡大/.test(w), '適用拡大警告: ' + w.slice(0, 40));
});
T('★② 学生は除外: 特定適用ON+週25h+高月収でも勤労学生なら出さない', function () {
  A.state.company.shakaTokutei = true; A.state.company.holidays = [0, 6];
  const w = A.shahoKanyuWarn(empShaho({ weeklyScheduledH: '25', hourly: '2000', honninKinrou: true }));
  eq(w, '', '学生→適用拡大は出さない');
});
T('② 月88,000円未満は適用拡大を出さない(特定適用ON・週20h・低時給)', function () {
  A.state.company.shakaTokutei = true; A.state.company.holidays = [0, 6];
  // 時給1000×週20h×52/12 ≈ 86,666 < 88,000
  const w = A.shahoKanyuWarn(empShaho({ weeklyScheduledH: '20', hourly: '1000' }));
  eq(w, '', '月88,000円未満→出さない(概算約86,666)');
});
T('② 週所定 未入力なら判定しない(誤警告防止)', function () {
  A.state.company.shakaTokutei = true;
  eq(A.shahoKanyuWarn(empShaho({ weeklyScheduledH: '' })), '', '週所定空=出さない');
});
T('② 既に健保・厚年オンの人には注意を出さない(加入済み)', function () {
  A.state.company.shakaTokutei = true; A.state.company.holidays = [0, 6];
  const e = empShaho({ weeklyScheduledH: '30', apply: { health: true, pension: true } });
  eq(A.shahoKanyuWarn(e), '', '社保オン=加入済み→注意不要');
});
T('② 業務委託・役員には出さない', function () {
  A.state.company.shakaTokutei = true;
  eq(A.shahoKanyuWarn(empShaho({ weeklyScheduledH: '40', employmentType: 'contractor' })), '', '業務委託は対象外');
  eq(A.shahoKanyuWarn(empShaho({ weeklyScheduledH: '40', payType: '役員' })), '', '役員は対象外');
});
T('② 回帰: 従来の逆向き警告(社保オフ→加入かも)は残っている(月給・常用)', function () {
  const e = Object.assign(A.defEmp('常用'), { payType: '月給', base: '300000', apply: { health: false, pension: false } });
  // shahoKanyuWarnは週所定空で出ないが、既存のshahoOffWarnはcompute経由の別警告。ここでは共存(クラッシュしない)を確認。
  ok(typeof A.shahoKanyuWarn(e) === 'string', 'shahoKanyuWarnは文字列を返す(週所定空=空文字)');
  eq(A.shahoKanyuWarn(e), '', '週所定空なら②は出さない(逆向き警告は別途shahoOffWarnが担当)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
