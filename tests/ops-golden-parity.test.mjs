/* ops-golden-parity.test.mjs — ★1円一致の証明★
 *
 * 比較相手は【移設前(1c128e1)に凍結したゴールデン】。移設後のapp.jsとの比較ではない。
 *   移設後は app.js も op も同じ lib を呼ぶので、両者の比較は自己参照＝常に緑＝何も証明しない。
 *
 * 見るもの:
 *   ① お金   … 総支給/控除各項目/控除計/手取り/課税A/標準報酬/中間値si を全ケース完全一致
 *   ② Excel … buildPeople の出力(people)と AOA/cols/merges をセル単位で一致
 *   ③ 警告   … 経理向け(Excelの要確認列)は文言まで完全一致。UI由来の全文言はコード集合で網羅を確認
 *
 * 使い方: node tests/ops-golden-parity.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const op = require(path.join(ROOT, 'ops/payroll.monthly.js'));

const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/payroll-input.json'), 'utf8'));
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/golden-1c128e1.json'), 'utf8'));

let pass = 0, fail = 0;
const diffs = [];
function T(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function eqNum(a, b, where) { if (a !== b) { diffs.push(`${where}: golden=${b} op=${a} 差=${a - b}`); throw new Error(`${where} golden=${b} op=${a}`); } }
function deep(a, b, where) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { diffs.push(`${where}: 不一致`); throw new Error(`${where}\n  golden=${B.slice(0, 300)}\n  op    =${A.slice(0, 300)}`); } }

// ゴールデンのUI文言 → 警告コード（テスト側の分類器。opの出力からは作らない）
function codesOf(text) {
  const c = new Set();
  if (/^最低賃金（.+）を下回っています/.test(text)) c.add('MIN_WAGE_UNDER');
  if (/保障給がありません/.test(text)) c.add('NO_GUARANTEE_PAY');
  if (/年間の労働時間が法律の目安/.test(text)) c.add('ANNUAL_HOURS_OVER');
  if (/単月100時間以上/.test(text)) c.add('OT_OVER100');
  if (/時間外が月45時間を超えています/.test(text)) c.add('OT_OVER45');
  if (/深夜（22時〜翌5時）の労働/.test(text)) c.add('MINOR_NIGHT');
  if (/18歳未満の方に時間外・休日労働/.test(text)) c.add('MINOR_OT');
  if (/平均が月80時間を超えています/.test(text)) c.add('OT36_AVG80');
  if (/年720時間を超えています/.test(text)) c.add('OT36_YEAR720');
  if (/月45時間を超えた月が年\d+回/.test(text)) c.add('OT36_COUNT6');
  if (/をオフにしています。短時間労働者などの適用除外/.test(text)) c.add('SHAHO_OFF_ELIGIBLE');
  if (/社会保険（健康保険・厚生年金）の加入対象の可能性/.test(text)) c.add('SHAHO_KANYU_REQUIRED');
  if (/控除なしの報酬明細/.test(text)) c.add('CONTRACTOR_DISGUISED');
  if (/丙は給与形態＝日給が前提です/.test(text)) c.add('HEI_NOT_DAILY');
  if (/休業手当が未入力/.test(text)) c.add('KYUGYO_TEATE_MISSING');
  if (/休業手当が平均賃金の約?60%を下回/.test(text)) c.add('KYUGYO_TEATE_LOW');
  if (/差引支給がマイナス/.test(text)) c.add('NET_NEGATIVE');
  if (/につき在籍\d+日で日割/.test(text)) c.add('PRORATE_JOIN_LEAVE');
  if (/月中退職のため当月の社保/.test(text)) c.add('MID_LEAVE_NO_SHAHO');
  if (/日が不就労のため控除/.test(text)) c.add('LEAVE_NOWORK_DEDUCTED');
  if (/固定残業（みなし）\d+時間を控除/.test(text)) c.add('MINASHI_APPLIED');
  if (/割増の率が法定下限を下回っています|が労基法37条の下限を下回/.test(text)) { c.add('RATE_BELOW_LEGAL'); }
  if (/は未収録の年度です/.test(text)) c.add('STATUTORY_STALE');
  return c;
}
const RATE_CODES = ['RATE_BELOW_LEGAL_OT', 'RATE_BELOW_LEGAL_HOLIDAY', 'RATE_BELOW_LEGAL_NIGHT', 'RATE_BELOW_LEGAL_OVER60'];

console.log('\n[ops-golden-parity] 移設前ゴールデン(1c128e1) vs ops/payroll.monthly');

let moneyChecked = 0, cellChecked = 0;

for (const ds of input.datasets) {
  const g = golden.datasets.find(x => x.id === ds.id);
  if (!g) { fail++; console.log('  ✗ ゴールデンに ' + ds.id + ' がありません'); continue; }

  const res = op.engine({ month: ds.month, company: ds.company, employees: ds.employees, otHistory: ds.otHistory });

  T(`[${ds.id}] 契約検証を通過し errors が空`, function () {
    if (res.errors.length) throw new Error(JSON.stringify(res.errors).slice(0, 300));
    if (!res.value) throw new Error('value が null');
  });

  T(`[${ds.id}] お金が1円まで一致（${g.people.length}名 × 総支給/控除各項目/手取り/課税A/標準報酬/si）`, function () {
    if (res.value.people.length !== g.people.length) throw new Error(`人数 golden=${g.people.length} op=${res.value.people.length}`);
    g.people.forEach((gp, i) => {
      const op_ = res.value.people[i];
      const w = `${ds.id}/${gp.name}`;
      if (op_.empId !== gp.empId) throw new Error(`${w}: empId golden=${gp.empId} op=${op_.empId}`);
      const m = gp.money;
      eqNum(op_.shikyuTotal, m.shikyuTotal, `${w}.総支給`);
      eqNum(op_.kojoTotal, m.kojoTotal, `${w}.控除計`);
      eqNum(op_.net, m.net, `${w}.手取り`);
      eqNum(op_.kazei, m.kazei, `${w}.課税A`);
      eqNum(op_.nonTaxable, m.nonTaxable, `${w}.非課税`);
      eqNum(op_.hyojun, m.hyojun, `${w}.標準報酬`);
      eqNum(op_.hyojunHealth, m.hyojunHealth, `${w}.標準報酬(健保)`);
      eqNum(op_.hyojunPension, m.hyojunPension, `${w}.標準報酬(厚年)`);
      eqNum(op_.incomeTax, m.incomeTax, `${w}.所得税`);
      eqNum(op_.residentTax, m.residentTax, `${w}.住民税`);
      for (const k of ['health', 'kaigo', 'pension', 'employ', 'total']) eqNum(op_.si[k], m.si[k], `${w}.si.${k}`);
      deep(op_.shikyu.map(x => ({ label: x.label, value: x.value, hikazei: !!x.hikazei })), m.shikyu, `${w}.支給明細`);
      deep(op_.kojo.map(x => ({ label: x.label, value: x.value })), m.kojo, `${w}.控除明細`);
      if (op_.netNegative !== m.netNegative) throw new Error(`${w}.差引マイナス判定`);
      moneyChecked++;
    });
  });

  T(`[${ds.id}] Excel(buildPeople出力)が一致`, function () {
    const p = res.cells._people;
    if (p.length !== g.excel.people.length) throw new Error(`人数 golden=${g.excel.people.length} op=${p.length}`);
    g.excel.people.forEach((gp, i) => deep(p[i], gp, `${ds.id}/${gp.name} excel.person`));
    deep(res.cells._opts, g.excel.opts, `${ds.id} excel.opts`);
  });

  T(`[${ds.id}] Excelのセル(AOA/cols/merges)がセル単位で一致`, function () {
    const sheets = res.cells.sheets;
    deep({ aoa: sheets[0].aoa, cols: sheets[0].cols, merges: sheets[0].merges },
      { aoa: g.excel.shukei.aoa, cols: g.excel.shukei.cols, merges: g.excel.shukei.merges }, `${ds.id} 集計シート`);
    g.excel.meishi.forEach((gm, i) => {
      const s = sheets[i + 1];
      if (s.name !== gm.sheetName) throw new Error(`${ds.id} シート名 golden=${gm.sheetName} op=${s.name}`);
      deep({ aoa: s.aoa, cols: s.cols, merges: s.merges }, { aoa: gm.aoa, cols: gm.cols, merges: gm.merges }, `${ds.id} 明細シート#${i + 1}`);
      cellChecked++;
    });
  });

  T(`[${ds.id}] 経理向け警告(Excelの要確認列)が文言まで一致`, function () {
    g.excel.people.forEach((gp, i) => deep(res.cells._people[i].warnings, gp.warnings, `${ds.id}/${gp.name} empWarnings`));
  });

  T(`[${ds.id}] UI由来の警告をオペが1つも落としていない(コード網羅)`, function () {
    const opCodes = new Set(res.warnings.map(w => (RATE_CODES.indexOf(w.code) >= 0 ? 'RATE_BELOW_LEGAL' : w.code)));
    const goldenCodes = new Set();
    g.companyWarnings.forEach(t => codesOf(t).forEach(c => goldenCodes.add(c)));
    g.people.forEach(p => p.warnings.forEach(t => codesOf(t).forEach(c => goldenCodes.add(c))));
    const missing = [...goldenCodes].filter(c => !opCodes.has(c));
    if (missing.length) throw new Error(`オペ側に無い警告: ${missing.join(', ')}（ゴールデンには出ている）`);
  });
}

T('比較件数が十分（空振りしていない）', function () {
  if (moneyChecked < 50) throw new Error('お金の比較件数が少なすぎます: ' + moneyChecked);
  if (cellChecked < 50) throw new Error('Excelシートの比較件数が少なすぎます: ' + cellChecked);
});

console.log(`\n── 実測 ──`);
console.log(`  お金を突き合わせた人数: ${moneyChecked}名（1人あたり 総支給/控除計/手取り/課税A/非課税/標準報酬×3/所得税/住民税/si×5/支給明細/控除明細）`);
console.log(`  Excel明細シート: ${cellChecked}枚をセル単位で比較`);
console.log(`  差分: ${diffs.length} 件` + (diffs.length ? '\n   ' + diffs.slice(0, 20).join('\n   ') : '  ← 差分ゼロ'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
