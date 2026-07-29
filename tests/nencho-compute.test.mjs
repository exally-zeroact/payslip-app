// nencho-compute.test.mjs — ★年末調整の控除・税額を令和8"公式実数"で正解突合(配線でなく金額)★
//  H1(扶養二重計上)と同型の「入力→控除額」の誤りを潰すため、app.jsの nenCompute を通し、
//  各控除カテゴリの控除合計への寄与(増分)＋年税額の通しを、被テストと別根拠の実数リテラルで固定。
//  期待値の根拠=令和8恒久額(扶養38/63/48/58・配偶者38/48・障害27/40/75・寡婦27/ひとり親35/勤労27万・
//  生保新上限4万・地震上限5万・iDeCo全額)＋速算表(≤195万=5%)＋復興税×1.021・100円未満切捨。
//  依存: jsdom。未導入なら SKIP。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=nencho-computeをスキップ。'); process.exit(0); }

let pass = 0, fail = 0;
function T(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' 期待' + b + ' 実際' + a); }

// index.html の非CDN・非supabaseスクリプトを jsdom に読み、__PAYSLIP_TEST を得る
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/\?.*$/, '')).filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document; win.fetch = () => Promise.reject(new Error('no net'));
for (const src of srcs) { const el = doc.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8'); doc.body.appendChild(el); }
const A = win.__PAYSLIP_TEST;
if (!A || !A.nenCompute) { console.log('SKIP: __PAYSLIP_TEST.nenCompute 未露出'); process.exit(0); }

// 本人=給与収入500万(→給与所得356万・本人所得tier0=900万以下)。控除は増分で検証。
const AGG = { shunyu: 5000000, genzen: 0, shaho: 0, months: 12 };
const kojo = (n) => A.nenCompute(AGG, n).res.kojoGoukei;
const BASE = kojo({});               // 全off=基礎控除のみ(社保0)
const inc = (n) => kojo(n) - BASE;   // その項目の控除寄与

T('基礎控除(令和8改正): 合計所得356万(132超489万)→基礎99万', () => {
  // ★根拠=令和8年度税制改正の基礎控除(国税庁2026kaisei.pdf・pdfplumber照合)。
  //   ≤132万=104万/132超489万=99万(令和8・9年分は132-336と336-489を1段に統合)/489超655万=67万/655超2350万=62万。
  //   ※令和7年度改正(95/88/68/63)は令和8分では令和8改正に置き換わる。合計所得356万は99万が正。
  const r = A.nenCompute(AGG, {}).res;
  eq(r.kojoGoukei, 990000, '所得控除合計=基礎99万のみ(社保0)');
  eq(r.kyuyoShotoku, 3560000, '給与所得(500万→356万)');
  // 合計所得132万以下(給与収入200万→給与所得126万)は基礎104万
  const low = A.nenCompute({ shunyu: 2000000, genzen: 0, shaho: 0 }, {}).res;
  eq(low.kyuyoShotoku, 1260000, '給与200万→給与所得126万(≤132万)');
  eq(low.kojoGoukei, 1040000, '合計所得132万以下は基礎104万');
});

T('配偶者控除(本人900万以下)=38万・老人配偶者=48万・配偶者特別(所得70万)=38万', () => {
  eq(inc({ haiEnabled: true, haiShotoku: 0 }), 380000, '配偶者(所得0)=38万');
  eq(inc({ haiEnabled: true, haiShotoku: 0, haiRojin: true }), 480000, '老人配偶者=48万');
  eq(inc({ haiEnabled: true, haiShotoku: 700000 }), 380000, '配偶者特別(所得70万・本人900万以下)=38万');
  eq(inc({ haiEnabled: false, haiShotoku: 500000 }), 0, '配偶者なし(haiEnabled=false)は所得入れても0');
});

T('扶養控除(累積入力→排他分解): 一般38/特定63/老人非同居48/同居老親58万・二重計上しない', () => {
  eq(inc({ fuyoIppan: 1 }), 380000, '一般1');
  eq(inc({ fuyoIppan: 1, fuyoTokutei: 1 }), 630000, '20歳(総数1+特定1)=63万・101万でない');
  eq(inc({ fuyoIppan: 1, fuyoRoujin: 1 }), 480000, '70歳非同居=48万');
  eq(inc({ fuyoIppan: 1, fuyoRoujin: 1, fuyoDoukyo: 1 }), 580000, '72歳同居=58万・144万でない');
  eq(inc({ fuyoIppan: 3, fuyoTokutei: 1, fuyoRoujin: 1 }), 380000 + 630000 + 480000, '総数3内訳=149万');
});

T('特定親族特別控除(所得70万=62超85)=63万', () => {
  eq(inc({ tokuteiShinzokuShotoku: 700000 }), 630000, '特定親族63万');
});

T('障害者(27/40/75)・寡婦27・ひとり親35・勤労学生27万', () => {
  eq(inc({ shougai: 'ippan' }), 270000, '一般障害者27万');
  eq(inc({ shougai: 'tokubetsu' }), 400000, '特別障害者40万');
  eq(inc({ shougai: 'doukyo' }), 750000, '同居特別障害者75万');
  eq(inc({ kafu: true }), 270000, '寡婦27万');
  eq(inc({ hitorioya: true }), 350000, 'ひとり親35万');
  eq(inc({ hitorioya: true, kafu: true }), 350000, 'ひとり親優先(35万・寡婦と二重にしない)');
  eq(inc({ kinrou: true }), 270000, '勤労学生27万');
});

T('生命保険料 新一般8万=上限4万・地震6万=上限5万・iDeCo24万=全額', () => {
  eq(inc({ seiGeneralNew: 80000 }), 40000, '生保新8万→控除4万(上限)');
  eq(inc({ jishinP: 60000 }), 50000, '地震6万→控除5万(上限)');
  eq(inc({ shokibo: 240000 }), 240000, '小規模掛金は全額');
});

T('★通し★ 給与500万/社保75万/生保新10万/源泉9万 → 課税178万・年税額90,800・過不足+800', () => {
  // 令和8: 基礎99万(合計所得356万)+社保75万+生保4万=178万控除。課税=356-178=178万。
  const r = A.nenCompute({ shunyu: 5000000, genzen: 90000, shaho: 750000, months: 12 }, { seiGeneralNew: 100000 }).res;
  eq(r.kojoGoukei, 990000 + 750000 + 40000, '所得控除=基礎99+社保75+生保4=178万');
  eq(r.kazeiKyuyoShotoku, 1780000, '課税給与所得=356-178=178万');
  eq(r.sanshutuZei, 89000, '算出税額=178万×5%');
  eq(r.nenchouNenzei, 90800, '年調年税額=89,000×1.021=90,800(100円未満切捨)');
  eq(r.kabusoku, 90800 - 90000, '過不足=年税額-源泉=+800(追加徴収)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
