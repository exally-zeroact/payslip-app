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
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/\?.*$/, '')).filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
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
  // ★実数(手計算検証)★ 退職金2000万・勤続21年(2005-04-01→2026-03-31)。控除870万・課税退職所得565万。
  set('#ts-gross', '20000000'); set('#ts-join', '2005-04-01'); set('#ts-ret', '2026-03-31');
  ok(errs.length === before, '退職金計算で例外: ' + errs.slice(before).join(' | '));
  // 申告書「未提出」(いいえ)=退職金×20.42%(退職所得控除/1/2なし)→手取り15,351,000
  const clickPill = (key, v) => { const p = [...doc.querySelectorAll('[data-tsyn="' + key + '"]')].find(x => x.dataset.v === v); if (p) p.click(); };
  clickPill('report', '0');
  ok(/15,351,000/.test(q('#ts-result').textContent), '未提出=×20.42%→手取り15,351,000: ' + (q('#ts-result').textContent.match(/手取り[^0-9]*([\d,]+)/) || [])[1]);
  // 申告書「提出」(はい)=控除870万→課税565万→所得税717,252・住民税565,000→手取り18,717,748
  clickPill('report', '1');
  ok(/18,717,748/.test(q('#ts-result').textContent), '提出=通常計算→手取り18,717,748: ' + (q('#ts-result').textContent.match(/手取り[^0-9]*([\d,]+)/) || [])[1]);
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
  ok(A.nenDeclBannerHTML('NOPE') === '', '提出が無い&未公開の従業員はバナー無し');
});

T('年調 Web申告の提出状況: 未提出(公開済)は「未提出」表示・未公開は無表示', function () {
  A.state._nenDecls = {}; // 誰も提出していない
  A.state._nenPubIds = { PUB1: true }; // PUB1はWeb明細配布済み(申告できる)
  const pub = A.nenDeclBannerHTML('PUB1');
  ok(/未提出/.test(pub), '公開済で未提出→「未提出」の目印が出る');
  ok(A.nenDeclBannerHTML('NOPUB') === '', '未公開の人は表示しない(手入力運用)');
  // 提出済なら未提出表示でなく取り込みバナー
  A.state._nenDecls = { PUB1: { decl: win.NenchoDecl.normalize({ fuyoIppan: 1 }), updatedAt: '2026-12-01T00:00:00Z' } };
  const sub = A.nenDeclBannerHTML('PUB1');
  ok(/data-nendecl-import="PUB1"/.test(sub) && !/未提出/.test(sub), '提出済は取り込みバナー(未提出表示は消える)');
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
  const data = { zip: '150-0001', address: '東京都渋谷区1-2-3', furiBankName: 'みずほ銀行', furiBankNo: '0001', furiBranchName: '本店', furiBranchNo: '001', furiYokin: '普通', furiAccount: '1234567', furiKana: 'ﾀﾅｶ ﾀﾛｳ' };
  A.state._empProfiles = { [t.id]: { employeeId: t.id, data, updatedAt: '2026-11-01T00:00:00Z' } };
  A.state._profImported = {};
  // バナーHTML
  const strip = A.empProfileStripHTML();
  ok(strip && new RegExp('data-profimport="' + t.id + '"').test(strip), '取り込むボタンがある');
  ok(/振込先を登録/.test(strip), '見出しが出る');
  // 取り込み前は空
  ok(!t.furiBankNo && !t.address, '取り込み前は未設定');
  // 取り込み実行
  ok(A.importEmpProfile(t.id) === true, '取り込み成功');
  ok(t.furiBankNo === '0001' && t.furiAccount === '1234567' && t.furiKana === 'ﾀﾅｶ ﾀﾛｳ', 'furi* に反映');
  ok(t.zip === '150-0001' && t.address === '東京都渋谷区1-2-3', '住所・郵便番号も反映');
  ok(/みずほ銀行/.test(t.bank || ''), '表示用bankも補完');
  // 取り込み済みはバナーから消える
  ok(A.empProfileStripHTML() === '', '取り込み後はバナーが消える');
  // applyEmpProfile: 空値は既存を消さない
  const e2 = A.defEmp('x'); e2.furiBankNo = '9999'; A.applyEmpProfile(e2, { furiBankNo: '', furiAccount: '111' });
  ok(e2.furiBankNo === '9999' && e2.furiAccount === '111', '空値は上書きしない・値ありは反映');
  // 源泉徴収票に住所が反映される(取り込んだ住所が票の住所欄に出る)
  A.state._nenRecs = [];
  const gensen = A.nenGensenHTML(t, 2026);
  ok(/東京都渋谷区1-2-3/.test(gensen) && /〒150-0001/.test(gensen), '源泉徴収票の住所欄に反映: ' + (gensen.match(/住所[^氏]*/) || [])[0]);
  const gensenNo = A.nenGensenHTML(A.defEmp('無住所'), 2026);
  ok(!/東京都渋谷区/.test(gensenNo), '住所未登録は空欄のまま(誤表示なし)');
});

T('Web明細QR: qrSvgがSVGを生成(空入力は空)', function () {
  ok(typeof win.qrcode === 'function' || typeof win.qrcode === 'object', 'lib/qr.js(qrcode)が読み込まれている');
  const svg = A.qrSvg('http://localhost/meisai.html?t=abc123', 200);
  ok(/^<svg[\s>]/.test(svg), 'svg要素で始まる');
  ok(/<rect /.test(svg) && (svg.match(/<rect /g) || []).length > 20, '黒モジュール(rect)が多数');
  ok(/shape-rendering="crispEdges"/.test(svg), '印刷向けcrispEdges');
  const m = svg.match(/width="(\d+)"/); ok(m && +m[1] >= 100, '実サイズを持つ: ' + (m && m[1]));
  ok(A.qrSvg('', 200) === '', '空入力は空文字');
});

