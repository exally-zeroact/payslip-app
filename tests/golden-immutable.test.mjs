/* golden-immutable.test.mjs — ★ゴールデンと入力fixtureの凍結を機械で守る★
 *
 * 目的: 「期待値を自分の出力から作らない」を担保する。
 *   ・入力fixture(payroll-input.json) の SHA256 が golden.meta.inputSha256 と一致すること
 *   ・golden.datasets の SHA256 が golden.meta.goldenSha256 と一致すること
 *   ・golden.meta.baseCommit が移設前コミットのままであること
 *   後からゴールデンを作り直す/入力をいじると、ここが赤くなる。
 *
 * 使い方: node tests/golden-immutable.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE_COMMIT = '1c128e1';
const INPUT = path.join(ROOT, 'tests', 'fixtures', 'payroll-input.json');
const GOLDEN = path.join(ROOT, 'tests', 'fixtures', `golden-${BASE_COMMIT}.json`);

let pass = 0, fail = 0;
function T(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
// ★改行は必ず正規化してからハッシュする: git の autocrlf で Windows作業ツリーがCRLFになっても
//   Linux(CI)と同じ値になる＝凍結がプラットフォーム依存にならない。
const sha256 = (s) => crypto.createHash('sha256').update(String(s).replace(/\r\n/g, '\n'), 'utf8').digest('hex');

console.log('\n[golden-immutable] 凍結の照合');

const inputRaw = fs.readFileSync(INPUT, 'utf8');
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

T('ゴールデンの baseCommit が移設前(' + BASE_COMMIT + ')のまま', function () {
  eq(golden.meta.baseCommit, BASE_COMMIT, 'baseCommit');
});

T('入力fixtureのSHA256が meta.inputSha256 と一致（入力が後から動いていない）', function () {
  eq(sha256(inputRaw), golden.meta.inputSha256, 'inputSha256');
});

T('ゴールデン本体のSHA256が meta.goldenSha256 と一致（期待値が作り直されていない）', function () {
  eq(sha256(JSON.stringify(golden.datasets)), golden.meta.goldenSha256, 'goldenSha256');
});

T('ゴールデンの中身が空でない（datasets/人/警告）', function () {
  ok(golden.datasets.length >= 10, 'datasets>=10 got ' + golden.datasets.length);
  const people = golden.datasets.reduce((a, d) => a + d.people.length, 0);
  ok(people >= 50, '人数>=50 got ' + people);
  const warns = golden.datasets.reduce((a, d) => a + d.companyWarnings.length + d.people.reduce((b, p) => b + p.warnings.length, 0), 0);
  ok(warns >= 30, '警告>=30 got ' + warns);
});

T('お金の値が全ケースで有限（NaN/undefinedが焼かれていない）', function () {
  for (const d of golden.datasets) for (const p of d.people) {
    const m = p.money;
    for (const k of ['shikyuTotal', 'kojoTotal', 'net', 'kazei', 'hyojun', 'incomeTax', 'residentTax', 'nonTaxable']) {
      ok(Number.isFinite(m[k]), `${d.id}/${p.name}.${k} が有限でない: ${m[k]}`);
    }
    for (const k of ['health', 'kaigo', 'pension', 'employ', 'total']) {
      ok(Number.isFinite(m.si[k]), `${d.id}/${p.name}.si.${k} が有限でない: ${m.si[k]}`);
    }
    eq(m.net, m.shikyuTotal - m.kojoTotal, `${d.id}/${p.name} 差引=支給-控除`);
  }
});

T('Excelの真値(buildPeople出力)が焼かれている', function () {
  for (const d of golden.datasets) {
    ok(d.excel && Array.isArray(d.excel.people), d.id + ': excel.people');
    eq(d.excel.people.length, d.people.length, d.id + ': excel人数');
    ok(Array.isArray(d.excel.shukei.aoa) && d.excel.shukei.aoa.length >= 4, d.id + ': 集計AOA');
    ok(d.excel.meishi.length === d.people.length, d.id + ': 明細シート数');
  }
});

T('警告テキストにテンプレ未展開の痕跡(\'+var+\')が無い', function () {
  for (const d of golden.datasets) {
    const all = d.companyWarnings.concat(...d.people.map(p => p.warnings));
    for (const w of all) ok(!/'\s*\+|\+\s*'/.test(w), d.id + ': 未展開の警告文が焼かれている → ' + w.slice(0, 60));
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
