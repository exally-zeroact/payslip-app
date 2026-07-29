/* shaho-kanyu.test.js — 社保 加入判定(短時間労働者)。厚労省/年金機構の一次情報を実数リテラルで固定。
 *   ★誤警告ゼロ最優先: 適用拡大(2)は特定適用事業所(51人以上)のときだけ。OFFでは絶対に出さない。 */
'use strict';
var SK = require('../lib/shaho-kanyu.js');

// 正社員=週40h想定。3/4=30h。
T('3/4基準: 週30h(=40×3/4)以上は加入対象・規模不問(トグルOFFでもsan34)', function () {
  var r = SK.judge({ weeklyH: 30, fullTimeWeeklyH: 40, tokuteiTekiyo: false });
  eq(r.san34, true, '30h=3/4ちょうど→該当');
  eq(r.required, true, '加入対象');
});
T('3/4基準: 週29hは非該当(30h未満)', function () {
  var r = SK.judge({ weeklyH: 29, fullTimeWeeklyH: 40, tokuteiTekiyo: false });
  eq(r.san34, false, '29h<30h→非該当');
});
T('3/4基準: 正社員週所定が未設定(0)なら判定不能=san34は出さない(誤警告防止)', function () {
  eq(SK.judge({ weeklyH: 35, fullTimeWeeklyH: 0 }).san34, false, 'ft=0→false');
});

// ★適用拡大=特定適用事業所(51人以上)のときだけ。小さい会社(OFF)では絶対に出さない。
T('★適用拡大: トグルOFF(小さい会社)では週25h・月10万でも一切出さない(誤警告ゼロ)', function () {
  var r = SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, isStudent: false, tokuteiTekiyo: false });
  eq(r.kakudai, false, '★OFF=適用拡大は出さない');
  eq(r.san34, false, '25h<30h=3/4も非該当');
  eq(r.required, false, '★加入対象にしない(入らなくていいパートに誤警告しない)');
});
T('適用拡大: トグルON+週20h以上+月88,000以上+非学生+継続 → 加入対象', function () {
  var r = SK.judge({ weeklyH: 20, fullTimeWeeklyH: 40, monthlyShoteiWage: 88000, isStudent: false, tokuteiTekiyo: true });
  eq(r.kakudai, true, '4要件そろい→該当');
  eq(r.required, true);
});
T('適用拡大: 週19h(20h未満)は非該当', function () {
  eq(SK.judge({ weeklyH: 19, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, tokuteiTekiyo: true }).kakudai, false);
});
T('適用拡大: 月87,999円(88,000未満)は非該当', function () {
  eq(SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 87999, tokuteiTekiyo: true }).kakudai, false);
});
T('★適用拡大: 学生は除外(週25h・月10万でもkakudai=false)', function () {
  var r = SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, isStudent: true, tokuteiTekiyo: true });
  eq(r.kakudai, false, '学生→対象外');
});
T('適用拡大: 2か月以内の雇用見込み(=2)は非該当(2か月超の見込みが必要)', function () {
  eq(SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, tokuteiTekiyo: true, employMonthsExpect: 2 }).kakudai, false, '2か月ちょうど→除外');
  eq(SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, tokuteiTekiyo: true, employMonthsExpect: 3 }).kakudai, true, '3か月→該当');
});
T('適用拡大: 見込み未設定(null)は継続とみなし該当しうる', function () {
  eq(SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, tokuteiTekiyo: true, employMonthsExpect: null }).kakudai, true);
});

// 3/4該当なら適用拡大の4要件は見に行かない(3/4が優先・二重表示しない)
T('3/4該当時: kakudaiはfalse(3/4で既に加入=適用拡大の判定に回さない)', function () {
  var r = SK.judge({ weeklyH: 32, fullTimeWeeklyH: 40, monthlyShoteiWage: 60000, isStudent: true, tokuteiTekiyo: true });
  eq(r.san34, true); eq(r.kakudai, false, '3/4該当→適用拡大は判定しない'); eq(r.required, true);
});

// 賃金要件の撤廃日フラグ(現状null=常に課す)。将来 '2026-10' を入れた時の挙動は wageReqActive で担保。
T('賃金要件: 現状(撤廃日null)は常に有効=88,000円を課す', function () {
  eq(SK.wageReqActive('2026-09'), true);
  eq(SK.wageReqActive('2026-10'), true);
  eq(SK.wageReqActive(''), true);
});

// 出典の実数がドリフトしていないか(定数の自己防衛)
T('法定しきい値の実数(出典照合): 週20h/88,000円/3-4', function () {
  eq(SK.WEEK_MIN_H, 20); eq(SK.WAGE_88K, 88000); eq(SK.RATIO_34, 0.75);
});
