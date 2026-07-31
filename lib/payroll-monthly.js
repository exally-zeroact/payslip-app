/* payroll-monthly.js — 月次給与の計算チェーン（headless・DOM非依存）
 *
 * ★このファイルは js/app.js から【移設】したものです。ロジックは1文字も変えていません。
 *   差分は state.month / state.company / state._otHist を明示引数 ctx に置き換えただけ。
 *   js/app.js 側は同名の薄いラッパから、ここへ委譲します（＝計算の唯一の真実源）。
 *
 * なぜ移設したか: グリッド/チャット/現UI/CI が同じ計算を呼べるようにするため。
 *   UIの中に計算があると、別の入口(オペレーション)から呼べず、数式で再実装する誘惑が生まれる。
 *
 * ctx = { company, month, otHist }
 *   company … state.company 相当（会社設定）
 *   month   … 'YYYY-MM'（対象月）
 *   otHist  … { empId: [{otMin,holidayMin}...] } 36協定の過去履歴（警告側で使用）
 *
 * 【利用】ブラウザ window.PayrollMonthly / Node require('./payroll-monthly.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./calc.js'), require('./payroll-calc.js'), require('./warimashi.js'),
      require('./zaiseki.js'), require('./juminzei.js'), require('./holidays.js'), require('./shotokuzei-hei.js'),
      require('./shiharai-chosho.js'), require('./pay-rule.js'), require('./shakaihoken-hyo.js'), require('./koyo-hoken.js'));
  } else {
    // ★SHAKAIHOKEN_HYO は `const` 宣言でwindowに付かない(script global の字句スコープにだけ居る)。
    //   このUMDラッパはグローバルスコープで実行されるので bare 参照で拾える。window経由だけだと
    //   料率が既定フォールバック(0.04955)に落ちて健保が静かに間違う。
    root.PayrollMonthly = factory(root.PayslipCalc, root.PayrollCalc, root.Warimashi, root.Zaiseki, root.Juminzei,
      root.Holidays, root.ShotokuzeiHei, root.ShiharaiChosho, root.PayRule,
      (typeof SHAKAIHOKEN_HYO !== 'undefined' ? SHAKAIHOKEN_HYO : root.SHAKAIHOKEN_HYO), root.KoyoHoken);
  }
})(typeof self !== 'undefined' ? self : this,
  function (_Calc, _PayrollCalc, _Warimashi, _Zaiseki, _Juminzei, _Holidays, _Hei, _Chosho, _PayRule, _SHH, _KoyoHoken) {
  'use strict';

  // 依存の解決は「読み込み時に渡された物 → 無ければ実行時にグローバル」＝app.jsの遅延参照と同じ挙動(読込順に強い)
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : {});
  function Calc() { return _Calc || G.PayslipCalc; }
  function PC() { return _PayrollCalc || G.PayrollCalc; }
  function W() { return _Warimashi || G.Warimashi; }
  function ZK() { return _Zaiseki || G.Zaiseki; }
  function JZ() { return _Juminzei || G.Juminzei; }
  function HD() { return _Holidays || G.Holidays; }
  function HEI() { return _Hei || G.ShotokuzeiHei; }
  function SC() { return _Chosho || G.ShiharaiChosho; }
  function PR() { return _PayRule || G.PayRule; }
  function SHH() { return _SHH || G.SHAKAIHOKEN_HYO || null; }
  function KH() { return _KoyoHoken || G.KoyoHoken; }

  // 全角数字/読点も数値化(M3: 全角123が0に化けるのを防ぐ)
  var num = function (v) { var s = String(v == null ? 0 : v).replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); }).replace(/[，、]/g, '').replace(/[, ]/g, ''); var n = Number(s); return isNaN(n) ? 0 : n; };

  function C(ctx) { return (ctx && ctx.company) || {}; }
  function YM(ctx) { return (ctx && ctx.month) || ''; }

  // ── カスタム給(PayRule) ──
  // カスタム給の既定spec(固定 +「歩合 か 時給×時間 の高い方」)。payType=カスタムに切替時にlazy初期化。
  function defPayRule() { return { fixed: '', variable: { mode: 'max', parts: [{ type: 'commission', amount: '', label: '' }, { type: 'hourly', amount: '', label: '' }] } }; }
  function ensurePayRule(e) { if (!e.payRule || !e.payRule.variable) e.payRule = defPayRule(); if (!e.payRule.variable.parts) e.payRule.variable.parts = []; return e.payRule; }
  function payRuleCtx(e) { if (e && e._ledgerCtx) return e._ledgerCtx; return { workMin: workedMin(e), workDays: kintaiVal(e, /出勤/), sales: num(e.salesAmt), commission: num(e.commissionAmt), count: num(e.pieceCount) }; }
  function payRuleResult(e) { var pr = PR(); if (!pr) return null; ensurePayRule(e); return pr.basePay(e.payRule, payRuleCtx(e)); } // B5: payRule未初期化(null)でも既定を作ってから評価=基本給0の黙り込みを防ぐ

  // ── 料率 ──
  function employRateOf(code, year, ctx) { var k = KH(); if (!k) return 0.005; return k.employRate(code, year || k.employYearOfYm(YM(ctx))); }
  function prefRate(code, payYm) { var S = SHH(); if (S && S.getKenko) { var k = S.getKenko(code, payYm); var sh = S.getShienkin ? S.getShienkin(payYm) : 0; return k.jugyoin + sh; } var K = (S && S.KENKO_RITSU) || {}; return (K[code] && K[code].jugyoin) || 0.04955; }

  // ── 通勤 ──
  // マイカー通勤 1か月非課税限度(片道km・国税庁No.2585 令和8年4月〜)★12区分 公式照合済2026-07★
  function carCommuteNonTax(km) {
    km = num(km);
    if (km < 2) return 0; if (km < 10) return 4200; if (km < 15) return 7300; if (km < 25) return 13500; if (km < 35) return 19700; if (km < 45) return 25900;
    if (km < 55) return 32300; if (km < 65) return 38700; if (km < 75) return 45700; if (km < 85) return 52700; if (km < 95) return 59600; return 66400;
  }
  function commuteLimit(e) { return e.commuteType === 'car' ? carCommuteNonTax(e.commuteKm) : 150000; }
  // 通勤手当を shikyu に同期（commute>0なら通勤手当(非課税)行を用意・非課税限度を方法/距離で設定）
  function syncCommute(e) {
    var idx = e.shikyu.findIndex(function (x) { return /通勤/.test(x.label); });
    var v = num(e.commute), lim = commuteLimit(e);
    if (v > 0) { if (idx < 0) e.shikyu.push({ label: '通勤手当', value: String(v), hikazei: true, nonTaxLimit: lim }); else { e.shikyu[idx].value = String(v); e.shikyu[idx].hikazei = true; e.shikyu[idx].nonTaxLimit = lim; } }
    else if (idx >= 0) e.shikyu.splice(idx, 1);
  }

  // ── 短時間区分・標準報酬の基礎 ──
  function stType(e) { return (e && e.shortTimeType) || ''; }
  function santeiRule(e) { var t = stType(e); return t === 'tanjikan' ? { primary: 11, fallback: 0 } : t === 'part' ? { primary: 17, fallback: 15 } : { primary: 17, fallback: 0 }; } // 算定基礎(定時決定)の日数基準
  function gekkakuTh(e) { return stType(e) === 'tanjikan' ? 11 : 17; } // 随時改定は17日(短時間労働者のみ11日・パートの15日特例は無い)
  function shahoBasisOf(e) { var s = e.shaho || {}, t = stType(e), th = (t === 'tanjikan' ? 11 : t === 'part' ? 15 : 17); return Calc().shahoBase({ mode: s.mode || 'teiji', months: s.months || [], mikomi: s.mikomi, value: s.manual, threshold: th }); }

  // ── 割増 ──
  // 割増基礎に入れるか（割増賃金は常に除外／明示include優先／明示exclude／既定は通勤・家族を除外＝実態の暫定）
  function isInBasis(e, label) {
    label = label || ''; if (/割増|残業|時間外|深夜|休日(出勤)?手当/.test(label)) return false; // 自動計算する割増系は単価基礎に入れない(二重防止)
    if ((e.wbInclude || []).indexOf(label) >= 0) return true;
    if ((e.wbExclude || []).indexOf(label) >= 0) return false;
    return !/通勤|家族/.test(label);
  }
  function warimashiBasis(e) { return (e.shikyu || []).filter(function (x) { return isInBasis(e, x.label); }).reduce(function (a, x) { return a + num(x.value); }, 0); }
  function dmin(o) { return num(o && o.h) * 60 + num(o && o.m); }
  function warimashiMins(w) {
    w = w || {};
    if ((w.mode || 'easy') === 'detail') {
      var d = w.detail || {}; var g = function (k) { return dmin(d[k]); };
      return { otMin: g('ot') + g('otNight') + g('over60') + g('over60Night'), nightMin: g('night') + g('otNight') + g('over60Night') + g('holidayNight'), holidayMin: g('holiday') + g('holidayNight') };
    }
    return { otMin: dmin({ h: w.otH, m: w.otM }), nightMin: dmin({ h: w.nightH, m: w.nightM }), holidayMin: dmin({ h: w.holidayH, m: w.holidayM }) };
  }
  function warimashiOf(e, ctx) {
    var Wm = W();
    if (!Wm) return { total: 0, lines: [], unit: 0 };
    if (e.payType === '役員') return { total: 0, lines: [], unit: 0 }; // 役員は割増(残業)の概念なし
    var co = C(ctx);
    var pctRate = function (v) { return (v != null && v !== '') ? num(v) / 100 : undefined; };
    var rates = { ot: pctRate(co.rateOt), holiday: pctRate(co.rateHoliday), night: pctRate(co.rateNight), over60Add: pctRate(co.rateOver60) };
    if (e.payType === '歩合') { // 出来高払=単価(基本給÷総労働時間)に時間外+0.25/深夜+0.25/法定休日+0.35の上乗せのみ(1.0は基本給に内包)。会社の率上書きは歩合にも反映(rates)
      var wc = e.warimashi || {}; var segc = { ot: dmin({ h: wc.otH, m: wc.otM }), night: dmin({ h: wc.nightH, m: wc.nightM }), holiday: dmin({ h: wc.holidayH, m: wc.holidayM }) };
      // ★割増の基礎は実際の基本給=高い方(歩合実績 vs 保障給)。保障給が効く月に割増が過小になるのを防ぐ(労基37条)
      var wmin = workedMin(e); var baseForWari = Wm.commissionBasePay(num(e.commissionAmt), e.hourlyGuarantee, wmin);
      return Wm.commission({ commissionTotal: baseForWari, totalWorkMin: wmin, seg: segc, rates: rates });
    }
    var ah = (e.annualHolidays != null && e.annualHolidays !== '') ? e.annualHolidays : co.annualHolidays; // 会社規定・従業員で任意上書き
    var dwh = (e.dailyWorkH != null && e.dailyWorkH !== '') ? e.dailyWorkH : co.dailyWorkH;
    var dwm = (e.dailyWorkM != null && e.dailyWorkM !== '') ? e.dailyWorkM : co.dailyWorkM;
    var ly = parseInt(String(YM(ctx) || '').slice(0, 4), 10) || 0; var leap = (ly % 4 === 0 && ly % 100 !== 0) || (ly % 400 === 0); // 対象月の年が閏年なら年間日数366(月平均所定の分母)
    var mh = (e.minashiH != null && e.minashiH !== '') ? e.minashiH : co.minashiH; var minashiMin = num(mh) * 60; // 固定残業(みなし)時間=会社規定・従業員で上書き可。時間外の基本割増から控除
    if (e.payType === 'カスタム') { // 固定側=通常割増(easy) + 歩合側=歩合上乗せ(commission) を分けて合算(労基37条・分解はPayRuleのfixedForWari/pieceworkForWari)
      var pr = payRuleResult(e) || { fixedForWari: 0, pieceworkForWari: 0 }; var wc2 = e.warimashi || {};
      var fixW = Wm.easy({ base: pr.fixedForWari, annualHolidays: ah, dailyHours: num(dwh) + num(dwm) / 60, rates: rates, leap: leap, otH: wc2.otH, otM: wc2.otM, nightH: wc2.nightH, nightM: wc2.nightM, holidayH: wc2.holidayH, holidayM: wc2.holidayM, minashiMin: minashiMin });
      var segp = { ot: dmin({ h: wc2.otH, m: wc2.otM }), night: dmin({ h: wc2.nightH, m: wc2.nightM }), holiday: dmin({ h: wc2.holidayH, m: wc2.holidayM }) };
      var pcW = Wm.commission({ commissionTotal: pr.pieceworkForWari, totalWorkMin: workedMin(e), seg: segp, rates: rates });
      (fixW.lines || []).forEach(function (l) { l.unit = fixW.unit; }); (pcW.lines || []).forEach(function (l) { l.unit = pcW.unit; }); // 内訳の単価は各側の実単価(歩合側は commission が「歩合 …」とラベル済)
      return { total: (fixW.total || 0) + (pcW.total || 0), lines: (fixW.lines || []).concat(pcW.lines || []), unit: (fixW.unit || pcW.unit || 0), split: true };
    }
    var w = e.warimashi || {}, dailyH = num(dwh) + num(dwm) / 60;
    var common = { base: warimashiBasis(e), annualHolidays: ah, dailyHours: dailyH, rates: rates, leap: leap };
    // ★時給/日給の割増単価は労基則19条=時給(時給額そのもの) / 日給(日給額÷1日所定時間)。一律手当(月額)は月平均所定で時給換算して加算。
    //  月給/カスタムは従来どおり(基礎÷月平均所定)＝common.unit未指定。日給者の残業が月給算式で過小になるsilent-wrongを根治(P0)。
    if (e.payType === '時給' || e.payType === '日給') {
      var stdH = Wm.monthlyStdHours(ah, dailyH, leap);
      var baseShikyu = (e.shikyu || []).filter(function (x) { return /基本給/.test(x.label || ''); }).reduce(function (a, x) { return a + num(x.value); }, 0);
      var teateMonthly = Math.max(0, warimashiBasis(e) - baseShikyu);
      var baseHourly = (e.payType === '時給') ? num(e.hourly) : (dailyH > 0 ? num(e.base) / dailyH : 0);
      common.unit = baseHourly + (stdH > 0 ? teateMonthly / stdH : 0);
    }
    if (w.mode === 'detail') {
      var d = w.detail || {}; var seg = {}; ['ot', 'otNight', 'over60', 'over60Night', 'night', 'holiday', 'holidayNight'].forEach(function (k) { seg[k] = dmin(d[k]); });
      return Wm.detail({ base: common.base, unit: common.unit, annualHolidays: common.annualHolidays, dailyHours: common.dailyHours, rates: common.rates, leap: common.leap, seg: seg, minashiMin: minashiMin });
    }
    return Wm.easy({ base: common.base, unit: common.unit, annualHolidays: common.annualHolidays, dailyHours: common.dailyHours, rates: common.rates, leap: common.leap,
      otH: w.otH, otM: w.otM, nightH: w.nightH, nightM: w.nightM, holidayH: w.holidayH, holidayM: w.holidayM, minashiMin: minashiMin });
  }

  // ── 勤怠 ──
  function kintaiVal(e, re) { var r = (e.kintai || []).find(function (x) { return re.test(x.label || ''); }); return r ? num(r.value) : 0; }
  function workedMin(e) { return num(e.workedH) * 60 + num(e.workedM); }
  function workedLabel(e) { var m = workedMin(e); return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
  // 実出勤日数(日給の基本給用)。無給代休(daikyuDeduct)なら代休取得を出勤から控除
  function effShukkin(e, ctx) { var co = C(ctx); var s = Math.max(0, kintaiVal(e, /出勤/)); if ((co.ruleOn || {}).daikyu && co.daikyuDeduct) s = Math.max(0, s - kintaiVal(e, /代休取得/)); return s; } // 出勤日数は0未満にしない(負の支給を防ぐ)

  // 時給=時給単価×労働時間 / 日給=日給額×出勤日数 で基本給を自動算出(月給は手入力のまま)
  // 基本給を状態から導出(単一ソース)。休暇中=休暇中の金額・時給=時給×労働時間・日給=日給×出勤・月給/役員=基本給。復職/再就職で自動的に元へ戻る
  function syncBasePay(e, ctx) {
    if (!e.shikyu) e.shikyu = [];
    var amt;
    if (e.workStatus && e.workStatus !== 'normal') { var _lwi = leaveNoWorkInfo(e, YM(ctx), ctx); amt = (_lwi && _lwi.partial) ? num(e.base) : num(e.leavePay); } // 部分月の産育休=満額(compute側で不就労を欠勤控除)/それ以外=休業中の金額を手入力
    else if (e.payType === '時給') amt = Math.round(num(e.hourly) * workedMin(e) / 60);
    else if (e.payType === '日給') amt = Math.round(num(e.base) * effShukkin(e, ctx));
    else if (e.payType === '歩合') amt = W() ? W().commissionBasePay(e.commissionAmt, e.hourlyGuarantee, workedMin(e)) : Math.max(num(e.commissionAmt), Math.round(num(e.hourlyGuarantee) * workedMin(e) / 60)); // 歩合実績と保障給(時給×総労働時間)の高い方=労基27条
    else if (e.payType === 'カスタム') { var _pr = payRuleResult(e); amt = _pr ? _pr.base : 0; } // 固定+変動{なし/単一/高い方}をPayRuleで評価
    else amt = num(e.base);
    var idx = e.shikyu.findIndex(function (x) { return /基本給/.test(x.label || ''); });
    if (idx < 0) e.shikyu.unshift({ label: '基本給', value: String(amt) }); else e.shikyu[idx].value = String(amt);
  }

  // ── 住民税・在籍・カレンダー ──
  // 住民税の当月天引き額: 年額モードは特別徴収12分割+退職時(一括/普通)。既定monthlyは月額直接入力のまま(回帰ゼロ)
  function residentTaxOf(e, ctx) {
    if (e.residentTaxMode === 'annual') { var jz = JZ(); if (jz && jz.juminForMonth) return jz.juminForMonth({ annualTax: num(e.residentTaxAnnual), ym: YM(ctx), retireYmd: e.taishokuYmd, ikkatsu: !!e.residentTaxIkkatsu }); }
    return num(e.residentTax);
  }
  function isActiveInMonth(e, ym) { var z = ZK(); return z ? z.isActiveInMonth(e, ym) : !(e.retired && !e.taishokuYmd); }
  function prorateInfo(e, ym) { var z = ZK(); return z ? z.prorateInfo(e, ym) : { prorate: false, factor: 1, shahoMonth: true, isJoin: false, isLeave: false, zd: 0, dim: 0, mid: false }; }
  // 勤怠カレンダー: その月の所定労働日数(暦日−休みの曜日−祝日−会社独自休)。祝日エンジン未読込ならnull
  function scheduledDaysOf(ym, ctx) { var H = HD(); if (!H) return null; var co = C(ctx); return H.scheduledWorkdays(ym, co.holidays || [], co.companyHolidays || []); }
  // 産休/育休が月途中(部分月)のときの当月不就労「所定労働日数」。就労分だけ支払う日割の土台(実務標準=所定労働日方式/freee)。
  //  対象= workStatus∈{産休,育休} かつ 月給 かつ 完全月給制でない かつ 開始/終了日あり かつ カレンダー可。対象外=null(=従来のleavePay手入力に委ねる=回帰ゼロ)。
  //  返り値 {total:当月所定, noWork:不就労所定, partial:noWork<total}。partial=false(=全月休業)はleavePay運用。
  function leaveNoWorkInfo(e, ym, ctx) {
    if (!e || !(e.workStatus === 'sankyu' || e.workStatus === 'ikukyu')) return null;
    if (e.payType !== '月給') return null;                         // 月給のみ(時給/日給/歩合は実績ベース)
    if (C(ctx).kanzenGekkyu) return null;                          // 完全月給制は控除しない=従来
    if (!e.leaveStartYmd || !e.leaveEndYmd) return null;            // 日付未設定=従来フォールバック
    var H = HD(); if (!H || !H.scheduledWorkdaysBetween) return null; // カレンダー未読込=従来
    var co = C(ctx); var rest = co.holidays || [], comp = co.companyHolidays || [];
    var total = H.scheduledWorkdays(ym, rest, comp); if (!(total > 0)) return null;
    var noWork = H.scheduledWorkdaysBetween(ym, rest, comp, e.leaveStartYmd, e.leaveEndYmd);
    return { total: total, noWork: noWork, partial: (noWork < total) };
  }
  // 甲欄の「扶養親族等の数」に足す本人の人的加算(障害者/寡婦orひとり親/勤労学生)。甲(ko)のみ、乙/丙は0。
  function jintekiOf(e, taxClass) {
    var pc = PC();
    if (taxClass !== 'ko' || !(pc && pc.honninJintekiCount)) return 0;
    return pc.honninJintekiCount({ shogai: !!e.honninShogai, kafuHitorioya: e.honninKafuHitorioya || '', kinrou: !!e.honninKinrou });
  }

  // ── 月次の本体 ──
  function compute(e, ctx) {
    syncCommute(e); syncBasePay(e, ctx);
    var month = YM(ctx);
    var pr = prorateInfo(e, month); e._prorate = pr;
    var lw = leaveNoWorkInfo(e, month, ctx); e._leaveNoWork = lw; // 産休/育休 部分月の不就労所定日数(就労分だけ支払う日割の土台)
    var sb = shahoBasisOf(e);
    // 標準報酬未確定時の暫定基礎は「割増を除く固定支給(通勤含む)」。割増(残業)で社保が膨らまないように。
    var fb = (e.shikyu || []).reduce(function (a, x) { return a + num(x.value); }, 0);
    e.hyojunBase = sb.hoshu > 0 ? sb.hoshu : fb;
    var w = warimashiOf(e, ctx); e._wari = w; // 割増は満額base(=e.shikyu)で算定済→日割の影響を受けない
    var shikyu = (e.shikyu || []).slice();
    // ★K4 §3: 台帳を取り込んだ月は、台帳の非課税ぶん(hikazei:true の実費等)を非課税支給として別に足す。
    //  local slice に足すだけ=非永続(再取り込みで重複しない)。hikazei:true→源泉/課税には入らず、総支給と手取りには入る。
    if (e._ledgerCtx && num(e._ledgerHikazei) > 0) shikyu = shikyu.concat([{ label: '台帳（非課税支給）', value: num(e._ledgerHikazei), hikazei: true }]);
    // 入社月/退職月の日割: 基本給＋課税手当を在籍日数で日割(通勤/非課税/割増は除外)。標準報酬(hyojunBase)・割増は満額のまま。
    if (pr.prorate && pr.factor < 1) { shikyu = shikyu.map(function (x) { if (x.hikazei || /通勤|割増/.test(x.label || '')) return x; return { label: x.label, value: Math.round(num(x.value) * pr.factor), hikazei: x.hikazei, nonTaxLimit: x.nonTaxLimit }; }); }
    if (w.total > 0) shikyu = shikyu.concat([{ label: '割増賃金', value: w.total }]); // 課税・総支給・雇用保険ベースに算入(日割しない)
    // 欠勤控除(月給・日給月給制): 月給で欠勤があれば不就労分を控除(完全月給制はしない)。割増基礎/標準報酬は満額のまま(=このローカルshikyuにだけ負の行を足す)
    // ★日割する月(入社月/退職月)は欠勤控除を併用しない(二重控除防止)
    var coK = C(ctx);
    if (!pr.prorate && e.payType === '月給' && !(e.workStatus && e.workStatus !== 'normal') && !coK.kanzenGekkyu) {
      var kday = kintaiVal(e, /欠勤/);
      if (kday > 0) {
        var ahK = (e.annualHolidays != null && e.annualHolidays !== '') ? e.annualHolidays : coK.annualHolidays;
        var dhK = num((e.dailyWorkH != null && e.dailyWorkH !== '') ? e.dailyWorkH : coK.dailyWorkH) + num((e.dailyWorkM != null && e.dailyWorkM !== '') ? e.dailyWorkM : coK.dailyWorkM) / 60;
        var kgaku = PC().calcKekkin({ base: num(e.base), ym: month, kekkinDays: kday, annualHolidays: ahK, dailyHours: dhK, method: coK.kekkinMethod });
        kgaku = Math.min(kgaku, num(e.base)); // 基本給を超えて引かない
        if (kgaku > 0) shikyu = shikyu.concat([{ label: '欠勤控除', value: -kgaku }]);
      }
    }
    // 産休/育休が月途中(部分月): 就労分だけ支払う=不就労の所定日数を「所定労働日方式」で控除(実務標準/freee・出典リサーチ)。
    //  社保は月末基準で別途免除(下)・所得税/雇用保険は残額(支給)に発生。★退職/入社月(pr.prorate)は日割優先で併用しない(二重控除防止)。会社が休業中に払う額はleavePayで加算(任意・通常0)。
    if (!pr.prorate && lw && lw.partial && !coK.kanzenGekkyu && lw.noWork > 0) {
      var lgaku = PC().calcKekkin({ base: num(e.base), ym: month, kekkinDays: lw.noWork, method: 'scheduled', scheduledDays: lw.total });
      lgaku = Math.min(lgaku, num(e.base)); // 基本給を超えて引かない
      if (lgaku > 0) shikyu = shikyu.concat([{ label: (e.workStatus === 'ikukyu' ? '育休' : '産休') + '不就労控除', value: -lgaku }]);
    }
    if (lw && lw.partial && num(e.leavePay) > 0) shikyu = shikyu.concat([{ label: '休業中支給', value: num(e.leavePay) }]); // 会社が休業中に払う額(課税・社保対象・任意)
    // 産休/育休の社保免除を月末在籍基準で当月判定。日付未設定=null→従来(e.applyの全月免除)のまま=回帰ゼロ。
    var apply = e.apply;
    if (e.workStatus === 'sankyu' || e.workStatus === 'ikukyu') {
      var zk = ZK();
      var ex = (zk && zk.shahoExemptMonthly) ? zk.shahoExemptMonthly({ leaveType: e.workStatus, startYmd: e.leaveStartYmd, endYmd: e.leaveEndYmd, ym: month, leaveDaysInMonth: num(e.leaveDaysInMonth) }) : null;
      e._shahoExemptThisMonth = ex; // 注記用
      if (ex != null) { apply = Object.assign({}, e.apply || {}, { health: ex ? false : true, pension: ex ? false : true, kaigo: ex ? false : true }); }
    }
    // 丙欄(日雇い): 所得税=日額表丙欄(日給)×出勤日数。丙は甲乙の算式を使わず表引き(taxClass='hei')
    var heiAmt = null;
    // 丙(日雇い)は日額表の表引き=「日給(=日額)」前提。丙×非日給は日額でないので甲で計算(silent-wrong防止・UIで警告)
    var heiActive = (e.taxClass === 'hei' && e.payType === '日給');
    if (heiActive) { var SHhei = HEI(); if (SHhei) heiAmt = SHhei.heiTax(num(e.base), { year: parseInt(String(month).slice(0, 4), 10) || 2026 }) * kintaiVal(e, /出勤/); }
    // 社保の当月/翌月徴収(会社設定 shahoTiming)。既定/'current'=現行(回帰ゼロ)。'next'=入社月0/月末退職2/月中退職1(前月分控除)
    var _tim = coK.shahoTiming, _shMult = 1, _shMonth = pr.shahoMonth;
    if (_tim === 'next') { var _zk = ZK(); if (_zk && _zk.shahoChargeMonths) _shMult = _zk.shahoChargeMonths({ timing: 'next', ym: month, joinYmd: e.joinYmd, taishokuYmd: e.taishokuYmd }); _shMonth = true; /* 翌月はmultで表現し旧shahoMonth抑止 */ }
    var effTaxClass = (e.taxClass === 'hei' && e.payType !== '日給') ? 'ko' : e.taxClass; // 丙×非日給は甲で計算
    // 甲欄のみ: 本人の人的加算(障害者/寡婦orひとり親/勤労学生)を扶養親族等の数に足す(乙/丙は対象外)
    var effFuyou = num(e.fuyou) + jintekiOf(e, effTaxClass);
    // ★K3 業務委託=204条掲載報酬の源泉(区分該当時のみ)。対象額=支給合計(税込・安全側)。非該当(代行)は0=控除ゼロ維持。
    var contractorGensen = 0;
    // ★源泉の対象額=課税支給のみ(非課税の通勤等 hikazei:true は除外・住宅手当など課税手当は対象)。taxableTotalで課税支給を単一ソース化。
    if (e.employmentType === 'contractor') { var _SC = SC(); if (_SC) { var _payG = Calc().taxableTotal(shikyu); contractorGensen = _SC.gensenFor(e.houshuKubun, _payG, { monthlySalary: 0 }); } }
    var r = Calc().computePayslip({ shikyu: shikyu, birthYmd: e.birthYmd, payYm: month, fuyou: effFuyou, taxClass: effTaxClass, heiTaxAmount: heiAmt, residentTax: residentTaxOf(e, ctx), healthRate: prefRate(e.pref, month), employRate: employRateOf(coK.gyoshu, null, ctx), hyojunBase: e.hyojunBase, apply: apply, extraKojo: e.extraKojo, shahoMonth: _shMonth, shahoMult: _shMult, employmentType: e.employmentType, contractorGensen: contractorGensen });
    if (e.employmentType !== 'contractor') applyNenchoAdj(e, r, ctx); // 年末調整の過不足を反映(業務委託=年調なし=対象外)
    return r;
  }
  // 年末調整の過不足(還付/追徴)を、指定した対象月の給与明細に反映する。★法定計算後の純調整=税/社保/雇用/課税には影響しない★。
  //  e.nenchoAdj={ym,amount}(amount<0=還付/>0=不足額徴収)。amountは反映時にnenComputeのkabusokuを凍結して持つ。
  function applyNenchoAdj(e, r, ctx) {
    var adj = e && e.nenchoAdj; if (!adj || adj.ym !== YM(ctx)) return; var amt = num(adj.amount); if (!amt) return;
    if (amt < 0) { r.shikyu = (r.shikyu || []).concat([{ label: '年末調整還付', value: -amt, hikazei: true }]); r.shikyuTotal = num(r.shikyuTotal) + (-amt); r.net = num(r.net) + (-amt); }
    else { r.kojo = (r.kojo || []).concat([{ label: '年末調整（不足額徴収）', value: amt }]); r.kojoTotal = num(r.kojoTotal) + amt; r.net = num(r.net) - amt; }
  }
  function payDateObj(ctx) {
    var ym = YM(ctx) || '2026-06', y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)), c = C(ctx);
    var py = y, pm = m; if ((c.paydayRel || 'next') === 'next') { pm = m + 1; if (pm > 12) { pm = 1; py++; } }
    var dd = String(c.paydayDay == null ? '' : c.paydayDay); var last = new Date(py, pm, 0).getDate();
    var day = /末/.test(dd) ? last : Math.min(parseInt(dd, 10) || 25, last); if (day < 1) day = 1;
    return { y: py, m: pm, d: day };
  }
  function payDateStr(ctx) { var o = payDateObj(ctx); return '令和' + (o.y - 2018) + '年' + o.m + '月' + o.d + '日'; }

  return {
    num: num,
    defPayRule: defPayRule, ensurePayRule: ensurePayRule, payRuleCtx: payRuleCtx, payRuleResult: payRuleResult,
    employRateOf: employRateOf, prefRate: prefRate,
    carCommuteNonTax: carCommuteNonTax, commuteLimit: commuteLimit, syncCommute: syncCommute,
    stType: stType, santeiRule: santeiRule, gekkakuTh: gekkakuTh, shahoBasisOf: shahoBasisOf,
    isInBasis: isInBasis, warimashiBasis: warimashiBasis, dmin: dmin, warimashiMins: warimashiMins, warimashiOf: warimashiOf,
    kintaiVal: kintaiVal, workedMin: workedMin, workedLabel: workedLabel, effShukkin: effShukkin, syncBasePay: syncBasePay,
    residentTaxOf: residentTaxOf, isActiveInMonth: isActiveInMonth, prorateInfo: prorateInfo,
    scheduledDaysOf: scheduledDaysOf, leaveNoWorkInfo: leaveNoWorkInfo, jintekiOf: jintekiOf,
    compute: compute, applyNenchoAdj: applyNenchoAdj, payDateObj: payDateObj, payDateStr: payDateStr,
  };
});
