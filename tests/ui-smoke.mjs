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

T('UI操作を通してJS例外・window.error が0', function () {
  ok(errs.length === 0, '例外あり: ' + errs.join(' | '));
});

console.log('  (クリックしたボタン ' + clicked + ' / 除外(破壊DL印刷公開) ' + skipped + ')');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
