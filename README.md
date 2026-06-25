# 給与明細アプリ（ZEROACT / payslip-app）

ブラウザで給与明細を作成・プレビュー・印刷(PDF)できる Web アプリ。
入力した支給/控除/勤怠/人数から、確定済みの 3 テンプレートを **自動選択** して描画します。
（代行請求アプリ Exally と同系の定義駆動 + DB 保存。まずブラウザ保存、Supabase 対応の作り）

## 機能（v0.1）
- 会社名 / 対象月 / 支給日、従業員 1〜4 名（各 勤怠・支給・控除 を行追加/削除）
- 差引支給額 = 支給合計 − 控除合計 を自動計算
- **テンプレ自動選択**
  - 1 人：横並び（支給左/控除右＋中身2カラム、最大 支給40/控除40）。`縦並び`(支給上/控除下) も選択可
  - 2 人：収まれば横並び(A4縦・各最大20/20)、超えれば横ストリップ(A4横)
  - 2〜4 人：横ストリップ（A4横・各人 縦並び・中身2カラム・最大17段/人）
  - 行数オーバー時は警告表示（1人1枚へ誘導）
- 勤怠は「6項目=基準、増えたら最大3行で自動折返し」
- 印刷 / PDF（ブラウザ印刷。向きはテンプレに応じ A4 縦/横を自動指定）
- 保存 / 読込（既定は localStorage、`window.SUPA` 設定で Supabase）

## ファイル
```
index.html        アプリ本体(UI)
css/app.css        UIスタイル
js/render.js       3テンプレの忠実レンダラ + 自動選択ロジック
js/store.js        保存層(localStorage / Supabase 切替)
js/app.js          UIロジック
supabase/schema.sql  Supabaseスキーマ(payslip_batches, RLS)
vercel.json        静的配信設定
```

## デザイン仕様（確定テンプレ）
- 明朝体・生成り紙(#fffefb)・焦茶ゴールド(#6f5a3e / #b6a06d)・文字濃さ3段
- 中身は常に2カラム。合計は下端で揃う（項目数が違っても揃う）
- 実測収まり（A4実寸 内高 縦1075 / 横742px）:
  - 横並び 1人 最大20段(40/40) / 2人 各10段(20/20)
  - 縦並び 1人 最大≒支給20/控除16
  - 横ストリップ 17段/人（人数不問）

## Supabase を有効化する
1. Supabase プロジェクト作成 → `supabase/schema.sql` を SQL Editor で実行
2. ルート直下に `js/config.js` を作成（gitignore 済み）:
   ```js
   window.SUPA = { url: 'https://xxxx.supabase.co', key: 'anon-public-key' };
   ```
3. `index.html` の Supabase 用コメント箇所で supabase-js v2 と config.js を読み込む
4. store.js の列名マップ（pay_date など）を本接続用に調整

## デプロイ（Vercel）
静的サイト。`vercel` で連携、または Vercel ダッシュボードからこのリポを Import。

## ライセンス / 用途
社内利用想定。給与計算ロジック（所得税・社会保険の自動計算）は今後 Exally 系エンジンと統合予定。
