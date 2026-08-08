★このrepoは凍結。給与の本体は exally-staging/kyuyo/ にあります。ここを触らないこと。★

# CLAUDE.md — payslip-app（Kyually / 給与明細）

本番: https://payslip-app-olive.vercel.app （管理画面 /admin）。GitHub: exally-zeroact/payslip-app・main。
静的HTML/JS（アプリ本体は依存ゼロ）。jsdomはテスト専用のdevDependency。

## ★★全アプリ共通 HARD RULE — テストは必ず2層を永久(CI)で持つ★★
片方だけで「動く/直った」と言わない。**新規アプリにも必ず適用**（このブロックを全アプリのCLAUDE.mdに置く）。

### ① 全機能を実データで確かめる（計算・ロジック層）
- そのアプリの**本物のエンジン**に**全パターン（全入力の組合せ）**を流し、**公式値/期待値と assert で突き合わせる**。
- 網羅・invariant（差引=支給-控除, NaN/矛盾ゼロ）・法定値は一次情報照合。中間値でなく**ユーザーに見える出力**で判定。
- 実装: `tests/payroll-patterns.mjs`（給与 全形態×扶養×甲乙丙×賞与×割増×日払い×日割×高齢×県）。

### ② Claude Code が実UIで全ボタン・全パターンを操作する
- **人間より速く正確にできる Claude Code の強み**。実アプリを Playwright/jsdom で動かし、**全タブ・全ボタン・全入力**を実際に押す/打ち込む。
- 確認: **JSエラー0**・各画面描画・入力で正しく再計算・**出力(PDF/Excel/振込データ/公開)の実生成**まで（＝配線が本当に生きてるか）。破壊/DL/ダイアログ系はデナイリストで安全に。URLを変えれば全アプリで回せる汎用ハーネスにする。

### なぜ両方要るか
計算lib緑＝「ボタンが押せる/画面が動く/出力が出る/配線されてる」は**保証しない**（過去の「lib有るのに未配線」バグの型）。

## テスト実行
- `node tests/run.js`（依存なし単体・387+）
- `node tests/integration.mjs`（jsdomでapp.js層＝配線/UI/描画）
- `node tests/payroll-patterns.mjs`（①全機能 実データ検証）
- `node scripts/verify-statutory.mjs`（法定数値ドリフト）

## 運用ルール
- push-gate: 監査通過＋実機＋**見た目変更は画面で見せてOK後**のみpush。緑/監査中で勝手にpush禁止。
- ツール呼び出しは必ず `antml:invoke`/`antml:parameter`（名前空間）。
- クラウドデータ(Supabase)は指示なしで追加/削除しない。
- 利用制御は Exally共通テーブル `exally_entitlements`(account_id×app×plan)・管理は /admin。
