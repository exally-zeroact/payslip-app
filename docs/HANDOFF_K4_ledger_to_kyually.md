# 引き継ぎ — K4：Kyually が Exally の台帳を読んで明細にする

**宛先：Kyuallyセッション。** Exally実装セッション作成（2026-07-26）。
前提＝Exally E0/E1/E2 は push 済み（`1e222b1` まで）。**台帳は動いていて、実データが `pay_ledger` に入る状態**。
★本書は **Kyually の実コードを読んで**書いた（推測なし）。参照した実物：`payslip-app/js/app.js`（`defEmp` / `dailyEntries` / `buildDailyData`）／`lib/periods.js`／`lib/pay-rule.js`／`js/store.js`。

---

## 0. K4 で何が完成するか
今は **Exally の台帳に入れても、金額は出ない**（Exally は支給額を計算しない＝司さん判断 2026-07-26）。
K4 で Kyually が台帳を読めば、**「毎日ちょこちょこ入れる → 締めの日に明細ができている」**が繋がる。
＝二度手間ゼロの完成。**E2の価値が出るのはここ**。

---

## 1. どこから読むか

```js
// RLSで自分のアカウントの行だけ返る。削除済み(deleted_at)は除く。
const { data } = await sb.from('pay_ledger')
  .select('id,employee_id,ymd,data', { count: 'exact' })
  .is('deleted_at', null)
  .gte('ymd', period.from).lte('ymd', period.to)
  .order('ymd', { ascending: true });
```

★**`count:'exact'` を必ず付けて、`count > data.length` なら「全部読めていない」**。
PostgREST はサーバ側の上限（Supabase既定1000行）で**黙って切る**＝**合計が静かに過少になる**。
Exally 側は切れたら合計を出さずに「期間を短く」と出している（`js/suite-data.js` の `ledger.list`）。同じ扱いにすること。

---

## 2. データの形（E0契約・`docs/SPEC_shared_schema.md` §5）

`pay_ledger`(id, account_id, employee_id, **ymd date**, data jsonb, deleted_at, updated_at)

| `data` のキー | 型 | Kyually 側の対応 |
|---|---|---|
| `uriage` | number | ★**Kyually に無い項目**（売上）。率で払う代行に必須 |
| `minutes` | number | ★**分**で入っている。Kyually `dailyEntries.hm` は `"8:30"` の**文字列** → **変換が要る** |
| `amount` | number | `dailyEntries.amount` と同じ |
| `count` | number | `dailyEntries.count` と同じ |
| `hikazei` | boolean | `dailyEntries.hikazei` と同じ。★**落とすと課税額が狂う** |
| `business` | string | 事業タグ（Kyually には無い。集計用・無視してよい） |
| `memo` | string | メモ |

### 2-1. ★人×日付に「N行」ある★
Kyually の `dailyEntries` は1日1行の想定だが、**台帳は同じ人の同じ日に何行でも入る**（1日に何本も＝代行の実態）。
→ **日付で畳んでから** `dailyEntries` に載せるか、`dailyEntries` 側を複数行対応にするか、どちらかの判断が要る。
（Exally は畳まずに全行を持ち、集計時に足している）

### 2-2. 変換の実装例
```js
function ledgerRowToDaily(r) {
  const d = r.data || {};
  return {
    ymd: r.ymd,
    hm: d.minutes ? (Math.floor(d.minutes / 60) + ':' + String(d.minutes % 60).padStart(2, '0')) : '',
    amount: d.amount || '',
    count: d.count || '',
    hikazei: !!d.hikazei
    // ★uriage は dailyEntries に入れ先が無い。ctx.sales として別途渡す(§3)
  };
}
```

---

## 3. ★台帳→給料の接続点は `pay-rule.js` の ctx★

`lib/pay-rule.js` が食う形はこれ（実物より）：
```js
ctx = { workMin, workDays, sales, commission, count }
```
Exally は**この形をそのまま作る純関数**を持っている＝ **`exally/lib/ledger-agg.js` の `byPeriod()`**。
返り値の `byPeriod[key].employees[i].ctx` がそのまま `PayRule.basePay(spec, ctx)` に渡せる。

| ctx | 台帳のどこから | 注意 |
|---|---|---|
| `sales` | `uriage` の合計 | `rate`（売上×率%）が食う |
| `workDays` | ★**1行でもある日の数**（同じ日に3件でも**1日**） | `daily`（日給×出勤日数）が食う |
| `workMin` | `minutes` の合計 | `hourly` が食う |
| `count` | `count` の合計 | `piece`（単価×件数）が食う |
| `commission` | `amount` の合計（★**非課税ぶんを除く**） | `commission` が食う |
| （別枠）`hikazeiAmount` | `hikazei:true` の `amount` 合計 | **課税に混ぜない**。非課税支給として別に足す |

★**司さんの代行＝「売上×0.35 と 保障 の高い方」＝ `spec.variable.mode:'max'`**（Kyually に実装済み）。
台帳から `ctx.sales` が来れば、そのまま動く。

### 3-1. `ledger-agg.js` を使うか、自前で書くか
- **使う場合**：`exally/lib/ledger-agg.js` は純関数UMD（依存は `periods.js` だけ）。複製するなら
  **`access.js` / `periods.js` と同じくドリフト突合テストを付けること**（片方だけ直すと支払いがズレる）。
- **自前で書く場合**：上の表の定義（特に **`workDays` の数え方**と**非課税の分離**）を必ず合わせる。
  Exally 側のテスト＝`exally/tests/ledger-agg.test.js`（14件・実数値）が仕様の一次情報。

