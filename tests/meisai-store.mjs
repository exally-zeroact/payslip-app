// meisai-store.mjs — Web明細の公開一覧フィルタ(必須1)＋削除時リンク失効(必須2)。ローカル(localStorage)モードで検証。
//  依存: jsdom。使い方: node tests/meisai-store.mjs (jsdom未導入なら SKIP=exit0)。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=meisai-storeをスキップ。'); process.exit(0); }

let pass = 0, fail = 0;
async function T(name, fn) { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); }

// SUPA未設定=ローカル(localStorage)モードで store.js を読む
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
const win = dom.window;
const el = win.document.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8'); win.document.body.appendChild(el);
const Store = win.Store;
function seed() {
  win.localStorage.setItem('payslip_meisai_pub_v1', JSON.stringify([
    { token: 'tA', employeeId: 'A', initCode: '1234', pwHash: 'hashA', deviceTokens: ['d1'], consentAt: '2026-06-01' },
    { token: 'tB', employeeId: 'B', initCode: '5678', pwHash: 'hashB', deviceTokens: ['d2'], consentAt: '2026-06-02' } // B=削除済みの幽霊
  ]));
  win.localStorage.setItem('payslip_meisai_docs_v1', JSON.stringify([
    { token: 'tA', ym: '2026-06', kind: 'monthly', name: 'Aさん' },
    { token: 'tB', ym: '2026-06', kind: 'monthly', name: 'Bさん' }
  ]));
}

console.log('\n[meisai-store] Web明細 公開一覧フィルタ＋削除時失効');
// ★共有 localStorage/Store のため必ず逐次実行(並行だと seed が競合する)。
await T('必須1: 名簿(empIds)にいる人だけ一覧に出る=削除済みの幽霊は消える', async function () {
  seed();
  const list = await Store.listMeisaiPub(['A']); // 名簿=Aのみ(B=削除済み)
  eq(list.length, 1, 'Aだけ');
  eq(list[0].employeeId, 'A', 'A');
  ok(!list.some(x => x.employeeId === 'B'), 'B(幽霊)は出ない');
});
await T('必須1: empIds未指定は全件(後方互換)', async function () {
  seed();
  const all = await Store.listMeisaiPub();
  eq(all.length, 2, '全件');
});
await T('必須1: 退職者も名簿(empIds)に残っていれば出る=消さない', async function () {
  seed();
  const list = await Store.listMeisaiPub(['A', 'B']); // AもBも名簿に居る(退職者含む想定)
  eq(list.length, 2, '名簿に居れば両方出る');
});
await T('必須2: unpublishMeisai=認証情報クリアでリンク死・docsは物理削除しない', async function () {
  seed();
  await Store.unpublishMeisai('A');
  const pubs = JSON.parse(win.localStorage.getItem('payslip_meisai_pub_v1'));
  const pa = pubs.find(p => p.employeeId === 'A');
  ok(pa, 'A行は残る(cascadeでdocsを消さないため行自体は保持)');
  ok(pa.initCode === null && pa.pwHash === null && pa.deviceTokens.length === 0 && pa.consentAt === null, 'Aの認証情報が全クリア=リンク死');
  const pb = pubs.find(p => p.employeeId === 'B');
  ok(pb && pb.pwHash === 'hashB', 'B(他人)は無傷');
  const docs = JSON.parse(win.localStorage.getItem('payslip_meisai_docs_v1'));
  ok(docs.some(d => d.token === 'tA'), '★Aのdocs(お金の記録)は物理削除されず残る');
});
await T('必須2: 空/未指定は安全に no-op', async function () {
  seed();
  const r = await Store.unpublishMeisai('');
  eq(r.ok, false, '空=ok:false');
  const pubs = JSON.parse(win.localStorage.getItem('payslip_meisai_pub_v1'));
  ok(pubs.length === 2, '何も壊さない');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
