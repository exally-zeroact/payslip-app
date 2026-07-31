/* verify-headless.mjs — ★lib/ が headless であることを機械で強制する★
 *
 * なぜ: lib は「検証済みエンジン」として最終形(Exally 1本)に生き残る資産。
 *   UIに触る依存が1つ混ざると、グリッド/チャット/CI/オペレーションから呼べなくなる。
 *   現状すでにクリーンなので、これは「直す」ではなく「壊れないよう縛る」ためのガード。
 *
 * 二重にチェックする:
 *   ①静的 … Nodeでutf8読み(★ripgrepに頼らない: statutory-rows.js はNUL文字を含みバイナリ判定される)
 *            コメント/文字列リテラルを除いた上で禁止識別子を探す。
 *            window/self/globalThis は「UMDのexportガードの形」のときだけ許す。
 *   ②動的 … window/document/localStorage/fetch/alert を「触ると即throwするgetter」に毒化してから
 *            lib/*.js を全部 require し、主要エントリを代表引数で実行。1つでも触れば赤。
 *
 * 使い方: node scripts/verify-headless.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'lib');

// ★例外: ここだけはブラウザ依存を許す(理由つき)。opはこれらを呼ばず、純関数だけ使う。
const ALLOWED = {
  'payslip-xlsx.js': {
    fns: ['download', 'downloadSheets'],
    why: 'SheetJS(グローバルXLSX)でファイルを書き出す出口。純関数(shukeiAOA/meishiAOA/...)とは分離済みで、' +
      'オペレーションはAOAだけを使う。UI総入れ替え時に adapters/ へ移す予定。',
  },
};

const BANNED = [
  ['document', /\bdocument\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['fetch(', /\bfetch\s*\(/],
  ['alert(', /\balert\s*\(/],
  ['confirm(', /\bconfirm\s*\(/],
  ['prompt(', /\bprompt\s*\(/],
  ['navigator', /\bnavigator\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['FileReader', /\bFileReader\b/],
  ['createElement', /\bcreateElement\b/],
  ['new Blob', /\bnew\s+Blob\b/],
  ['new Image', /\bnew\s+Image\b/],
  ['Math.random', /\bMath\.random\b/],       // 再現性が壊れる
  ['Date.now', /\bDate\.now\b/],             // 同上
  ['new Date() 引数なし', /new\s+Date\s*\(\s*\)/], // 同上（引数ありは決定的なのでOK）
];

// UMDのexportガードとして許す形
const UMD_OK = [
  /typeof\s+self\s*!==\s*['"]undefined['"]\s*\?\s*self\s*:\s*this/,
  /typeof\s+window\s*!==\s*['"]undefined['"]/,
  /typeof\s+globalThis\s*!==\s*['"]undefined['"]/,
  /window\.[A-Za-z_$][\w$]*\s*=\s*(api|factory\(\)|[A-Z][\w$]*)/,
  /globalThis\.[A-Za-z_$][\w$]*\s*=\s*(api|factory\(\)|[A-Z][\w$]*)/,
  /root\.[A-Za-z_$][\w$]*\s*=\s*factory\(/,
  /\?\s*window\s*:\s*(root|globalThis|\{\})/,
  /typeof\s+window\s*!==\s*['"]undefined['"]\s*&&\s*window\.[A-Za-z_$][\w$]*/,
];

