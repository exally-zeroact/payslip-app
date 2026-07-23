// pay-rule.js — 給与の「決め方(ロジック型)」を評価する純関数。テンプレ/雑入力ウィザードの土台(器)。
//  どんな給料体制でも「固定給 ＋ 変動部分」で表す。変動は なし / 単一 / 「AかBの高い方(max)」。
//  ★競合(freee/MF/SmartHR/奉行/Gusto/ADP…)が持たない「AかBの高い方」をネイティブ表現(業界空白)★。
//
//  spec = { fixed: number,                         // 固定給部分(0=無し)
//           variable: { mode:'none'|'one'|'max',   // 変動部分の決め方
//                       parts:[ part, ... ] } }     // one=先頭1個 / max=一番高い方
//  part = { type:'hourly'|'daily'|'piece'|'commission'|'rate'|'tiered'|'fixed', amount:number, label?:string }
//    hourly     : amount(時給)   × ctx.workMin/60   (時給×労働時間)      … amount=時給(spec)
//    daily      : amount(日給)   × ctx.workDays     (日給×出勤日数)      … amount=日給(spec)
//    piece      : amount(単価)   × ctx.count        (件数×単価・出来高)  … amount=1件単価(spec)・件数は当月(ctx)
//    commission : ctx.commission そのまま           (出来高・毎月入力)    … 歩合額は当月値(ctx)。specのamountは使わない
//    rate       : ctx.sales × amount/100            (売上×率%)           … amount=率%(spec)・売上は当月(ctx)
//    tiered     : 段階制/スライド率(累進)            (売上◯万超で率アップ)… tiers=[{from:下限,rate:率%}]・超過分だけその率(滑らか)
//    fixed      : amount そのまま                    (固定額・spec)
//  ★spec=構造+固定レート(時給/日給/単価/率%/固定額)。ctx=当月データ(歩合額/売上/件数/労働時間/出勤日数)。
//  ★期間(日/週/月)は当月合計に集約=定率なら結果同じ。件数/売上は"当月合計"を入れる。
//  ctx = { workMin:0, workDays:0, sales:0, commission:0, count:0 }
//
//  ★端数/割増/社保/税には関与しない。ここは「基本給(base)を幾らにするか」だけ。割増の基礎分解はbreakdownで返す。
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PayRule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function num(v) { v = (v == null || v === '') ? 0 : +String(v).replace(/[^0-9.\-]/g, ''); return isFinite(v) ? v : 0; }
  function r0(v) { return Math.round(v); } // 円未満は四捨五入(基本給の丸め)

  // 1つの部品の金額を評価
  function evalPart(part, ctx) {
    part = part || {}; ctx = ctx || {};
    var a = num(part.amount);
    switch (part.type) {
      case 'hourly': return r0(a * num(ctx.workMin) / 60);
      case 'daily': return r0(a * num(ctx.workDays));
      case 'piece': return r0(a * num(ctx.count)); // 件数×単価(当月件数はctx)
      case 'commission': return r0(num(ctx.commission)); // 歩合額は当月値(ctx)
      case 'rate': return r0(num(ctx.sales) * a / 100);
      case 'tiered': return r0(evalTiered(part.tiers, num(ctx.sales))); // 段階制(累進=超過分だけ率アップ)
      case 'fixed': return r0(a);
      default: return 0;
    }
  }
  // 段階制/スライド率(累進): tiers=[{from:下限, rate:率%}]。売上のうち各段(from〜次のfrom)に入った分だけその率。
  //  ★超過分だけ率アップ=境目で手取りが跳ねない(滑らか)。所得税と同じ考え方。丸めは最後に1回(r0)。
  function evalTiered(tiers, sales) {
    var t = (tiers || []).filter(Boolean).map(function (x) { return { from: num(x.from), rate: num(x.rate) }; });
    if (!t.length) return 0;
    t.sort(function (a, b) { return a.from - b.from; });
    var total = 0;
    for (var i = 0; i < t.length; i++) {
      var lo = t[i].from, hi = (i + 1 < t.length) ? t[i + 1].from : Infinity;
      if (sales > lo) total += (Math.min(sales, hi) - lo) * t[i].rate / 100;
    }
    return total;
  }
  function partLabel(part) {
    if (part && part.label) return part.label;
    switch (part && part.type) {
      case 'hourly': return '時給×時間'; case 'daily': return '日給×日数'; case 'piece': return '件数×単価';
      case 'commission': return '歩合'; case 'rate': return '売上×率'; case 'tiered': return '売上×段階率'; case 'fixed': return '固定';
      default: return '—';
    }
  }

  // 変動部分を評価。mode=one:先頭1個 / max:一番高い部品。返り値={amount,chosen(選ばれた部品),evaluated[]}
  function evalVariable(v, ctx) {
    v = v || {}; var parts = (v.parts || []).filter(Boolean);
    var evaluated = parts.map(function (p) { return { part: p, label: partLabel(p), value: evalPart(p, ctx) }; });
    if (v.mode === 'none' || !parts.length) return { amount: 0, chosen: null, evaluated: evaluated };
    if (v.mode === 'max') {
      var best = evaluated[0];
      for (var i = 1; i < evaluated.length; i++) if (evaluated[i].value > best.value) best = evaluated[i];
      return { amount: best.value, chosen: best, evaluated: evaluated };
    }
    // one(単一)
    return { amount: evaluated[0].value, chosen: evaluated[0], evaluated: evaluated };
  }

  // 基本給を評価。返り値: { base, fixed, variable(金額), chosen, evaluated }
  //  breakdown用に fixed(通常割増の基礎) と commissionPortion(歩合割増の基礎) を分けて返す。
  function basePay(spec, ctx) {
    spec = spec || {}; ctx = ctx || {};
    var fixed = num(spec.fixed);
    var vr = evalVariable(spec.variable, ctx);
    var base = fixed + vr.amount;
    // 採用された変動部分が commission/rate(=出来高性)なら歩合割増の基礎、hourly/daily/fixedなら固定側(通常割増)に寄せる
    var chosenType = vr.chosen && vr.chosen.part ? vr.chosen.part.type : null;
    var isPiecework = (chosenType === 'commission' || chosenType === 'rate' || chosenType === 'piece' || chosenType === 'tiered'); // 出来高性=歩合割増(上乗せのみ)側
    return {
      base: base,
      fixed: fixed,
      variable: vr.amount,
      chosen: vr.chosen,
      chosenType: chosenType,
      evaluated: vr.evaluated,
      // 割増の基礎分解: 固定側(月給的=通常割増) / 歩合側(出来高=歩合上乗せのみ)
      fixedForWari: isPiecework ? fixed : base,
      pieceworkForWari: isPiecework ? vr.amount : 0
    };
  }

  // 出来高払制の保障給チェック(労基法27条・器レベル/構造のみ)。
  //  specが「出来高(歩合/率/件数/段階)を含むのに、労働時間に応じた保障(時給/日給)も固定給も一切ない」
  //  = 完全歩合・無保障 = 27条違反の恐れ → true を返す。
  //  ★"時給×時間 か 歩合 の高い方"や"固定給+歩合"は保障あり=false。判定は当月金額に依存しない構造判定。
  //  ★UI側で黄色・非ブロックの注意に使う(違法設定でも入力は許容=製品方針)。歩合payType(hourlyGuarantee)側は呼び出し元で別途判定。
  var GUARANTEE_TYPES = { hourly: 1, daily: 1 };                    // 時間比例=保障給になりうる
  var OUTPUT_TYPES = { commission: 1, rate: 1, piece: 1, tiered: 1 }; // 出来高=これだけでは保障にならない
  function lacksGuarantee(spec) {
    spec = spec || {};
    var v = spec.variable || {};
    var parts = (v.mode && v.mode !== 'none' && Array.isArray(v.parts)) ? v.parts.filter(Boolean) : [];
    var hasOutput = parts.some(function (p) { return OUTPUT_TYPES[p && p.type]; });
    if (!hasOutput) return false;                                   // 出来高が無ければ27条の対象外
    var hasGuarantee = parts.some(function (p) { return GUARANTEE_TYPES[p && p.type]; });
    var hasFixed = num(spec.fixed) > 0;                             // 固定給も時間非依存の下限=保障とみなす
    return !hasGuarantee && !hasFixed;                             // 出来高のみ・保障ゼロ=無保障
  }

  return { evalPart: evalPart, evalVariable: evalVariable, basePay: basePay, partLabel: partLabel, evalTiered: evalTiered, lacksGuarantee: lacksGuarantee };
});
