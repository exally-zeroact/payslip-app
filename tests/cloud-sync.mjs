// cloud-sync.mjs — ★クラウド保存層(store.js)の回帰テスト★
//  Supabaseをモックして store.js の cloudSaveState/cloudLoadState を検証。
//  専門家QA(2026-07-16)が見つけた P0-1(保存項目の欠落)/P0-2(差分ハードデリート)/P1-4(保存成否) を二度と出さない。
//  依存: jsdom(store.jsを window付きで読む為)。使い方: node tests/cloud-sync.mjs (jsdom未導入なら SKIP)。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=cloud-syncをスキップ。'); process.exit(0); }

let pass = 0, fail = 0;
function T(name, fn) { return fn().then(() => { pass++; console.log('  ✓ ' + name); }, e => { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); }); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }

// ── Supabaseモック(呼び出しを記録・失敗も注入できる) ──
function makeMock(opts) {
  opts = opts || {};
  const calls = { companyUpsert: [], empUpsert: [], deletes: [] };
  let serverEmpIds = (opts.serverEmpIds || []).slice();
  // dbFormatモード=実Postgres(timestamptz)を模擬: 送られたISO(…Z)を保存時に…+00:00へ書式変換し、読み戻しはその値を返す。
  //  ＝JS生成文字列(…Z)を競合基準にすると読み戻し(…+00:00)と毎回不一致になる本番バグを再現する。
  const dbFmt = s => (opts.dbFormat && typeof s === 'string') ? s.replace(/Z$/, '+00:00') : s;
  let storedUA = (typeof opts.companyUpdatedAt === 'function') ? opts.companyUpdatedAt() : opts.companyUpdatedAt;
  function curCompanyUA() {
    if (opts.dbFormat) return storedUA; // upsertで更新された保存値を返す
    return (typeof opts.companyUpdatedAt === 'function') ? opts.companyUpdatedAt() : opts.companyUpdatedAt;
  }
  function query(kind) {
    const _cua = curCompanyUA();
    let res;
    if (kind === 'ledger') { // K4: pay_ledger。count:'exact'(切れ検知)を模擬
      const rows = opts.ledgerRows || [];
      res = { data: rows, count: (opts.ledgerCount != null ? opts.ledgerCount : rows.length), error: opts.ledgerError || null };
    } else {
      const data = kind === 'companyData' ? ((opts.companyData || _cua) ? { data: opts.companyData, updated_at: _cua } : null)
        : kind === 'empIds' ? serverEmpIds.map(id => ({ id }))
          : (opts.serverEmps || []);
      res = { data, error: null };
    }
    // is/gte/lte もチェーン可能(pay_ledger の .is().gte().lte().order() 用)
    // range: store.js の全件ページング(fetchAllQ)を本物どおりに模擬。配列はrange位置で1000件ずつスライス
    //  (少件数モックでは1ページ目=全件・2ページ目=空)。count注入(切れ検知テスト)もそのまま保つ。
    let _lo = 0;
    function paged() {
      if (!Array.isArray(res.data)) return res; // 単一行(maybeSingle系)はそのまま
      return { data: res.data.slice(_lo, _lo + 1000), count: (res.count != null ? res.count : res.data.length), error: res.error };
    }
    const q = { eq: () => q, is: () => q, gte: () => q, lte: () => q, order: () => q, range: (a) => { _lo = a; return q; }, maybeSingle: () => Promise.resolve(res), then: (f, r) => Promise.resolve(paged()).then(f, r) };
    return q;
  }
  function from(table) {
    return {
      upsert: (d) => {
        (table === 'pay_companies' ? calls.companyUpsert : calls.empUpsert).push(d);
        let retUA = null;
        if (table === 'pay_companies' && d && d.updated_at != null) { retUA = dbFmt(d.updated_at); if (opts.dbFormat) storedUA = retUA; }
        const res = { error: opts.failUpsert ? { message: 'upsert失敗' } : null, data: retUA != null ? { updated_at: retUA } : null };
        // upsert(...) は Promise。さらに .select('updated_at').single() でDB保存後の updated_at を返せるようにする。
        const p = Promise.resolve(res);
        p.select = () => ({ single: () => Promise.resolve(res), maybeSingle: () => Promise.resolve(res), then: (f, r) => Promise.resolve(res).then(f, r) });
        return p;
      },
      select: (cols) => query(table === 'pay_ledger' ? 'ledger' : table === 'pay_companies' ? 'companyData' : cols === 'id' ? 'empIds' : 'emps'),
      delete: () => ({ in: (col, ids) => { calls.deletes.push(ids); return Promise.resolve({ error: null }); } }),
    };
  }
  return { from, auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) }, __calls: calls };
}

function loadStore(mock) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.SUPA = { url: 'https://x.supabase.co', key: 'anon' };
  win.supabase = { createClient: () => mock };
  const el = win.document.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  win.document.body.appendChild(el);
  return win.Store;
}

