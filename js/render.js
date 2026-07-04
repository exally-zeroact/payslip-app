/* render.js — 給与明細テンプレ(3種)を実データから描画する忠実レンダラ
 * 確定テンプレ: ① 横並び(支給左/控除右+中身2カラム) cols  ② 縦並び vstack  ③ 横ストリップ strips
 * いずれも「中身2カラム・勤怠6基準→最大3行」。各 build* は完結したHTML文字列を返す(iframe/印刷用)。
 */
(function (global) {
  'use strict';

  // ---- 共有デザイントークン ----
  var ROOT = ':root{--ink:#23261f;--ink2:#6a6d62;--ink3:#7d7f72;--hair:#ddd7c7;--hair-lt:#ece7dc;--hair2:#cfc9b8;--accent:#6f5a3e;--accent-soft:#b6a06d;--paper:#ffffff;}' +
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    '.sum{display:grid!important;grid-template-columns:1fr 1fr;align-items:baseline;}.sum .v{text-align:right;}.sum .l{text-align:left;}.sum .sgrp{display:flex;justify-content:space-between;align-items:baseline;}.r-pad .l,.r-pad .v,.r-pad .lab,.r-pad .amt{visibility:hidden;}' +
    '.pgbreak{height:0;}@media print{.pgbreak{page-break-after:always;}}' +
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
    '.meta,.iss-date{font-size:9.5px;color:var(--ink2);text-align:right;line-height:1.6;}' +
    '.ttl{font-size:13px;letter-spacing:.28em;font-weight:500;white-space:nowrap;}.ttl small{display:block;font-size:9px;letter-spacing:.16em;margin-top:4px;font-weight:500;}' +
    '.tophd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;}.tophd .mh{text-align:left;}.mh-title{font-size:13.5px;letter-spacing:.34em;font-weight:500;}.mh-month{font-size:10px;letter-spacing:.20em;margin-top:5px;font-weight:500;color:var(--ink2);}.mh-rule{height:.6px;background:var(--hair2);margin-top:9px;margin-bottom:14px;}' +
    '.hero{text-align:center;margin-top:14px;}.h-co{font-size:11px;color:var(--ink2);margin-bottom:10px;letter-spacing:.12em;}.h-nm{font-size:14.5px;letter-spacing:.1em;}.h-nm .dono{font-size:11.5px;color:var(--ink2);margin-left:.3em;}' +
    '.h-lab{font-size:11px;letter-spacing:.40em;color:var(--accent);margin-top:10px;}.h-val{font-size:36px;margin-top:5px;line-height:1.05;font-variant-numeric:tabular-nums;}.h-val .yen{font-size:18px;color:var(--accent);margin-right:2px;}' +
    '.nm{text-align:center;margin-top:7px;font-size:14px;letter-spacing:.06em;}.nm .dono{font-size:10px;color:var(--ink3);margin-left:.3em;}.rule{height:.7px;background:var(--hair2);margin:8px 0;}' +
    '.net{text-align:center;font-size:11px;color:var(--accent);letter-spacing:.2em;}.net b{font-size:21px;color:var(--ink);font-weight:500;margin-left:8px;font-variant-numeric:tabular-nums;}.net b .y{font-size:12px;color:var(--accent);margin-right:1px;}' +
    '.kin{display:flex;flex-direction:column;border-top:1px solid var(--accent-soft);border-bottom:1px solid var(--accent-soft);margin:10px 0 9px;padding:7px 0;}.kin .kg{display:grid;justify-content:center;column-gap:0;}.kin .k{text-align:center;padding:0 6px;}.kin .kl{font-size:9px;color:var(--ink2);}.kin .kv{font-size:12px;margin-top:3px;font-variant-numeric:tabular-nums;}.kin .krow.kb{border-bottom:.7px solid var(--hair-lt);padding-bottom:6px;}.kin .krow.kb + .krow{padding-top:6px;}' +
    '.sec-title,.st{font-size:12px;letter-spacing:.40em;color:var(--accent);padding-left:.40em;margin-bottom:2px;}' +
    '.pd{display:flex;gap:36px;align-items:stretch;}.p1{padding-top:72px;}.pd .col{flex:1;display:flex;flex-direction:column;}.pd .st{padding-bottom:8px;border-bottom:.7px solid var(--hair2);margin-bottom:3px;}' +
    '.p2{padding:24px;}.p2 .unit:first-child{border-bottom:1px dashed #d3d3d3;padding-bottom:24px;margin-bottom:0;}.p2 .unit:last-child{padding-top:24px;}' +
    '.vu .pd{flex-direction:column;gap:2px;min-height:0;}.vu .pd .col{min-height:0;}.vu .pd .r.sum{margin-top:4px;}' +
    '.unit-c .mh-title{font-size:11px;letter-spacing:.22em;}.unit-c .mh-month{font-size:8px;margin-top:0;}.unit-c .mh-rule{margin-top:2px;margin-bottom:3px;}' +
    '.unit-c .hero2{align-items:start;}.unit-c .hero{margin-top:0;}.unit-c .h-co{font-size:8.5px;margin-bottom:0;line-height:1.1;}.unit-c .h-nm{font-size:11px;line-height:1.1;margin-top:-1px;}.unit-c .h-lab{font-size:8.5px;margin-top:0;letter-spacing:.2em;}.unit-c .h-val{font-size:19px;margin-top:0;line-height:1.1;}.unit-c .h-val .yen{font-size:10px;}' +
    '.hero2{display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:12px;}.hero2 .hg-l{text-align:left;}.hero2 .hg-r{text-align:center;}.hero2 .h-co{margin-bottom:5px;}.hero2 .h-lab{margin-top:0;}.hero2 .h-val{margin-top:3px;}' +
    '.unit-c .sec-title{font-size:10.5px;}.unit-c .kin{margin:1px 0 2px;padding:1px 0;}.unit-c .kin .kl{font-size:7.5px;}.unit-c .kin .kv{font-size:9.5px;margin-top:0;}.unit-c .sec-title{margin-top:7px!important;}' +
    '.p2 .unit-c{flex:1 1 0;display:flex;flex-direction:column;min-height:0;}.unit-c .pd{flex:1 1 auto;min-height:0;}.unit-c:not(.vu) .r.sum{margin-top:auto;}' +
    '.unit-c.vu .pd .col{flex:0 0 auto;}.vu .pd .vsp{flex:1 1 auto;min-height:0;}.vu .pd .vspb{flex:1.6 1 auto;}' +
    '.items2{display:grid;grid-template-columns:1fr 1fr;column-gap:0;}.items2 .r:nth-child(odd){padding-right:11px;}.items2 .r:nth-child(even){padding-left:11px;}' +
    '.r{display:flex;justify-content:space-between;align-items:baseline;padding:4px 1px;border-bottom:.7px solid var(--hair-lt);}.r .l{font-size:10.5px;color:var(--ink2);}.r .l .hz{font-size:8px;color:var(--ink3);margin-left:3px;font-family:"Yu Gothic","Hiragino Sans",sans-serif;}.r .v{font-size:11px;font-variant-numeric:tabular-nums;}' +
    '.items2 .r.e{height:26px;box-sizing:border-box;}.items2 .r:nth-last-child(-n+2){border-bottom:none;}' +
    '.r.sum{border-bottom:none;border-top:1px solid var(--accent-soft);margin-top:0;padding-top:8px;column-gap:20px;}.r.sum .l{color:var(--ink);letter-spacing:.16em;font-size:12px;}.r.sum .v{font-size:14px;}.r.sum .sgrp .l{letter-spacing:.1em;}' +
    '@page{size:A4 portrait;margin:0;}@media print{body{background:#fff;}.page,.sheet{box-shadow:none;}}';

  // 行を2列グリッドに流す。奇数なら空セルを補い、行区切り線が全幅で出るようにする
  function rowsHTML(items, minCells){ var h=items.map(function(it){ var hz=it.hikazei?'<span class="hz">非課税</span>':''; return '<div class="r"><span class="l">'+esc(it.label)+hz+'</span><span class="v">'+fmt(it.value)+'</span></div>'; }).join(''); for(var n=items.length; (n%2===1)||(n<(minCells||0)); n++) h+='<div class="r e"></div>'; return h; }
  // 合計行：金額を左列の金額と同じ位置に揃える(右端に飛ばさない)。cls= r / ln
  // green=true(全幅で離れる縦並び)→ラベルを右列(緑線)・値を右列の数字位置に揃える / falseはラベル左
  function sumLine(cls, label, value, green){
    var lc=cls==='ln'?'lab':'l', vc=cls==='ln'?'amt':'v';
    if(green || cls==='ln'){
      return '<div class="'+cls+' sum"><span class="sp"></span><span class="sgrp"><span class="'+lc+'">'+label+'</span><span class="'+vc+'">'+fmt(value)+'</span></span></div>'; }
    return '<div class="'+cls+' sum"><span class="'+lc+'">'+label+'</span><span class="'+vc+'">'+fmt(value)+'</span></div>'; }
  // 勤怠の列数=1行最大max(縦/横並び6・横ストリップ3)。フル行は中央(ブロック中央寄せ)・端数行は左揃え(列が揃う)
  function kinCols(n, max){ return Math.max(1, Math.min(n||1, max)); }
  // 勤怠=行ごとに全幅ラッパー(.krow)+中央グリッド(.kg)。行間の薄線は.krow.kbの全幅border=他の線と左右一致(全テンプレ共通)
  function kinBuild(kintai, c, w){ var rows=[]; for(var i=0;i<kintai.length;i+=c) rows.push(kintai.slice(i,i+c)); return '<div class="kin">'+rows.map(function(row,ri){ var cells=row.map(function(k){ return '<div class="k"><div class="kl">'+esc(k.label)+'</div><div class="kv">'+esc(k.value)+'</div></div>'; }).join(''); return '<div class="krow'+(ri<rows.length-1?' kb':'')+'"><div class="kg" style="grid-template-columns:repeat('+c+','+w+'px)">'+cells+'</div></div>'; }).join('')+'</div>'; }
  function kinHTML(kintai){ return kinBuild(kintai, kinCols(kintai.length,12), 56); }
  function metaHTML(p){ return '<div class="meta">支給日　'+esc(p.payDate||'')+'<br>'+esc(p.company||'')+'</div>'; }
  // 上部=会社名/氏名(左)と差引支給額/¥(中央)の2カラム(全テンプレ共通デフォルト)
  function heroHTML(p){ return '<div class="hero hero2"><div class="hg-l"><div class="h-co">'+esc(p.company||'')+'</div><div class="h-nm">'+esc(p.name||'')+'<span class="dono">殿</span></div></div><div class="hg-r"><div class="h-lab">差 引 支 給 額</div><div class="h-val">'+YEN+fmt(p.net)+'</div></div></div>'; }
  // 表題=左寄せ・支給日=右(同じ行)+全幅の細線(全テンプレ共通)
  function topHead(p){ var ttl=P.kind==='bonus'?'賞 与 支 給 明 細 書':'給 与 支 給 明 細 書'; return '<div class="tophd"><div class="mh"><div class="mh-title">'+ttl+'</div><div class="mh-month">'+esc(P.month||'令 和 八 年 六 月 分')+'</div></div><div class="iss-date">支給日　'+esc(p.payDate||'')+'</div></div><div class="mh-rule"></div>'; }
  // 勤怠セクション(賞与明細では描かない)
  function kinSection(html){ return P.kind==='bonus' ? '' : html; }

  function colsUnitHero(p){
    return '<div class="unit">' +
      topHead(p) +
      heroHTML(p) +
      kinSection('<div class="sec-title" style="margin-top:6px">勤 怠</div>'+kinHTML(p.kintai)) +
      '<div class="pd">' +
        '<div class="col"><div class="st">支 給</div><div class="items2">'+rowsHTML(p.shikyu,22)+'</div>'+sumLine('r','支給合計',p.shikyuTotal!=null?p.shikyuTotal:sum(p.shikyu))+'</div>' +
        '<div class="col"><div class="st">控 除</div><div class="items2">'+rowsHTML(p.kojo,22)+'</div>'+sumLine('r','控除合計',p.kojoTotal!=null?p.kojoTotal:sum(p.kojo))+'</div>' +
      '</div></div>';
  }
  // 2人版も1人版(hero)と同じ中央デザインのまま小さく(.unit-cで縮小)
  function unitCommon(p, extraCls, green, minCells){
    return '<div class="unit unit-c'+(extraCls?' '+extraCls:'')+'">' +
      topHead(p) +
      heroHTML(p) +
      kinSection('<div class="sec-title" style="margin-top:6px">勤 怠</div>'+kinHTML(p.kintai)) +
      '<div class="pd">' +
        '<div class="col"><div class="st">支 給</div><div class="items2">'+rowsHTML(p.shikyu,minCells)+'</div>'+sumLine('r','支給合計',p.shikyuTotal!=null?p.shikyuTotal:sum(p.shikyu),green)+'</div>' +
        (extraCls==='vu'?'<div class="vsp"></div>':'') +
        '<div class="col"><div class="st">控 除</div><div class="items2">'+rowsHTML(p.kojo,minCells)+'</div>'+sumLine('r','控除合計',p.kojoTotal!=null?p.kojoTotal:sum(p.kojo),green)+'</div>' +
        (extraCls==='vu'?'<div class="vsp vspb"></div>':'') +
      '</div></div>';
  }
  function colsUnitCompact(p){ return unitCommon(p, '', false, 20); }

  function colsBody(people){ var n=people.length; if(n===1) return '<div class="page p1">'+colsUnitHero(people[0])+'</div>'; return '<div class="page p2">'+people.slice(0,2).map(colsUnitCompact).join('')+'</div>'; }
  function buildCols(people, doc){ P=doc||{}; return wrap(COLS_CSS, colsBody(people), 'portrait'); }
  // 縦並びコンパクト単位(支給↓控除・vuで縦積み)→1枚に2人。デザインは1人版と同じ中央(小さく)
  function vstackUnitCompact(p){ return unitCommon(p, 'vu', true, 8); }
  function vstack2Body(people){ return '<div class="page p2 p2v">'+people.slice(0,2).map(vstackUnitCompact).join('')+'</div>'; }

  // ============ ② 縦並び vstack (1人・上部コンパクト) ============
  var VSTACK_CSS = ROOT +
    '.sheet{width:794px;min-height:1123px;margin:0 auto;background:var(--paper);padding:72px 52px 30px;display:flex;flex-direction:column;}' +
    '.issuer{display:flex;justify-content:space-between;align-items:flex-start;}.iss-date{font-size:10.5px;color:var(--ink2);text-align:right;line-height:1.6;}' +
    '.tophd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;}.tophd .mh{text-align:left;}.mh-title{font-size:13px;letter-spacing:.34em;font-weight:500;}.mh-month{font-size:9.5px;letter-spacing:.20em;margin-top:4px;font-weight:500;color:var(--ink2);}.mh-rule{height:.6px;background:var(--hair2);margin-top:8px;margin-bottom:0;}' +
    '.hero{margin-top:9px;}.hero2{display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:12px;}.hero2 .hg-l{text-align:left;}.hero2 .hg-r{text-align:center;}' +
    '.h-co{font-size:11px;color:var(--ink2);margin-bottom:5px;letter-spacing:.12em;}.h-nm{font-size:14px;letter-spacing:.1em;}.h-nm .dono{font-size:11.5px;color:var(--ink2);margin-left:.4em;}' +
    '.h-lab{font-size:11px;letter-spacing:.30em;color:var(--accent);}.h-val{display:inline-flex;align-items:baseline;gap:6px;font-size:36px;margin-top:3px;line-height:1.04;font-variant-numeric:tabular-nums;}.h-val .yen{font-size:18px;color:var(--accent);}' +
    '.sec-title{font-size:11px;letter-spacing:.40em;color:var(--accent);padding-left:.40em;margin-bottom:2px;}' +
    '.kin{display:flex;flex-direction:column;border-top:1px solid var(--accent-soft);border-bottom:1px solid var(--accent-soft);margin:8px 0 9px;padding:6px 0;}.kin .kg{display:grid;justify-content:center;column-gap:0;}.kin .k{text-align:center;padding:0 6px;}.kin .kl{font-size:9px;color:var(--ink2);}.kin .kv{font-size:11.5px;margin-top:3px;font-variant-numeric:tabular-nums;}.kin .krow.kb{border-bottom:.7px solid var(--hair-lt);padding-bottom:6px;}.kin .krow.kb + .krow{padding-top:6px;}' +
    '.pd{display:flex;flex-direction:column;gap:14px;}.pd .col{display:flex;flex-direction:column;}.pd .sec-title{padding-bottom:7px;border-bottom:.7px solid var(--hair2);margin-bottom:2px;}' +
    '.items2{display:grid;grid-template-columns:1fr 1fr;column-gap:0;}.items2 .ln:nth-child(odd){padding-right:23px;}.items2 .ln:nth-child(even){padding-left:23px;}' +
    '.ln{display:flex;justify-content:space-between;align-items:baseline;padding:5.5px 2px;border-bottom:.7px solid var(--hair-lt);}.ln .lab{font-size:12px;color:var(--ink2);}.ln .lab .hz{font-size:8.5px;color:var(--ink3);margin-left:4px;font-family:"Yu Gothic","Hiragino Sans",sans-serif;}.ln .amt{font-size:13px;font-variant-numeric:tabular-nums;}' +
    '.items2 .ln.e{height:33px;box-sizing:border-box;}.items2 .ln:nth-last-child(-n+2){border-bottom:none;}' +
    '.ln.sum{border-bottom:none;border-top:1px solid var(--accent-soft);margin-top:0;padding-top:9px;column-gap:46px;}.ln.sum .lab{color:var(--ink);letter-spacing:.18em;font-size:12.5px;}.ln.sum .amt{font-size:15px;}' +
    '@page{size:A4 portrait;margin:0;}@media print{body{background:#fff;}.sheet{box-shadow:none;}}';

  function lnHTML(items, minCells){ var h=items.map(function(it){ var hz=it.hikazei?'<span class="hz">非課税</span>':''; return '<div class="ln"><span class="lab">'+esc(it.label)+hz+'</span><span class="amt">'+fmt(it.value)+'</span></div>'; }).join(''); for(var n=items.length; (n%2===1)||(n<(minCells||0)); n++) h+='<div class="ln e"></div>'; return h; }
  function kinHTMLv(kintai){ return kinBuild(kintai, kinCols(kintai.length,12), 56); }

  function vstackBody(p){
    return '<div class="sheet">' +
      topHead(p) +
      heroHTML(p) +
      kinSection('<div class="sec-title" style="margin-top:6px">勤 怠</div>'+kinHTMLv(p.kintai)) +
      '<div class="pd">' +
        '<div class="col"><div class="sec-title">支 給</div><div class="items2">'+lnHTML(p.shikyu,14)+'</div>'+sumLine('ln','支給合計',p.shikyuTotal!=null?p.shikyuTotal:sum(p.shikyu))+'</div>' +
        '<div class="col"><div class="sec-title">控 除</div><div class="items2">'+lnHTML(p.kojo,10)+'</div>'+sumLine('ln','控除合計',p.kojoTotal!=null?p.kojoTotal:sum(p.kojo))+'</div>' +
      '</div></div>';
  }
  function buildVstack1(people, doc){ P=doc||{}; return wrap(VSTACK_CSS, vstackBody(people[0]), 'portrait'); }

  // ============ ③ 横ストリップ strips (2-4人) ============
  var STRIPS_CSS = ROOT +
    '.page{width:1123px;height:794px;margin:0 auto;background:var(--paper);box-shadow:0 10px 36px rgba(0,0,0,.26);padding:24px 0;display:flex;}.page.one{justify-content:center;}' +
    '.strip{flex:1;padding:0 22px;border-left:1px dashed var(--hair2);display:flex;flex-direction:column;}.strip:first-child{border-left:none;}.one .strip{flex:0 0 460px;}' +
    // 表題=左 / 支給日=右(同じ行)+全幅細線 ※1人/2人版と同じ並び
    '.tophd{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}.tophd .mh{text-align:left;}.mh-title{font-size:10px;letter-spacing:.08em;font-weight:500;}.mh-month{font-size:7.5px;letter-spacing:.1em;margin-top:1px;font-weight:500;color:var(--ink2);}.iss-date{font-size:7.5px;color:var(--ink2);text-align:right;line-height:1.5;}.mh-rule{height:.6px;background:var(--hair2);margin:3px 0 5px;}' +
    // 会社名+氏名=左 / 差引支給額¥=中央
    '.hero2{display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:6px;}.hero2 .hg-l{text-align:left;}.hero2 .hg-r{text-align:center;}.h-co{font-size:8px;color:var(--ink2);letter-spacing:.06em;}.h-nm{font-size:10px;letter-spacing:.04em;}.h-nm .dono{font-size:7.5px;color:var(--ink3);margin-left:.2em;}.h-lab{font-size:7.5px;letter-spacing:.2em;color:var(--accent);}.h-val{display:inline-flex;align-items:baseline;gap:3px;font-size:17px;line-height:1.1;font-variant-numeric:tabular-nums;}.h-val .yen{font-size:9px;color:var(--accent);}' +
    // 勤怠
    '.sec-title{font-size:8px;letter-spacing:.2em;color:var(--accent);margin:6px 0 1px;}' +
    '.kin{display:flex;flex-direction:column;border-top:1px solid var(--accent-soft);border-bottom:1px solid var(--accent-soft);margin:1px 0 5px;padding:3px 0;}.kin .kg{display:grid;justify-content:center;column-gap:0;}.kin .k{text-align:center;padding:0 4px;}.kin .kl{font-size:7px;color:var(--ink2);}.kin .kv{font-size:9px;margin-top:0;font-variant-numeric:tabular-nums;}.kin .krow.kb{border-bottom:.6px solid var(--hair-lt);padding-bottom:3px;}.kin .krow.kb + .krow{padding-top:3px;}' +
    // 支給/控除(縦に積む=1カラム)・項目+空行罫線・薄線・緑線合計
    '.pd{display:flex;flex-direction:column;gap:3px;}.pd .col{display:flex;flex-direction:column;}.pd.two{flex-direction:row;gap:14px;}.pd.two .col{flex:1;min-width:0;}.st{font-size:8px;letter-spacing:.2em;color:var(--accent);padding-bottom:3px;border-bottom:.7px solid var(--hair2);margin-bottom:1px;}' +
    '.items1 .r:last-child{border-bottom:none;}.items1 .r.e{height:16px;box-sizing:border-box;}' +
    '.r{display:flex;justify-content:space-between;align-items:baseline;padding:3px 1px;border-bottom:.6px solid var(--hair-lt);}.r .l{font-size:8.5px;color:var(--ink2);}.r .l .hz{font-size:6px;color:var(--ink3);margin-left:2px;font-family:"Yu Gothic","Hiragino Sans",sans-serif;}.r .v{font-size:9px;font-variant-numeric:tabular-nums;}' +
    '.items2{display:grid;grid-template-columns:1fr 1fr;column-gap:0;}.items2 .r:nth-child(odd){padding-right:8px;}.items2 .r:nth-child(even){padding-left:8px;}.items2 .r.e{height:16px;box-sizing:border-box;}.items2 .r:nth-last-child(-n+2){border-bottom:none;}' +
    '.r.sum{border-bottom:none;border-top:1px solid var(--accent-soft);margin-top:4px;padding-top:5px;column-gap:18px;}.r.sum .l{color:var(--ink);letter-spacing:.08em;}.r.sum .v{font-size:9.5px;}.r.sum .sgrp .l{letter-spacing:.06em;}' +
    // 2カラム(支給|控除 横並び)は列を等高にし、合計を下端へ固定=支給合計と控除合計を必ず同じ高さに揃える
    '.pd.two{align-items:stretch;}.pd.two .col .r.sum{margin-top:auto;}' +
    '@page{size:A4 landscape;margin:0;}@media print{body{background:#fff;}.page{box-shadow:none;}}';

  function srowsHTML(items, minCells){ var h=items.map(function(it){ var hz=it.hikazei?'<span class="hz">非課税</span>':''; return '<div class="r"><span class="l">'+esc(it.label)+hz+'</span><span class="v">'+fmt(it.value)+'</span></div>'; }).join(''); for(var n=items.length; (n%2===1)||(n<(minCells||0)); n++) h+='<div class="r e"></div>'; return h; }
  // 横ストリップの勤怠(1人/2人版と同じルール=固定幅56px・中央寄せ・最大5列/行=内幅330÷56・2行は全幅薄線)
  function skin(kintai){ return kinBuild(kintai, kinCols(kintai.length,5), 56); }
  // 横ストリップ用の単列項目(2カラム=支給|控除を横並びにする時・幅が狭いので各セクション1列)
  function srows1(items, minCells){ var h=items.map(function(it){ var hz=it.hikazei?'<span class="hz">非課税</span>':''; return '<div class="r"><span class="l">'+esc(it.label)+hz+'</span><span class="v">'+fmt(it.value)+'</span></div>'; }).join(''); for(var n=items.length; n<(minCells||0); n++) h+='<div class="r e"></div>'; return '<div class="items1">'+h+'</div>'; }
  // 1人/2人版と同じ並び・形(表題左/支給日右・会社名+氏名左・差引¥中央)。two=true:2カラム(支給|控除 横並び・ラベル左) / false:1カラム(支給↓控除・緑線)。幅だけ狭い
  function strip(p, two){
    var sh=p.shikyuTotal!=null?p.shikyuTotal:sum(p.shikyu), ko=p.kojoTotal!=null?p.kojoTotal:sum(p.kojo);
    var pd = two ?
      '<div class="pd two">' +
        '<div class="col"><div class="st">支 給</div>'+srows1(p.shikyu,20)+sumLine('r','支給合計',sh,false)+'</div>' +
        '<div class="col"><div class="st">控 除</div>'+srows1(p.kojo,20)+sumLine('r','控除合計',ko,false)+'</div>' +
      '</div>'
      :
      '<div class="pd">' +
        '<div class="col"><div class="st">支 給</div><div class="items2">'+srowsHTML(p.shikyu,16)+'</div>'+sumLine('r','支給合計',sh,true)+'</div>' +
        '<div class="col"><div class="st">控 除</div><div class="items2">'+srowsHTML(p.kojo,16)+'</div>'+sumLine('r','控除合計',ko,true)+'</div>' +
      '</div>';
    return '<div class="strip">' + topHead(p) + heroHTML(p) + kinSection('<div class="sec-title">勤 怠</div>'+skin(p.kintai)) + pd + '</div>';
  }
  function stripsBody(people, two){ return '<div class="page'+(people.length===1?' one':'')+'">'+people.map(function(p){ return strip(p, two); }).join('')+'</div>'; }
  function buildStrips(people, doc){ P=doc||{}; return wrap(STRIPS_CSS, stripsBody(people, false), 'landscape'); }

  function wrap(css, body, orientation){
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>'+css+'</style></head><body data-orientation="'+orientation+'">'+body+'</body></html>';
  }

  // テンプレは手動選択(prefer)。旧・人数/項目数からの自動選択は廃止(手動選択に移行)。
  // 収まり容量(実測): col2_X=支給/控除 各≤20段(1人)/各≤10段(2人) / col1_X=支給段+控除段 合計≤17〜18段。段=2項目で1段。

  // 白へ寄せて薄く(amt 0..1)。文字の濃淡・罫線の濃淡を1色から作る(色相は変えない=「文字は文字/線は線」を別々に指定)
  function lighten(hex, amt){
    var c=String(hex||'').replace('#',''); if(c.length===3)c=c[0]+c[0]+c[1]+c[1]+c[2]+c[2]; if(c.length!==6)return hex;
    var r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);
    r=Math.round(r+(255-r)*amt); g=Math.round(g+(255-g)*amt); b=Math.round(b+(255-b)*amt);
    return '#'+[r,g,b].map(function(x){return ('0'+x.toString(16)).slice(-2);}).join('');
  }
  // theme = { accent:アクセント色, line:罫線色, ink:文字色 } をそれぞれ独立に適用(濃さは内部で派生)
  function rootFor(theme){
    theme=theme||{}; var accent=theme.accent||'#6f5a3e', line=theme.line||'#cfc9b8', ink=theme.ink||'#23261f';
    return ':root{--ink:'+ink+';--ink2:'+lighten(ink,.34)+';--ink3:'+lighten(ink,.48)+';--hair:'+lighten(line,.30)+';--hair-lt:'+lighten(line,.58)+';--hair2:'+line+';--accent:'+accent+';--accent-soft:'+line+';--paper:#ffffff;}';
  }
  var Render = {
    // テンプレ(prefer)で固定。全員を1枚ずつ/2人ずつ/横3人ずつに自動ページ分割(誰も欠けない)
    // prefer名は実体準拠: col2_X=2カラム(支給|控除 横並び)/col1_X=1カラム(支給↓控除 縦積み)・X=1人/2人/3人。
    //   col2_1=A4縦1人(hero) col2_2=A4縦2人 col2_3=A4横3人 / col1_1=A4縦1人 col1_2=A4縦2人 col1_3=A4横3人
    build: function(people, doc, prefer, theme){
      P=doc||{}; people=people||[]; prefer=(prefer&&prefer!=='auto')?prefer:'col2_1';
      var css, orient, per, mk;
      if(prefer==='col1_1'){ css=VSTACK_CSS; orient='portrait'; per=1; mk=function(ch){ return vstackBody(ch[0]); }; }      // 1カラム1人
      else if(prefer==='col1_2'){ css=COLS_CSS; orient='portrait'; per=2; mk=function(ch){ return vstack2Body(ch); }; }      // 1カラム2人
      else if(prefer==='col1_3'){ css=STRIPS_CSS; orient='landscape'; per=3; mk=function(ch){ return stripsBody(ch, false); }; } // 1カラム3人(支給↓控除)
      else if(prefer==='col2_3'){ css=STRIPS_CSS; orient='landscape'; per=3; mk=function(ch){ return stripsBody(ch, true); }; }  // 2カラム3人(支給|控除)
      else if(prefer==='col2_2'){ css=COLS_CSS; orient='portrait'; per=2; mk=function(ch){ return colsBody(ch); }; }          // 2カラム2人
      else { prefer='col2_1'; css=COLS_CSS; orient='portrait'; per=1; mk=function(ch){ return colsBody(ch); }; }              // 2カラム1人(hero)
      var pages=[]; for(var i=0;i<people.length;i+=per) pages.push(people.slice(i,i+per)); if(!pages.length) pages=[[{name:'',company:'',kintai:[],shikyu:[],kojo:[],net:0}]];
      var body=pages.map(function(ch){ P=doc||{}; return mk(ch); }).join('<div class="pgbreak"></div>');
      var html=wrap(css, body, orient).replace(/:root\{[^}]*\}/, rootFor(theme));
      return { html: html, builder: prefer, fits: true, orientation: orient, pages: pages.length };
    },
    lighten: lighten, rootFor: rootFor,
    buildCols: buildCols, buildVstack1: buildVstack1, buildStrips: buildStrips
  };
  global.Render = Render;
})(window);