---

## 4. 期間（締め方）の契約

- **期間の定義は `lib/periods.js`（Kyually が唯一の源）**。Exally は複製＋**4,155パターン突合テスト**で守っている
  （`exally/tests/periods-drift.test.js`）。**Kyually 側を直したら Exally にも複製し直す**（テストが赤になって気付ける）。
- **締め方の設定も Kyually が唯一の源**＝`pay_companies.data.company.shimeMethod` / `shimeN`。
  Exally は**読んで表示するだけ**（設定UIを作っていない）。
- **期間キー**：monthly も `'P1'`（`'M'` は存在しない）。

### 4-1. ★`pay_payslips` の id（E0 §6-2・改訂済み）★
- **分割なし（monthly）＝従来どおり `ps_{ym}_{eid}`（period を付けない）** ＝既存データと完全互換。
- **分割あり（half/ten/ndays）＝ `ps_{ym}_{Pn}_{eid}`**（例 `ps_2026-07_P1_e1`）。
- `data.period` には `periods.js` の key をそのまま（monthly なら `'P1'`）＋ `periodFrom` / `periodTo`。

### 4-2. ★法定帳簿を壊さないための必須要件（E0 §6-2・未実装）★
現行の消費側は「**`kind!=='bonus'` なら月次**」の**除外方式**で、賃金台帳 `lib/chingin-daicho.js:19` は
**`従業員|月` をキーに後勝ちで上書き**する。→ 同じ月に期間行が2件以上あると **1件しか残らない**
＝**労基法108条の賃金台帳が欠落／定時決定・年末調整も過少**。

**K4（または K2 の続き）で必ずやること：**
1. 消費側を**許可方式**（`kind==='monthly' || kind==null`）に変える。
2. **同一 ym の複数 period は、法定帳簿へ渡す前に合算する**（賃金台帳・定時決定・年調・前月比）。
3. ★**それが入るまで、期間行を `pay_payslips` に書かない**（Exally も書いていない）。

---

## 5. ★二重入力の畳み方＝「単一ソース原則」で確定（司さん判断 2026-07-28）★

今は **Kyually の `dailyEntries`（従業員data内）** と **Exally の `pay_ledger`（テーブル）** の両方がある。

### 5-1. 確定した原則
> ★**`pay_ledger` を正（唯一の源）とする。同じ実績を二度数えない。**★

- **台帳＝Exally が唯一の源**（司さんの⑤方針そのもの）。Kyually は**読む側**。
- **`dailyEntries` を「もう一つの正」として並立させない**。

### 5-2. ★K4 が絶対に守ること（これだけは裁量ではない）★
> **同じ実績を二度数えない。**
> `pay_ledger` と `dailyEntries` の**両方から足してはいけない**。両方から足すと**支給が倍になる**（お金の間違い）。

**具体的な手段は K4 実装の裁量**（読むだけ／移行して以後は台帳だけ／移行期間だけフォールバック 等、
どれを選んでもよい）。ただし選んだ方式が上の絶対条件を満たすことを、**テストで固定**すること。

### 5-3. 実装時の実務メモ
- `dailyEntries` → `pay_ledger` へ書き出す方式を採るなら、**`hm`（"8:30"）→ `minutes`（分）** の変換を忘れない（§2-2）。
  **`uriage`（売上）は既存 `dailyEntries` に無い**ので空になる。
- どの方式でも、**同じ (employee_id, ymd) の実績がどちらか一方からしか集計されない**ことを
  実データのテストで確認する（例：台帳に3件・`dailyEntries` に同じ日の1件がある状態で、合計が二重にならない）。

---

## 6. 動かして確かめる道具（Exally側にある）
- `node exally/tests/live-seed.mjs seed` ... テスト専用アカウントに会社/事業/人/取引先/台帳6件を入れる。
  期待値（事業別の合計）も出力する。`clean` で消える。
- ★**テスト専用アカウント（`exally.supoort+e0test@gmail.com`）以外では即中止**する作り。
  **司さんの本番アカウントは絶対に使わない**（実データを汚さない）。
- 実ブラウザで開く時は**パスワードを画面に打たず**、node でセッションを取り `auth.setSession` を注入している。

---

## 7. まとめ（K4のDoD案）
1. `pay_ledger` を期間で読む（**`count:'exact'` で切れ検知**）。
2. 人ごとに `ctx` を作る（**`workDays` の数え方**と**非課税の分離**を Exally と一致させる）。
3. `PayRule.basePay(spec, ctx)` で基本給を出す → 既存の決定論エンジンで明細に。
4. 期間分割で保存するなら §4-1 の id ＋ §4-2 の**合算**を先に入れる。
5. ★**§5-2 の絶対条件（同じ実績を二度数えない）をテストで固定**する。
6. テスト先行 → 対立監査 → **実機で実際に台帳へ入れて明細が出るのを確認** → 見せてOK後 push。

## 8. Exally 側の連絡先ファイル
- 契約：`exally/docs/SPEC_shared_schema.md`（E0・v2）
- 台帳の設計：`exally/docs/SPEC_E2_ledger.md`
- 実装：`exally/lib/ledger-agg.js` / `exally/lib/periods.js` / `exally/js/suite-data.js`
- テスト（仕様の一次情報）：`exally/tests/ledger-agg.test.js` / `periods-drift.test.js` / `suite-data.test.js`
