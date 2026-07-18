// nencho-web-declaration.test.js — ★年末調整 従業員セルフ申告(Web明細)の保存層E2E★
//  store.js(localStorageフォールバック)+ nencho-declaration.js を jsdom に読み、
//  公開→初回PW設定→ログイン→申告保存→会社が一覧/取得→取り込み(applyToNencho) を通す。
//  認証(device/pw)が無ければ保存/取得を拒否することも確認。
//  依存: jsdom。使い方: node tests/nencho-web-declaration.test.js (jsdom未導入なら SKIP)。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=web申告テストをスキップ。'); process.exit(0); }

let pass = 0, fail = 0;
function T(name, fn) { return Promise.resolve().then(fn).then(() => { pass++; console.log('  ✓ ' + name); }, e => { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); }); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'not equal') + ' — got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

// localStorageモード(SUPA未設定)で store.js + nencho-declaration.js を読む
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window;
for (const src of ['lib/nencho-declaration.js', 'js/store.js']) {
  const el = win.document.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8'); win.document.body.appendChild(el);
}
const Store = win.Store, ND = win.NenchoDecl;
ok(Store && Store.saveNenchoDecl && Store.getNenchoDecl && Store.listNenchoDecl, 'store: web申告API露出');
ok(ND && ND.normalize && ND.applyToNencho, 'NenchoDecl露出');

const YEAR = 2026;
let token, cred;

await T('準備: 明細公開→初回PW設定→ログインでdeviceToken取得', async () => {
  const pub = await Store.publishMeisai([{ employeeId: 'E1', name: '山田 太郎', ym: '2026-06', kind: 'monthly', data: { person: { name: '山田 太郎', net: 250000 } } }]);
  ok(pub && pub[0] && pub[0].token, '公開でtoken発行');
  token = pub[0].token;
  const list = await Store.listMeisaiPub();
  const p = list.find(x => x.token === token); ok(p && p.initCode, '初回コードが取れる(PW未設定)');
  const sp = await Store.meisaiSetPassword(token, p.initCode, 'password12'); ok(sp && sp.ok, '初回PW設定OK');
  const vf = await Store.meisaiVerifyPassword(token, 'password12'); ok(vf && vf.ok && vf.deviceToken, 'ログインでdeviceToken');
  cred = { deviceToken: vf.deviceToken };
});

await T('未提出なら found:false', async () => {
  const r = await Store.getNenchoDecl(token, cred, YEAR); eq(r.found, false, '未提出');
});

let savedDecl;
await T('従業員が申告を保存できる(認証あり)', async () => {
  savedDecl = ND.normalize({ haiEnabled: true, haiShotoku: 300000, haiRojin: false, fuyoIppan: 2, seiGeneralNew: 80000, jishinP: 12000, shokibo: 240000 });
  const r = await Store.saveNenchoDecl(token, cred, YEAR, savedDecl);
  ok(r && r.ok, '保存OK: ' + JSON.stringify(r));
});

await T('本人が取得すると保存内容が返る', async () => {
  const r = await Store.getNenchoDecl(token, cred, YEAR);
  ok(r.found, '提出済'); eq(r.decl.haiEnabled, true, '配偶者あり'); eq(r.decl.haiShotoku, 300000, '配偶者所得');
  eq(r.decl.fuyoIppan, 2, '扶養2'); eq(r.decl.seiGeneralNew, 80000, '生保新'); eq(r.decl.shokibo, 240000, 'iDeCo');
});

await T('会社が提出一覧を取得(employeeId付き)', async () => {
  const l = await Store.listNenchoDecl(YEAR);
  const row = l.find(x => x.employeeId === 'E1'); ok(row, 'E1の申告が一覧に出る');
  eq(row.decl.seiGeneralNew, 80000, '一覧のdeclも中身を持つ'); ok(row.submittedAt, '提出日時');
});

await T('別の年は空', async () => {
  const l = await Store.listNenchoDecl(2027); eq(l.length, 0, '2027は無し');
  const g = await Store.getNenchoDecl(token, cred, 2027); eq(g.found, false, '2027は未提出');
});