const SNAP = { v: 1, company: { name: 'A' }, month: '2026-06', theme: 't', prefer: 'p', depts: [], roles: [], showRetired: false,
  bonus: { byEmp: { e1: { amount: '500000' } } }, confirmed: { '2026-06': { e1: true } }, nencho: { e1: { kyuyoShunyu: '5000000' } },
  onboardDone: true, onboardOutput: true, payPatterns: [{ id: 'p1' }],
  employees: [{ id: 'e1', name: '山田' }, { id: 'e2', name: '佐藤' }] };

console.log('\n[cloud-sync] クラウド保存層 回帰テスト');
const runs = [];

// P0-1: 全スナップショット項目(確定印/年末調整/賞与/カスタム給/onboard)がクラウドに載る
runs.push(T('P0-1: confirmed/nencho/bonus/payPatterns/onboard も pay_companies に保存される', async function () {
  const mock = makeMock({});
  const Store = loadStore(mock);
  const r = await Store.cloudSaveState(SNAP);
  ok(r.ok, '保存ok');
  const saved = mock.__calls.companyUpsert[0].data; // upsert({account_id,data:settings})→ .data
  ['confirmed', 'nencho', 'bonus', 'payPatterns', 'onboardDone', 'onboardOutput'].forEach(k => ok(saved[k] !== undefined, k + ' が保存されている'));
  ok(saved.employees === undefined, 'employeesはsettingsに含めない(別テーブル)');
}));

// P0-2: 同期前(load前)は差分削除しない=古い/空の端末が本番を消さない
runs.push(T('P0-2: 未同期(load前)は差分ハードデリートを実行しない', async function () {
  const mock = makeMock({ serverEmpIds: ['e1', 'e2', 'e3'] }); // サーバに3人居る
  const Store = loadStore(mock);
  // load せずに save(手元e1,e2のみ)。従来なら e3 を delete していた=消失バグ
  await Store.cloudSaveState(SNAP);
  ok(mock.__calls.deletes.length === 0, '未同期セッションでは delete を呼ばない(消さない)');
}));

// P0-2b: 同期後(load済)は差分削除する=正しく消えたempはクラウドからも消える
runs.push(T('P0-2b: 同期後(load済)は手元に無いempを差分削除する', async function () {
  const mock = makeMock({ serverEmpIds: ['e1', 'e2', 'e3'], serverEmps: [{ data: { id: 'e1' } }, { data: { id: 'e2' } }, { data: { id: 'e3' } }], companyData: { company: { name: 'A' } } });
  const Store = loadStore(mock);
  await Store.cloudLoadState(); // 同期する
  await Store.cloudSaveState(SNAP); // 手元は e1,e2 のみ → e3 を削除
  ok(mock.__calls.deletes.length === 1 && mock.__calls.deletes[0].indexOf('e3') >= 0, '同期後は e3 を削除: ' + JSON.stringify(mock.__calls.deletes));
}));

// P1-4: 保存失敗は {ok:false} を返す(「保存済」と嘘をつかない)
runs.push(T('P1-4: 書込失敗時は ok:false を返す', async function () {
  const mock = makeMock({ failUpsert: true });
  const Store = loadStore(mock);
  const r = await Store.cloudSaveState(SNAP);
  ok(r.ok === false, '失敗を ok:false で返す(reason=' + r.reason + ')');
}));

