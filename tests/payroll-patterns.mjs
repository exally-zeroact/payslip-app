// payroll-patterns.mjs — ★給与 全パターン 実データ検証(永久テスト)★
//  本物の js/app.js(compute) に 全給与形態×扶養×甲乙丙×賞与×日払い×割増×日割×高齢×県 を流し、
//  令和8年度(2026)の公式料率と突き合わせて assert する。手作業QA(2026-07-14)を自動化=回帰で毎回捕まえる。
//  ★見る値は kojo(実控除)/net(手取り)=ユーザーに見える出力。si(生の中間値)では判定しない★
//  依存: jsdom。使い方: node tests/payroll-patterns.mjs (jsdom未導入なら SKIP=exit0)。CI(run系)に組込。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('SKIP: jsdom未導入=全パターン検証をスキップ(npm i jsdom)。'); process.exit(0); }

let pass = 0, fail = 0;
function T(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function near(a, b, tol, m) { if (Math.abs(a - b) > (tol || 1)) throw new Error((m || '') + ' expected≈' + b + ' got ' + a); }

function loadApp() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window; win.fetch = () => Promise.reject(new Error('no net'));
  for (const src of srcs) { const el = win.document.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8'); win.document.body.appendChild(el); }
  ok(win.__PAYSLIP_TEST, '__PAYSLIP_TEST 露出');
  return win;
}
const win = loadApp(); const A = win.__PAYSLIP_TEST; A.state.month = '2026-06';
const emp = o => Object.assign(A.defEmp(o.name || 'T'), { pref: 'tokyo', birthYmd: '1990-01-01' }, o);
const kojo = (r, l) => { const x = (r.kojo || []).find(k => k.label === l); return x ? x.value : 0; };

console.log('\n[payroll-patterns] 給与 全パターン 実データ検証 (2026-06 / 令和8年度)');

// ── ① 確定料率(令和8・公式照合済) ──
T('料率: 厚年=標準×18.3%÷2 / 雇用=総支給×0.5%(令和8引下げ)', function () {
  const r = A.compute(emp({ payType: '月給', base: '300000', fuyou: '0' }));
  near(kojo(r, '厚生年金'), Math.round(r.hyojun * 0.183 / 2), 1, '厚年');
  near(kojo(r, '雇用保険'), Math.round(r.shikyuTotal * 0.005), 1, '雇用0.5%');
});
T('料率: 東京健保=令和8 9.85%+子育て支援金0.23%=10.08%(折半)', function () {
  const r = A.compute(emp({ payType: '月給', base: '300000', fuyou: '0' }));
  const rate = kojo(r, '健康保険') * 2 / r.hyojun; // 標準報酬(厚年上限内)で近似
  near(rate, 0.1008, 0.0005, '東京健保+支援金');
});

// ── ② 全給与形態 差引=支給-控除・有限・手取り<総支給 ──
T('全形態(月給/時給/日給/歩合/役員/カスタム4モード): 差引一致・有限・手取り正', function () {
  const cases = [
    emp({ payType: '月給', base: '300000' }),
    emp({ payType: '時給', hourly: '1500', kintai: [{ label: '出勤日数', value: '20' }], workedH: '160' }),
    emp({ payType: '日給', base: '13000', kintai: [{ label: '出勤日数', value: '20' }] }),
    emp({ payType: '歩合', commissionAmt: '300000', hourlyGuarantee: '1200', workedH: '170' }),
    emp({ payType: '役員', base: '600000' }),
    emp({ payType: 'カスタム', payRule: { fixed: '250000', variable: { mode: 'none', parts: [] } } }),
    emp({ payType: 'カスタム', payRule: { fixed: '0', variable: { mode: 'max', parts: [{ type: 'rate', amount: '40' }, { type: 'hourly', amount: '1200' }] } }, salesAmt: '400000', workedH: '170' }),
  ];
  cases.forEach(function (e) {
    const r = A.compute(e);
    ok([r.shikyuTotal, r.kojoTotal, r.net, r.incomeTax].every(Number.isFinite), e.payType + ' 有限');
    ok(Math.abs(r.net - (r.shikyuTotal - r.kojoTotal)) <= 1, e.payType + ' 差引一致');
    ok(r.net > 0 && r.net < r.shikyuTotal, e.payType + ' 手取り正');
  });
});

// ── ③ 扶養0〜7で甲欄所得税が単調減少 ──
T('扶養0〜7: 甲欄所得税が単調に減少(増えない)', function () {
  let prev = Infinity;
  for (let f = 0; f <= 7; f++) {
    const r = A.compute(emp({ payType: '月給', base: '500000', fuyou: String(f) }));
    ok(r.incomeTax <= prev + 1, '扶' + f + 'で増加(' + r.incomeTax + '>' + prev + ')');
    ok(r.incomeTax >= 0 && Number.isFinite(r.incomeTax), '扶' + f + ' 所得税健全');
    prev = r.incomeTax;
  }
});

// ── ④ 税区分 乙>甲・丙は日額表 ──
T('税区分: 乙欄>甲欄 / 丙欄(日給)は算出される', function () {
  const ko = A.compute(emp({ payType: '月給', base: '300000', fuyou: '0', taxClass: 'ko' }));
  const otsu = A.compute(emp({ payType: '月給', base: '300000', fuyou: '0', taxClass: 'otsu' }));
  ok(otsu.incomeTax > ko.incomeTax, '乙>甲');
  const hei = A.compute(emp({ payType: '日給', base: '10000', taxClass: 'hei', kintai: [{ label: '出勤日数', value: '15' }] }));
  ok(Number.isFinite(hei.incomeTax) && hei.incomeTax >= 0, '丙欄健全');
});

// ── ⑤ 介護保険=40〜64歳のみ(kojo基準) ──
T('介護保険: 40〜64歳のみ控除に出る', function () {
  const y39 = A.compute(emp({ payType: '月給', base: '400000', birthYmd: '1990-01-01' })); // 36歳
  const y50 = A.compute(emp({ payType: '月給', base: '400000', birthYmd: '1976-01-01' })); // 50歳
  ok(kojo(y39, '介護保険') === 0, '40未満は介護0');
  ok(kojo(y50, '介護保険') > 0, '40-64は介護あり');
});

// ── ⑥ 産休/育休の社保免除(apply=UI設定と同じ)→ kojoから健保/厚年が消える ──
T('産休/育休: 社保免除で健保・厚年が控除に出ない(apply経路)', function () {
  const r = A.compute(emp({ payType: '月給', base: '300000', fuyou: '0', workStatus: 'sankyu', apply: { health: false, pension: false, kaigo: false } }));
  ok(kojo(r, '健康保険') === 0 && kojo(r, '厚生年金') === 0, '産休で健保/厚年が控除に無い');
});

// ── ⑦ 割増(残業)が支給に加算される ──
T('割増: 残業時間を入れると割増賃金が支給に加算', function () {
  const base = A.compute(emp({ payType: '月給', base: '300000' }));
  const ot = A.compute(emp({ payType: '月給', base: '300000', warimashi: { mode: 'easy', otH: '45', otM: '0' } }));
  ok(ot.shikyuTotal > base.shikyuTotal, '割増で総支給が増える');
});

// ── ⑧ 賞与: 算出率表(復興税込)・厚年150万上限・健保573万年度上限 ──
T('賞与(ShoyoZei): 税率表(復興税込)・厚年150万/回上限・健保573万年度上限', function () {
  const SZ = win.ShoyoZei; ok(SZ && SZ.calcBonusTax, 'ShoyoZei露出');
  const t = SZ.calcBonusTax({ bonus: 500000, bonusSI: 75000, prevSalary: 300000, prevSI: 45000, fuyou: 0, taxClass: 'ko', payYm: '2026-06' });
  ok(t.rate > 0 && !t.special, '算出率が引ける');
  const si2 = SZ.calcBonusSI({ bonus: 2000000, healthRate: 0.0504, hasKaigo: false, employRate: 0.005 });
  near(si2.pension, Math.round(1500000 * 0.0915), 2, '厚年150万上限');
  const si3 = SZ.calcBonusSI({ bonus: 1000000, healthRate: 0.0504, hasKaigo: false, employRate: 0.005, ytdKenpoBonus: 5700000 });
  ok(si3.kenpoBase === 30000, '健保573万年度上限(残3万)');
});

// ── ⑧b 高齢: 70歳以上=厚年資格喪失(0) / 75歳以上=健保資格喪失(後期高齢・0) ──
T('高齢: 70歳以上は厚年0 / 75歳以上は健保0(資格喪失・kojo基準)', function () {
  const y68 = A.compute(emp({ payType: '月給', base: '400000', birthYmd: '1958-01-01' })); // 2026-06で68歳
  ok(kojo(y68, '厚生年金') > 0 && kojo(y68, '健康保険') > 0, '68歳は厚年・健保あり');
  const y71 = A.compute(emp({ payType: '月給', base: '400000', birthYmd: '1955-01-01' })); // 71歳
  ok(kojo(y71, '厚生年金') === 0, '71歳は厚年0(70歳資格喪失)');
  ok(kojo(y71, '健康保険') > 0, '71歳は健保あり(75未満)');
  const y76 = A.compute(emp({ payType: '月給', base: '400000', birthYmd: '1950-01-01' })); // 76歳
  ok(kojo(y76, '健康保険') === 0, '76歳は健保0(75歳→後期高齢)');
  ok(kojo(y76, '厚生年金') === 0, '76歳は厚年も0');
});

// ── ⑧c 賞与も高齢ゲート: 71歳=賞与厚年0 / 76歳=賞与健保0 ──
T('賞与の高齢ゲート: 71歳は賞与厚年0 / 76歳は賞与健保0', function () {
  const st = A.state; st.bonus = { payYm: '2026-06', payDay: '', byEmp: {} };
  function bsi(birthYmd) {
    const e = emp({ payType: '月給', base: '400000', birthYmd });
    st.employees = [e]; A.bonusEntry(e).amount = '600000'; // 賞与60万
    return A.computeBonus(e).si;
  }
  const y68 = bsi('1958-01-01'); ok(y68.pension > 0 && y68.health > 0, '68歳は賞与厚年・健保あり');
  const y71 = bsi('1955-01-01'); ok(y71.pension === 0 && y71.health > 0, '71歳は賞与厚年0/健保あり');
  const y76 = bsi('1950-01-01'); ok(y76.health === 0 && y76.pension === 0, '76歳は賞与健保0/厚年0');
  st.bonus = { payYm: '', payDay: '', byEmp: {} };
});

// ── ⑨ 入退社の日割 ──
T('入退社: 月途中入社/退職で基本給が日割になる', function () {
  const full = A.compute(emp({ payType: '月給', base: '300000' }));
  const joinMid = A.compute(emp({ payType: '月給', base: '300000', joinYmd: '2026-06-16' }));
  const baseFull = (full.shikyu.find(x => x.label === '基本給') || {}).value;
  const baseMid = (joinMid.shikyu.find(x => x.label === '基本給') || {}).value;
  ok(baseMid < baseFull, '入社月は日割で基本給減');
});

// ── ⑨b 年末調整: 給与所得控除/基礎控除(令和8)/累進/復興税/各種控除/住宅ローン税額控除 ──
T('年末調整: 給与所得控除・基礎控除R8・算出税・復興税・過不足が正しい', function () {
  const NM = win.Nenmatsu; ok(NM && NM.computeNencho, 'Nenmatsu露出');
  const r = NM.computeNencho({ kyuyoShunyu: 5000000, shakaiHoken: 750000 });
  near(r.kyuyoShotoku, 3560000, 1, '給与所得(控除144万)');      // 500万×20%+44万=144万控除
  near(r.kojoList.kiso, 990000, 1, '基礎控除R8=99万');
  near(r.kazeiKyuyoShotoku, 1820000, 1, '課税所得');
  near(r.sanshutuZei, 91000, 1, '算出税(5%)');
  near(r.nenchouNenzei, 92900, 1, '年調年税額(×1.021・百円切捨)');
  const r3 = NM.computeNencho({ kyuyoShunyu: 3000000, shakaiHoken: 450000 });
  near(r3.kyuyoShotoku, 2020000, 1, '300万→給与所得控除98万');
});
T('年末調整: 各種控除が効く(生保/地震/障害者/配偶者/扶養/住宅ローン税額控除)', function () {
  const NM = win.Nenmatsu;
  ok(NM.computeNencho({ kyuyoShunyu: 5000000, seimei: { generalNew: 120000 } }).kojoList.seimei === 40000, '生保 一般新12万→4万上限');
  ok(NM.computeNencho({ kyuyoShunyu: 5000000, seimei: { generalNew: 120000, kaigo: 120000, pensionNew: 120000 } }).kojoList.seimei === 120000, '生保 総上限12万');
  const base = NM.computeNencho({ kyuyoShunyu: 5000000, shakaiHoken: 750000 });
  const withFuyo = NM.computeNencho({ kyuyoShunyu: 5000000, shakaiHoken: 750000, fuyoKojo: 760000 });
  ok(withFuyo.kazeiKyuyoShotoku < base.kazeiKyuyoShotoku, '扶養控除で課税所得減');
  const withLoan = NM.computeNencho({ kyuyoShunyu: 5000000, shakaiHoken: 750000, jutakuLoan: 200000 });
  ok(withLoan.nenchouNenzei < base.nenchouNenzei && withLoan.kazeiKyuyoShotoku === base.kazeiKyuyoShotoku, '住宅ローンは税額控除(課税所得は不変・年税額のみ減)');
});

// ── ⑨c 住民税モード / 退職月資格喪失 / 社保翌月徴収 ──
T('住民税: 月額直接 と 年額12分割(端数初月寄せ)', function () {
  const m = A.compute(emp({ payType: '月給', base: '300000', residentTaxMode: 'monthly', residentTax: '12500' }));
  near(kojo(m, '住民税'), 12500, 0, '月額直接');
  const y = A.compute(emp({ payType: '月給', base: '300000', residentTaxMode: 'annual', residentTaxAnnual: '180000' }));
  near(kojo(y, '住民税'), 15000, 0, '年額18万÷12');
});
T('退職月: 月中退職=社保0(前月まで) / 月末退職=当月社保あり', function () {
  const mid = A.compute(emp({ payType: '月給', base: '300000', taishokuYmd: '2026-06-15' }));
  ok(kojo(mid, '健康保険') === 0 && kojo(mid, '厚生年金') === 0, '6/15月中退職は当月社保0');
  const end = A.compute(emp({ payType: '月給', base: '300000', taishokuYmd: '2026-06-30' }));
  ok(kojo(end, '健康保険') > 0, '6/30月末退職は当月社保あり');
});
T('社保 翌月徴収(shahoTiming=next): 入社月は当月0', function () {
  A.state.company.shahoTiming = 'next';
  const r = A.compute(emp({ payType: '月給', base: '300000', joinYmd: '2026-06-10' }));
  A.state.company.shahoTiming = 'current';
  ok(kojo(r, '健康保険') === 0 && kojo(r, '厚生年金') === 0, '翌月徴収の入社月は社保0');
});

// ── ⑨d 割増 詳細モード/月60時間超(1.5倍) ──
T('割増: 詳細モードで60時間超(1.5)が効く・RATEが法定', function () {
  ok(win.Warimashi.RATE.ot === 1.25 && win.Warimashi.RATE.over60 === 1.5 && win.Warimashi.RATE.over60Night === 1.75, 'RATE法定(ot1.25/60超1.5/60超深夜1.75)');
  const e = emp({ payType: '月給', base: '300000', warimashi: { mode: 'detail', detail: { ot: { h: '40', m: '0' }, over60: { h: '20', m: '0' } } } });
  const w = (A.compute(e).shikyu || []).find(x => /割増/.test(x.label));
  ok(w && w.value > 0, '詳細+60h超で割増賃金が出る');
});

// ── ⑨e 全銀ファイル(総合振込): 120桁固定レコード・件数・合計 ──
T('全銀ファイル: 120桁固定×5レコード・件数/合計が正しい(money-critical)', function () {
  const Z = win.Zengin; ok(Z && Z.build, 'Zengin露出');
  const committer = { code: '0123456789', name: 'ｶ)ｾﾞﾛｱｸﾄ', torikumiMMDD: '0625', bankNo: '0001', bankName: 'ﾐｽﾞﾎ', branchNo: '001', branchName: 'ﾎﾝﾃﾝ', yokin: '1', account: '1234567' };
  const tr = [
    { bankNo: '0005', bankName: 'UFJ', branchNo: '002', branchName: 'ｼﾌﾞﾔ', yokin: '1', account: '7654321', name: 'ﾔﾏﾀﾞ ﾀﾛｳ', amount: 252310 },
    { bankNo: '0009', bankName: 'SMBC', branchNo: '003', branchName: 'ｼﾝｼﾞｭｸ', yokin: '2', account: '1112223', name: 'ｻﾄｳ ﾊﾅｺ', amount: 198000 },
  ];
  const r = Z.build(committer, tr);
  near(r.count, 2, 0, '件数'); near(r.total, 450310, 0, '合計');
  const lines = String(r.text || '').split(/\r?\n/).filter(Boolean);
  near(lines.length, 5, 0, 'レコード数(ヘッダ+データ2+トレーラ+エンド)');
  ok(lines.every(l => l.length === 120), '全レコード120桁固定');
});

// ── ⑩ 網羅: 全形態×扶養0-3×県5×年齢4=480 → NaN/差引不一致/手取りマイナス ゼロ ──
T('網羅480ケース: NaN・差引不一致・手取りマイナス ゼロ', function () {
  const PT = [['月給', 'base', '280000'], ['時給', 'hourly', '1500'], ['日給', 'base', '13000'], ['歩合', 'commissionAmt', '300000'], ['役員', 'base', '600000'], ['カスタム', '_pr', '']];
  const PR = ['tokyo', 'osaka', 'hokkaido', 'okinawa', 'hiroshima']; const BY = ['1995-01-01', '1970-01-01', '1952-01-01', '1998-01-01'];
  let nan = 0, mism = 0, neg = 0, n = 0;
  for (const [pt, fld, val] of PT) for (let f = 0; f <= 3; f++) for (const pr of PR) for (const by of BY) {
    const o = { name: pt, payType: pt, fuyou: String(f), pref: pr, birthYmd: by };
    if (pt === 'カスタム') o.payRule = { fixed: '250000', variable: { mode: 'none', parts: [] } };
    else o[fld] = val;
    if (pt === '時給' || pt === '日給') { o.kintai = [{ label: '出勤日数', value: '20' }]; o.workedH = '160'; }
    if (pt === '歩合') { o.hourlyGuarantee = '1200'; o.workedH = '170'; }
    const r = A.compute(emp(o)); n++;
    if (![r.shikyuTotal, r.kojoTotal, r.net, r.incomeTax].every(Number.isFinite)) nan++;
    else { if (Math.abs(r.net - (r.shikyuTotal - r.kojoTotal)) > 1) mism++; if (r.net < 0) neg++; }
  }
  ok(nan === 0, 'NaN=' + nan); ok(mism === 0, '差引不一致=' + mism); ok(neg === 0, '手取りマイナス=' + neg + '/' + n);
});

// ── 本人の人的加算(甲欄): ひとり親/障害者/勤労学生で扶養親族等の数+1 → 甲欄所得税が下がる。乙欄は不変(配線確認) ──
T('本人加算(甲): ひとり親で甲欄所得税が「扶養+1」ぶん下がる・乙欄は不変', function () {
  const base = { payType: '月給', base: '300000', fuyou: '0' };
  const t0 = A.compute(emp(Object.assign({ name: 'K0' }, base))).incomeTax;
  const tHitori = A.compute(emp(Object.assign({ name: 'K1' }, base, { honninKafuHitorioya: 'hitorioya' }))).incomeTax;
  const tFuyou1 = A.compute(emp(Object.assign({ name: 'K2' }, base, { fuyou: '1' }))).incomeTax;
  ok(tHitori < t0, 'ひとり親で甲欄税が下がる(' + t0 + '→' + tHitori + ')');
  near(tHitori, tFuyou1, 1, 'ひとり親=扶養+1と等価');
  // 乙欄は人的加算の対象外(税額が変わらない)
  const oBase = A.compute(emp(Object.assign({ name: 'O0', taxClass: 'otsu' }, base))).incomeTax;
  const oHitori = A.compute(emp(Object.assign({ name: 'O1', taxClass: 'otsu' }, base, { honninKafuHitorioya: 'hitorioya' }))).incomeTax;
  near(oHitori, oBase, 1, '乙欄は本人加算で変わらない');
});
T('本人加算(甲): 障害者+勤労学生で扶養+2ぶん下がる', function () {
  const base = { payType: '月給', base: '350000', fuyou: '1' };
  const t1 = A.compute(emp(Object.assign({ name: 'J1' }, base))).incomeTax;
  const t3 = A.compute(emp(Object.assign({ name: 'J3' }, base, { honninShogai: true, honninKinrou: true }))).incomeTax;
  const tFuyou3 = A.compute(emp(Object.assign({ name: 'J9', payType: '月給', base: '350000', fuyou: '3' }))).incomeTax;
  ok(t3 < t1, '障害者+勤労学生で下がる(' + t1 + '→' + t3 + ')');
  near(t3, tFuyou3, 1, '2加算=扶養+2(=計3)と等価');
});

// ── 年末調整の集計が通勤手当の「非課税限度 超過分」を課税収入に含める(月次源泉と一致・配線) ──
T('年調集計: 通勤15万超の超過分が年間給与収入に入る(月次と非対称でない)', function () {
  // マイカー通勤(限度7,300)で通勤15,000=超過7,700。保存済み明細1か月を模して nenAggregate に流す
  const slip = { employee_id: 'E1', data: { kind: 'monthly', tax: 0, si: {}, shikyu: [
    { label: '基本給', value: 250000 },
    { label: '通勤手当', value: 15000, hikazei: true, nonTaxLimit: 7300 }
  ] } };
  const agg = A.nenAggregate([slip], 'E1');
  near(agg.shunyu, 257700, 1, '課税給与収入=基本給250,000+通勤超過7,700'); // 旧バグ実装だと250,000で7,700欠落
});

// ── 産育休/法定控除オフ: si自体を0にし 集計/賃金台帳(shakaiRows=r.si直読み) と 明細(kojo) を一致させる ──
T('産休・育休: si.total=0 (集計/台帳が休職者に社保を出さない・kojoと一致)', function () {
  for (const ws of ['sankyu', 'ikukyu']) {
    const r = A.compute(emp({ name: ws, payType: '月給', base: '300000', workStatus: ws, leaveStartYmd: '2026-06-01', leaveEndYmd: '2026-08-31', leaveDaysInMonth: '30' }));
    const si = r.si || {};
    ok((si.health + si.pension + (si.kaigo || 0)) === 0, ws + ' の si 社保が0でない(健' + si.health + '/厚' + si.pension + '/介' + si.kaigo + ')');
    const kojoSocial = (r.kojo || []).filter(k => /健康保険|介護保険|厚生年金/.test(k.label)).reduce((a, k) => a + k.value, 0);
    ok(kojoSocial === 0, ws + ' の kojo に社保が残る');
  }
});
T('法定控除オフ(役員=雇用なし/非加入=健保厚年なし): siも0で集計と一致', function () {
  const r = A.compute(emp({ name: '役員', payType: '月給', base: '500000', apply: { health: false, pension: false, kaigo: false, employ: false } }));
  const si = r.si || {};
  ok(si.health === 0 && si.pension === 0 && (si.kaigo || 0) === 0 && si.employ === 0, 'オフにした社保のsiが0でない: ' + JSON.stringify(si));
  ok((si.total || 0) === 0, 'si.total=0でない(' + si.total + ')');
});

// ── 賞与の健保573万 年度累計(ytd)を自動集計値で上限適用・手入力は上書き ──
T('賞与ytd自動: _bonusYtd(既往500万)で健保573万上限が効く・手入力で上書き', function () {
  const e = emp({ name: 'ytd', payType: '月給', base: '300000', pref: 'tokyo' });
  A.state.bonus = { payYm: '2026-12', byEmp: {} };
  const en = A.bonusEntry(e); en.amount = '2000000'; // 標準賞与額200万
  A.state._bonusYtd = {}; A.state._bonusYtd[e.id] = 5000000; // 既往500万を自動集計済とする
  const c = A.computeBonus(e);
  ok(c.ytdAuto === true && c.ytdVal === 5000000, 'ytd自動が反映');
  ok(c.si.kenpoBase === 730000, '健保対象が573万上限で73万(' + c.si.kenpoBase + ')'); // min(200万, 573万-500万=73万)
  en.ytd = '0'; const c2 = A.computeBonus(e); // 手入力0で上書き
  ok(c2.ytdAuto === false && c2.si.kenpoBase === 2000000, '手入力0で上限未適用(' + c2.si.kenpoBase + ')');
  en.ytd = ''; A.state._bonusYtd = {}; // 後片付け
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
