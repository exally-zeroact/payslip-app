/* shaho-kanyu.js — 社会保険(健保/厚年)の加入判定(短時間労働者)。純関数UMD。
 * ================================================================
 * 【出典・一次情報(2026-07照合)】
 *  ・日本年金機構「短時間労働者に対する健康保険・厚生年金保険の適用の拡大」
 *      https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html
 *  ・厚生労働省「社会保険加入の要件(適用拡大特設サイト)」
 *      https://www.mhlw.go.jp/tekiyoukakudai/jugyouin/taisho/
 *  ・年金機構FAQ(4分の3基準)
 *      https://www.nenkin.go.jp/faq/kounen/hihokensha/20140902-07.html
 * 【判定は2系統】
 *  (1) 3/4基準【規模不問=全適用事業所】: 週の所定労働時間 が通常労働者(正社員)の 3/4以上 → 加入対象。
 *      ※法は「週所定 かつ 月所定労働日数」の両方が3/4以上。本アプリは週所定時間ベースで判定(入力を薄く/司さん設計)。
 *  (2) 適用拡大【特定適用事業所=厚年被保険者51人以上(2024.10〜)のみ】: 3/4未満でも次を全て満たせば加入対象。
 *      ア) 週の所定労働時間 20時間以上
 *      イ) 所定内賃金 月額 88,000円以上 ※残業/賞与/通勤/家族/精皆勤手当は含めない
 *      ウ) 学生でない
 *      エ) 2か月以内の期間を定めた雇用でない(=2か月超の見込み)
 * 【★将来変更(要更新)】イの「月額88,000円」賃金要件は【令和8年(2026年)10月に撤廃予定】(厚労省)。
 *      施行が確定したら WAGE_88K_REMOVED_YM を '2026-10' 等に設定 → 以後は賃金要件を課さない。
 *      それまでは現行法どおり88,000円を課す(未確定の将来法を先取りしない=捏造しない)。
 * ================================================================
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ShahoKanyu = api;
  else if (typeof globalThis !== 'undefined') globalThis.ShahoKanyu = api;
})(this, function () {
  'use strict';
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  // 法定しきい値(一次情報)。★自己参照でなく上記出典の実数。
  var WEEK_MIN_H = 20;        // 適用拡大: 週20時間以上
  var WAGE_88K = 88000;       // 適用拡大: 所定内月額88,000円以上
  var RATIO_34 = 3 / 4;       // 3/4基準
  var WAGE_88K_REMOVED_YM = null; // 令和8年10月に賃金要件撤廃予定→施行確定後に'2026-10'を設定(それまでnull=現行どおり課す)

  // ym('YYYY-MM')時点で「88,000円の賃金要件」が有効か(撤廃日以降はfalse)。
  function wageReqActive(ym) {
    if (!WAGE_88K_REMOVED_YM) return true;
    return String(ym || '') < WAGE_88K_REMOVED_YM;
  }

  // 加入判定。誤警告ゼロ最優先=適用拡大は特定適用事業所(51人以上)のときだけ判定する。
  //  inp: {
  //    weeklyH,            従業員の週所定労働時間(h)
  //    fullTimeWeeklyH,    通常労働者(正社員)の週所定労働時間(h)。0/未設定なら3/4基準は判定不能(false)。
  //    monthlyShoteiWage,  所定内月額賃金(円・残業/賞与/通勤/家族/精皆勤除外)
  //    isStudent,          学生か(true=適用拡大の対象外)
  //    tokuteiTekiyo,      特定適用事業所(厚年被保険者51人以上)か
  //    employMonthsExpect, 雇用見込み月数(null/未設定=継続=2か月超とみなす)
  //    ym                  対象月('YYYY-MM'・賃金要件撤廃日の判定用・任意)
  //  }
  //  返り: { required, san34, kakudai, reasons:[..], wageReqActive }
  function judge(inp) {
    inp = inp || {};
    var wk = num(inp.weeklyH), ft = num(inp.fullTimeWeeklyH);
    var reasons = [];

    // (1) 3/4基準(規模不問)。週所定が正社員の3/4以上。
    var san34 = (ft > 0 && wk > 0 && wk + 1e-9 >= ft * RATIO_34);
    if (san34) reasons.push('3/4基準（週の所定労働時間が正社員の3/4以上）');

    // (2) 適用拡大(特定適用事業所のみ)。3/4未満でも4要件で加入。
    var kakudai = false;
    if (inp.tokuteiTekiyo && !san34) {
      var wReq = wageReqActive(inp.ym);
      var okWeek = wk + 1e-9 >= WEEK_MIN_H;
      var okWage = !wReq || num(inp.monthlyShoteiWage) >= WAGE_88K; // 撤廃後は賃金要件を課さない
      var okStudent = !inp.isStudent;
      var okMonths = (inp.employMonthsExpect == null) || num(inp.employMonthsExpect) > 2; // 未設定=継続とみなす
      if (okWeek && okWage && okStudent && okMonths) {
        kakudai = true;
        reasons.push('適用拡大（週20時間以上・' + (wReq ? '月88,000円以上・' : '') + '学生でない・2か月超の見込み／特定適用事業所）');
      }
    }
    return { required: san34 || kakudai, san34: san34, kakudai: kakudai, reasons: reasons, wageReqActive: wageReqActive(inp.ym) };
  }

  return { judge: judge, wageReqActive: wageReqActive, WEEK_MIN_H: WEEK_MIN_H, WAGE_88K: WAGE_88K, RATIO_34: RATIO_34 };
});