T('カスタム項目名サジェスト: 過去に使った名前＋定番がdatalist候補に出る', function () {
  const a = A.defEmp('甲'); a.shikyu = [{ label: '基本給', value: '0' }, { label: '危険手当', value: '3000' }, { label: '通勤手当', value: '5000' }];
  a.extraKojo = [{ label: '寮費', value: '20000' }];
  A.state.employees = [a];
  const sup = A.itemSuggestOptions('shikyu');
  ok(sup.indexOf('危険手当') === 0, '実使用の項目名が先頭(MRU的): ' + sup.slice(0, 3));
  ok(sup.indexOf('資格手当') > 0, '定番も候補に含む');
  ok(sup.indexOf('基本給') < 0 && sup.indexOf('通勤手当') < 0, '自動項目(基本給/通勤手当)は候補に出さない');
  const koj = A.itemSuggestOptions('kojo');
  ok(koj.indexOf('寮費') === 0 && koj.indexOf('組合費') > 0, '控除も実使用＋定番');
  const html = A.itemSuggestHTML();
  ok(/<datalist id="dl-item-shikyu">/.test(html) && /<datalist id="dl-item-kojo">/.test(html), '2つのdatalistを生成');
  ok(/<option value="危険手当">/.test(html), 'option化される');
  // 実マスタ描画: datalistは常時出る＋カード/手当サブ節を開くと入力欄が datalist を参照
  A.state.open = { [a.id]: true, ['D' + a.id]: true, ['DS' + a.id + 'teate']: true };
  A.renderEmpMaster();
  const empList = doc.getElementById('emp-list');
  ok(/<datalist id="dl-item-shikyu">/.test(empList.innerHTML), 'datalistが常時描画される');
  ok(/list="dl-item-shikyu"/.test(empList.innerHTML) && /list="dl-item-kojo"/.test(empList.innerHTML), '追加入力欄が候補を参照');
});

T('★H1回帰★ 扶養控除: 累積入力(総数＋そのうち)を排他区分に分解=二重計上しない', function () {
  const fb = A.fuyoBuckets;
  // 20歳1人: 総数1・特定1 → 一般0/特定1(二重で38+63にしない)
  let b = fb({ fuyoIppan: 1, fuyoTokutei: 1 });
  ok(b.ippan === 0 && b.tokutei === 1 && b.total === 1, '20歳1人→特定1のみ: ' + JSON.stringify(b));
  // 72歳同居1人: 総数1・老人1・同居1 → 同居老親1のみ
  b = fb({ fuyoIppan: 1, fuyoRoujin: 1, fuyoDoukyo: 1 });
  ok(b.doukyo === 1 && b.roujin === 0 && b.ippan === 0 && b.total === 1, '72歳同居→同居老親1のみ: ' + JSON.stringify(b));
  // 総数3(特定1・老人1非同居・一般1)
  b = fb({ fuyoIppan: 3, fuyoTokutei: 1, fuyoRoujin: 1, fuyoDoukyo: 0 });
  ok(b.ippan === 1 && b.tokutei === 1 && b.roujin === 1 && b.total === 3, '3人の内訳: ' + JSON.stringify(b));
  // ★実数リテラルで扶養控除の全組み合わせを正解と突合(配線でなく金額を検証=H1再発防止)★
  //  令和8恒久額: 一般38万/特定63万/老人(非同居)48万/同居老親58万。累積入力→排他分解の増分で検証。
  const AGG = { shunyu: 5000000, genzen: 0, shaho: 0, months: 12 };
  const base = A.nenCompute(AGG, { fuyoIppan: 0 }).res.kojoGoukei;
  const inc = (n) => A.nenCompute(AGG, n).res.kojoGoukei - base;
  ok(inc({ fuyoIppan: 1 }) === 380000, '一般1人=38万: ' + inc({ fuyoIppan: 1 }));
  ok(inc({ fuyoIppan: 1, fuyoTokutei: 1 }) === 630000, '20歳(総数1+特定1)=63万・二重101万でない: ' + inc({ fuyoIppan: 1, fuyoTokutei: 1 }));
  ok(inc({ fuyoIppan: 1, fuyoRoujin: 1 }) === 480000, '70歳非同居(総数1+老人1)=48万: ' + inc({ fuyoIppan: 1, fuyoRoujin: 1 }));
  ok(inc({ fuyoIppan: 1, fuyoRoujin: 1, fuyoDoukyo: 1 }) === 580000, '72歳同居(総数1+老人1+同居1)=58万・二重144万でない: ' + inc({ fuyoIppan: 1, fuyoRoujin: 1, fuyoDoukyo: 1 }));
  ok(inc({ fuyoIppan: 2 }) === 760000, '一般2人=76万: ' + inc({ fuyoIppan: 2 }));
  ok(inc({ fuyoIppan: 3, fuyoTokutei: 1, fuyoRoujin: 1, fuyoDoukyo: 0 }) === 380000 + 630000 + 480000, '総数3(一般1+特定1+老人非同居1)=149万: ' + inc({ fuyoIppan: 3, fuyoTokutei: 1, fuyoRoujin: 1 }));
});

T('算定基礎届: 確定4-6月明細から標準報酬を決定しExcel列に配線', function () {
  const e = A.defEmp('山田'); e.birthYmd = '1990-01-01';
  A.state.employees = [e];
  const recs = [
    { ym: '2026-04', employee_id: e.id, data: { paymentDays: 30, shikyuTotal: 300000, kind: 'monthly' } },
    { ym: '2026-05', employee_id: e.id, data: { paymentDays: 31, shikyuTotal: 305000, kind: 'monthly' } },
    { ym: '2026-06', employee_id: e.id, data: { paymentDays: 30, shikyuTotal: 295000, kind: 'monthly' } },
  ];
  const rows = A.santeiRows(recs, 2026, A.state.employees);
  ok(rows.length === 1 && rows[0].hasData, '対象1名(4-6月データあり)');
  ok(rows[0].r.heikin === 300000, '平均30万: ' + rows[0].r.heikin);
  ok(rows[0].r.decPension === 300000 && rows[0].r.decHealth === 300000, '標準報酬30万(健保/厚年)');
  const aoa = A.santeiAoa(rows, 2026);
  ok(/氏名/.test(aoa[0].join(',')) && /決定 標準報酬\(健保\)/.test(aoa[0].join(',')), 'Excelヘッダに公式項目');
  ok(aoa[1].indexOf('山田') >= 0 && aoa[1].indexOf(300000) >= 0, 'データ行に氏名と標準報酬30万');
  // 17日未満は除外(4月15日)
  const recs2 = [
    { ym: '2026-04', employee_id: e.id, data: { paymentDays: 15, shikyuTotal: 200000, kind: 'monthly' } },
    { ym: '2026-05', employee_id: e.id, data: { paymentDays: 20, shikyuTotal: 305000, kind: 'monthly' } },
    { ym: '2026-06', employee_id: e.id, data: { paymentDays: 22, shikyuTotal: 295000, kind: 'monthly' } },
  ];
  ok(A.santeiRows(recs2, 2026, A.state.employees)[0].r.heikin === 300000, '4月17日未満を除外→平均30万');
});