// 文字列リテラル・コメントを空白に潰す（識別子だけを見るため）
function stripLiterals(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && src[i + 1] === '*') { out += '  '; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += (src[i] === '\n' ? '\n' : ' '); i++; } out += '  '; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; out += ' '; i++;
      while (i < n) { if (src[i] === '\\') { out += '  '; i += 2; continue; } if (src[i] === q) { out += ' '; i++; break; } out += (src[i] === '\n' ? '\n' : ' '); i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

let fails = [];
let checkedFiles = 0, checkedHits = 0;

// ── ① 静的 ──
const files = fs.readdirSync(LIB).filter(f => f.endsWith('.js')).sort();
for (const f of files) {
  // ★Nodeでutf8読み。ripgrep等はNUL文字(lib/statutory-rows.jsが持つ)でバイナリ判定して素通りする
  const raw = fs.readFileSync(path.join(LIB, f), 'utf8');
  const code = stripLiterals(raw);
  checkedFiles++;
  const allow = ALLOWED[f];
  for (const [name, re] of BANNED) {
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(code)) !== null) {
      const ln = lineOf(code, m.index);
      const srcLine = raw.split('\n')[ln - 1] || '';
      if (allow && allow.fns.some(fn => srcLine.includes(fn) || nearFunction(raw, ln, allow.fns))) { checkedHits++; continue; }
      fails.push(`${f}:${ln} 禁止: ${name}  → ${srcLine.trim().slice(0, 100)}`);
    }
  }
  // window/self/globalThis は UMD ガードの形のときだけ許す
  const g2 = /\b(window|globalThis)\b/g;
  let m2;
  while ((m2 = g2.exec(code)) !== null) {
    const ln = lineOf(code, m2.index);
    const srcLine = raw.split('\n')[ln - 1] || '';
    if (UMD_OK.some(re => re.test(srcLine))) { checkedHits++; continue; }
    fails.push(`${f}:${ln} window/globalThis の使い方がUMDのexportガードの形ではありません → ${srcLine.trim().slice(0, 100)}`);
  }
}

// 例外関数の中かどうか（雑だが十分: 直前50行以内に function 名がある）
function nearFunction(raw, ln, fns) {
  const lines = raw.split('\n');
  for (let i = ln - 1; i >= Math.max(0, ln - 50); i--) {
    const t = lines[i] || '';
    if (fns.some(fn => new RegExp('function\\s+' + fn + '\\s*\\(').test(t))) return true;
    if (/^\s{2}function\s/.test(t)) return false; // 別の関数に入った
  }
  return false;
}

