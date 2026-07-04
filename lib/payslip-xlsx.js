/* payslip-xlsx.js — 給与明細のExcel出力(崩れないレイアウト)
 * 純関数 shukeiAOA/meishiAOA で「セルの2次元配列(AOA)+列幅+結合」を作り(テスト可能)、
 * download() はブラウザの SheetJS(window.XLSX) で .xlsx を書き出す。
 * people = buildPeople() 形 [{name,company,payDate,kintai:[{label,value}],shikyu:[{label,value,hikazei}],kojo:[{label,value}],net,shikyuTotal,kojoTotal}]
 * 【利用】ブラウザ window.PayslipXlsx / Node require('./payslip-xlsx.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.PayslipXlsx = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v){ var n=Number(String(v==null?0:v).replace(/[, ]/g,'')); return isNaN(n)?0:n; }

  // 集計シート: 氏名・支給合計・控除合計・差引支給額 + 合計行
  function shukeiAOA(people, opts){
    opts=opts||{}; var aoa=[];
    aoa.push([(opts.company||'')+' 給与集計', '', '', '', '']);
    aoa.push([opts.monthLabel||'', '', '', '', '']);
    aoa.push(['氏名','支給合計','控除合計','差引支給額','要確認']);
    var ts=0,tk=0,tn=0;
    people.forEach(function(p){ var s=p.shikyuTotal!=null?num(p.shikyuTotal):0, k=p.kojoTotal!=null?num(p.kojoTotal):0, n=num(p.net);
      var warn=(p.warnings&&p.warnings.length)?('⚠ '+p.warnings.join(' / ')):'';
      ts+=s; tk+=k; tn+=n; aoa.push([p.name||'', s, k, n, warn]); });
    aoa.push(['合計', ts, tk, tn, '']);
    return { aoa: aoa, cols: [{wch:18},{wch:14},{wch:14},{wch:14},{wch:44}],
      merges: [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}}] };
  }

  // 明細シート(従業員1名): 会社/表題/氏名・支給日/勤怠/支給・控除(2列)/合計/差引
  function meishiAOA(p, opts){
    opts=opts||{}; p=p||{}; var aoa=[], merges=[]; var W=4;
    function full(r){ merges.push({s:{r:r,c:0},e:{r:r,c:W-1}}); }
    aoa.push([p.company||'', '', '', '']); full(aoa.length-1);
    aoa.push(['給与支給明細書　'+(opts.monthLabel||''), '', '', '']); full(aoa.length-1);
    aoa.push(['氏名', p.name||'', '支給日', p.payDate||'']);
    aoa.push(['','','','']);
    aoa.push(['【勤怠】','','','']); full(aoa.length-1);
    (p.kintai||[]).forEach(function(k){ aoa.push([k.label||'', k.value!=null?k.value:'', '', '']); });
    aoa.push(['','','','']);
    aoa.push(['【支給】','','【控除】','']);
    var sh=p.shikyu||[], ko=p.kojo||[], rows=Math.max(sh.length, ko.length);
    for(var i=0;i<rows;i++){
      var s=sh[i], k=ko[i];
      aoa.push([ s?(s.label||'')+(s&&s.hikazei?'(非課税)':''):'', s?num(s.value):'', k?(k.label||''):'', k?num(k.value):'' ]);
    }
    aoa.push(['支給合計', p.shikyuTotal!=null?num(p.shikyuTotal):'', '控除合計', p.kojoTotal!=null?num(p.kojoTotal):'']);
    aoa.push(['差引支給額', num(p.net), '', '']);
    return { aoa: aoa, cols:[{wch:18},{wch:14},{wch:18},{wch:14}], merges: merges };
  }

  // Excelで使えるシート名に整える(31字以内・禁止文字除去・重複回避)
  function sheetName(name, used){
    var s=String(name||'明細').replace(/[\\\/\?\*\[\]:]/g,' ').slice(0,28).trim()||'明細';
    var base=s, n=2; used=used||{}; while(used[s]){ s=base.slice(0,28)+'_'+(n++); } used[s]=true; return s;
  }

  function download(people, opts){
    opts=opts||{};
    if(typeof XLSX==='undefined'){ if(typeof alert!=='undefined') alert('Excel機能の読み込みに失敗しました（通信環境をご確認ください）'); return false; }
    var wb=XLSX.utils.book_new(), used={};
    var sk=shukeiAOA(people,opts), ss=XLSX.utils.aoa_to_sheet(sk.aoa); ss['!cols']=sk.cols; ss['!merges']=sk.merges; XLSX.utils.book_append_sheet(wb, ss, '集計');
    people.forEach(function(p){ var m=meishiAOA(p,opts), s=XLSX.utils.aoa_to_sheet(m.aoa); s['!cols']=m.cols; s['!merges']=m.merges; XLSX.utils.book_append_sheet(wb, s, sheetName(p.name, used)); });
    XLSX.writeFile(wb, opts.filename||'給与明細.xlsx');
    return true;
  }

  // ── 帳票(社保一覧・部署別集計・賃金台帳) ──
  // 社保一覧: rows=[{name,hyojun,health,kaigo,pension,employ,sum}]
  function shakaiListAOA(rows, opts){ opts=opts||{}; var aoa=[]; aoa.push([(opts.company||'')+' 社会保険一覧（本人負担）','','','','','','']);
    aoa.push([opts.monthLabel||'','','','','','','']); aoa.push(['氏名','標準報酬','健康保険','介護保険','厚生年金','雇用保険','本人計']);
    var t={health:0,kaigo:0,pension:0,employ:0,sum:0};
    (rows||[]).forEach(function(r){ t.health+=num(r.health);t.kaigo+=num(r.kaigo);t.pension+=num(r.pension);t.employ+=num(r.employ);t.sum+=num(r.sum); aoa.push([r.name||'',num(r.hyojun),num(r.health),num(r.kaigo),num(r.pension),num(r.employ),num(r.sum)]); });
    aoa.push(['合計','',t.health,t.kaigo,t.pension,t.employ,t.sum]);
    return { aoa:aoa, cols:[{wch:16},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12}] }; }
  // 部署別: g={groups:[{dept,rows:[{name,s,k,n}],sub:{s,k,n}}],total:{s,k,n}}
  function deptSummaryAOA(g, opts){ opts=opts||{}; var aoa=[]; aoa.push([(opts.company||'')+' 部署別集計','','','']); aoa.push([opts.monthLabel||'','','','']); aoa.push(['部署 / 従業員','支給合計','控除合計','差引支給']);
    (g&&g.groups||[]).forEach(function(gr){ aoa.push(['【'+gr.dept+'】('+gr.rows.length+'名)','','','']);
      gr.rows.forEach(function(x){ aoa.push(['　'+(x.name||''),num(x.s),num(x.k),num(x.n)]); });
      aoa.push([gr.dept+' 小計',num(gr.sub.s),num(gr.sub.k),num(gr.sub.n)]); });
    var tot=(g&&g.total)||{s:0,k:0,n:0}; aoa.push(['総合計',num(tot.s),num(tot.k),num(tot.n)]);
    return { aoa:aoa, cols:[{wch:22},{wch:14},{wch:14},{wch:14}] }; }
  // 賃金台帳: L=ChinginDaicho.buildLedger結果, CDm=ChinginDaichoモジュール → 従業員別シート配列(確定済み月のみ)
  function chinginDaichoSheets(L, year, CDm, opts){ opts=opts||{}; var sheets=[], used={};
    function fmtMin(min){ min=num(min); return min?(Math.floor(min/60)+':'+('0'+(min%60)).slice(-2)):''; }
    (L||[]).forEach(function(row){ var t=CDm.ledgerTotals(row), lab=CDm.ledgerLabels(row); if(t.savedMonths===0) return;
      var months=[]; for(var m=1;m<=12;m++)months.push(m); var aoa=[];
      aoa.push([(opts.company||'')+' 賃金台帳','','','','','','','','','','','','','']);
      aoa.push([ (row.name||'')+'（'+year+'年）','','','','','','','','','','','','','']);
      aoa.push(['項目'].concat(months.map(function(m){return m+'月';})).concat(['年計']));
      function line(label,getRaw,total,fmt){ fmt=fmt||num; var r=[label]; months.forEach(function(m){ var d=row.monthly[m]; r.push(d?fmt(getRaw(d)):''); }); r.push(fmt(total)); aoa.push(r); }
      line('労働日数',function(d){return (d.work||{}).days;},t.days,function(v){return num(v);});
      line('労働時間',function(d){return (d.work||{}).workMin;},t.workMin,fmtMin);
      line('時間外',function(d){return (d.work||{}).otMin;},t.otMin,fmtMin);
      line('深夜',function(d){return (d.work||{}).nightMin;},t.nightMin,fmtMin);
      line('法定休日',function(d){return (d.work||{}).holidayMin;},t.holidayMin,fmtMin);
      lab.shikyu.forEach(function(l){ line(l,function(d){return CDm.itemVal(d.shikyu,l);},t.shikyu[l],num); });
      line('総支給',function(d){return d.shikyuTotal;},t.shikyuTotal,num);
      lab.kojo.forEach(function(l){ line(l,function(d){return CDm.itemVal(d.kojo,l);},t.kojo[l],num); });
      line('控除計',function(d){return d.kojoTotal;},t.kojoTotal,num);
      line('差引支給',function(d){return d.net;},t.net,num);
      sheets.push({ name:sheetName(row.name,used), aoa:aoa, cols:[{wch:12}].concat(months.map(function(){return {wch:9};})).concat([{wch:11}]) }); });
    return sheets; }
  // 汎用: シート配列(name/aoa/cols/merges)を1ブックに書き出す
  function downloadSheets(sheets, opts){ opts=opts||{};
    if(typeof XLSX==='undefined'){ if(typeof alert!=='undefined') alert('Excel機能の読み込みに失敗しました'); return false; }
    var wb=XLSX.utils.book_new(), used={};
    (sheets||[]).forEach(function(sh){ var s=XLSX.utils.aoa_to_sheet(sh.aoa); if(sh.cols)s['!cols']=sh.cols; if(sh.merges)s['!merges']=sh.merges; XLSX.utils.book_append_sheet(wb, s, sheetName(sh.name||'Sheet', used)); });
    XLSX.writeFile(wb, opts.filename||'帳票.xlsx'); return true; }

  return { shukeiAOA: shukeiAOA, meishiAOA: meishiAOA, sheetName: sheetName, download: download,
    shakaiListAOA: shakaiListAOA, deptSummaryAOA: deptSummaryAOA, chinginDaichoSheets: chinginDaichoSheets, downloadSheets: downloadSheets };
});