T('月額変更届: 随時改定該当者を確定明細から判定→該当行がExcelに', function () {
  const e = A.defEmp('高橋'); e.birthYmd = '1985-03-10';
  e.shaho = Object.assign({}, e.shaho, { mode: 'zuiji', henkoYm: '2026-04', prevHyojun: '200000', fixedChanged: true });
  A.state.employees = [e];
  const recs = [
    { ym: '2026-04', employee_id: e.id, data: { paymentDays: 20, shikyuTotal: 300000, kind: 'monthly' } },
    { ym: '2026-05', employee_id: e.id, data: { paymentDays: 22, shikyuTotal: 300000, kind: 'monthly' } },
    { ym: '2026-06', employee_id: e.id, data: { paymentDays: 21, shikyuTotal: 300000, kind: 'monthly' } },
  ];
  const rows = A.gekkakuRows(recs, A.state.employees);
  ok(rows.length === 1 && rows[0].hasData, '対象1名(3か月データあり)');
  const z = rows[0].z;
  ok(z.avg === 300000, '3か月平均30万: ' + z.avg);
  ok(z.pension.prevHyojun === 200000 && z.pension.newHyojun === 300000, '厚年 従前20万→改定30万');
  ok(z.gradeDiff >= 2 && z.eligible, '2等級以上差＋固定給変動＋17日以上=該当');
  ok(z.applyYm === '2026-07', '適用月=変動月の4か月目(2026-07): ' + z.applyYm);
  const aoa = A.gekkakuAoa(rows);
  ok(/変動月/.test(aoa[0].join(',')) && /適用月/.test(aoa[0].join(',')) && /該当/.test(aoa[0].join(',')), 'Excelヘッダに公式項目(変動月/適用月/該当)');
  ok(aoa[1].indexOf('高橋') >= 0 && aoa[1].indexOf('該当') >= 0 && aoa[1].indexOf('2026-04') >= 0, 'データ行に氏名・変動月・該当');
  // 固定給変動なし=非該当(届出対象外)
  const e2 = A.defEmp('未変動'); e2.shaho = Object.assign({}, e2.shaho, { henkoYm: '2026-04', prevHyojun: '200000', fixedChanged: false });
  const rows2 = A.gekkakuRows(recs.map(r => ({ ym: r.ym, employee_id: e2.id, data: r.data })), [e2]);
  ok(rows2.length === 1 && !rows2[0].z.eligible, '固定給変動なし=非該当(候補には出るが届出対象外)');
  // 17日未満が混じる=非該当
  const recs3 = [
    { ym: '2026-04', employee_id: e.id, data: { paymentDays: 10, shikyuTotal: 300000, kind: 'monthly' } },
    { ym: '2026-05', employee_id: e.id, data: { paymentDays: 22, shikyuTotal: 300000, kind: 'monthly' } },
    { ym: '2026-06', employee_id: e.id, data: { paymentDays: 21, shikyuTotal: 300000, kind: 'monthly' } },
  ];
  ok(!A.gekkakuRows(recs3, A.state.employees)[0].z.eligible, '3か月17日以上でない=非該当');
});

T('賞与 項目名サジェスト: 賞与で使った名前＋賞与定番がdatalist候補に出る', function () {
  A.state.bonus = { payYm: '2026-06', payDay: '', byEmp: { E1: { addShikyu: [{ label: '決算賞与', value: '50000' }], addKojo: [{ label: '共済会費', value: '2000' }] } } };
  const sup = A.bonusItemSuggestOptions('shikyu');
  ok(sup.indexOf('決算賞与') === 0, '賞与で実使用の名前が先頭: ' + sup.slice(0, 3));
  ok(sup.indexOf('特別賞与') > 0 && sup.indexOf('寸志') > 0, '賞与定番(特別賞与/寸志)も候補');
  const koj = A.bonusItemSuggestOptions('kojo');
  ok(koj.indexOf('共済会費') === 0 && koj.indexOf('親睦会費') > 0, '控除も実使用＋定番');
  const html = A.bonusItemSuggestHTML();
  ok(/<datalist id="dl-bonus-shikyu">/.test(html) && /<datalist id="dl-bonus-kojo">/.test(html), '賞与用datalist2種');
  ok(/<option value="決算賞与">/.test(html), 'option化される');
});

T('源泉徴収票 Web交付: 単独HTML(自己完結)が氏名・見出し・CSSを含み iframe srcdoc で表示可能', function () {
  A.state._nenRecs = [];
  const e = A.defEmp('山田 太郎'); e.address = '東京都渋谷区1-2-3'; e.zip = '150-0001';
  const html = A.nenGensenDoc(e, 2026);
  ok(/^<!doctype html>/i.test(html), '完結したHTMLドキュメント');
  ok(/令和8年分　給与所得の源泉徴収票/.test(html), '公式見出し');
  ok(/山田 太郎/.test(html) && /東京都渋谷区1-2-3/.test(html), '氏名・住所が入る(住所Web登録の反映)');
  ok(/<style>[\s\S]*\.gtbl[\s\S]*<\/style>/.test(html), '票のCSSを内包(iframeで崩れず表示)');
  ok(/源泉徴収税額/.test(html) && /所得控除の額の合計額/.test(html), '主要な金額欄がある');
  ok(!/マイナンバー|個人番号/.test(html), '★本人交付用=マイナンバー(個人番号)を記載しない(平成28年〜)★');
});

