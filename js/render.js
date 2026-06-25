/* render.js — 給与明細テンプレ(3種)を実データから描画する忠実レンダラ
 * 確定テンプレ: ① 横並び(支給左/控除右+中身2カラム) cols  ② 縦並び vstack  ③ 横ストリップ strips
 * いずれも「中身2カラム・勤怠6基準→最大3行」。各 build* は完結したHTML文字列を返す(iframe/印刷用)。
 */
(function (global) {
  'use strict';

  // ---- 共有デザイントークン ----
  var ROOT = ':root{--ink:#23261f;--ink2:#6a6d62;--ink3:#7d7f72;--hair:#ddd7c7;--hair2:#cfc9b8;--accent:#6f5a3e;--accent-soft:#b6a06d;--paper:#fffefb;}' +
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","Hiragino Mincho Pro","HG明朝E","MS Mincho",serif;color:var(--ink);-webkit-font-smoothing:antialiased;}';

  var YEN = '<span class="yen">¥</span>';
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmt(v){ if(v==null||v==='') return ''; if(typeof v==='number') return v.toLocaleString('ja-JP'); var n=Number(String(v).replace(/[, ]/g,'')); return isNaN(n)?esc(v):n.toLocaleString('ja-JP'); }
  function sum(items){ return items.reduce(function(a,it){ var n=Number(String(it.value).replace(/[, ]/g,'')); return a+(isNaN(n)?0:n); },0); }

  function masthead(){ return '<div class="masthead"><div class="mh-title">給 与 支 給 明 細 書</div><div class="mh-month">'+esc(P.month||'令 和 八 年 六 月 分')+'</div><div class="mh-rule"></div></div>'; }
  var P = {}; // doc-level (month) set per render

  // ============ ① 横並び cols (n=1 大ヒーロー / n=2 積み) ============
  var COLS_CSS = ROOT +
    '.sheet{width:794px;min-height:1123px;margin:0 auto;background:var(--paper);padding:30px 48px;display:flex;flex-direction:column;}' +
    '.page{width:794px;min-height:1123px;margin:0 auto;background:var(--paper);padding:24px 44px;display:flex;flex-direction:column;}' +
    '.issuer,.top{display:flex;justify-content:space-between;align-items:flex-start;}' +
    '.meta,.iss-date{font-size:9.5px;color:#6a6d62;text-align:right;line-height:1.6;}' +
    '.ttl{font-size:13px;letter-spacing:.28em;font-weight:500;white-space:nowrap;}.ttl small{display:block;font-size:9px;letter-spacing:.16em;margin-top:4px;font-weight:500;}' +
    '.masthead{text-align:center;margin-bottom:14px;}.mh-title{font-size:17px;letter-spacing:.40em;font-weight:500;}.mh-month{font-size:12px;letter-spacing:.20em;margin-top:8px;font-weight:500;}.mh-rule{height:.6px;background:var(--hair2);margin-top:12px;}' +
    '.hero{text-align:center;margin-top:14px;}.h-co{font-size:13px;color:#5f6258;margin-bottom:10px;letter-spacing:.14em;}.h-nm{font-size:17px;letter-spacing:.12em;}.h-nm .dono{font-size:14px;color:var(--ink2);margin-left:.3em;}' +
    '.h-lab{font-size:12px;letter-spacing:.40em;color:var(--accent);margin-top:10px;}.h-val{font-size:54px;margin-top:7px;line-height:1.05;font-variant-numeric:tabular-nums;}.h-val .yen{font-size:26px;color:var(--accent);margin-right:2px;}' +
    '.nm{text-align:center;margin-top:7px;font-size:14px;letter-spacing:.06em;}.nm .dono{font-size:10px;color:var(--ink3);margin-left:.3em;}.rule{height:.7px;background:var(--hair2);margin:8px 0;}' +
    '.net{text-align:center;font-size:11px;color:var(--accent);letter-spacing:.2em;}.net b{font-size:21px;color:var(--ink);font-weight:500;margin-left:8px;font-variant-numeric:tabular-nums;}.net b .y{font-size:12px;color:var(--accent);margin-right:1px;}' +
    '.kin{display:grid;grid-template-columns:repeat(6,1fr);row-gap:7px;border-top:1px solid var(--accent-soft);border-bottom:1px solid var(--accent-soft);margin:10px 0 9px;padding:7px 0;}.kin .k{text-align:center;padding:0 2px;}.kin .k .kl{font-size:9px;color:#6a6d62;}.kin .k .kv{font-size:12px;margin-top:3px;font-variant-numeric:tabular-nums;}' +
    '.sec-title,.st{font-size:12px;letter-spacing:.40em;color:var(--accent);padding-left:.40em;margin-bottom:2px;}' +
    '.pd{display:flex;gap:36px;align-items:stretch;}.p1 .pd{min-height:283px;}.p2 .pd{min-height:283px;}.pd .col{flex:1;display:flex;flex-direction:column;}.pd .st{padding-bottom:8px;border-bottom:.7px solid var(--hair2);margin-bottom:3px;}' +
    '.items2{display:grid;grid-template-columns:1fr 1fr;column-gap:20px;}' +
    '.r{display:flex;justify-content:space-between;align-items:baseline;padding:4px 1px;border-bottom:.7px solid var(--hair);}.r .l{font-size:10.5px;color:#5f6258;}.r .l .hz{font-size:8px;color:var(--ink3);margin-left:3px;font-family:"Yu Gothic","Hiragino Sans",sans-serif;}.r .v{font-size:11px;font-variant-numeric:tabular-nums;}' +
    '.items2 .r:nth-last-child(-n+2){border-bottom:none;}' +
    '.r.sum{border-bottom:none;border-top:1px solid var(--accent-soft);margin-top:auto;padding-top:8px;}.r.sum .l{color:var(--ink);letter-spacing:.16em;font-size:12px;}.r.sum .v{font-size:14px;}' +
    '@page{size:A4 portrait;margin:0;}@media print{body{background:#fff;}.page,.sheet{box-shadow:none;}}';

  function rowsHTML(items){ return items.map(function(it){ var hz=it.hikazei?'<span class="hz">非課税</span>':''; return '<div class="r"><span class="l">'+esc(it.label)+hz+'</span><span class="v">'+fmt(it.value)+'</span></div>'; }).join(''); }
  function kinHTML(kintai){ return '<div class="kin">'+kintai.map(function(k){ return '<div class="k"><div class="kl">'+esc(k.label)+'</div><div class="kv">'+esc(k.value)+'</div></div>'; }).join('')+'</div>'; }
  function metaHTML(p){ return '<div class="meta">支給日　'+esc(p.payDate||'')+'<br>'+esc(p.company||'')+'</div>'; }

  function colsUnitHero(p){
    return '<div class="unit">' +
      '<div class="issuer"><div></div><div class="iss-date">支給日　'+esc(p.payDate||'')+'</div></div>' +
      masthead() +
      '<div class="hero"><div class="h-co">'+esc(p.company||'')+'</div><div class="h-nm">'+esc(p.name||'')+'<span class="dono">殿</span></div><div class="h-lab">差 引 支 給 額</div><div class="h-val">'+YEN+fmt(p.net)+'</div></div>' +
      '<div class="sec-title" style="margin-top:6px">勤 怠</div>'+kinHTML(p.kintai) +
      '<div class="pd">' +
        '<div class="col"><div class="st">支 給</div><div class="items2">'+rowsHTML(p.shikyu)+'</div><div class="r sum"><span class="l">支給合計</span><span class="v">'+fmt(p.shikyuTotal!=null?p.shikyuTotal:sum(p.shikyu))+'</span></div></div>' +
        '<div class="col"><div class="st">控 除</div><div class="items2">'+rowsHTML(p.kojo)+'</div><div class="r sum"><span class="l">控除合計</span><span class="v">'+fmt(p.kojoTotal!=null?p.kojoTotal:sum(p.kojo))+'</span></div></div>' +
      '</div></div>';
  }
  function colsUnitCompact(p){
    return '<div class="unit">' +
      '<div class="top"><div class="ttl">給 与 支 給 明 細 書<small>'+esc(P.month||'令 和 八 年 六 月 分')+'</small></div>'+metaHTML(p)+'</div>' +
      '<div class="nm">'+esc(p.name||'')+'<span class="dono">殿</span></div><div class="rule"></div>' +
      '<div class="net">差引支給額<b><span class="y">¥</span>'+fmt(p.net)+'</b></div>' +
      kinHTML(p.kintai) +
      '<div class="pd">' +
        '<div class="col"><div class="st">支 給</div><div class="items2">'+rowsHTML(p.shikyu)+'</div><div class="r sum"><span class="l">支給合計</span><span class="v">'+fmt(p.shikyuTotal!=null?p.shikyuTotal:sum(p.shikyu))+'</span></div></div>' +
        '<div class="col"><div class="st">控 除</div><div class="items2">'+rowsHTML(p.kojo)+'</div><div class="r sum"><span class="l">控除合計</span><span class="v">'+fmt(p.kojoTotal!=null?p.kojoTotal:sum(p.kojo))+'</span></div></div>' +
      '</div></div>';
  }

  function buildCols(people, doc){
    P = doc||{};
    var n = people.length;
    var body, cls;
    if(n===1){ cls='page p1'; body=colsUnitHero(people[0]); }
    else { cls='page p2'; body=people.slice(0,2).map(colsUnitCompact).join(''); }
    return wrap(COLS_CSS, '<div class="'+cls+'">'+body+'</div>', 'portrait');
  }

  // ============ ② 縦並び vstack (1人・上部コンパクト) ============
  var VSTACK_CSS = ROOT +
    '.sheet{width:794px;min-height:1123px;margin:0 auto;background:var(--paper);padding:26px 52px;display:flex;flex-direction:column;}' +
    '.issuer{display:flex;justify-content:space-between;align-items:flex-start;}.iss-date{font-size:10.5px;color:#6a6d62;text-align:right;line-height:1.6;}' +
    '.masthead{text-align:center;margin-top:0;}.mh-title{font-size:15px;letter-spacing:.40em;font-weight:500;}.mh-month{font-size:10.5px;letter-spacing:.20em;margin-top:4px;font-weight:500;}.mh-rule{height:.6px;background:var(--hair2);margin-top:8px;}' +
    '.hero{text-align:center;margin-top:9px;}.hc-co{font-size:12px;color:#5f6258;margin-bottom:4px;letter-spacing:.14em;}.hc-name{font-size:15px;letter-spacing:.12em;}.hc-name .dono{font-size:12px;color:var(--ink2);margin-left:.4em;}' +
    '.hc-label{font-size:10.5px;letter-spacing:.40em;color:var(--accent);margin-top:5px;}.hc-val{display:inline-flex;align-items:baseline;gap:6px;font-size:34px;margin-top:3px;line-height:1.04;font-variant-numeric:tabular-nums;}.hc-val .yen{font-size:18px;color:var(--accent);}' +
    '.sec-title{font-size:11px;letter-spacing:.40em;color:var(--accent);padding-left:.40em;margin-bottom:2px;}' +
    '.kin{display:grid;grid-template-columns:repeat(6,1fr);row-gap:5px;border-top:1px solid var(--accent-soft);border-bottom:1px solid var(--accent-soft);margin:8px 0 9px;padding:6px 0;}.kin .k{text-align:center;padding:0 2px;}.kin .k .kl{font-size:9px;color:#6a6d62;}.kin .k .kv{font-size:11.5px;margin-top:3px;font-variant-numeric:tabular-nums;}' +
    '.pd{display:flex;flex-direction:column;gap:14px;}.pd .col{display:flex;flex-direction:column;}.pd .sec-title{padding-bottom:7px;border-bottom:.7px solid var(--hair2);margin-bottom:2px;}' +
    '.items2{display:grid;grid-template-columns:1fr 1fr;column-gap:46px;}' +
    '.ln{display:flex;justify-content:space-between;align-items:baseline;padding:5.5px 2px;border-bottom:.7px solid var(--hair);}.ln .lab{font-size:12px;color:#5f6258;}.ln .lab .hz{font-size:8.5px;color:var(--ink3);margin-left:4px;font-family:"Yu Gothic","Hiragino Sans",sans-serif;}.ln .amt{font-size:13px;font-variant-numeric:tabular-nums;}' +
    '.items2 .ln:nth-last-child(-n+2){border-bottom:none;}' +
    '.ln.sum{border-bottom:none;border-top:1px solid var(--accent-soft);margin-top:6px;padding-top:9px;}.ln.sum .lab{color:var(--ink);letter-spacing:.18em;font-size:12.5px;}.ln.sum .amt{font-size:15px;}' +
    '@page{size:A4 portrait;margin:0;}@media print{body{background:#fff;}.sheet{box-shadow:none;}}';

  function lnHTML(items){ return items.map(function(it){ var hz=it.hikazei?'<span class="hz">非課税</span>':''; return '<div class="ln"><span class="lab">'+esc(it.label)+hz+'</span><span class="amt">'+fmt(it.value)+'</span></div>'; }).join(''); }
  function kinHTMLv(kintai){ return '<div class="kin">'+kintai.map(function(k){ return '<div class="k"><div class="kl">'+esc(k.label)+'</div><div class="kv">'+esc(k.value)+'</div></div>'; }).join('')+'</div>'; }

  function buildVstack1(people, doc){
    P=doc||{}; var p=people[0];
    var body='<div class="sheet">' +
      '<div class="issuer"><div></div><div class="iss-date">支給日　'+esc(p.payDate||'')+'</div></div>' +
      masthead() +
      '<div class="hero"><div class="hc-co">'+esc(p.company||'')+'</div><div class="hc-name">'+esc(p.name||'')+'<span class="dono">殿</span></div><div class="hc-label">差 引 支 給 額</div><div class="hc-val"><span class="yen">¥</span>'+fmt(p.net)+'</div></div>' +
      '<div class="sec-title" style="margin-top:6px">勤 怠</div>'+kinHTMLv(p.kintai) +
      '<div class="pd">' +
        '<div class="col"><div class="sec-title">支 給</div><div class="items2">'+lnHTML(p.shikyu)+'</div><div class="ln sum"><span class="lab">支給合計</span><span class="amt">'+fmt(p.shikyuTotal!=null?p.shikyuTotal:sum(p.shikyu))+'</span></div></div>' +
        '<div class="col"><div class="sec-title">控 除</div><div class="items2">'+lnHTML(p.kojo)+'</div><div class="ln sum"><span class="lab">控除合計</span><span class="amt">'+fmt(p.kojoTotal!=null?p.kojoTotal:sum(p.kojo))+'</span></div></div>' +
      '</div></div>';
    return wrap(VSTACK_CSS, body, 'portrait');
  }

  // ============ ③ 横ストリップ strips (2-4人) ============
  var STRIPS_CSS = ROOT +
    '.page{width:1123px;height:794px;margin:0 auto;background:var(--paper);box-shadow:0 10px 36px rgba(0,0,0,.26);padding:26px 24px;display:flex;}.page.one{justify-content:center;}' +
    '.strip{flex:1;padding:0 16px;border-left:1px dashed #c4bda9;display:flex;flex-direction:column;}.strip:first-child{border-left:none;}.one .strip{flex:0 0 460px;}' +
    '.s-title{font-size:11.5px;letter-spacing:.22em;text-align:center;font-weight:500;}.s-month{font-size:8.5px;letter-spacing:.14em;text-align:center;margin-top:4px;font-weight:500;}.s-rule{height:.8px;background:var(--accent-soft);margin:8px 0 5px;}' +
    '.s-who{text-align:center;margin:5px 0 4px;}.s-co{font-size:8.5px;color:#5f6258;letter-spacing:.08em;}.s-name{font-size:11px;margin-top:3px;letter-spacing:.06em;}.s-name .dono{font-size:9px;color:var(--ink3);margin-left:.3em;}' +
    '.s-hl{font-size:8.5px;letter-spacing:.34em;color:var(--accent);text-align:center;margin-top:6px;}.s-val{text-align:center;font-size:21px;margin-top:2px;font-variant-numeric:tabular-nums;}.s-val .yen{font-size:12px;color:var(--accent);margin-right:1px;}' +
    '.sl{font-size:8.5px;letter-spacing:.30em;color:var(--accent);padding-left:.30em;margin:9px 0 1px;padding-bottom:4px;border-bottom:.7px solid var(--hair2);}' +
    '.r{display:flex;justify-content:space-between;align-items:baseline;padding:3.4px 1px;border-bottom:.6px solid var(--hair);}.r .l{font-size:9px;color:#5f6258;}.r .l .hz{font-size:6.5px;color:var(--ink3);margin-left:2px;font-family:"Yu Gothic","Hiragino Sans",sans-serif;}.r .v{font-size:9.5px;font-variant-numeric:tabular-nums;}' +
    '.kintai{border-top:1px solid var(--accent-soft);border-bottom:1px solid var(--accent-soft);margin-top:5px;padding:2px 0;}.kintai .k3{display:grid;grid-template-columns:1fr 1fr 1fr;column-gap:14px;}.kintai .r{border-bottom:none;padding:3px 1px;}' +
    '.items2{display:grid;grid-template-columns:1fr 1fr;column-gap:14px;}.items2 .r:nth-last-child(-n+2){border-bottom:none;}' +
    '.r.sum{border-bottom:none;border-top:1px solid var(--accent-soft);margin-top:5px;padding-top:6px;}.r.sum .l{color:var(--ink);letter-spacing:.1em;}.r.sum .v{font-size:10.5px;}' +
    '@page{size:A4 landscape;margin:0;}@media print{body{background:#fff;}.page{box-shadow:none;}}';

  function srowsHTML(items){ return items.map(function(it){ var hz=it.hikazei?'<span class="hz">非課税</span>':''; return '<div class="r"><span class="l">'+esc(it.label)+hz+'</span><span class="v">'+fmt(it.value)+'</span></div>'; }).join(''); }
  function skinHTML(kintai){ return kintai.map(function(k){ return '<div class="r"><span class="l">'+esc(k.label)+'</span><span class="v">'+esc(k.value)+'</span></div>'; }).join(''); }
  function strip(p){
    return '<div class="strip">' +
      '<div class="s-title">給 与 支 給 明 細 書</div><div class="s-month">'+esc(P.month||'令 和 八 年 六 月 分')+'</div><div class="s-rule"></div>' +
      '<div class="s-who"><div class="s-co">'+esc(p.company||'')+'</div><div class="s-name">'+esc(p.name||'')+'<span class="dono">殿</span></div></div>' +
      '<div class="s-hl">差 引 支 給 額</div><div class="s-val"><span class="yen">¥</span>'+fmt(p.net)+'</div>' +
      '<div class="sl" style="border:none;padding-bottom:0;">勤 怠</div><div class="kintai"><div class="k3">'+skinHTML(p.kintai)+'</div></div>' +
      '<div class="sl">支 給</div><div class="items2">'+srowsHTML(p.shikyu)+'</div><div class="r sum"><span class="l">支給合計</span><span class="v">'+fmt(p.shikyuTotal!=null?p.shikyuTotal:sum(p.shikyu))+'</span></div>' +
      '<div class="sl">控 除</div><div class="items2">'+srowsHTML(p.kojo)+'</div><div class="r sum"><span class="l">控除合計</span><span class="v">'+fmt(p.kojoTotal!=null?p.kojoTotal:sum(p.kojo))+'</span></div>' +
      '</div>';
  }
  function buildStrips(people, doc){
    P=doc||{}; var n=people.length;
    return wrap(STRIPS_CSS, '<div class="page'+(n===1?' one':'')+'">'+people.map(strip).join('')+'</div>', 'landscape');
  }

  function wrap(css, body, orientation){
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>'+css+'</style></head><body data-orientation="'+orientation+'">'+body+'</body></html>';
  }

  // ---- 自動テンプレ選択（ロジックは lib/select.js = PayslipSelect に集約・テスト可能）----
  function choose(people, prefer){
    var S = global.PayslipSelect;
    return S.choose(people, prefer);
  }

  var Render = {
    build: function(people, doc, prefer){
      var c = choose(people, prefer);
      var html;
      if(c.builder==='cols') html=buildCols(people, doc);
      else if(c.builder==='vstack') html=buildVstack1(people, doc);
      else html=buildStrips(people, doc);
      return { html: html, builder: c.builder, fits: c.fits,
               orientation: (c.builder==='strips'?'landscape':'portrait') };
    },
    buildCols: buildCols, buildVstack1: buildVstack1, buildStrips: buildStrips, choose: choose
  };
  global.Render = Render;
})(window);