// ── ② 動的（子プロセスでグローバルを毒化して実行） ──
const probe = `
const path=require('path'), fs=require('fs');
const LIB=${JSON.stringify(LIB)};
const touched=[];
// ★毒化は「触ったら記録して undefined を返す」。throwにしない理由:
//   UMDの存在チェック typeof window !== 'undefined' は正当で、throwすると全libが読めなくなる。
//   window/globalThis 自体はUMDのexportガードが正当に読むので毒化の対象外(そちらは静的チェックで見る)。
for (const k of ['document','localStorage','sessionStorage','alert','confirm','prompt','fetch','navigator','XMLHttpRequest','FileReader']) {
  Object.defineProperty(globalThis, k, { configurable:true, get(){ touched.push(k); return undefined; } });
}
const mods={};
for (const f of fs.readdirSync(LIB).filter(f=>f.endsWith('.js')).sort()) {
  try { mods[f]=require(path.join(LIB,f)); } catch(e){ console.log('LOADFAIL\\t'+f+'\\t'+e.message); }
}
// 主要エントリを代表引数で実行（DOMに触れば毒getterがthrowする）
const ctx={ company:{name:'T',annualHolidays:'120',dailyWorkH:'8',dailyWorkM:'0',gyoshu:'ippan',holidays:[0],ruleOn:{}}, month:'2026-06', otHist:{} };
const emp={ id:'p1',name:'P',payType:'月給',base:'300000',fuyou:'1',pref:'tokyo',birthYmd:'1990-01-01',
  shikyu:[{label:'基本給',value:'300000'}],kintai:[{label:'出勤日数',value:'21'}],apply:{},taxClass:'ko',
  workedH:'160',workedM:'0',warimashi:{mode:'easy'},shaho:{mode:'teiji',months:[]},extraKojo:[] };
const CALLS=[
  ()=>mods['payroll-monthly.js'].compute(JSON.parse(JSON.stringify(emp)), ctx),
  ()=>{ const e=JSON.parse(JSON.stringify(emp)); mods['payroll-monthly.js'].compute(e,ctx); return mods['payroll-warnings.js'].collect(e,ctx); },
  ()=>mods['payroll-warnings.js'].collectCompany(ctx),
  ()=>mods['calc.js'].computePayslip({shikyu:[{label:'基本給',value:300000}],payYm:'2026-06',fuyou:1,pref:'tokyo'}),
  ()=>mods['payroll-calc.js'].calcSocialInsurance({payTotal:300000,pref:'tokyo',payYm:'2026-06'}),
  ()=>mods['warimashi.js'].easy({base:300000,annualHolidays:'120',dailyHours:8,otH:'10'}),
  ()=>mods['shotokuzei-densan.js'].calcByClass(250000,1,'ko',{year:2026}),
  ()=>mods['saitei-chingin.js'].getChingin('tokyo'),
  ()=>mods['shaho-kanyu.js'].judge({weeklyH:25,fullTimeWeeklyH:40,monthlyShoteiWage:100000,ym:'2026-06',tokuteiTekiyo:true}),
  ()=>mods['holidays.js'].scheduledWorkdays('2026-06',[0],[]),
  ()=>mods['zaiseki.js'].prorateInfo({joinYmd:'2026-06-16'},'2026-06'),
  ()=>mods['juminzei.js'].juminForMonth({annualTax:120000,ym:'2026-06'}),
  ()=>mods['payslip-xlsx.js'].shukeiAOA([{name:'A',net:1,shikyuTotal:2,kojoTotal:1}],{}),
  ()=>mods['payslip-xlsx.js'].meishiAOA({name:'A',shikyu:[],kojo:[],net:1},{}),
  ()=>mods['ledger-agg.js'].aggregateEmployee ? mods['ledger-agg.js'].aggregateEmployee([],{}) : null,
  ()=>mods['op-contract.js'].validateInputs({month:'2026-06'},[{key:'month',type:'ym',required:true}]),
];
let ran=0;
for (const c of CALLS) { try { c(); ran++; } catch(e){ console.log('CALLFAIL\\t'+e.message); } }
console.log('RAN\\t'+ran+'/'+CALLS.length);
console.log('TOUCHED\\t'+touched.join(','));
`;

let dynOut = '';
try {
  dynOut = execFileSync(process.execPath, ['-e', probe], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
} catch (e) {
  dynOut = (e.stdout || '') + (e.stderr || '');
  fails.push('動的チェックの実行に失敗: ' + (e.message || '').slice(0, 200));
}
const dynLines = dynOut.trim().split('\n');
for (const ln of dynLines) {
  if (ln.startsWith('LOADFAIL')) fails.push('素Nodeで読み込めません → ' + ln.replace(/^LOADFAIL\t/, ''));
  if (ln.startsWith('CALLFAIL')) fails.push('毒化グローバルに触れた/実行失敗 → ' + ln.replace(/^CALLFAIL\t/, ''));
}
const ranLine = dynLines.find(l => l.startsWith('RAN')) || 'RAN\t0/0';
const touchedLine = (dynLines.find(l => l.startsWith('TOUCHED')) || 'TOUCHED\t').split('\t')[1] || '';
if (touchedLine) fails.push('毒化グローバルに触れました: ' + touchedLine);

console.log('\n[verify-headless] lib/ の headless 検証');
console.log(`  ①静的: ${checkedFiles}ファイル走査（許可された UMD/例外パターン ${checkedHits}件）`);
console.log(`  ②動的: 毒化グローバル下で ${ranLine.split('\t')[1]} 本のエントリを実行`);
console.log(`  例外登録: lib/payslip-xlsx.js の download/downloadSheets（${ALLOWED['payslip-xlsx.js'].why}）`);

if (fails.length) {
  console.log('\n✗ headless違反 ' + fails.length + '件:');
  fails.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('\n✓ lib/ は headless（DOM・ネットワーク・非決定性に依存していない）');