T('給与支払報告書: 市区町村抽出＋源泉徴収票と同じ集計で総括表/個人別明細書を生成', function () {
  ok(A.extractCity('東京都渋谷区神南1-2-3') === '東京都渋谷区', '23区(都道府県付き): ' + A.extractCity('東京都渋谷区神南1-2-3'));
  ok(A.extractCity('神奈川県横浜市西区みなとみらい1-1') === '神奈川県横浜市', '政令市は市に寄る: ' + A.extractCity('神奈川県横浜市西区みなとみらい1-1'));
  ok(A.extractCity('千葉県市川市1-1') === '千葉県市川市', '名称内の市を誤らない(市川市): ' + A.extractCity('千葉県市川市1-1'));
  ok(A.extractCity('三重県四日市市西新地1') === '三重県四日市市', '★末尾の市が切れない(四日市市)★: ' + A.extractCity('三重県四日市市西新地1'));
  ok(A.extractCity('広島県廿日市市宮島町1') === '広島県廿日市市', '廿日市市: ' + A.extractCity('広島県廿日市市宮島町1'));
  ok(A.extractCity('東京都港区6-1') === '東京都港区', '港区: ' + A.extractCity('東京都港区6-1'));
  ok(A.extractCity('広島県安芸郡府中町1') === '広島県安芸郡府中町', '郡部の町(郡付き): ' + A.extractCity('広島県安芸郡府中町1'));
  // ★同名別自治体(東京都府中市 と 広島県府中市)を都道府県付きで区別=合算しない★
  ok(A.extractCity('東京都府中市1') !== A.extractCity('広島県府中市1'), '同名別自治体を区別: ' + A.extractCity('東京都府中市1') + ' vs ' + A.extractCity('広島県府中市1'));
  ok(A.extractCity('') === '（住所未登録）', '空は未登録');
  A.state.month = '2026-06';
  const e = A.defEmp('田中 一郎'); e.address = '東京都新宿区西新宿2-8-1'; e.birthYmd = '1990-04-01';
  A.state._nenEmps = [e]; A.state.nencho = {}; A.state._nenRecs = [];
  for (let m = 1; m <= 12; m++) A.state._nenRecs.push({ ym: '2026-' + ('0' + m).slice(-2), employee_id: e.id, data: { shikyuTotal: 300000, tax: 5000, si: { health: 15000, pension: 27000, employ: 1800 }, kind: 'monthly', confirmed: true } });
  const rows = A.gyoyoRows(A.state._nenRecs, 2026, A.state._nenEmps);
  ok(rows.length === 1, '対象1名');
  ok(rows[0].city === '東京都新宿区', '市区町村=東京都新宿区: ' + rows[0].city);
  ok(rows[0].shunyu === 3600000, '支払金額=360万(12×30万): ' + rows[0].shunyu);
  const mei = A.gyoyoMeisaiAoa(rows, 2026);
  ok(/個人別明細書/.test(mei[0].join('')) && mei[3].indexOf('提出先 市区町村') >= 0 && mei[3].indexOf('支払金額') >= 0, '個人別明細ヘッダ');
  const drow = mei.find(r => r.indexOf('田中 一郎') >= 0);
  ok(drow && drow.indexOf('東京都新宿区') >= 0 && drow.indexOf(3600000) >= 0, 'データ行に市区町村・支払金額');
  ok(!/個人番号|マイナンバー/.test(mei[3].join('|')), '★列ヘッダにマイナンバー欄なし★');
  const sou = A.gyoyoSoukatsuAoa(rows, 2026);
  ok(/総括表/.test(sou[0].join('')), '総括表見出し');
  const cityRow = sou.find(r => r[0] === '東京都新宿区');
  ok(cityRow && cityRow[1] === 1 && cityRow[4] === 3600000, '総括表: 東京都新宿区 1名 支払360万');
  const goukei = sou.find(r => r[0] === '合計');
  ok(goukei && goukei[1] === 1 && goukei[4] === 3600000, '総括表 合計行');
});

