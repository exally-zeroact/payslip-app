// stamp-build.mjs — 全ローカルアセット(js/*.js・lib/*.js・css/*.css)の src/href に ?v=<内容ハッシュ> を付与。
//   目的: github.io/Vercel が JS を max-age で数分キャッシュ→デプロイしても端末が旧コードのまま、を根絶。
//   ★方式=コンテンツハッシュ: 全JS/CSSの内容から短いハッシュを作り、全URLに ?v=<hash> を付ける。
//     コードが変わればハッシュが変わる→URLが変わる→端末は必ず新規取得。変わらなければ同じ=無駄なバスト無し。
//     決定論的なので CI が「貼り忘れ/古い?v」を --check で検知できる(下記)。
//   ★外部CDN(https://... の supabase-js/jsPDF/xlsx/html2canvas)はバージョン固定URL=対象外(相対 js/|lib/|css/ だけ書換)。
//   使い方: node scripts/stamp-build.mjs         … HTMLに ?v=<hash> を書き込む(push前 or ビルド時)
//           node scripts/stamp-build.mjs --check … 全HTMLが現在の内容ハッシュで貼られているか検証(ズレてたら exit 1)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_FILES = ['index.html', 'meisai.html', 'admin.html'];
const ASSET_DIRS = ['js', 'lib', 'css'];
const ASSET_RE = /((?:src|href)=")((?:js|lib|css)\/[^"?\s]+\.(?:js|css))(\?v=[^"]*)?(")/g;

// 全ローカルアセットの内容から決定論的な短いハッシュ(8桁)を作る。ファイル名でソート=順序非依存。
function buildHash() {
  const hash = crypto.createHash('sha256');
  const files = [];
  for (const d of ASSET_DIRS) {
    const dir = path.join(ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (/\.(js|css)$/.test(f)) files.push(d + '/' + f); // ★relは常にスラッシュ=OS(Windows\ vs Linux/)差でハッシュがブレない
    }
  }
  files.sort();
  for (const rel of files) {
    hash.update(rel + '\n');
    // ★行末を LF に正規化してからハッシュ=CRLF(Windows)/LF(CI Linux)でブレない(決定論)。
    const body = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    hash.update(body, 'utf8');
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 8);
}

const V = buildHash();
const check = process.argv.includes('--check');
let changed = 0, stale = [];

for (const f of HTML_FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, 'utf8');
  const next = html.replace(ASSET_RE, '$1$2?v=' + V + '$4');
  if (check) {
    if (next !== html) stale.push(f);
  } else if (next !== html) {
    fs.writeFileSync(p, next); changed++;
  }
}

if (check) {
  if (stale.length) {
    console.error('✗ stamp-build --check: 以下が現在の内容ハッシュ(?v=' + V + ')で貼られていません: ' + stale.join(', '));
    console.error('  → `node scripts/stamp-build.mjs` を実行して commit してください(JS/CSSを変えたら毎回)。');
    process.exit(1);
  }
  console.log('✓ stamp-build --check: 全HTMLが ?v=' + V + ' で最新です。');
} else {
  console.log('stamped ?v=' + V + ' (' + changed + ' HTML files updated)');
}
