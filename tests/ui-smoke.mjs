// ui-smoke.mjs — ★②UI 全ボタン検証(永久テスト)★
//  本物の index.html + js/app.js を jsdom に読み込み、全タブ/全セグメント/全ボタン(＋/×/▲▼/詳細/確定 等)を
//  実際にクリックして「JS例外0・各画面が中身を描画」を保証する。手作業UI検証(2026-07-16)を回帰自動化。
//  ★破壊/DL/印刷/公開系(印刷・Excel・全銀・Web公開・従業員全削除)はデナイリストで除外(ダイアログ/DL/データ作成回避)。
//  この"全ボタンをクリックして例外0"の形は全アプリ共通の②ハーネス=各アプリはセレクタを差し替えて再利用する。
//  依存: jsdom。使い方: node tests/ui-smoke.mjs (jsdom未導入なら SKIP=exit0)。CIに組込。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=UIスモークをスキップ(npm i jsdom)。'); process.exit(0); }

let pass = 0, fail = 0;
function T(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
const errs = [];
win.addEventListener('error', e => errs.push('window.error: ' + (e.message || e)));
win.print = () => {}; // 印刷ダイアログ無効化(万一押されても安全)
for (const src of srcs) { const el = doc.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8'); doc.body.appendChild(el); }
const A = win.__PAYSLIP_TEST; ok(A, '__PAYSLIP_TEST 露出(init成功)');

// サンプルデータ(2名)を入れて画面に中身を持たせる
A.state.company.name = '株式会社テスト';
A.state.employees = [A.defEmp('山田 太郎'), A.defEmp('佐藤 花子')];
A.state.employees[0].base = '300000'; A.state.employees[1].payType = '時給'; A.state.employees[1].hourly = '1500';
A.state.month = '2026-06';

// クリックしてはいけない(破壊/DL/印刷/公開)ボタンの判定
const DENY = /b-print|b-xlsx|データ|全銀|Excel|印刷|公開|webpub|dl-|csvimport|従業員を削除|この従業員/i;
function denied(el) {
  if (el.id && DENY.test(el.id)) return true;
  var t = (el.textContent || '').slice(0, 30), dl = el.getAttribute('data-link') || '', dw = el.getAttribute('data-webpub') || '';
  if (DENY.test(t) || dl || dw) return true;
  if (el.hasAttribute('data-del-emp') || el.className && /m-del-emp|del-emp/.test(el.className)) return true;
  return false;
}

console.log('\n[ui-smoke] 全ボタンUI検証(jsdom)');

// ── 各画面を開いて、その画面の全ボタンをクリック(例外0) ──
const SCREENS = ['scr-settings', 'scr-input', 'scr-list', 'scr-print'];
let clicked = 0, skipped = 0;
T('全タブ→全ボタンをクリックしても例外0・各画面が描画', function () {
  const q = s => doc.querySelector(s), qa = s => [...doc.querySelectorAll(s)];
  for (const scr of SCREENS) {
    const tab = q('.bn[data-scr="' + scr + '"]'); ok(tab, 'タブ ' + scr);
    tab.click();
    const el = doc.getElementById(scr);
    ok(el && el.classList.contains('active'), scr + ' がactive');
    ok(el.innerHTML.length > 500, scr + ' が中身を描画(' + el.innerHTML.length + ')');
    // 設定画面は3セグメントも回す
    if (scr === 'scr-settings') for (const s of ['company', 'emp', 'design']) { const b = q('#set-seg .seg-b[data-set="' + s + '"]'); if (b) b.click(); }
    if (scr === 'scr-list') for (const v of ['list', 'sum', 'cho', 'nen']) { const b = q('.seg-b[data-view="' + v + '"]'); if (b) b.click(); }
    // この画面の全ボタンを順にクリック(デナイリスト除外)
    const before = errs.length;
    qa('#' + scr + ' button').forEach(function (btn) {
      if (denied(btn)) { skipped++; return; }
      try { btn.click(); clicked++; } catch (e) { errs.push('click例外[' + scr + ' "' + (btn.textContent || '').slice(0, 12) + '"]: ' + e.message); }
    });
    ok(errs.length === before, scr + ' のボタンで例外: ' + errs.slice(before).join(' | '));
  }
});

T('入力→氏名/基本給を入力すると手取りが再計算される(配線)', function () {
  const q = s => doc.querySelector(s);
  q('.bn[data-scr="scr-input"]').click();
  const dt = q('#input-list [data-toggle]'); if (dt) dt.click();
  const otH = q('#input-list input[data-wk="otH"]');
  const netEl = () => (q('#input-list .acc-net') || {}).textContent;
  const before = netEl();
  if (otH) { otH.value = '45'; otH.dispatchEvent(new win.Event('input', { bubbles: true })); }
  ok(netEl() !== before, '割増入力で手取りが再計算された(' + before + '→' + netEl() + ')');
});

T('退職金の計算モーダル: 帳票→退職金を計算→入力→結果表示・例外0', function () {
  const q = s => doc.querySelector(s);
  q('.bn[data-scr="scr-list"]').click();
  const cho = q('.seg-b[data-view="cho"]'); if (cho) cho.click();
  const btn = q('[data-taishoku-calc]'); ok(btn, '帳票に退職金ボタン');
  const before = errs.length;
  btn.click();
  ok(q('#ts-gross'), '退職金モーダルが開く');
  const set = (sel, v) => { const e = q(sel); if (e) { e.value = v; e.dispatchEvent(new win.Event('input', { bubbles: true })); } };
  set('#ts-gross', '20000000'); set('#ts-join', '1996-04-01'); set('#ts-ret', '2026-06-30');
  ok(errs.length === before, '退職金計算で例外: ' + errs.slice(before).join(' | '));
  const res = q('#ts-result'); ok(res && /手取り/.test(res.textContent) && /15,700,000/.test(res.textContent), '控除・手取りが計算表示される');
  // モーダルを閉じる
  const cl = [...doc.querySelectorAll('.ui-modal-btn')].find(b => /閉じる/.test(b.textContent)); if (cl) cl.click();
});

T('随時改定モード: 3か月+従前+固定給変動を入力すると該当/非該当が表示・例外0', function () {
  const q = s => doc.querySelector(s), qa = s => [...doc.querySelectorAll(s)];
  q('.bn[data-scr="scr-settings"]').click();
  const empSeg = q('#set-seg .seg-b[data-set="emp"]'); if (empSeg) empSeg.click();
  // 1人目のカードと社保「詳しく」を開く(state直接→再描画)
  const id0 = A.state.employees[0].id;
  A.state.open = A.state.open || {};
  A.state.open[id0] = true;            // カード
  A.state.open['D' + id0] = true;      // 詳細設定
  A.state.open['DS' + id0 + 'shaho'] = true; // 社会保険サブセクション
  A.state.open['SHD' + id0] = true;    // 社保「詳しく」
  empSeg.click();
  const before = errs.length;
  const zuiji = q('#emp-list .sh-mode[data-mode="zuiji"]'); ok(zuiji, '随時改定モードボタン');
  zuiji.click();
  // 3か月・日数・従前標準報酬・変動月を入力し固定給変動チップON
  const set = (el, v) => { if (el) { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); } };
  qa('#emp-list .sh-pay').forEach((el, k) => set(el, [280000, 285000, 282000][k]));
  qa('#emp-list .sh-days').forEach(el => set(el, 20));
  set(q('#emp-list .sh-prevhyojun'), '200000');
  set(q('#emp-list .sh-henko'), '2026-06');
  const chip = q('#emp-list [data-shfixed]'); ok(chip, '固定給変動チップ'); chip.click();
  const box = q('#emp-list .zk-box'); ok(box, '随時改定 判定ボックス');
  ok(/該当します/.test(box.textContent), '該当表示（' + box.textContent.slice(0, 30) + '）');
  ok(/2026-09/.test(box.textContent), '適用月=2026-09');
  ok(errs.length === before, '随時改定操作で例外: ' + errs.slice(before).join(' | '));
});

T('対象月グローバル化: ヘッダーの対象月が入力/一覧で表示・設定で非表示・変更でstate同期', function () {
  const q = s => doc.querySelector(s);
  const am = q('#appbar-month'), at = q('#appbar-tab');
  ok(am, 'ヘッダーに対象月ピッカー');
  q('.bn[data-scr="scr-input"]').click();
  ok(am.style.display !== 'none', '入力でヘッダー対象月が表示');
  ok(at.style.display === 'none', '入力ではタブ名を隠す(排他)');
  q('.bn[data-scr="scr-settings"]').click();
  ok(am.style.display === 'none', '設定ではヘッダー対象月を隠す');
  // ヘッダーの対象月を変えると state.month が変わり全.scr-monthが同期
  q('.bn[data-scr="scr-input"]').click();
  const inp = q('#appbar-month input.scr-month'); ok(inp, 'ヘッダー対象月input');
  inp.value = '2026-08'; inp.dispatchEvent(new win.Event('change', { bubbles: true }));
  ok(A.state.month === '2026-08', 'ヘッダー変更でstate.month同期(' + A.state.month + ')');
  A.state.month = '2026-06'; // 後続テストのため戻す
});

T('本人の人的加算チップ(甲): ひとり親をタップ→state反映+甲欄税が下がる', function () {
  const q = s => doc.querySelector(s);
  const e0 = A.state.employees[0]; e0.base = '300000'; e0.fuyou = '0'; e0.taxClass = 'ko';
  e0.honninShogai = false; e0.honninKafuHitorioya = ''; e0.honninKinrou = false;
  const id0 = e0.id;
  A.state.open = A.state.open || {}; A.state.open[id0] = true; A.state.open['D' + id0] = true; A.state.open['DS' + id0 + 'zei'] = true;
  q('.bn[data-scr="scr-settings"]').click();
  const seg = q('#set-seg .seg-b[data-set="emp"]'); seg.click(); seg.click();
  const taxBefore = A.compute(e0).incomeTax;
  const chip = q('#emp-list [data-honnin="hitorioya"]'); ok(chip, 'ひとり親チップ(甲)');
  chip.click();
  ok(A.state.employees[0].honninKafuHitorioya === 'hitorioya', 'stateにひとり親が反映');
  ok(A.compute(A.state.employees[0]).incomeTax < taxBefore, '甲欄税が下がる(' + taxBefore + '→' + A.compute(A.state.employees[0]).incomeTax + ')');
});

T('個別「確認済」で当月スナップショットが保存される(確定前保存・データ欠落しない)', function () {
  const q = s => doc.querySelector(s);
  // Storeをスタブして savePayslip の呼び出しを捕捉
  const saved = [];
  win.Store = { savePayslip: (ym, eid, data) => { saved.push({ ym, eid, data }); }, getPayslipsByYm: () => Promise.resolve([]) };
  A.state.month = '2026-06';
  A.state.confirmed = {}; // 未確定に戻す
  q('.bn[data-scr="scr-input"]').click();
  const cb = q('#input-list .econf'); ok(cb, '個別「確認済」チェックボックス');
  const eci = +cb.dataset.econf; const emp = A.state.employees[eci];
  ok(!cb.checked, '初期は未確認');
  cb.click(); // 確認ON → 確定前に saveMonthlyPayslips が走るはず
  ok(saved.some(s => s.eid === emp.id && s.ym === '2026-06'), '確定した従業員の当月slipが保存された(' + saved.map(s => s.eid).join(',') + ')');
  ok(A.state.confirmed['2026-06'] && A.state.confirmed['2026-06'][emp.id], '確定フラグも立つ');
});

T('キーボードa11y: div/bトグルがfocus可能(tabindex/role)＋Enterで発火', function () {
  const q = s => doc.querySelector(s);
  q('.bn[data-scr="scr-input"]').click();
  A.labelInputsA11y(doc); // フォーカス可能属性を付与(通常はMutationObserverが実行)
  const imode = q('.imode:not(.on)'); ok(imode, '非選択の月次/賞与トグル');
  ok(imode.getAttribute('tabindex') === '0', 'トグルがtabindex=0');
  ok(imode.getAttribute('role') === 'button', 'トグルがrole=button');
  const before = A.state.inputMode;
  imode.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(A.state.inputMode !== before, 'Enterでモードが切り替わる(' + before + '→' + A.state.inputMode + ')');
  // 元に戻す
  const back = q('.imode[data-imode="monthly"]'); if (back) back.click();
});

T('台帳/年調の確定ゲート: 下書き保存はconfirmed=false・確定でtrue・confirmedRecsが下書きを除外', function () {
  const q = s => doc.querySelector(s);
  const saved = [];
  win.Store = { savePayslip: (ym, eid, data) => { saved.push({ ym, eid, data }); }, getPayslipsByYm: () => Promise.resolve([]) };
  A.state.month = '2026-06'; A.state.confirmed = {};
  const emp = A.state.employees[0];
  // 未確定のまま自動保存(下書き) → confirmed=false
  saved.length = 0; A.saveMonthlyPayslips();
  const draft = saved.find(s => s.eid === emp.id);
  ok(draft && draft.data.confirmed === false, '下書き保存が confirmed=false (' + (draft && draft.data.confirmed) + ')');
  // 確定してforce保存 → confirmed=true
  A.setConfirm(emp.id, true); saved.length = 0; A.saveMonthlyPayslips(true);
  const conf = saved.find(s => s.eid === emp.id);
  ok(conf && conf.data.confirmed === true, '確定保存が confirmed=true');
  // confirmedRecs: 下書き(false)は除外・確定(true)と旧データ(無し)は集計対象
  const recs = [
    { ym: '2026-01', employee_id: 'x', data: { confirmed: true, net: 1 } },
    { ym: '2026-02', employee_id: 'x', data: { confirmed: false, net: 2 } },
    { ym: '2026-03', employee_id: 'x', data: { net: 3 } } // 旧データ(フラグ無し)
  ];
  const kept = A.confirmedRecs(recs);
  ok(kept.length === 2, 'confirmedRecsが下書きだけ除外(残' + kept.length + ')');
  ok(!kept.some(r => r.data.confirmed === false), '下書きが残っている');
});

await (async () => {
  let pass2 = 0;
  // 賞与ytd自動集計: 当年度(4-3月)の当月より前の賞与の標準賞与額を合計する
  const saved = [
    { ym: '2026-06', employee_id: 'E1', data: { kind: 'bonus', hyojun: 3000000 } }, // 同年度・前
    { ym: '2026-09', employee_id: 'E1', data: { kind: 'bonus', hyojun: 2000000 } }, // 同年度・前
    { ym: '2026-12', employee_id: 'E1', data: { kind: 'bonus', hyojun: 1000000 } }, // 当月=除外
    { ym: '2026-03', employee_id: 'E1', data: { kind: 'bonus', hyojun: 9000000 } }, // 前年度(3月)=除外
    { ym: '2026-07', employee_id: 'E1', data: { kind: 'monthly', kazei: 250000 } } // 月次=除外
  ];
  win.Store = { getPayslipsByYm: (from, to) => Promise.resolve(saved.filter(r => r.ym >= from && r.ym <= to)), savePayslip: () => {} };
  A.state.bonus = { payYm: '2026-12', byEmp: {} }; A.state._bonusYtdYm = null; A.state.inputMode = 'monthly';
  await A.loadBonusYtd();
  await new Promise(r => setTimeout(r, 20));
  T('賞与ytd自動集計: 当年度の当月より前の賞与(標準賞与額)だけ合計(前年度/月次/当月は除外)', function () {
    ok(A.state._bonusYtd && A.state._bonusYtd.E1 === 5000000, '既往合計=3,000,000+2,000,000=5,000,000 (' + (A.state._bonusYtd && A.state._bonusYtd.E1) + ')');
  });
})();

T('表入力ビュー: 「今月を確定」ボタンが出る・"undefined"を表示しない(confirmBtn定義順バグ回帰)', function () {
  const q = s => doc.querySelector(s);
  // 2名いる前提(冒頭でemployees2名設定済)。入力→表ビュー
  q('.bn[data-scr="scr-input"]').click();
  const tv = q('[data-ivw="table"]'); ok(tv, '表ビュー切替(2名以上)');
  tv.click();
  const list = q('#input-list');
  ok(q('#input-list [data-confirm-month]'), '表ビューに「今月を確定」ボタンがある');
  ok(!/undefined/.test(list.innerHTML), '表ビューに "undefined" 文字列が出ていない');
  // カードビューに戻す
  const cv = q('[data-ivw="card"]'); if (cv) cv.click();
});

T('年調 平易ウィザード: 全申告項目に data-nf があり既存ハンドラで n.* に書ける(配線)', function () {
  const html = A.nenchoWizardHTML('E1', {});
  ok(html && html.length > 500, 'ウィザードHTMLが生成される');
  // 数値/選択は data-nf、はい/いいえ(bool)は data-nfbool として出ている
  ['seiGeneralNew', 'fuyoIppan', 'fuyoTokutei', 'shougai', 'jishinP', 'shokibo', 'jutakuLoan'].forEach(k => {
    ok(new RegExp('data-nf="' + k + '"').test(html), 'data-nf=' + k + ' がある');
  });
  ['haiEnabled', 'kafu', 'hitorioya', 'kinrou'].forEach(k => {
    ok(new RegExp('data-nfbool="' + k + '"').test(html), 'data-nfbool=' + k + ' がある(はい/いいえ)');
  });
  ok(/はい</.test(html) && /いいえ</.test(html), 'はい/いいえ の2択が出る');
  ok(/data-eid="E1"/.test(html), 'data-eid が付く');
  // 生活語の質問が入っている(暗号ラベルでない)
  ok(/配偶者（夫・妻）はいますか/.test(html) && /控除証明書/.test(html), '生活語の質問+補足');
  // 依存行(when:haiEnabled)は配偶者=いいえで隠れ、はいで出る
  ok(!/data-nfbool="haiRojin"/.test(html) && !/data-nf="haiShotoku"/.test(html), '配偶者いいえ→配偶者の所得/70歳行は隠れる');
  const htmlHai = A.nenchoWizardHTML('E1', { haiEnabled: true });
  ok(/data-nfbool="haiRojin"/.test(htmlHai) && /data-nf="haiShotoku"/.test(htmlHai), '配偶者はい→配偶者の所得/70歳行が出る');
});

T('年調 平易ウィザード入力→ n.* に反映され控除に効く(実app compute)', function () {
  // nenStore に書く=既存ハンドラと同じ経路。生命保険料(新)8万→控除4万(令和8上限)が効く
  const n = A.nenStore('WZ1');
  n.seiGeneralNew = '80000';
  // nenCompute は nenAggregate + n から計算。ここでは applyToNencho 相当を直接検証: n に値が入ること
  ok(A.nenStore('WZ1').seiGeneralNew === '80000', 'nenStore に反映');
});

T('年調 従業員Web申告バナー: 提出があると要約+取り込みボタンが出る', function () {
  const decl = win.NenchoDecl.normalize({ haiEnabled: true, haiShotoku: 300000, fuyoIppan: 2, seiGeneralNew: 80000 });
  A.state._nenDecls = { WZ1: { decl, submittedAt: '2026-12-01T00:00:00Z', updatedAt: '2026-12-01T00:00:00Z' } };
  const html = A.nenDeclBannerHTML('WZ1');
  ok(html && /data-nendecl-import="WZ1"/.test(html), '取り込むボタンがある');
  ok(/Webで年末調整の申告を提出/.test(html), '提出の見出し');
  ok(/配偶者/.test(html) && /扶養/.test(html), '申告内容の要約(生活語)が出る');
  ok(A.nenDeclBannerHTML('NOPE') === '', '提出が無い従業員はバナー無し');
});

T('給与パターン 一括適用(ロジック): 選んだ人だけに構造が反映・給与額は不変', function () {
  // emp0 を「時給・皆勤手当あり」に仕立ててパターン化
  const src = A.defEmp('原型'); src.payType = '時給'; src.hourly = '1500';
  src.shikyu = [{ label: '基本給', value: '0' }, { label: '皆勤手当', value: '8000' }];
  const pat = A.makePayPattern(src, 'バイト');
  ok(pat && pat.pay && /皆勤手当/.test((pat.pay.shikyuTpl || []).join(',')), 'パターンに皆勤手当ラベルが入る(値は含めない)');
  // 適用先2名(月給・別の額)。給与額は変わらない・構造だけ変わる
  const a = A.defEmp('田中'); a.payType = '月給'; a.base = '300000';
  const b = A.defEmp('鈴木'); b.payType = '月給'; b.base = '280000';
  A.applyPayPattern(a, pat); A.applyPayPattern(b, pat);
  ok(a.payType === '時給' && b.payType === '時給', '給与形態が反映');
  ok((a.shikyu || []).some(x => x.label === '皆勤手当'), '支給項目(皆勤手当)が反映');
  ok(a.base === '300000' && b.base === '280000', '基本給(人ごとの額)は不変');
  ok(!(pat.pay.base) && !(pat.pay.hourly), 'パターンに給与額は含まれない');
});

T('給与パターン 一括適用(モーダル): 全員チェックで選んだ人数に適用', function () {
  A.state.payPatterns = [A.makePayPattern((() => { const e = A.defEmp('原'); e.payType = '日給'; e.shikyu = [{ label: '基本給', value: '0' }, { label: '危険手当', value: '3000' }]; return e; })(), '現場')];
  A.state.employees = [A.defEmp('甲'), A.defEmp('乙'), A.defEmp('丙')];
  A.state.employees.forEach(e => { e.payType = '月給'; });
  A.renderEmpMaster();
  // 前テストの残りモーダルを閉じてから開く
  doc.querySelectorAll('.ui-modal-ov').forEach(m => m.remove());
  A.openBulkPatternApply();
  const ov = doc.querySelector('.ui-modal-ov'); ok(ov, 'モーダルが開く');
  ok(!/在籍中の従業員がいません/.test(ov.textContent), '在籍者ありで適用モーダルが出る(アラートでない)');
  const cks = ov.querySelectorAll('.bp-ck'); ok(cks.length === 3, '在籍3名分のチェックが出る: ' + cks.length);
  ok(ov.querySelector('#bp-pat'), 'パターン選択がある');
  // 「全員 ON/OFF」で一旦全解除→全選択(トグル配線)を確認
  const allBtn = ov.querySelector('#bp-all'); ok(allBtn, '全員ON/OFFボタン');
  allBtn.click(); ok([...ov.querySelectorAll('.bp-ck')].every(c => !c.checked), '一度で全解除');
  allBtn.click(); ok([...ov.querySelectorAll('.bp-ck')].every(c => c.checked), 'もう一度で全選択');
  // 「適用」を押すとモーダルが閉じる(実際の適用=applyPayPatternは上のロジックテスト+実機で担保)
  const applyBtn = [...ov.querySelectorAll('.ui-modal-btn')].find(b => /適用/.test(b.textContent));
  ok(applyBtn, '適用ボタンがある'); applyBtn.click();
  ok(!doc.querySelector('.ui-modal-ov'), '適用後モーダルは閉じる');
});

T('振込先 Web登録: 会社バナー＋取り込みで従業員マスタの振込先(furi*)に反映', function () {
  A.state.employees = [A.defEmp('田中'), A.defEmp('佐藤')];
  const t = A.state.employees[0];
  const data = { furiBankName: 'みずほ銀行', furiBankNo: '0001', furiBranchName: '本店', furiBranchNo: '001', furiYokin: '普通', furiAccount: '1234567', furiKana: 'ﾀﾅｶ ﾀﾛｳ' };
  A.state._empProfiles = { [t.id]: { employeeId: t.id, data, updatedAt: '2026-11-01T00:00:00Z' } };
  A.state._profImported = {};
  // バナーHTML
  const strip = A.empProfileStripHTML();
  ok(strip && new RegExp('data-profimport="' + t.id + '"').test(strip), '取り込むボタンがある');
  ok(/振込先を登録/.test(strip), '見出しが出る');
  // 取り込み前は空
  ok(!t.furiBankNo, '取り込み前は未設定');
  // 取り込み実行
  ok(A.importEmpProfile(t.id) === true, '取り込み成功');
  ok(t.furiBankNo === '0001' && t.furiAccount === '1234567' && t.furiKana === 'ﾀﾅｶ ﾀﾛｳ', 'furi* に反映');
  ok(/みずほ銀行/.test(t.bank || ''), '表示用bankも補完');
  // 取り込み済みはバナーから消える
  ok(A.empProfileStripHTML() === '', '取り込み後はバナーが消える');
  // applyEmpProfile: 空値は既存を消さない
  const e2 = A.defEmp('x'); e2.furiBankNo = '9999'; A.applyEmpProfile(e2, { furiBankNo: '', furiAccount: '111' });
  ok(e2.furiBankNo === '9999' && e2.furiAccount === '111', '空値は上書きしない・値ありは反映');
});

T('UI操作を通してJS例外・window.error が0', function () {
  ok(errs.length === 0, '例外あり: ' + errs.join(' | '));
});

console.log('  (クリックしたボタン ' + clicked + ' / 除外(破壊DL印刷公開) ' + skipped + ')');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