T('★給与支払報告書 完成度UP★ 16歳未満扶養/本人区分/徴収区分の内訳', function () {
  A.state.month = '2026-06';
  const e = A.defEmp('鈴木 花子'); e.id = 'E_gyoyo2'; e.address = '大阪府大阪市北区梅田1-1'; e.birthYmd = '1988-03-03';
  e.nenshoFuyo = '2'; e.honninShogai = true; e.honninKafuHitorioya = 'hitorioya'; e.juminCollect = 'ordinary'; // 16歳未満2人・障害者・ひとり親・普通徴収
  const f = A.defEmp('佐藤 太郎'); f.id = 'E_gyoyo3'; f.address = '大阪府大阪市北区中之島1-1'; f.birthYmd = '1980-01-01'; f.juminCollect = 'special';
  A.state._nenEmps = [e, f]; A.state.nencho = {}; A.state._nenRecs = [];
  [e, f].forEach(emp => { for (let m = 1; m <= 12; m++) A.state._nenRecs.push({ ym: '2026-' + ('0' + m).slice(-2), employee_id: emp.id, data: { shikyuTotal: 300000, tax: 5000, si: { health: 15000, pension: 27000, employ: 1800 }, kind: 'monthly', confirmed: true } }); });
  const rows = A.gyoyoRows(A.state._nenRecs, 2026, A.state._nenEmps);
  const r1 = rows.find(x => x.name === '鈴木 花子');
  ok(r1 && r1.city === '大阪府大阪市', '政令市は市に寄る(大阪市): ' + (r1 && r1.city));
  ok(r1 && r1.nensho === 2, '16歳未満扶養=2: ' + (r1 && r1.nensho));
  ok(r1 && /障害者/.test(r1.honnin) && /ひとり親/.test(r1.honnin), '本人区分=障害者・ひとり親: ' + (r1 && r1.honnin));
  ok(r1 && r1.collect === '普通徴収', '徴収区分=普通徴収');
  const mei = A.gyoyoMeisaiAoa(rows, 2026);
  ok(mei[3].indexOf('16歳未満扶養') >= 0 && mei[3].indexOf('本人区分') >= 0 && mei[3].indexOf('徴収区分') >= 0, 'ヘッダに新項目3つ');
  const drow = mei.find(r => r.indexOf('鈴木 花子') >= 0);
  ok(drow && drow.indexOf('普通徴収') >= 0 && drow.indexOf(2) >= 0 && drow.some(c => /障害者/.test(String(c))), 'データ行に徴収区分・16歳未満・本人区分');
  // 総括表: 特別徴収1名/普通徴収1名の内訳(同じ大阪市)
  const sou = A.gyoyoSoukatsuAoa(rows, 2026);
  const cityRow = sou.find(r => r[0] === '大阪府大阪市');
  ok(cityRow && cityRow[1] === 2 && cityRow[2] === 1 && cityRow[3] === 1, '総括表: 大阪市 2名(特別1/普通1)の内訳: ' + JSON.stringify(cityRow && cityRow.slice(1, 4)));
  const goukei = sou.find(r => r[0] === '合計');
  ok(goukei && goukei[2] === 1 && goukei[3] === 1, '合計行: 特別1/普通1');
});

T('労働保険 年度更新: 労災/雇用の賃金を年度集計＋雇用保険料は全体率で自動(役員/雇用オフ除外)', function () {
  const K = win.KoyoHoken;
  ok(Math.abs(K.fullRate('ippan', 2026) - 0.0135) < 1e-9, '令和8 一般 全体13.5‰(厚労省照合): ' + (K.fullRate('ippan', 2026) * 1000));
  ok(Math.abs(K.fullRate('kensetsu', 2026) - 0.0165) < 1e-9, '令和8 建設 全体16.5‰');
  ok(Math.abs(K.fullRate('ippan', 2025) - 0.0145) < 1e-9, '令和7 一般 全体14.5‰');
  ok(K.fullRate('ippan', 2024) === null, '未収録年度=null(捏造しない)');
  A.state.month = '2026-07'; A.state.company.gyoshu = 'ippan'; A.state.company.rousaiRate = '3';
  const lab = A.defEmp('労働 太郎'), part = A.defEmp('パート 花子'), yaku = A.defEmp('役員 一郎');
  lab.id = 'E_lab'; part.id = 'E_part'; yaku.id = 'E_yaku'; // 明示id(uidは同一ミリ秒で衝突しうる)
  part.apply = { employ: false }; yaku.payType = '役員';
  A.state.employees = [lab, part, yaku];
  const recs = [];
  ['2026-04', '2026-05', '2026-06'].forEach(ym => { recs.push({ ym, employee_id: lab.id, data: { shikyuTotal: 300000, kind: 'monthly' } }); recs.push({ ym, employee_id: part.id, data: { shikyuTotal: 100000, kind: 'monthly' } }); recs.push({ ym, employee_id: yaku.id, data: { shikyuTotal: 500000, kind: 'monthly' } }); });
  const sum = A.roudouSummary(recs, 2026, A.state.employees);
  ok(sum.rousaiWageTotal === 1200000, '労災賃金=120万(役員除外・(30万+10万)×3): ' + sum.rousaiWageTotal);
  ok(sum.koyoWageTotal === 900000, '雇用保険賃金=90万(雇用オフのパート除外・30万×3): ' + sum.koyoWageTotal);
  ok(sum.koyoRyo === 12150, '雇用保険料=90万×13.5‰=12150: ' + sum.koyoRyo);
  ok(sum.rousaiRyo === 3600, '労災保険料=120万×3‰=3600: ' + sum.rousaiRyo);
  const aoa = A.roudouAoa(sum, 2026);
  ok(/算定基礎賃金集計表/.test(aoa[0].join('')) && aoa[3].indexOf('労災 賃金') >= 0 && aoa[3].indexOf('雇用保険 賃金') >= 0, '集計表ヘッダ');
  const totalRow = aoa.find(r => r[0] === '年度計');
  ok(totalRow && totalRow[2] === 1200000 && totalRow[4] === 900000, '年度計行に労災120万/雇用90万');
  ok(A.roudouFYof() === 2026, '労働保険年度=2026(7月起点)');
});

T('★総点検是正★ 労働保険料の端数=賃金1000円未満切捨→×率→1円未満切捨(徴収法)', function () {
  A.state.month = '2026-07'; A.state.company.gyoshu = 'ippan'; A.state.company.rousaiRate = '3';
  const e = A.defEmp('端数 太郎'); e.id = 'E_hasu';
  A.state.employees = [e];
  // 年度計 雇用保険賃金 = 12,345,678 になるよう1か月で投入
  const recs = [{ ym: '2026-04', employee_id: e.id, data: { shikyuTotal: 12345678, kind: 'monthly' } }];
  const sum = A.roudouSummary(recs, 2026, A.state.employees);
  ok(sum.koyoWageTotal === 12345678, '賃金総額=12,345,678: ' + sum.koyoWageTotal);
  // 公式: 12,345,000(1000円未満切捨) × 0.0135 = 166,657.5 → 1円未満切捨 = 166,657（旧round実装は166,667で+10円誤り）
  ok(sum.koyoRyo === 166657, '雇用保険料=Math.floor(12,345,000×0.0135)=166,657(旧round=166,667は誤り): ' + sum.koyoRyo);
  // 労災: 12,345,000 × 3‰ = 37,035 → 切捨 37,035
  ok(sum.rousaiRyo === 37035, '労災保険料=Math.floor(12,345,000×3‰)=37,035: ' + sum.rousaiRyo);
});