// 楽観ロック: 読込後にクラウドのupdated_atが別端末で変わっていたら上書きせず conflict を返す
runs.push(T('楽観ロック: 別端末が後から更新→保存は conflict で上書きしない', async function () {
  let cua = '2026-07-17T00:00:00.000Z'; // 現在のクラウドupdated_at(可変)
  const mock = makeMock({ companyData: { company: { name: 'A' } }, companyUpdatedAt: () => cua });
  const Store = loadStore(mock);
  await Store.cloudLoadState(); // 読込=lastCompanyUpdatedAt を U0 に
  // 同じ値のまま保存 → 競合なし=保存される
  const r1 = await Store.cloudSaveState(SNAP);
  ok(r1.ok === true, '競合なしなら保存OK(reason=' + r1.reason + ')');
  const upsertsBefore = mock.__calls.companyUpsert.length;
  // 別端末がクラウドを更新(updated_atが進む) → 次の保存は conflict
  cua = '2026-07-17T09:00:00.000Z';
  const r2 = await Store.cloudSaveState(SNAP);
  ok(r2.ok === false && r2.reason === 'conflict', '別端末更新後は conflict(reason=' + r2.reason + ')');
  ok(mock.__calls.companyUpsert.length === upsertsBefore, 'conflict時は pay_companies を上書きしない');
}));
// ★P0根治: DB書式(…+00:00)とJS生成(…Z)の差で、外部変更なしの連続保存が誤conflictしない
runs.push(T('楽観ロック(P0): DB書式差(+00:00 vs Z)で誤conflictしない=連続保存が通る', async function () {
  const initialUA = '2026-07-20T00:00:00.000+00:00'; // DBが返す既存値(＋00:00)
  const mock = makeMock({ companyData: { company: { name: 'A' } }, companyUpdatedAt: initialUA, dbFormat: true });
  const Store = loadStore(mock);
  await Store.cloudLoadState();            // baseline = initialUA(DB書式)
  const r1 = await Store.cloudSaveState(SNAP); ok(r1.ok === true, 'save1 ok(reason=' + r1.reason + ')');
  // 外部変更なしの2回目(スクロール等の自動保存相当)。書式差で誤発火してはいけない。
  const r2 = await Store.cloudSaveState(SNAP);
  ok(r2.ok === true && r2.reason !== 'conflict', '2回目保存が誤conflictしない(reason=' + r2.reason + ')');
  const r3 = await Store.cloudSaveState(SNAP);
  ok(r3.ok === true && r3.reason !== 'conflict', '3回目も誤conflictしない(reason=' + r3.reason + ')');
}));
// 書式が違っても「本物の別端末更新」は依然 conflict で検出する(根治で検出力を落とさない)
runs.push(T('楽観ロック(P0): 書式差対応後も、本物の別端末更新は conflict を検出する', async function () {
  let ua = '2026-07-20T00:00:00.000+00:00';
  const mock = makeMock({ companyData: { company: { name: 'A' } }, companyUpdatedAt: () => ua });
  const Store = loadStore(mock);
  await Store.cloudLoadState();
  const r1 = await Store.cloudSaveState(SNAP); ok(r1.ok === true, 'save1 ok');
  ua = '2026-07-20T09:00:00.000+00:00'; // 別端末が後から更新
  const r2 = await Store.cloudSaveState(SNAP);
  ok(r2.ok === false && r2.reason === 'conflict', '本物の別端末更新は conflict(reason=' + r2.reason + ')');
}));
// 初回(未load/クラウド空)は競合判定せず保存できる(新規アカウント)
runs.push(T('楽観ロック: 初回(load前)は競合扱いにせず保存できる', async function () {
  const mock = makeMock({}); // クラウド空
  const Store = loadStore(mock);
  const r = await Store.cloudSaveState(SNAP);
  ok(r.ok === true, '初回保存OK(reason=' + r.reason + ')');
}));

// ── K4: Store.getLedger(pay_ledger 読取・count:'exact' 切れ検知) ──
// HANDOFF §1: count > data.length なら「全部読めていない」= truncated:true(静かな過少を検出)
runs.push(T('K4 getLedger: 全行読めた時 truncated:false・rows/count 一致', async function () {
  const rows = [
    { id: 'l1', employee_id: 'e1', ymd: '2026-07-03', data: { uriage: 100000 } },
    { id: 'l2', employee_id: 'e1', ymd: '2026-07-05', data: { minutes: 480 } },
    { id: 'l3', employee_id: 'e2', ymd: '2026-07-06', data: { amount: 5000 } }
  ];
  const mock = makeMock({ ledgerRows: rows, ledgerCount: 3 });
  const Store = loadStore(mock);
  const r = await Store.getLedger('2026-07-01', '2026-07-31');
  ok(r.rows.length === 3, 'rows=3件: ' + r.rows.length);
  ok(r.count === 3, 'count=3: ' + r.count);
  ok(r.truncated === false, '切れていない(truncated:false): ' + r.truncated);
  ok(!r.error, 'errorなし');
}));

runs.push(T('K4 getLedger: サーバ上限で切れたら truncated:true(count>rows)', async function () {
  // Supabase既定1000行で切れた状況: 実データ1500件だが1000件しか返らない
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: 'l' + i, employee_id: 'e1', ymd: '2026-07-03', data: {} }));
  const mock = makeMock({ ledgerRows: rows, ledgerCount: 1500 });
  const Store = loadStore(mock);
  const r = await Store.getLedger('2026-07-01', '2026-07-31');
  ok(r.count === 1500 && r.rows.length === 1000, 'count1500 > rows1000');
  ok(r.truncated === true, '★切れ検知 truncated:true(合計を静かに過少にしない): ' + r.truncated);
}));

runs.push(T('K4 getLedger: エラー時は空+error(嘘の空集計を返さない)', async function () {
  const mock = makeMock({ ledgerError: { message: 'permission denied' } });
  const Store = loadStore(mock);
  const r = await Store.getLedger('2026-07-01', '2026-07-31');
  ok(r.rows.length === 0 && r.count === 0, '空');
  ok(r.error === 'permission denied', 'errorを載せる: ' + r.error);
  ok(r.truncated === false, 'エラー時 truncated:false');
}));

await Promise.all(runs);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
