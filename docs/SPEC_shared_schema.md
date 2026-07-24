# SPEC — 共有データスキーマ契約（E0・スイート共通）

経営セッション発。**Kyuallyセッションと Exallyセッションの"契約"**（同じデータ形で動き、別々に違うスキーマを作って衝突するのを防ぐ）。
既存（pay_* / exally_entitlements / KyuallyのdefEmp形）に**互換**で、新規（日次台帳・取引先）を足す。実装（DDL/RLS）は Exally E0/E1。参照: `reference_payslip_supabase_setup`（倉庫Exally共有/棚アプリ毎独立）。

## 0. 原則・完了条件
- **1アカウント（account_id）で全モジュール共有**。倉庫（共有マスタ）＝Exally共有／棚（モジュール固有）＝独立。
- **既存を壊さない**（Kyually現行の pay_employees/pay_companies/pay_payslips/exally_entitlements と互換）。
- **実装は実Supabaseと照合**（本SPECの【要確認】は実DDLで確認してから実装）。捏造禁止。
- DoD：スキーマ実装（Exally）＋Kyuallyの読み書き配線が、**Claude Code実機で1アカウント越しに繋がる**のを確認→見せてOK後push。

## 1. アカウント／利用権（既存・稼働中・変えない）
- **account_id** = Supabase auth user（1契約=1アカウント）。
- **exally_entitlements**(account_id, app, plan)：モジュールの解錠（trial/paid/free/disabled）。稼働中。**変えない**。

## 2. 従業員マスタ（既存 pay_employees・defEmp互換＋新フィールド）
- **pay_employees**(id, account_id, sort, data jsonb)。`data` = KyuallyのdefEmp形（氏名/給与形態/基本給/手当/控除apply/社保/通勤/扶養…）。
- ★**新規フィールド（data に追加）**：
  - `employmentType`: `'従業員'` | `'業務委託'`（**雇用形態**・既定`'従業員'`・K1）。
  - `business`（事業/職種タグ・集計/グループ化用。既存 `dept`/`role` を流用 or 追加）。
- **全モジュールがこの pay_employees を"従業員マスタ"として共有**（1回入力）。Kyually=給与項目、Exally=台帳/事業タグ、を**同じ従業員dataの別キー**に足す（キー空間を分けて衝突回避）。

## 3. 自社情報（既存 pay_companies ＋ インボイス/印影）
- **pay_companies**(account_id, data jsonb)＝会社設定。
- ★共有マスタとして：**屋号／住所／インボイス登録番号／印影**を含める（請求・見積・明細が共通で使う）。

## 4. 取引先マスタ（新規 pay_partners）※名称は提案・実装で確定
- **pay_partners**(id, account_id, data jsonb)：名称/住所/敬称/インボイス番号/振込先/過去単価 等。
- 用途：請求・見積が使う（**見積→請求ワンタップ**の源）。

## 5. 日次/期間台帳（新規 pay_ledger）★E2の中核・二度手間解消の源
- **pay_ledger**(id, account_id, employee_id, date, data jsonb)：
  - `data`＝`{ 売上?, 時間?, 金額?, メモ? }`（**人×日付の1行**。各社バラバラの溜め方を許容）。
  - **締め方（日次/週次/N日/1〜10・11〜20・21〜末）で期間集計 → 期間の支給額 → Kyuallyへ**。
  - 決め方（率/保障/日額）は 従業員data の給与形態 or 別ルールに。
- ＝**Excelを別に持たなくていい＝二度手間解消**の実体。「きく」のground源にもなる。

## 6. 期間/月次の明細・履歴（既存 pay_payslips）
- **pay_payslips**(id=`'ps_'+ym+'_'+eid`, account_id, ym, employee_id, data)。月次/確定明細・突合履歴。既存。
- **期間分割（K2）**：同月に複数期間が併存するため、**id/ym に期間キーを拡張**する（例 `ps_2026-06_P1_<eid>`）【要確認・実装で形を確定】。

## 7. 集計（横断ビュー・E5）
- 上記を **account_id ＋ business（事業/職種）** で集計 → **Exally からも Kyually からも見える**。

## 8. 契約のルール（両セッションが守る）
- **従業員マスタ = pay_employees（defEmp互換）が唯一の源**。二重に別テーブルを作らない。
- **新テーブル（pay_ledger / pay_partners）は Exally E0/E1 が作る**（DDL/RLS）。**Kyually は本契約に従って読み書き**（自前で別スキーマを作らない）。
- **account_id の RLS で他アカウント遮断**（既存方針・ソフト削除30日等も既存に合わせる）。
- **キー空間の分離**：同じ従業員dataに、Kyually（給与）と Exally（台帳/事業）が別キーで書く。上書き事故を防ぐ（クラウド上書きは既存P0の教訓）。

## 9. 【要確認】（実装セッションが実Supabaseで確認してから）
- 現行の**実テーブル名/カラム**（pay_employees/pay_companies/pay_payslips/exally_entitlements の実DDL）。
- 期間分割の**明細 id/ym 拡張の具体形**。
- 現行の**RLSポリシー**。
- pay_ledger / pay_partners の**最終テーブル名**。

## 司さん手番
なし（スキーマ設計）。実装（DDL/RLS/Supabase）は Exally セッション。