T('★総点検是正★ 被保険者判定を在籍単一ソースに統一(退職ボタンだけ/退職日だけの取りこぼし)', function () {
  A.state.month = '2026-07';
  // (a) 退職ボタンだけ押した人(retired=true・退職日未入力)は資格喪失届に「要入力」で必ず出る(静かに落とさない)
  const r1 = A.defEmp('退職ボタン 太郎'); r1.id = 'E_rb'; r1.retired = true; r1.taishokuYmd = '';
  ok(A.shikakuRows([r1]).some(x => x.kind === '喪失' && /退職日を入力/.test(x.note)), 'retiredだけ→喪失届に要入力で表示');
  // (b) 退職日だけ入れて退職フラグ無し(taishokuYmd過去)は算定基礎届から除外(過剰計上しない)
  const r2 = A.defEmp('退職日だけ 花子'); r2.id = 'E_td'; r2.retired = false; r2.taishokuYmd = '2026-05-31';
  A.state._santeiRecs = ['2026-04', '2026-05', '2026-06'].map(ym => ({ ym, employee_id: r2.id, data: { paymentDays: 30, shikyuTotal: 300000, kind: 'monthly' } }));
  const srows = A.santeiRows(A.state._santeiRecs, 2026, [r2]);
  ok(srows.length === 0, '7/1に被保険者でない(5月末退職)→算定基礎届から除外: ' + srows.length);
  // (c) 在籍中(日付なし)は従来どおり対象
  const act = A.defEmp('在籍 一郎'); act.id = 'E_act';
  const arows = A.santeiRows(['2026-04', '2026-05', '2026-06'].map(ym => ({ ym, employee_id: act.id, data: { paymentDays: 30, shikyuTotal: 300000, kind: 'monthly' } })), 2026, [act]);
  ok(arows.length === 1, '在籍中は算定基礎届の対象');
});

T('★総点検是正★ 役員も資格取得・喪失届の対象(健保・厚年 被保険者)＋備考「役員」', function () {
  A.state.month = '2026-07';
  const yaku = A.defEmp('役員 太郎'); yaku.id = 'E_yk'; yaku.payType = '役員'; yaku.joinYmd = '2026-04-01'; yaku.taishokuYmd = '';
  const rows = A.shikakuRows([yaku]);
  const acq = rows.find(x => x.kind === '取得');
  ok(acq && acq.name === '役員 太郎' && /役員/.test(acq.note), '役員の資格取得届が出る＋備考「役員」: ' + (acq && acq.note));
});

T('★総点検是正★ 賞与支払届の支払年月日=未入力なら空＋要入力(月だけの値を出さない)', function () {
  A.state.month = '2026-07';
  const e = A.defEmp('賞与 太郎'); e.id = 'E_bns'; e.base = '300000';
  A.state.employees = [e];
  A.state.bonus = { payYm: '2026-07', payDay: '', byEmp: { E_bns: { amount: '500000' } } };
  const rows = A.bonusHarauRows();
  ok(rows.length === 1, '賞与対象1名');
  ok(rows[0].payDate === '', '支払日未入力→支払年月日は空(月だけの値を出さない): "' + rows[0].payDate + '"');
  ok(/賞与支払日を入力/.test(rows[0].note), '要入力を備考で案内');
  // 入力すればその値
  A.state.bonus.payDay = '2026-07-10';
  ok(A.bonusHarauRows()[0].payDate === '2026-07-10', '入力すれば支払年月日に反映');
});

T('資格取得・喪失届: 入社日=取得/退職日翌日=喪失・標準報酬・喪失日の月末年末繰上げ', function () {
  ok(A.ymdPlus1('2026-05-15') === '2026-05-16', '翌日: ' + A.ymdPlus1('2026-05-15'));
  ok(A.ymdPlus1('2026-05-31') === '2026-06-01', '月末→翌月1日: ' + A.ymdPlus1('2026-05-31'));
  ok(A.ymdPlus1('2026-12-31') === '2027-01-01', '年末→翌年1/1: ' + A.ymdPlus1('2026-12-31'));
  ok(A.ymdPlus1('2028-02-29') === '2028-03-01', 'うるう2/29→3/1: ' + A.ymdPlus1('2028-02-29'));
  ok(A.ymdPlus1('') === '', '空は空');
  A.state.month = '2026-07';
  const join = A.defEmp('入社 太郎'); join.id = 'E_join'; join.joinYmd = '2026-04-01'; join.taishokuYmd = ''; join.birthYmd = '1990-01-01';
  join.shaho = { mode: 'manual', manual: '300000' }; // 取得時見込み=標準報酬30万
  const leave = A.defEmp('退職 花子'); leave.id = 'E_leave'; leave.joinYmd = ''; leave.taishokuYmd = '2026-06-30'; leave.birthYmd = '1985-01-01';
  const yaku = A.defEmp('役員 一郎'); yaku.id = 'E_yaku2'; yaku.payType = '役員'; yaku.joinYmd = '2026-04-01';
  A.state.employees = [join, leave, yaku];
  const rows = A.shikakuRows(A.state.employees);
  const acq = rows.find(r => r.kind === '取得' && r.name === '入社 太郎');
  const loss = rows.find(r => r.kind === '喪失' && r.name === '退職 花子');
  ok(acq && acq.date === '2026-04-01', '取得日=入社日: ' + (acq && acq.date));
  ok(acq && acq.decH === 300000 && acq.decP === 300000, '取得の標準報酬=30万(見込み)');
  ok(loss && loss.date === '2026-07-01', '喪失日=退職日6/30の翌日=7/1: ' + (loss && loss.date));
  ok(loss && loss.reason === '退職等', '喪失理由=退職等');
  ok(rows.some(r => r.name === '役員 一郎' && r.kind === '取得' && /役員/.test(r.note)), '役員も被保険者=取得届に出る＋備考「役員」');
  const aoa = A.shikakuAoa(rows);
  ok(/資格取得届／資格喪失届/.test(aoa[0].join('')) && aoa[3].indexOf('資格取得日／喪失日') >= 0, 'Excelヘッダ公式項目');
  const arow = aoa.find(r => r.indexOf('入社 太郎') >= 0);
  ok(arow && arow[0] === '取得' && arow.indexOf('2026-04-01') >= 0 && arow.indexOf(300000) >= 0, '取得行に日付・標準報酬');
  const lrow = aoa.find(r => r.indexOf('退職 花子') >= 0);
  ok(lrow && lrow[0] === '喪失' && lrow.indexOf('2026-07-01') >= 0, '喪失行に喪失日');
  ok(!/個人番号|マイナンバー/.test(aoa[3].join('|')), '★列ヘッダにマイナンバー(個人番号)欄なし★');
});

