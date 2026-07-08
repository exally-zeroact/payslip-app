// check-statutory.mjs — 法定データ(最賃/健保料率等)の年度更新を自動検知する。
// GitHub Actions の定期実行から呼ぶ。役所の公式ソースを取得→現在コードの値と比較→
// ・変化あり: exit 10 + 差分を出力(呼出側でPR/通知) ・取得/解析失敗: exit 20 + 理由(黙って壊れない)
// ・変化なし: exit 0。役所HTMLはShift-JISが多いのでTextDecoderでデコード(Node18+ full-ICU前提)。
import { readFileSync } from 'node:fs';

const findings = [];
const failures = [];

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'payslip-statutory-check' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  const buf = new Uint8Array(await res.arrayBuffer());
  // 先頭にUTF-8 BOM/charset=shift_jis判定。既定はShift-JISで試し、文字化けならUTF-8。
  let txt;
  try { txt = new TextDecoder('shift-jis', { fatal: false }).decode(buf); } catch { txt = ''; }
  if (!/[一-龠ぁ-ゟ]/.test(txt)) { try { txt = new TextDecoder('utf-8').decode(buf); } catch { /* noop */ } }
  return txt;
}
function loadLib(rel) { return readFileSync(new URL(rel, import.meta.url), 'utf8'); }
function numJP(s) { return parseInt(String(s).replace(/[,，]/g, ''), 10); }

// ── 最低賃金: 全国加重平均で「年度が変わったか」を検知(表全体の更新シグナル) ──
async function checkSaitei() {
  const url = 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/';
  let html;
  try { html = await fetchText(url); } catch (e) { failures.push('最賃: 取得失敗 ' + e.message); return; }
  // 現在コードの全国加重平均
  const lib = loadLib('../lib/saitei-chingin.js');
  const cur = numJP((lib.match(/ZENKOKU_HEIKIN:\s*([0-9,]+)/) || [])[1]);
  // ページから「加重平均 …円」を拾う(表記ゆれに強めの正規表現・複数候補)
  const m = html.match(/加重平均[^0-9]{0,10}([0-9,]{3,5})\s*円/) || html.match(/全国加重平均額[^0-9]{0,10}([0-9,]{3,5})/);
  if (!m) { failures.push('最賃: ページから全国加重平均を抽出できず(様式変更の可能性・要手動確認 ' + url + ')'); return; }
  const site = numJP(m[1]);
  if (!(site > 800 && site < 3000)) { failures.push('最賃: 抽出値が異常(' + site + ')・要手動確認'); return; }
  if (site !== cur) findings.push('最賃 全国加重平均: コード=' + cur + '円 → 公式=' + site + '円（改定あり。lib/saitei-chingin.js の47県とNENDO/NENDO_YEARを更新）\n  出典: ' + url);
}

const run = async () => {
  await checkSaitei();
  // (拡張余地) 健保=協会けんぽ料率表, 所得税=国税庁denshi_01/02 の年分, 雇用=厚労省 も同型で追加可能。
  if (failures.length) {
    console.log('STATUS=FAILED');
    failures.forEach(f => console.log('FAIL: ' + f));
    process.exit(20);
  }
  if (findings.length) {
    console.log('STATUS=CHANGED');
    findings.forEach(f => console.log('CHANGE: ' + f));
    process.exit(10);
  }
  console.log('STATUS=OK (法定データは最新)');
  process.exit(0);
};
run().catch(e => { console.log('STATUS=ERROR ' + e.message); process.exit(20); });