await T('認証が無い/誤りなら保存・取得を拒否(unauth)', async () => {
  const s = await Store.saveNenchoDecl(token, {}, YEAR, { haiEnabled: true }); ok(s && s.unauth && !s.ok, '空credは拒否');
  const s2 = await Store.saveNenchoDecl(token, { deviceToken: 'wrong' }, YEAR, { haiEnabled: true }); ok(s2 && s2.unauth, '偽deviceは拒否');
  const g = await Store.getNenchoDecl(token, { password: 'zzz' }, YEAR); ok(g && g.unauth, '誤PWは取得拒否');
  // 拒否後も正しいcredの内容は無傷
  const ok2 = await Store.getNenchoDecl(token, cred, YEAR); eq(ok2.decl.haiShotoku, 300000, '不正操作で申告が壊れない');
});

await T('再提出は上書き(submittedAtは維持・updatedAt更新)', async () => {
  const before = await Store.getNenchoDecl(token, cred, YEAR);
  const decl2 = ND.normalize({ haiEnabled: false, fuyoIppan: 3, seiGeneralNew: 40000 });
  const r = await Store.saveNenchoDecl(token, cred, YEAR, decl2); ok(r.ok, '再保存OK');
  const after = await Store.getNenchoDecl(token, cred, YEAR);
  eq(after.decl.haiEnabled, false, '配偶者なしに更新'); eq(after.decl.fuyoIppan, 3, '扶養3に更新');
  eq(after.decl.haiShotoku, 0, '配偶者なし→所得クリア(normalize整合)');
  eq(after.submittedAt, before.submittedAt, 'submittedAtは初回のまま');
});

await T('会社側 applyToNencho: 申告が年調 n.* に1:1反映', async () => {
  const l = await Store.listNenchoDecl(YEAR); const row = l.find(x => x.employeeId === 'E1');
  const n = {}; ND.applyToNencho(n, row.decl);
  eq(n.fuyoIppan, 3, 'n.fuyoIppan'); eq(n.seiGeneralNew, 40000, 'n.seiGeneralNew'); eq(n.haiEnabled, false, 'n.haiEnabled');
});

// ── 従業員セルフ登録: 振込先(save/get/list・同じtoken/credを流用) ──
ok(Store.saveEmpProfile && Store.getEmpProfile && Store.listEmpProfile, 'store: 振込先API露出');

await T('振込先: 未登録なら found:false', async () => {
  const r = await Store.getEmpProfile(token, cred); eq(r.found, false, '未登録');
});

await T('振込先: 従業員が保存→本人が取得できる', async () => {
  const data = { furiBankName: 'みずほ銀行', furiBankNo: '0001', furiBranchName: '本店', furiBranchNo: '001', furiYokin: '普通', furiAccount: '1234567', furiKana: 'ﾔﾏﾀﾞ ﾀﾛｳ' };
  const s = await Store.saveEmpProfile(token, cred, data); ok(s && s.ok, '保存OK: ' + JSON.stringify(s));
  const g = await Store.getEmpProfile(token, cred); ok(g.found, '登録済'); eq(g.data.furiBankNo, '0001', '銀行コード'); eq(g.data.furiAccount, '1234567', '口座番号');
});

await T('振込先: 認証が無い/誤りなら拒否(unauth)', async () => {
  const s = await Store.saveEmpProfile(token, {}, { furiBankNo: '9999' }); ok(s && s.unauth && !s.ok, '空credは拒否');
  const g = await Store.getEmpProfile(token, { password: 'zzz' }); ok(g && g.unauth, '誤PWは取得拒否');
  const ok2 = await Store.getEmpProfile(token, cred); eq(ok2.data.furiBankNo, '0001', '不正操作で登録が壊れない');
});

await T('振込先: 会社が一覧取得(employeeId付き)', async () => {
  const l = await Store.listEmpProfile(); const row = l.find(x => x.employeeId === 'E1');
  ok(row, 'E1の振込先が一覧に出る'); eq(row.data.furiKana, 'ﾔﾏﾀﾞ ﾀﾛｳ', '名義カナ'); ok(row.submittedAt, '提出日時');
});

await T('振込先: 再登録は上書き(submittedAt維持)', async () => {
  const before = await Store.getEmpProfile(token, cred);
  const r = await Store.saveEmpProfile(token, cred, { furiBankName: '三菱UFJ銀行', furiBankNo: '0005', furiAccount: '7654321' }); ok(r.ok, '再保存OK');
  const after = await Store.getEmpProfile(token, cred);
  eq(after.data.furiBankNo, '0005', '銀行コード更新'); eq(after.data.furiAccount, '7654321', '口座番号更新');
  eq(after.submittedAt, before.submittedAt, 'submittedAtは初回のまま');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