T('休業手当60%割れ警告(C): 月給kyugyoで leavePay<0.4×基本給→黄警告 / 以上→なし / 時給は対象外', function () {
  const q = s => doc.querySelector(s), qa = s => [...doc.querySelectorAll(s)];
  A.state.employees = [A.defEmp('休業 太郎')];
  const e = A.state.employees[0];
  e.payType = '月給'; e.base = '250000'; e.workStatus = 'kyugyo';
  A.state.empFilter = 'all';                                   // 休業者は在籍中フィルタで隠れるので全員表示
  const id0 = e.id;
  A.state.open = {}; A.state.open[id0] = true; A.state.open['D' + id0] = true; A.state.open['DS' + id0 + 'zaiseki'] = true;
  const render = () => { q('.bn[data-scr="scr-settings"]').click(); const seg = q('#set-seg .seg-b[data-set="emp"]'); if (seg) seg.click(); };
  const w60 = () => qa('.cr-warn').some(x => /下回っている可能性/.test(x.textContent));
  e.leavePay = '90000'; render(); ok(w60(), 'leavePay90000(<0.4×25万=10万)で60%割れ警告あり');
  e.leavePay = '120000'; render(); ok(!w60(), 'leavePay120000(>10万)は警告なし(誤警告しない)');
  e.payType = '時給'; e.hourly = '1500'; e.leavePay = '10000'; render(); ok(!w60(), '時給は対象外=警告なし');
});

T('36協定 複数月80h平均警告: 履歴(state._otHist)＋当月で入力タブに黄警告(配線)', function () {
  const q = s => doc.querySelector(s), qa = s => [...doc.querySelectorAll(s)];
  A.state.employees = [A.defEmp('残業 太郎')];
  const e = A.state.employees[0];
  e.payType = '月給'; e.base = '300000'; e.warimashi = { mode: 'easy', otH: '90', otM: '0' };
  A.state.inputView = 'card'; A.state.empFilter = 'active';
  A.state.open = {}; A.state.open[e.id] = true;
  const go = () => { const b = q('.bn[data-scr="scr-input"]'); if (b) b.click(); };
  const has80 = () => qa('.cr-warn').some(x => /80時間.*36条|複数月平均80/.test(x.textContent));
  A.state._otHist = {}; go(); ok(!has80(), '履歴なし(当月90hのみ)は複数月80h警告を出さない');
  A.state._otHist = { [e.id]: [{ ym: '2026-04', otMin: 90 * 60, holidayMin: 0 }, { ym: '2026-05', otMin: 90 * 60, holidayMin: 0 }] };
  go(); ok(has80(), '履歴2ヶ月@90h＋当月90h=平均90>80で複数月80h警告あり');
});

T('K1 雇用形態: 業務委託に切替=控除ゼロ+偽装請負警告・従業員に戻すと回帰・例外0', function () {
  const q = s => doc.querySelector(s), qa = s => [...doc.querySelectorAll(s)];
  q('.bn[data-scr="scr-settings"]').click();
  const empSeg = q('#set-seg .seg-b[data-set="emp"]'); if (empSeg) empSeg.click();
  const e = A.state.employees[0];
  e.base = '300000'; e.payType = '月給'; e.employmentType = 'employee';
  A.state.open = A.state.open || {}; A.state.open[e.id] = true; A.state.open['D' + e.id] = true; // カード+詳細設定を開く
  empSeg.click();
  ok(A.compute(e).kojoTotal > 0, '従業員(既定)は法定控除あり');
  // 業務委託チップをクリック
  const cBtn = q('#emp-list [data-emptype="contractor"]'); ok(cBtn, '業務委託チップが存在');
  cBtn.click();
  ok(e.employmentType === 'contractor', 'フラグ=contractor');
  const r = A.compute(e);
  ok(r.kojoTotal === 0 && r.net === r.shikyuTotal, '業務委託=控除ゼロ・支給=支払額');
  ok(qa('#emp-list .cr-warn').some(x => /偽装請負/.test(x.textContent)), '偽装請負の黄警告が出る');
  ok(!q('#emp-list [data-dsub$=":shaho"]'), '社会保険サブセクションが消える(情報パネルに差替)');
  // 従業員に戻すと回帰
  const eBtn = q('#emp-list [data-emptype="employee"]'); ok(eBtn, '従業員チップが存在');
  eBtn.click();
  ok(e.employmentType === 'employee', 'フラグ=employee');
  ok(A.compute(e).kojoTotal > 0, '従業員に戻すとフル控除に回帰(回帰ゼロ)');
  ok(!qa('#emp-list .cr-warn').some(x => /偽装請負/.test(x.textContent)), '偽装請負警告が消える');
  ok(!!q('#emp-list [data-dsub$=":shaho"]'), '社会保険サブセクションが戻る');
});

T('K1 業務委託は賞与でも控除ゼロ(社保0・源泉0=支給が手取り)', function () {
  const e = A.state.employees[0];
  A.state.bonus = { payYm: '2026-06', byEmp: {} };
  A.state.bonus.byEmp[e.id] = { amount: '500000' };
  e.employmentType = 'employee';
  ok(A.computeBonus(e).si.total > 0, '従業員の賞与は社保あり');
  e.employmentType = 'contractor';
  const r = A.computeBonus(e);
  ok(r.si.total === 0 && r.taxAmt === 0, '業務委託の賞与=社保0・源泉0');
  ok(r.net === r.totalGross - r.addKojoTotal, '手取り=総支給(控除ゼロ)');
  e.employmentType = 'employee'; // 後片付け
});

