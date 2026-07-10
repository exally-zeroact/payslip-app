// statutory-reminder.mjs — 法定データの年度更新を「日付ベース」で堅牢に催促する(役所HTMLスクレイプに依存しない)。
//  各kindの適用/公表時期に、libが必要年度を未収録なら reminder を出す。lib自身のstale判定を使うので堅牢。
//  週次cron(GitHub Actions)から呼ぶ。reminder有り: exit 10(呼出側でIssue作成)。無し: exit 0。
//  ★役所HTMLのスクレイプは様式変更で壊れやすいので採用しない。これは日付+lib introspectionのみ=堅牢。
//  テスト/CI決定性のため STATUTORY_TODAY=YYYY-MM で「今日」を上書き可。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SHH = require('../lib/shakaihoken-hyo.js');
const SAI = require('../lib/saitei-chingin.js');
const KOYO = require('../lib/koyo-hoken.js');
const D = require('../lib/shotokuzei-densan.js');

// 「今日」の年月(env上書き可)。
function today() {
  const o = process.env.STATUTORY_TODAY;
  if (o && /^\d{4}-\d{2}$/.test(o)) return { y: +o.slice(0, 4), m: +o.slice(5, 7) };
  const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 };
}
const reikan = (yr) => '令和' + (yr - 2018) + '年';
const reminders = [];
const { y, m } = today();

// 最低賃金: 会計年度10月適用・答申8〜9月。9月以降は当年度が必要。lib(SAI.saiteiStale)で未収録判定。
{ const need = (m >= 9 ? y : y - 1);
  if (SAI.saiteiStale && SAI.saiteiStale(need + '-10'))
    reminders.push('最低賃金 ' + reikan(need) + '度(' + need + ')が未収録。厚労省の答申額を確認 → lib/saitei-chingin.js 47県+NENDO_YEAR更新 → seed-statutory.mjs。'); }
// 健保/介護(協会けんぽ): 社保年度3月適用・公表2月。2月以降は当年が必要。getKenko(..).staleで判定。
{ const need = (m >= 2 ? y : y - 1); const k = SHH.getKenko && SHH.getKenko('tokyo', need + '-06');
  if (k && k.stale)
    reminders.push('社会保険料率(健保/介護) ' + reikan(need) + '(' + need + ')が未収録。協会けんぽ料率表を確認 → lib/shakaihoken-hyo.js更新 → seed。'); }
// 雇用保険: 労働保険年度4月適用・公表3月。lib(KOYO.RATES)の収録最新年と比較。
{ const need = (m >= 3 ? y : y - 1); const latest = Math.max.apply(null, Object.keys(KOYO.RATES).map(Number));
  if (need > latest)
    reminders.push('雇用保険料率 ' + reikan(need) + '度(' + need + ')が未収録。厚労省の料率を確認 → lib/koyo-hoken.js更新 → seed。'); }
// 所得税(源泉/年末調整): 税制改正大綱12月・翌暦年分。densan PARAMS の収録最新年と比較。
{ const need = (m >= 12 ? y + 1 : y); const latest = Math.max.apply(null, Object.keys(D.PARAMS).map(Number));
  if (need > latest)
    reminders.push('所得税(源泉/年末調整) ' + need + '年分(' + reikan(need) + ')が未収録。税制改正大綱/国税庁あらましを確認 → densan/nenmatsu更新 → seed。'); }

if (reminders.length) {
  console.log('STATUS=REMINDER (更新が必要な法定データがあります・対象月 ' + y + '-' + ('0' + m).slice(-2) + ')');
  reminders.forEach((r) => console.log('TODO: ' + r));
  console.log('\n手順: 一次情報で照合(捏造禁止) → lib修正+実数値テスト → node scripts/seed-statutory.mjs で中央statutory更新 → CIのドリフトガードが緑を確認。');
  process.exit(10);
}
console.log('STATUS=OK (' + y + '-' + ('0' + m).slice(-2) + '時点で更新が必要な法定データはありません)');
process.exit(0);
