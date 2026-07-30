// pagination.test.mjs — ★1000件超が"黙って"欠落するのを二度と出さない回帰テスト★
//  代行請求で実際に踏んだのと同根: store.js/admin.js が .select() をページング無しで投げると
//  Supabase(PostgREST)の既定 max_rows=1000 で1000件超がエラー無しに切り捨てられ、
//  賃金台帳/年末調整/明細一覧/法定データ が黙って過少になる。
//  ここでは本物どおり「1リクエスト最大1000行・count=総数」を模擬した偽Supabaseに1,080件を仕込み、
//  各 Store 関数が全件返すことを固定する(旧コードなら1000で止まって赤くなる)。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=paginationをスキップ。'); process.exit(0); }

let pass = 0, fail = 0;
function T(name, fn) { return Promise.resolve().then(fn).then(() => { pass++; console.log('  ✓ ' + name); }, e => { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); }); }
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); }

const PAGE = 1000, TOTAL = 1080; // 司さんの実データ規模(1000超)

// ── 本物どおりの偽Supabase: table→行配列。select(cols,{count})→count=総数, range(a,b)→最大 cap 件スライス ──
//  cap = サーバ側 max_rows(既定1000)。cap を小さくして「上限がページ幅より小さい」状況も再現できる。
function makeMock(tables, cap = PAGE) {
  function from(table) {
    const all = tables[table] || [];
    function builder() {
      let lo = 0, hi = null, wantCount = false;
      const q = {
        select: (_c, opts) => { wantCount = !!(opts && opts.count); return q; },
        eq: () => q, is: () => q, gte: () => q, lte: () => q, in: () => q, order: () => q,
        range: (a, b) => { lo = a; hi = b; return q; },
        limit: (n) => { hi = lo + n - 1; return q; },
        maybeSingle: () => Promise.resolve({ data: all[0] || null, error: null }),
        single: () => Promise.resolve({ data: all[0] || null, error: null }),
        then: (f, r) => {
          const top = (hi == null) ? cap - 1 : hi;
          const to = Math.min(top, lo + cap - 1);            // 1リクエスト最大 cap 行(本物の上限)
          const data = all.slice(lo, to + 1);
          return Promise.resolve({ data, count: wantCount ? all.length : null, error: null }).then(f, r);
        }
      };
      return q;
    }
    return builder();
  }
  return { from, auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) } };
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

// TOTAL件を作る小道具
const mk = (f) => Array.from({ length: TOTAL }, (_, i) => f(i));

const tables = {
  pay_payslips: mk(i => ({ ym: '2026-06', employee_id: 'e' + i, data: { kind: 'monthly' } })),
  pay_ledger: mk(i => ({ id: 'l' + i, employee_id: 'e' + i, ymd: '2026-06-01', data: {}, deleted_at: null })),
  payslip_batches: mk(i => ({ id: 'b' + i, title: 't' + i, month: '2026-06', company: 'A', updated_at: '2026-06-01' })),
  pay_employees: mk(i => ({ id: 'e' + i, data: { id: 'e' + i, name: '従業員' + i }, sort: i })),
  pay_meisai_pub: mk(i => ({ token: 'tk' + i, employee_id: 'e' + i, init_code: 'C' + i, pw_hash: null, consent_at: null })),
  pay_meisai_docs: mk(i => ({ token: 'tk' + i, ym: '2026-06', kind: 'monthly', published_at: '2026-06-01', opened_at: null, data: { person: { name: '従業員' + i } } })),
  pay_nencho_decl: mk(i => ({ employee_id: 'e' + i, decl: {}, submitted_at: '2026-06-01', updated_at: '2026-06-01' })),
  pay_emp_profile: mk(i => ({ employee_id: 'e' + i, data: {}, submitted_at: '2026-06-01', updated_at: '2026-06-01' })),
  statutory: mk(i => ({ kind: 'k' + i, year: 2026, data: {} })),
  pay_companies: [{ data: { name: 'A' }, updated_at: '2026-06-01' }],
};
const Store = loadStore(makeMock(tables));

console.log('\n[pagination] 1,080件(1000超)を全 Store 関数が全件返すか');
const runs = [];
runs.push(T('getPayslipsByYm(賃金台帳/年末調整の素): 1080件全部', async () => {
  const r = await Store.getPayslipsByYm('2026-01', '2026-12'); eq(r.length, TOTAL, '明細');
}));
runs.push(T('getLedger(台帳取込): 1080件全部・truncated=false', async () => {
  const r = await Store.getLedger('2026-01-01', '2026-12-31'); eq(r.rows.length, TOTAL, 'rows'); eq(r.truncated, false, 'truncated');
}));
runs.push(T('list(バッチ一覧): 1080件全部', async () => {
  const r = await Store.list(); eq(r.length, TOTAL, 'batches');
}));
runs.push(T('cloudLoadState(従業員名簿): 1080人全部', async () => {
  const s = await Store.cloudLoadState(); eq(s.employees.length, TOTAL, 'employees');
}));
runs.push(T('listNenchoDecl(年末調整 提出一覧): 1080件全部', async () => {
  const r = await Store.listNenchoDecl(2026); eq(r.length, TOTAL, 'nencho');
}));
runs.push(T('listEmpProfile(振込先一覧): 1080件全部', async () => {
  const r = await Store.listEmpProfile(); eq(r.length, TOTAL, 'profiles');
}));
runs.push(T('getStatutory(中央の法定データ): 1080件全部', async () => {
  const r = await Store.getStatutory(); eq(r.length, TOTAL, 'statutory');
}));
runs.push(T('listMeisaiPub(Web明細 公開一覧): 1080件全部', async () => {
  const r = await Store.listMeisaiPub(); eq(r.length, TOTAL, 'pub');
}));

// ★サーバ上限がページ幅より小さくても取りこぼさない（実受信数で offset を進める）
const StoreSmallCap = loadStore(makeMock({ pay_payslips: tables.pay_payslips, pay_companies: tables.pay_companies }, 300));
runs.push(T('★上限300(ページ幅未満)でも getPayslipsByYm が1080件全部（size固定なら止まる）', async () => {
  const r = await StoreSmallCap.getPayslipsByYm('2026-01', '2026-12'); eq(r.length, TOTAL, '明細(小上限)');
}));

await Promise.all(runs);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
