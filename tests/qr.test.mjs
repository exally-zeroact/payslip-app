// qr.test.mjs — ★Web明細リンクQRの厳密検証(生成→ラスタライズ→jsQR復号→一致)★
//  lib/qr.js(vendored qrcode-generator MIT)が作るQRを jsQR で実際に読み取り、元URLに一致することを保証。
//  "描画されるが読めない"silent-wrongを防ぐ。依存: jsqr(devDep・app本体は非依存)。未導入なら SKIP。
import { createRequire } from 'node:module';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let jsQR, qrcode;
try { jsQR = require('jsqr'); jsQR = jsQR.default || jsQR; }
catch { console.log('SKIP: jsqr未導入=QR復号テストをスキップ(npm i -D jsqr)。'); process.exit(0); }
qrcode = require(path.join(ROOT, 'lib/qr.js'));

let pass = 0, fail = 0;
function T(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'not equal') + ' — got ' + JSON.stringify(a)); }

// lib/qr.js の isDark 行列を白地黒モジュール(quiet zone付)の RGBA に焼いて jsQR で読む
function encodeDecode(text, scale = 4, quiet = 4) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), size = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) { data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const y = (quiet + r) * scale + dy, x = (quiet + c) * scale + dx, idx = (y * size + x) * 4;
      data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0;
    }
  }
  return jsQR(data, size, size);
}

T('ファインダーパターン(3隅)とquiet構造が正しい', () => {
  const qr = qrcode(0, 'M'); qr.addData('http://x/'); qr.make(); const n = qr.getModuleCount();
  ok(n >= 21 && (n - 21) % 4 === 0, 'モジュール数はQR仕様(21+4k): ' + n);
  ok(qr.isDark(0, 0) && qr.isDark(0, 6) && qr.isDark(6, 0), '左上ファインダー外枠が黒');
  ok(!qr.isDark(1, 1) && !qr.isDark(5, 5), 'ファインダー内側の白リング');
  ok(qr.isDark(0, n - 1) && qr.isDark(n - 1, 0), '右上・左下ファインダー');
});

T('Web明細URL(token付)が読み取って一致する', () => {
  const url = 'http://localhost:8763/meisai.html?t=tkl747y0es6e6';
  const res = encodeDecode(url); ok(res, '復号できる'); eq(res.data, url, 'URL一致');
});

T('本番想定URL(https・長いuuidトークン)も一致', () => {
  const url = 'https://payslip-app-olive.vercel.app/meisai.html?t=3f9a1c22-7b0e-4d81-9a2b-1e4c5f6a7b88';
  const res = encodeDecode(url); ok(res, '復号できる'); eq(res.data, url, 'URL一致');
});

T('別トークンは別内容として正しく読める(取り違えなし)', () => {
  const a = 'https://payslip-app-olive.vercel.app/meisai.html?t=aaaaaaaa-0000-0000-0000-000000000001';
  const b = 'https://payslip-app-olive.vercel.app/meisai.html?t=bbbbbbbb-0000-0000-0000-000000000002';
  eq(encodeDecode(a).data, a, 'A一致'); eq(encodeDecode(b).data, b, 'B一致');
});

T('同じ入力は毎回同じ行列(決定的)', () => {
  const mk = () => { const q = qrcode(0, 'M'); q.addData('https://x/meisai.html?t=zzz'); q.make(); let s = ''; const n = q.getModuleCount(); for (let r = 0; r < n; r++)for (let c = 0; c < n; c++)s += q.isDark(r, c) ? '1' : '0'; return s; };
  eq(mk(), mk(), '2回生成が一致');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