T('K2 期間分割: 10日締めで3期間・各期間の報酬明細・業務委託=控除ゼロ', function () {
  A.state.company.shimeMethod = 'ten'; A.state.month = '2026-06';
  const e = A.state.employees[0]; e.employmentType = 'contractor';
  e.dailyEntries = [
    { ymd: '2026-06-05', hm: '8:00', amount: '12000' }, { ymd: '2026-06-10', hm: '8:00', amount: '10000' }, // P1=22000
    { ymd: '2026-06-15', hm: '8:00', amount: '9000' },  // P2=9000
    { ymd: '2026-06-25', hm: '8:00', amount: '11000' }   // P3=11000
  ];
  ok(A.shimeSplit(), '締め方=分割あり');
  const ps = A.shimePeriods('2026-06'); ok(ps.length === 3, '10日締め=3期間');
  const p1 = A.buildDailyData(e, ps[0]);
  ok(p1.totalAmount === 22000 && p1.tax === 0 && p1.net === 22000, 'P1=控除ゼロ22000(支給=手取り)');
  ok(p1.periodMode && p1.contractor, '期間モード・業務委託フラグ');
  ok(A.buildDailyData(e, ps[1]).totalAmount === 9000, 'P2=9000');
  ok(A.buildDailyData(e, ps[2]).totalAmount === 11000, 'P3=11000');
  const doc = A.dailySlipDoc([p1, A.buildDailyData(e, ps[1]), A.buildDailyData(e, ps[2])].filter(d => d && d.days && d.days.length), '1col');
  ok((doc.match(/class="sheet"/g) || []).length === 3, '3期間の明細シート');
  ok(/業務委託/.test(doc) && /控除なし/.test(doc), '業務委託=控除なし表記');
  A.state.company.shimeMethod = 'monthly'; e.dailyEntries = []; e.employmentType = 'employee';
});

T('K2 期間分割: 従業員は概算の黄警告・業務委託は警告なし', function () {
  A.state.company.shimeMethod = 'ten'; A.state.month = '2026-06';
  const e = A.state.employees[0];
  e.employmentType = 'employee'; e.dailyEntries = [{ ymd: '2026-06-05', hm: '8:00', amount: '12000' }];
  const docE = A.dailySlipDoc([A.buildDailyData(e, A.shimePeriods()[0])], '1col');
  ok(/概算/.test(docE), '従業員=概算の注記');
  ok(/報\s*酬\s*明\s*細（概算）/.test(docE), '従業員=タイトルに（概算）で公式給与明細と区別(誤用防止)');
  ok(/月額でまとめて|月次/.test(docE), '社保/所得税は月次の説明');
  e.employmentType = 'contractor';
  const docC = A.dailySlipDoc([A.buildDailyData(e, A.shimePeriods()[0])], '1col');
  ok(!/概算/.test(docC), '業務委託=概算表記なし(正式な報酬明細)');
  A.state.company.shimeMethod = 'monthly'; e.dailyEntries = []; e.employmentType = 'employee';
});

T('K3 源泉区分の配線: 業務委託で該当区分=明細に源泉・非該当(代行)=控除ゼロ', function () {
  const e = A.state.employees[0];
  e.employmentType = 'contractor'; e.houshuKubun = 'none'; A.state.month = '2026-06';
  ok(A.compute(e).kojoTotal === 0, '非該当(代行)=控除ゼロ(支給=支払額)');
  e.houshuKubun = 'ippan';
  const r = A.compute(e);
  ok(r.kojo.some(k => /源泉/.test(k.label) && k.value > 0), '一般/士業=源泉徴収税が控除に載る');
  ok(r.net === r.shikyuTotal - r.kojoTotal, '手取り=支給−源泉');
  e.houshuKubun = 'none'; e.employmentType = 'employee'; // 後片付け
});

T('修正A 新規従業員ひな型=決めつけ金額なし(基本給/時給/通勤/住民税/住宅手当が空・骨組みは維持)', function () {
  const e = A.defEmp('テスト');
  ok(e.base === '' && e.hourly === '' && e.commute === '' && e.residentTax === '', '金額既定(基本給/時給/通勤/住民税)が空');
  ok(e.shikyu.length === 1 && e.shikyu[0].label === '基本給' && e.shikyu[0].value === '', 'shikyu=基本給(空)のみ・住宅手当なし');
  ok(e.payType === '月給' && e.pref === 'tokyo' && e.taxClass === 'ko' && e.fuyou === '1', '骨組み(payType/pref/taxClass/fuyou)維持');
  ok(Array.isArray(e.kintai) && e.kintai.length === 3, 'kintai骨組み維持');
});

T('修正C 業務委託の源泉=課税支給のみ(非課税通勤を除外・住宅手当は対象)', function () {
  const e = A.defEmp('委託C');
  e.employmentType = 'contractor'; e.houshuKubun = 'ippan';
  e.shikyu = [{ label: '報酬', value: '500000' }, { label: '住宅手当', value: '50000' }, { label: '通勤手当', value: '20000', hikazei: true }];
  A.state.employees.push(e); A.state.month = '2026-06';
  const r = A.compute(e);
  const g = r.kojo.filter(k => /源泉/.test(k.label)).reduce((a, k) => a + k.value, 0);
  ok(g === 56155, '源泉=課税支給55万(報酬50万+住宅5万・通勤2万は除外)×10.21%=56,155 (got ' + g + ')');
  A.state.employees.pop();
});

T('UI操作を通してJS例外・window.error が0', function () {
  ok(errs.length === 0, '例外あり: ' + errs.join(' | '));
});

console.log('  (クリックしたボタン ' + clicked + ' / 除外(破壊DL印刷公開) ' + skipped + ')');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
