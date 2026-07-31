/* payroll-warnings.js — 月次給与の黄警告（headless・DOM非依存）
 *
 * ★このファイルは js/app.js から【移設】したものです。判定も文言も1文字も変えていません。
 *   差分は state.month / state.company / state._otHist を明示引数 ctx に置き換えただけ。
 *   js/app.js は同名の薄いラッパから、ここへ委譲します（＝警告文言の唯一の真実源＝二重定義を作らない）。
 *
 * 製品方針: すべて【黄色・非ブロック】。違法・グレーでもユーザーは入力・保存・計算できる。注意だけ伝える。
 *
 * collect(e, ctx)        … 従業員1人ぶんの警告を構造化 [{code,level,scope,text}] で返す（オペレーション用）
 * collectCompany(ctx, emps) … 会社スコープの警告（割増率の法定下限・年間労働時間・未収録年度）
 * それ以外の関数は app.js が描画にそのまま使う（HTML文字列を返すものは従来どおりの文字列）
 *
 * 【利用】ブラウザ window.PayrollWarnings / Node require('./payroll-warnings.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./payroll-monthly.js'), require('./payroll-calc.js'), require('./warimashi.js'),
      require('./saitei-chingin.js'), require('./shaho-kanyu.js'), require('./pay-rule.js'), require('./shakaihoken-hyo.js'));
  } else {
    // ★SAITEI_CHINGIN / SHAKAIHOKEN_HYO は `const` 宣言でwindowに付かない。UMDラッパはグローバル
    //   スコープで走るので bare 参照なら拾える。window経由だけだと最賃チェックが丸ごと無言で消える。
    root.PayrollWarnings = factory(root.PayrollMonthly, root.PayrollCalc, root.Warimashi,
      (typeof SAITEI_CHINGIN !== 'undefined' ? SAITEI_CHINGIN : root.SAITEI_CHINGIN), root.ShahoKanyu, root.PayRule,
      (typeof SHAKAIHOKEN_HYO !== 'undefined' ? SHAKAIHOKEN_HYO : root.SHAKAIHOKEN_HYO));
  }
})(typeof self !== 'undefined' ? self : this, function (_PM, _PayrollCalc, _Warimashi, _SAI, _ShahoKanyu, _PayRule, _SHH) {
  'use strict';

  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : {});
  function PM() { return _PM || G.PayrollMonthly; }
  function PC() { return _PayrollCalc || G.PayrollCalc; }
  function W() { return _Warimashi || G.Warimashi; }
  function SAI() { return _SAI || G.SAITEI_CHINGIN || null; }
  function SK() { return _ShahoKanyu || G.ShahoKanyu; }
  function PR() { return _PayRule || G.PayRule; }
  function SHH() { return _SHH || G.SHAKAIHOKEN_HYO || null; }

  var num = function (v) { return PM().num(v); };
  // app.js と同じ文字列ユーティリティ（文言をバイト単位で一致させるために必要・業務ロジックではない）
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var fmtN = function (v) { var n = num(v); return n ? n.toLocaleString('ja-JP') : (v === 0 || v === '0' ? '0' : ''); };
  function C(ctx) { return (ctx && ctx.company) || {}; }
  function YM(ctx) { return (ctx && ctx.month) || ''; }

  // ── ① 最低賃金（最低賃金法） ──
  function isInMinWage(label) {
    label = label || '';
    if (/割増|残業|時間外|深夜|休日(出勤)?手当/.test(label)) return false;   // 所定外・休日・深夜(規則1条3〜5号)
    if (/通勤|家族|扶養|皆勤|精勤/.test(label)) return false;               // 精皆勤・通勤・家族(規則1条6号)
    if (/賞与|一時金|臨時|寸志|決算賞与|報奨金|インセンティブ/.test(label)) return false; // 臨時・1か月超(4条3項1・2号)
    if (/控除|欠勤|不就労|返還|立替/.test(label)) return false;             // マイナス行は算入賃金でない
    if (/基本給/.test(label)) return false;                                 // 基本給はbaseで別計上(二重計上防止)
    return true;
  }
  // 最賃算入の固定手当(月額・契約額=e.shikyuは日割前)。基本給と除外手当を除く。
  function minWageTeate(e) { return (e.shikyu || []).filter(function (x) { return isInMinWage(x.label) && num(x.value) > 0; }).reduce(function (a, x) { return a + num(x.value); }, 0); }
  // 最低賃金チェック(事業所所在地=従業員prefの地域別最賃と時間額を比較)。役員/休業中は対象外。返り{hourly,minWage,prefName,ok,teate}
  function minWageInfo(e, ctx) {
    if (!e || e.payType === '役員' || e.employmentType === 'contractor' || (e.workStatus && e.workStatus !== 'normal')) return null;
    var S = SAI(); if (!S || !S.getChingin) return null;
    var mw = S.getChingin(e.pref); if (!mw) return null;
    var co = C(ctx);
    var ah = (e.annualHolidays != null && e.annualHolidays !== '') ? e.annualHolidays : co.annualHolidays;
    var dwh = num((e.dailyWorkH != null && e.dailyWorkH !== '') ? e.dailyWorkH : co.dailyWorkH) + num((e.dailyWorkM != null && e.dailyWorkM !== '') ? e.dailyWorkM : co.dailyWorkM) / 60;
    var ly = parseInt(String(YM(ctx) || '').slice(0, 4), 10) || 0, leap = (ly % 4 === 0 && ly % 100 !== 0) || (ly % 400 === 0);
    var stdH = W() ? W().monthlyStdHours(ah, dwh, leap) : 0;
    var teate = minWageTeate(e);                                   // 最賃算入の固定手当(月額)
    var teateHourly = stdH > 0 ? teate / stdH : 0;                 // 手当を月平均所定時間で時給換算し基本給の時給に加算(最賃法どおり手当も算入)
    var hourly = 0;
    if (e.payType === '時給') hourly = num(e.hourly) + teateHourly;
    else if (e.payType === '日給') hourly = (dwh > 0 ? num(e.base) / dwh : 0) + teateHourly;
    else if (e.payType === '歩合') { var wmw = PM().workedMin(e); var gpw = W() ? W().guaranteePay(e.hourlyGuarantee, wmw) : Math.round(num(e.hourlyGuarantee) * wmw / 60); var bpw = Math.max(num(e.commissionAmt), gpw); hourly = (wmw > 0 ? bpw / (wmw / 60) : 0) + teateHourly; } // 歩合=賃金合計(高い方)÷総労働時間で最賃判定
    else if (e.payType === 'カスタム') { var wmc = PM().payRuleCtx(e).workMin; var prc = PM().payRuleResult(e); var bpc = prc ? prc.base : 0; hourly = (wmc > 0 ? bpc / (wmc / 60) : 0) + teateHourly; } // カスタム=基本給÷総労働時間(★K4:基本給と同じソース=台帳取り込み時は台帳のworkMin。未取り込みはworkedMin(e)と同値)
    else { hourly = (stdH > 0 ? num(e.base) / stdH : 0) + teateHourly; } // 月給=基本給÷月平均所定時間＋算入手当
    hourly = Math.floor(hourly);
    // 減額の特例(最賃法7条・労働局長許可): 障害者/試用期間/認定職業訓練/軽易業務/断続的労働。許可された減額率(%)で最賃を下げて判定。
    //  減額後最賃=最賃×(1−率)を円未満切り上げ(労働者有利・記入要領)。率は会社が許可どおり入力。
    var reduce = Math.max(0, Math.min(100, num(e.minWageReduce)));
    var effMw = reduce > 0 ? Math.ceil(mw * (100 - reduce) / 100) : mw;
    return { hourly: hourly, minWage: mw, effMinWage: effMw, reduce: reduce, prefName: ((S.todofuken || {})[e.pref] || {}).name || '', ok: (hourly === 0 || hourly >= effMw), teate: teate, stale: (S.saiteiStale ? S.saiteiStale(YM(ctx)) : false) };
  }
  // 最賃割れのtooltip/説明文(表ビューの⚠とカードのバナーで文面を統一)。製品方針=黄色・非ブロック・具体的に伝える。
  function mwWarnText(mw) { var v = (mw.reduce > 0) ? mw.effMinWage : mw.minWage, sfx = (mw.reduce > 0) ? '（減額特例' + fmtN(mw.reduce) + '%後）' : ''; return '最低賃金（' + esc(mw.prefName) + '：時給' + fmtN(v) + '円' + sfx + '）を下回っています（約' + fmtN(mw.hourly) + '円）'; }

  // ── ② 保障給（労基27条） ──
  // 出来高払制の保障給チェック(労基法27条)。完全歩合で保障(時給/日給の下限 or 固定給)が一切ない=27条違反の恐れ。役員/休業中は対象外。返り{ok} ok=false=無保障。
  //  ★製品方針=黄色・非ブロック(違法・グレーでもユーザーが選択/入力して使えるようにする=注意のみ)。構造判定は lib/pay-rule.js の lacksGuarantee に集約。
  function hoshoInfo(e) {
    if (!e || e.payType === '役員' || e.employmentType === 'contractor' || (e.workStatus && e.workStatus !== 'normal')) return null;
    if (e.payType === '歩合') return { ok: num(e.hourlyGuarantee) > 0 };                 // 歩合payType=保障給の時給が未設定(0)なら無保障
    if (e.payType === 'カスタム') { if (!e.payRule || !PR() || !PR().lacksGuarantee) return null; return { ok: !PR().lacksGuarantee(e.payRule) }; }
    return null;                                                                    // 月給/時給/日給=定額or時間給=保障あり(対象外)
  }
  function hoshoWarnText() { return '<b>保障給がありません</b>（労基法27条）。出来高払・歩合で働く人には<b>労働時間に応じた保障給</b>（例：時給の下限）が必要で、保障のない完全歩合は違反の恐れがあります。決め方を<b>「高い方（完全歩合＋保障）」</b>にして<b>時給×時間</b>の候補を足すか、歩合形態なら<b>保障給の時給</b>を入れてください。'; }

  // ── ③ 割増率の法定下限（労基37条・会社スコープ） ──
  // 割増率が法定下限を下回る時の黄警告(労基37条)。会社は上げてよいが下回りは違法の恐れ→非ブロックで注意。
  function rateFloorWarn(co) {
    if (!W() || !W().belowLegalRates) return '';
    var pr = function (v) { return (v != null && v !== '') ? num(v) / 100 : undefined; };
    var low = W().belowLegalRates({ ot: pr(co.rateOt), holiday: pr(co.rateHoliday), night: pr(co.rateNight), over60Add: pr(co.rateOver60) });
    if (!low.length) return '';
    var names = low.map(function (x) { return x.label + '（' + Math.round(x.value * 100) + '%→法定' + Math.round(x.floor * 100) + '%）'; }).join('・');
    return '<div class="cr-warn" style="margin:6px 2px 0">⚠ 割増の率が<b>法定下限</b>を下回っています：' + names + '。労基法37条の下限（時間外25%／休日35％／深夜+25%／月60時間超+25%）以上が必要です（このまま保存・計算はできます）。</div>';
  }

  // ── ④ 年間労働時間（労基32条） ──
  // 年間所定労働時間が法定(週40h)目安を超える時の黄警告(労基32条)。年間休日過少/長時間所定。役員/休業中は対象外。
  //  ★ヘルプ(annual)で「黄色で教えます」と約束している警告の実体。変形労働時間制なら適法もあり=注意のみ・非ブロック。
  function annualHoursInfo(e, ctx) {
    if (!e || e.payType === '役員' || e.employmentType === 'contractor' || (e.workStatus && e.workStatus !== 'normal')) return null;
    if (!W() || !W().annualHoursCheck) return null;
    var co = C(ctx);
    var ah = (e.annualHolidays != null && e.annualHolidays !== '') ? e.annualHolidays : co.annualHolidays;
    var dwh = num((e.dailyWorkH != null && e.dailyWorkH !== '') ? e.dailyWorkH : co.dailyWorkH) + num((e.dailyWorkM != null && e.dailyWorkM !== '') ? e.dailyWorkM : co.dailyWorkM) / 60;
    var ly = parseInt(String(YM(ctx) || '').slice(0, 4), 10) || 0, leap = (ly % 4 === 0 && ly % 100 !== 0) || (ly % 400 === 0);
    return W().annualHoursCheck(ah, dwh, leap);
  }
  function annualHoursWarnText(r) { return '<b>年間の労働時間が法律の目安（週40時間）を超えています</b>（約' + fmtN(Math.round(r.annualHours)) + '時間／週あたり約' + (Math.round(r.avgWeekly * 10) / 10) + '時間・労基法32条）。年間休日を増やすか1日の所定を短くしてください。変形労働時間制なら適法な場合もあります（このまま保存・計算はできます）。'; }

  // ── ⑤ 36協定・年少者（労基36/60/61条） ──
  // ④36協定 時間外上限(労基36条)＋⑤年少者(18歳未満)の時間外/深夜/休日規制(労基60/61条)の黄警告。役員は労働時間規制の対象外。非ブロック。
  // ④⑤の警告メッセージ配列(HTMLの<b>込み)を単一ソースで返す。カードはcr-warn・表ビューは⚠tooltipで共用。
  function laborLimitItems(e, ctx) {
    if (!e || e.payType === '役員') return [];
    var Wm = W(), pc = PC(); if (!Wm) return []; var m = PM().warimashiMins(e.warimashi); var out = [];
    if (Wm.overtimeLimitLevel) {
      var lv = Wm.overtimeLimitLevel(m.otMin, m.holidayMin);
      if (lv === 'over100') out.push('<b>時間外＋休日労働</b>が<b>単月100時間以上</b>です。36協定の特別条項でも<b>上限違反の恐れ</b>があります（労基法36条・いわゆる過労死ライン）');
      else if (lv === 'over45') out.push('時間外が<b>月45時間</b>を超えています。原則の上限を超えるには36協定の<b>特別条項</b>が必要です（労基法36条）');
    }
    if (pc && pc.isMinor && pc.isMinor(e.birthYmd, YM(ctx))) {
      if (m.nightMin > 0) out.push('<b>18歳未満</b>の方に<b>深夜（22時〜翌5時）の労働</b>が入っています。年少者の深夜業は原則禁止です（労基法61条）');
      if (m.otMin > 0 || m.holidayMin > 0) out.push('<b>18歳未満</b>の方に<b>時間外・休日労働</b>が入っています。年少者は原則できません（労基法60条）');
    }
    // 36協定 特別条項の複数月/年の上限(履歴=保存済み過去11ヶ月[loadOtHistory]＋当月liveを合成)
    if (Wm.overtime36Check) {
      var hist = (((ctx && ctx.otHist) || {})[e.id] || []).map(function (x) { return { otMin: x.otMin, holidayMin: x.holidayMin }; });
      var c36 = Wm.overtime36Check(hist.concat([{ otMin: m.otMin, holidayMin: m.holidayMin }]));
      if (c36.over80) out.push('直近<b>' + c36.over80.months + 'か月</b>の時間外＋休日の平均が<b>月80時間</b>を超えています（約' + fmtN(Math.round(c36.over80.avgMin / 60)) + 'h/月）。特別条項でも複数月平均80hが上限です（労基法36条）');
      if (c36.over720) out.push('直近12か月の時間外が<b>年720時間</b>を超えています（約' + fmtN(Math.round(c36.over720.totalMin / 60)) + 'h/年）。特別条項でも年720hが上限です（労基法36条）');
      if (c36.over45count > 6) out.push('時間外が<b>月45時間を超えた月が年' + c36.over45count + '回</b>あります。特別条項でも年6回までです（労基法36条）');
    }
    return out;
  }
  function laborLimitWarn(e, ctx) { return laborLimitItems(e, ctx).map(function (t) { return '<div class="cr-warn" style="margin:8px 0 0">⚠ ' + t + '。</div>'; }).join(''); }
  function laborLimitText(e, ctx) { return laborLimitItems(e, ctx).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join(' / '); } // 表ビューの⚠tooltip用(タグ除去)

  // ── ⑥ 社会保険（健保法・厚年法） ──
  // ③社会保険(健保/厚年)を常用らしい人で恣意的にオフにした時の黄警告(健保法/厚年法の強制加入)。産育休/休職の免除・年齢による自動喪失・短時間は対象外。非ブロック。
  function shahoOffWarn(e, ctx) {
    if (!e || (e.workStatus && e.workStatus !== 'normal')) return '';           // 産育休/休職等=正当な免除/調整
    if (!(e.payType === '月給' || e.payType === '役員')) return '';             // 時給/日給/歩合の短時間は適用除外の可能性=誤警告回避
    if (e.shortTimeType) return '';                                       // 短時間就労者/短時間労働者を宣言済=適用除外の可能性=誤警告回避(L-3)
    var pc = PC(), ap = e.apply || {}, off = [];
    var healthElig = !(pc && pc.isHealthTarget) || pc.isHealthTarget(e.birthYmd, YM(ctx));   // 75歳未満=加入対象
    var pensionElig = !(pc && pc.isPensionTarget) || pc.isPensionTarget(e.birthYmd, YM(ctx)); // 70歳未満=加入対象
    if (ap.health === false && healthElig) off.push('健康保険');
    if (ap.pension === false && pensionElig) off.push('厚生年金');
    if (!off.length) return '';
    return '<div class="cr-warn" style="margin:6px 2px 0">⚠ ' + off.join('・') + 'をオフにしています。<b>短時間労働者などの適用除外</b>でなければ、常用の方は<b>加入が必要</b>です（健保法・厚年法。最終判断は会社でご確認ください）。</div>';
  }
  // 正社員(通常労働者)の週所定労働時間 = 1日の所定 × 週の労働日数(7 − 休みの曜日数)。会社設定から導出。未設定は法定上限40hで代用。
  function fullTimeWeeklyH(ctx) {
    var c = C(ctx);
    var dwh = num(c.dailyWorkH) + num(c.dailyWorkM) / 60; if (dwh <= 0) return 40;
    var offDays = ((c.holidays || []).length); var workDays = 7 - offDays; if (workDays <= 0 || workDays > 7) workDays = 5;
    var h = dwh * workDays; return (h > 0 && h <= 60) ? h : 40; // 常識外の値は40hで代用(誤判定防止)
  }
  // その人の「所定内 月額賃金」推定(社保88,000円判定用)。残業/賞与/通勤/家族/精皆勤は含めない=最賃算入賃金と同じ考え方。
  //  時給=時給×(週所定×52/12)/ 日給=日給×月所定日数概算 / 月給等=基本給+最賃算入手当。あくまで概算(黄警告の入口・最終は会社確認)。
  function shoteiMonthlyWage(e, ctx) {
    var wk = num(e.weeklyScheduledH);
    if (e.payType === '時給') { return Math.round(num(e.hourly) * (wk > 0 ? wk * 52 / 12 : 0)); }
    if (e.payType === '日給') { var co = C(ctx); var dwh = num((e.dailyWorkH !== '' && e.dailyWorkH != null) ? e.dailyWorkH : co.dailyWorkH) + num((e.dailyWorkM !== '' && e.dailyWorkM != null) ? e.dailyWorkM : co.dailyWorkM) / 60; var days = (dwh > 0 && wk > 0) ? (wk / dwh * 52 / 12) : 0; return Math.round(num(e.base) * days); }
    return num(e.base) + (minWageTeate ? num(minWageTeate(e)) : 0); // 月給/役員/歩合/カスタム=基本給+最賃算入手当
  }
  // ②社保 加入判定の黄警告(短時間労働者)。lib/shaho-kanyu.js。役員/業務委託/休職・既に社保オンは対象外。誤警告ゼロ最優先。
  function shahoKanyuWarn(e, ctx) {
    var sk = SK(); if (!sk) return '';
    if (!e || e.employmentType === 'contractor' || e.payType === '役員' || (e.workStatus && e.workStatus !== 'normal')) return '';
    var wk = num(e.weeklyScheduledH); if (wk <= 0) return ''; // 週所定未入力=判定材料なし(誤警告しない)
    var ap = e.apply || {}, alreadyOn = (ap.health !== false) && (ap.pension !== false); // 既に健保・厚年オン=加入済み→注意不要
    if (alreadyOn) return '';
    var r = sk.judge({ weeklyH: wk, fullTimeWeeklyH: fullTimeWeeklyH(ctx), monthlyShoteiWage: shoteiMonthlyWage(e, ctx),
      isStudent: !!e.honninKinrou, tokuteiTekiyo: !!C(ctx).shakaTokutei, ym: YM(ctx) });
    if (!r.required) return '';
    return '<div class="cr-warn" style="margin:6px 2px 0">⚠ この方は<b>社会保険（健康保険・厚生年金）の加入対象の可能性</b>があります（' + esc(r.reasons.join('／')) + '）。健保・厚年をオフにしています。最終判断は会社・年金事務所でご確認ください。</div>';
  }

  // ── ⑦ 法定データの鮮度（silent-wrong防止・会社/月スコープ） ──
  // 対象月の法定値(社保料率・所得税額表・最低賃金)が未収録年度なら暫定計算の黄警告(silent-wrong防止)。値は捏造せず直近収録値で暫定。
  function statutoryStaleWarn(ctx) {
    var msgs = []; var S = SHH();
    if (S && S.getKenko) { var k = S.getKenko('tokyo', YM(ctx)); if (k && k.stale) msgs.push('社会保険料率・所得税額表'); }
    var SA = SAI();
    if (SA && SA.saiteiStale && SA.saiteiStale(YM(ctx))) msgs.push('最低賃金');
    if (!msgs.length) return '';
    return '<div class="cr-warn" style="margin:0 0 10px">⚠ 対象月（' + esc(YM(ctx)) + '）の <b>' + msgs.join('・') + '</b> は未収録の年度です。直近の収録年度の値で<b>暫定計算</b>しています（公式値が公表されたらデータ更新が必要）。</div>';
  }

  // ── ⑧ 経理向けサマリ（Excel/集計に出す） ──
  // 経理向け警告(最賃割れ/差引マイナス/休業手当未入力)。従業員に渡す明細でなく集計/Excelに出す。
  function empWarnings(e, ctx) {
    var w = []; var mw = minWageInfo(e, ctx); if (mw && !mw.ok) w.push('最低賃金（' + mw.prefName + ' 時給' + fmtN(mw.reduce > 0 ? mw.effMinWage : mw.minWage) + '円' + (mw.reduce > 0 ? '・減額特例' + fmtN(mw.reduce) + '%後' : '') + '）未満（約' + fmtN(mw.hourly) + '円）');
    try { var r = PM().compute(e, ctx); if (r && r.netNegative) w.push('差引支給がマイナス'); } catch (_) { }
    if (e.workStatus === 'kyugyo' && num(e.leavePay) <= 0) w.push('休業手当が未入力（平均賃金60%以上・労基26条）');
    else if (e.workStatus === 'kyugyo' && e.payType === '月給' && num(e.leavePay) > 0 && num(e.leavePay) < 0.4 * num(e.base)) w.push('休業手当が平均賃金の60%を下回る可能性（労基26条・要確認）'); // 全月休業の下限≒平均賃金(月給/30.4)×0.6×所定20日≒0.4×基本給。誤警告を避け0.4未満のみ検知
    var h = hoshoInfo(e); if (h && !h.ok) w.push('保障給なし（完全歩合・労基27条の恐れ）');
    return w;
  }

  // ── ⑨ 計算の注記（info・engine由来） ──
  // 入社月/退職月の日割・社保の注記(黄・ブロックしない)
  function prorateNote(e) {
    var pr = e._prorate, lw = e._leaveNoWork; var msg = [];
    if (pr && pr.prorate && pr.factor < 1) msg.push((pr.isJoin && !pr.isLeave ? '入社月' : pr.isLeave && !pr.isJoin ? '退職月' : '入社/退職月') + 'につき在籍' + pr.zd + '日で日割（' + pr.zd + '/' + pr.dim + '日）');
    if (pr && pr.mid) msg.push('月中退職のため当月の社保（健保・厚年・介護）は徴収しません（資格喪失=退職日翌日・前月分まで／雇用保険は実支払分）');
    if (!(pr && pr.prorate) && lw && lw.partial && lw.noWork > 0) msg.push((e.workStatus === 'ikukyu' ? '育休' : '産休') + 'で当月の所定' + lw.total + '日のうち' + lw.noWork + '日が不就労のため控除（就労' + (lw.total - lw.noWork) + '日分を支給）。社保は月末基準で免除・所得税/雇用保険は就労分に発生');
    return msg.length ? '<div class="cr-warn" style="margin:0 12px 10px">⚠ ' + msg.join('。') + '。</div>' : '';
  }

  // ══ オペレーション用: 構造化して返す ══
  var strip = function (h) { return String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/^[⚠\s]+/, '').replace(/[。\s]+$/, '').trim(); };

  // 従業員1人ぶん。★compute() を先に通してから呼ぶこと(prorateNote は e._prorate を読む)
  function collect(e, ctx) {
    var out = [];
    var push = function (code, level, text) { if (text) out.push({ empId: e.id, code: code, level: level, scope: 'employee', text: strip(text) }); };
    var mw = minWageInfo(e, ctx); if (mw && !mw.ok) push('MIN_WAGE_UNDER', 'warn', mwWarnText(mw));
    var h = hoshoInfo(e); if (h && !h.ok) push('NO_GUARANTEE_PAY', 'warn', hoshoWarnText());
    var an = annualHoursInfo(e, ctx); if (an && an.over) push('ANNUAL_HOURS_OVER', 'warn', annualHoursWarnText(an));
    laborLimitItems(e, ctx).forEach(function (t) {
      var code = /単月100時間/.test(t) ? 'OT_OVER100' : /月45時間</.test(t) || /月45時間<\/b>を超え/.test(t) ? 'OT_OVER45'
        : /深夜（22時/.test(t) ? 'MINOR_NIGHT' : /時間外・休日労働<\/b>が入って/.test(t) ? 'MINOR_OT'
          : /平均が<b>月80時間/.test(t) ? 'OT36_AVG80' : /年720時間/.test(t) ? 'OT36_YEAR720'
            : /月45時間を超えた月が年/.test(t) ? 'OT36_COUNT6' : 'OT_LIMIT';
      push(code, 'warn', t);
    });
    push('SHAHO_OFF_ELIGIBLE', 'warn', shahoOffWarn(e, ctx));
    push('SHAHO_KANYU_REQUIRED', 'warn', shahoKanyuWarn(e, ctx));
    if (e.employmentType === 'contractor') push('CONTRACTOR_DISGUISED', 'warn', '控除なしの報酬明細（源泉・社保・住民税・年末調整なし＝支給＝支払額）。実態が従業員なら社会保険・労働法の対象になる可能性があります（偽装請負）');
    if (e.taxClass === 'hei' && e.payType !== '日給') push('HEI_NOT_DAILY', 'warn', '丙は給与形態＝日給が前提です。現在「' + esc(e.payType) + '」なので丙は適用せず甲欄で計算しています');
    // 経理サマリ由来(差引マイナス・休業手当)。最賃/保障給は上で出しているので重複を避ける
    empWarnings(e, ctx).forEach(function (t) {
      if (/^最低賃金/.test(t) || /^保障給なし/.test(t)) return;
      push(/マイナス/.test(t) ? 'NET_NEGATIVE' : /未入力/.test(t) ? 'KYUGYO_TEATE_MISSING' : 'KYUGYO_TEATE_LOW', 'warn', t);
    });
    // info(計算の注記)
    var pr = e._prorate, lw = e._leaveNoWork;
    if (pr && pr.prorate && pr.factor < 1) push('PRORATE_JOIN_LEAVE', 'info', (pr.isJoin && !pr.isLeave ? '入社月' : pr.isLeave && !pr.isJoin ? '退職月' : '入社/退職月') + 'につき在籍' + pr.zd + '日で日割（' + pr.zd + '/' + pr.dim + '日）');
    if (pr && pr.mid) push('MID_LEAVE_NO_SHAHO', 'info', '月中退職のため当月の社保（健保・厚年・介護）は徴収しません');
    if (!(pr && pr.prorate) && lw && lw.partial && lw.noWork > 0) push('LEAVE_NOWORK_DEDUCTED', 'info', (e.workStatus === 'ikukyu' ? '育休' : '産休') + 'で当月の所定' + lw.total + '日のうち' + lw.noWork + '日が不就労のため控除');
    var co = C(ctx);
    var mh = (e.minashiH != null && e.minashiH !== '') ? e.minashiH : co.minashiH;
    if (num(mh) > 0 && e.payType !== '役員') push('MINASHI_APPLIED', 'info', '固定残業（みなし）' + num(mh) + '時間を控除して計算中（超過分のみ）');
    return out;
  }

  // 会社スコープ
  function collectCompany(ctx) {
    var out = [];
    var push = function (code, level, text) { if (text) out.push({ empId: null, code: code, level: level, scope: 'company', text: strip(text) }); };
    var co = C(ctx);
    var rf = rateFloorWarn(co);
    if (rf) {
      var Wm = W(); var pr = function (v) { return (v != null && v !== '') ? num(v) / 100 : undefined; };
      var low = Wm.belowLegalRates({ ot: pr(co.rateOt), holiday: pr(co.rateHoliday), night: pr(co.rateNight), over60Add: pr(co.rateOver60) });
      low.forEach(function (x) {
        var code = /時間外/.test(x.label) ? 'RATE_BELOW_LEGAL_OT' : /休日/.test(x.label) ? 'RATE_BELOW_LEGAL_HOLIDAY'
          : /深夜/.test(x.label) ? 'RATE_BELOW_LEGAL_NIGHT' : 'RATE_BELOW_LEGAL_OVER60';
        push(code, 'warn', x.label + '（' + Math.round(x.value * 100) + '%→法定' + Math.round(x.floor * 100) + '%）が労基法37条の下限を下回っています');
      });
    }
    push('STATUTORY_STALE', 'warn', statutoryStaleWarn(ctx));
    return out;
  }

  return {
    isInMinWage: isInMinWage, minWageTeate: minWageTeate, minWageInfo: minWageInfo, mwWarnText: mwWarnText,
    hoshoInfo: hoshoInfo, hoshoWarnText: hoshoWarnText,
    rateFloorWarn: rateFloorWarn,
    annualHoursInfo: annualHoursInfo, annualHoursWarnText: annualHoursWarnText,
    laborLimitItems: laborLimitItems, laborLimitWarn: laborLimitWarn, laborLimitText: laborLimitText,
    shahoOffWarn: shahoOffWarn, fullTimeWeeklyH: fullTimeWeeklyH, shoteiMonthlyWage: shoteiMonthlyWage, shahoKanyuWarn: shahoKanyuWarn,
    statutoryStaleWarn: statutoryStaleWarn, empWarnings: empWarnings, prorateNote: prorateNote,
    collect: collect, collectCompany: collectCompany,
  };
});
