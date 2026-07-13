// pay-parse.js — 雑な自然言語の給与説明を解釈して給与spec(payType+payRule)に変換する純関数。
//  ★競合ほぼ白地の"雑入力→解釈→これでいいですか"の解釈エンジン(ルールベース=オフライン/決定論)★。
//  例: 「時給1200」「月給25万」「日給1万」「売上の3.5割か時給1200の高い方」「固定18万＋歩合」「1件1500円」
//  返り値: { ok, payType, fields{base?,hourly?,payRule?}, summary, unrecognized, low }
//   payType: '月給'|'時給'|'日給'|'カスタム' / fields=従業員に反映する項目 / summary=人が読む解釈 / low=自信低い(要確認強め)
//  ★解釈は必ずUI側で「数字例つき"これでいいですか"」を出して人が確認する前提(silent-wrong防止)。
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PayParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 全角数字→半角・記号ゆらぎ正規化
  function norm(s) {
    return String(s || '')
      .replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); })
      .replace(/[，、]/g, ',').replace(/[％]/g, '%').replace(/[／]/g, '/').replace(/[＋]/g, '+')
      .replace(/パーセント/g, '%').replace(/[\s　]/g, '');
  }
  // 金額: "18万"→180000 / "1.5万"→15000 / "1,200"→1200 / "250000"→250000
  function yen(str) {
    if (str == null) return null; var s = String(str).replace(/[,円]/g, '');
    var m = s.match(/^([\d.]+)万$/); if (m) return Math.round(parseFloat(m[1]) * 10000);
    m = s.match(/^([\d.]+)$/); if (m) return Math.round(parseFloat(m[1]));
    return null;
  }
  // 率: "3.5割"→35 / "35%"→35 / "3割5分"→35
  function pct(str) {
    var s = String(str);
    var m = s.match(/([\d.]+)\s*%/); if (m) return parseFloat(m[1]);
    m = s.match(/([\d.]+)割(?:([\d.]+)分)?/); if (m) return parseFloat(m[1]) * 10 + (m[2] ? parseFloat(m[2]) : 0);
    return null;
  }

  // 段階制/スライド率(累進)=明確な2段だけ保守的に読む。「(金額)まで(率1)…(超/以上)(率2)」→[{from:0,r1},{from:金額,r2}]
  //  曖昧なものは読まない(nullを返す)=ウィザードの「これでいいですか」で人が確認する前提。
  function parseTiered(s) {
    var re = /(?:売上[のを×xX*]?)?([\d.,]+万?)円?(?:まで|以下)[^0-9]*?([\d.]+(?:割(?:[\d.]+分)?|%))[^0-9]*?(?:を?こえ|を?超え|超|以上)[^0-9]*?([\d.]+(?:割(?:[\d.]+分)?|%))/;
    var m = s.match(re); if (!m) return null;
    var thr = yen(m[1]), r1 = pct(m[2]), r2 = pct(m[3]);
    if (thr == null || r1 == null || r2 == null || thr <= 0) return null;
    return { tiers: [{ from: '0', rate: String(r1) }, { from: String(thr), rate: String(r2) }], match: m[0] };
  }

  function parse(text) {
    var s = norm(text);
    if (!s) return { ok: false, payType: null, fields: {}, summary: '', unrecognized: String(text || ''), low: true };
    var used = []; // 認識できた部分(unrecognized算出用)
    function grab(re) { var m = s.match(re); if (m) used.push(m[0]); return m; }

    var fixedAmt = null, simple = null; // simple: {kind:'月給'|'時給'|'日給', amount}
    var parts = []; // 変動部品 [{type,amount?,label}]

    // 月給 / 基本給 / 固定 → 固定部分(単独なら月給)
    var mGek = grab(/(?:月給|基本給|固定給|固定|ベース)\s*([\d.,]+万?)/);
    if (mGek) { fixedAmt = yen(mGek[1]); }
    // 時給
    var mHr = grab(/時給\s*([\d.,]+万?)/) || grab(/([\d.,]+)円?\/時/) || grab(/([\d.,]+)円?\/h/i);
    // 日給
    var mDay = grab(/日給\s*([\d.,]+万?)/);
    // 件数×単価: "1件1500円" "1個500" "1台◯円" "1件あたり1500"
    var mPiece = grab(/1?\s*(?:件|個|台|本|口|回)\s*(?:あたり|につき|=|＝)?\s*([\d.,]+万?)円?/) || grab(/([\d.,]+万?)円?\s*[\/×xX]\s*(?:件|個|台|本|口|回)/);
    // 段階制(累進)を先に判定=金額と率を消費し、単一rateの誤検出を防ぐ
    var tiered = parseTiered(s);
    if (tiered) { used.push(tiered.match); }
    // 売上×率: "売上の3.5割" "売上35%" or 単独の "3.5割/35%"(段階制でないとき)
    var mRate = tiered ? null : (grab(/売上[のを×xX*]?\s*([\d.]+\s*(?:割(?:[\d.]+分)?|%))/) || grab(/([\d.]+\s*(?:割(?:[\d.]+分)?|%))/));
    // 歩合(語のみ・額は毎月入力)
    var mCom = /歩合|出来高|インセン/.test(s);

    if (mHr) parts.push({ type: 'hourly', amount: yen(mHr[1]) });
    if (mDay) parts.push({ type: 'daily', amount: yen(mDay[1]) }); // 日給も部品に(単独なら下でsimple日給に畳む)。B1: 複合で日給が消えるバグ修正
    if (mPiece) parts.push({ type: 'piece', amount: yen(mPiece[1]) });
    if (tiered) parts.push({ type: 'tiered', tiers: tiered.tiers });
    if (mRate) parts.push({ type: 'rate', amount: pct(mRate[1]) });
    if (mCom && !mRate && !mPiece && !tiered) parts.push({ type: 'commission' }); // 「歩合」だけ=歩合額を毎月入力

    // 高い方/いずれか → max
    var isMax = /高い方|いい方|良い方|大きい方|どちらか|いずれか|または|か時給|か日給|か歩合|orか/.test(s) || /.+か.+/.test(s) && parts.length >= 2;

    // ── payType 決定 ──
    // 変動部品ゼロ = 単純形(月給)
    if (!parts.length) {
      if (mHr === null && fixedAmt != null && mGek && /月給|基本給|固定給|固定|ベース/.test(mGek[0])) return finalizeSimple('月給', fixedAmt, s, used);
      // 数字だけ等=解釈不能
      return { ok: false, payType: null, fields: {}, summary: '読み取れませんでした', unrecognized: String(text || ''), low: true };
    }
    // 単独・固定なし = 単純形(時給/日給)
    if (parts.length === 1 && fixedAmt == null) {
      if (parts[0].type === 'hourly') return finalizeSimple('時給', parts[0].amount, s, used);
      if (parts[0].type === 'daily') return finalizeSimple('日給', parts[0].amount, s, used);
    }
    // それ以外 = カスタム(固定 + 変動{one/max})
    var mode = (parts.length >= 2) ? 'max' : 'one';
    // ★B2: 変動2部品で「＋(両方)」意図(高い方でない)は none/one/max では"合算"を表現できない→自信低(low)で人に確認を促す
    var lowConf = (parts.length >= 2 && !isMax);
    var payRule = { fixed: fixedAmt != null ? String(fixedAmt) : '', variable: { mode: mode, parts: parts.map(function (p) { var o = { type: p.type, amount: p.amount != null ? String(p.amount) : '', label: '' }; if (p.type === 'tiered') o.tiers = p.tiers; return o; }) } };
    var sum = summaryOf(fixedAmt, mode, parts) + (lowConf ? '（※「＋」は"高い方"として解釈。両方を足す設定は器で作れないため、必要なら手で調整してください）' : '');
    return { ok: true, payType: 'カスタム', fields: { payRule: payRule }, summary: sum, unrecognized: leftover(text, used), low: lowConf };
  }

  function finalizeSimple(kind, amount, s, used) {
    var f = {}; if (kind === '時給') f.hourly = String(amount); else f.base = String(amount);
    var lbl = kind === '時給' ? ('時給 ' + yenS(amount) + '円') : kind === '日給' ? ('日給 ' + yenS(amount) + '円') : ('月給 ' + yenS(amount) + '円');
    return { ok: amount != null, payType: kind, fields: f, summary: lbl, unrecognized: '', low: amount == null };
  }
  function partLabel(p) {
    switch (p.type) {
      case 'hourly': return '時給×時間（' + yenS(p.amount) + '円/時）';
      case 'daily': return '日給×日数（' + yenS(p.amount) + '円）';
      case 'piece': return '件数×単価（1件' + yenS(p.amount) + '円）';
      case 'rate': return '売上×率（' + (p.amount != null ? p.amount : '?') + '%）';
      case 'tiered': return '売上×段階率（' + (p.tiers || []).map(function (t) { return Number(t.from).toLocaleString('en-US') + '円〜' + t.rate + '%'; }).join(' / ') + '）';
      case 'commission': return '歩合（毎月入力）';
      case 'fixed': return '固定（' + yenS(p.amount) + '円）';
      default: return '—';
    }
  }
  function summaryOf(fixedAmt, mode, parts) {
    var head = fixedAmt ? ('固定 ' + yenS(fixedAmt) + '円 ＋ ') : '';
    var pv = parts.map(partLabel);
    var body = mode === 'max' ? ('高い方（' + pv.join(' か ') + '）') : pv.join(' ＋ ');
    return head + body;
  }
  function yenS(n) { return (n == null) ? '?' : Number(n).toLocaleString('en-US'); }
  function leftover(text, used) {
    var s = norm(text); used.forEach(function (u) { s = s.replace(norm(u), ''); }); // 正規化どうしで引く(全角読点等のズレ防止)
    s = s.replace(/[のをか+とやまたはいずれか高い方いい方良い方大きい方どちらか,。・]/g, '');
    return s;
  }

  return { parse: parse, _yen: yen, _pct: pct, _norm: norm };
});
