// exally-login.test.mjs — ★item C: メール確認ON前提のsignup分岐★
//  共通ログイン部品(js/exally-login.js)の signup を検証:
//   - session有り(確認OFF)=即ログイン(onLogin呼ぶ)=既存動作を壊さない
//   - session無し(確認ON)=「確認メール送信」待機画面(onLogin呼ばない・auto-loginしない)
//   - 待機画面から「戻る」で通常ログインへ復帰
//   - signupエラーは待機画面を出さずエラー表示
//   - 通常loginは従来どおり
//  依存: jsdom。使い方: node tests/exally-login.test.mjs (jsdom未導入ならSKIP)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=exally-loginテストをスキップ。'); process.exit(0); }

let pass = 0, fail = 0;
function T(name, fn) { return Promise.resolve().then(fn).then(() => { pass++; console.log('  ✓ ' + name); }, e => { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); }); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }

function loadLogin() {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  const el = win.document.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, 'js/exally-login.js'), 'utf8');
  win.document.body.appendChild(el);
  ok(win.ExallyLogin && win.ExallyLogin.mount, 'ExallyLogin.mount 露出');
  return win;
}

// mock supabase auth。signUp/signIn の返りを注入。呼び出し回数も記録。
function makeSb(opt) {
  const calls = { signUp: 0, signIn: 0 };
  return { calls, auth: {
    signUp: function () { calls.signUp++; return Promise.resolve(opt.signUp); },
    signInWithPassword: function () { calls.signIn++; return Promise.resolve(opt.signIn); }
  } };
}

function fill(win, email, pass) {
  win.document.getElementById('loginEmail').value = email;
  win.document.getElementById('loginPass').value = pass;
}
// onclickは async。直接呼んで待つ(clickだとPromiseを取れない)。
function clickAsync(win, id) { const b = win.document.getElementById(id); return Promise.resolve(b.onclick()); }

console.log('\n[exally-login] item C: メール確認ON signup分岐');
const runs = [];

// 1. 確認OFF(session有り)=即ログイン=既存動作を壊さない
runs.push(T('確認OFF: signupでsession有り→即ログイン(onLogin呼ぶ・待機画面出さない)', async function () {
  const win = loadLogin();
  const sb = makeSb({ signUp: { data: { user: { email: 'a@b.com' }, session: { access_token: 't' } } } });
  let loggedIn = null;
  const L = win.ExallyLogin.mount({ app: '給料明細', sb, onLogin: function (u) { loggedIn = u; } });
  L.show(); fill(win, 'a@b.com', 'secret1');
  await clickAsync(win, 'btnSignup');
  ok(loggedIn && loggedIn.email === 'a@b.com', 'onLoginが呼ばれた(即ログイン)');
  ok(!win.document.getElementById('loginConfirmSent'), '待機画面は出ていない');
  eq(sb.calls.signIn, 0, 'auto-loginのsignInは呼ばない(sessionが有るので不要)');
}));

// 2. ★確認ON(session無し)=待機画面・onLogin呼ばない・auto-loginしない
runs.push(T('★確認ON: signupでsession無し→確認メール待機画面(onLogin呼ばない・signInも呼ばない)', async function () {
  const win = loadLogin();
  const sb = makeSb({ signUp: { data: { user: { email: 'new@b.com' }, session: null } } });
  let loggedIn = null;
  const L = win.ExallyLogin.mount({ app: '給料明細', sb, onLogin: function (u) { loggedIn = u; } });
  L.show(); fill(win, 'new@b.com', 'secret1');
  await clickAsync(win, 'btnSignup');
  ok(!loggedIn, '★onLoginは呼ばれない(まだログインさせない)');
  eq(sb.calls.signIn, 0, '★確認前にauto-login(signIn)を試みない=「Email not confirmed」誤案内を出さない');
  const cs = win.document.getElementById('loginConfirmSent');
  ok(cs, '★確認メール待機画面が出る(#loginConfirmSent)');
  ok(/new@b\.com/.test(win.document.getElementById('loginOv').textContent), '宛先メールを表示');
  ok(!win.document.getElementById('btnSignup'), '待機画面ではsignupボタンは消えている(loginフォーム非表示)');
}));

// 3. 待機画面→「戻る」で通常ログイン画面へ復帰(再度操作できる)
runs.push(T('待機画面→戻るで通常ログインへ復帰(btnLogin/btnSignupが再び出る)', async function () {
  const win = loadLogin();
  const sb = makeSb({ signUp: { data: { user: { email: 'new@b.com' }, session: null } } });
  const L = win.ExallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} });
  L.show(); fill(win, 'new@b.com', 'secret1');
  await clickAsync(win, 'btnSignup');
  ok(win.document.getElementById('loginConfirmSent'), '待機画面が出ている');
  const back = win.document.getElementById('btnBackLogin'); ok(back, '戻るボタンがある');
  back.onclick();
  ok(win.document.getElementById('btnLogin') && win.document.getElementById('btnSignup'), '★ログインフォームに復帰(btnLogin/btnSignup再表示)');
  ok(!win.document.getElementById('loginConfirmSent'), '待機画面は消えた');
}));

// 4. signupエラー=待機画面を出さずエラー表示(既存動作)
runs.push(T('signupエラー: 待機画面を出さずfriendlyエラー(既存登録済み等)', async function () {
  const win = loadLogin();
  const sb = makeSb({ signUp: { error: { message: 'User already registered' } } });
  let loggedIn = null;
  const L = win.ExallyLogin.mount({ app: '給料明細', sb, onLogin: function (u) { loggedIn = u; } });
  L.show(); fill(win, 'dup@b.com', 'secret1');
  await clickAsync(win, 'btnSignup');
  ok(!loggedIn, 'ログインしない');
  ok(!win.document.getElementById('loginConfirmSent'), '待機画面は出さない');
  ok(/登録されています/.test(win.document.getElementById('loginErr').textContent), 'friendlyエラー表示');
}));

// 5. 通常login(確認済/確認OFF)は従来どおり=回帰
runs.push(T('回帰: 通常loginはonLoginを呼ぶ(従来どおり)', async function () {
  const win = loadLogin();
  const sb = makeSb({ signIn: { data: { user: { email: 'a@b.com' } } } });
  let loggedIn = null;
  const L = win.ExallyLogin.mount({ app: '給料明細', sb, onLogin: function (u) { loggedIn = u; } });
  L.show(); fill(win, 'a@b.com', 'secret1');
  await clickAsync(win, 'btnLogin');
  ok(loggedIn && loggedIn.email === 'a@b.com', 'onLogin呼ばれた');
}));

await Promise.all(runs);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
