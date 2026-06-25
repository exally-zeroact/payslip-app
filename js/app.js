/* app.js — 給与明細アプリ（ミント4タブ） */
(function(){
  'use strict';
  var $=function(s,r){return (r||document).querySelector(s);};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
  var num=function(v){var n=Number(String(v==null?0:v).replace(/[, ]/g,''));return isNaN(n)?0:n;};
  var yen=function(n){return '¥'+Math.round(n).toLocaleString('ja-JP');};
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  var attr=function(s){return String(s==null?'':s).replace(/"/g,'&quot;');};
  var uid=function(){return 'e'+Math.abs(Date.now()%1e7).toString(36)+Math.floor(performance.now()).toString(36);};

  var THEMES=[{accent:'#6f5a3e',soft:'#b6a06d',name:'焦茶ゴールド'},{accent:'#3D9E72',soft:'#9ad9bb',name:'ミント'},{accent:'#2f4858',soft:'#9bb2c2',name:'ネイビー'},{accent:'#7a3b3b',soft:'#caa0a0',name:'えんじ'},{accent:'#3a3a3a',soft:'#aaaaaa',name:'モノクロ'}];

  function defEmp(name){
    return { id:uid(), name:name||'山田 太郎', birthYmd:'1980-05-15', fuyou:1, residentTax:12500,
      kintai:[{label:'出勤日数',value:'21'},{label:'欠勤日数',value:'0'},{label:'有給取得',value:'1'},{label:'労働時間',value:'168:00'},{label:'残業時間',value:'10:00'},{label:'深夜時間',value:'0:00'}],
      shikyu:[{label:'基本給',value:'250000'},{label:'残業手当',value:'19531'},{label:'住宅手当',value:'10000'},{label:'通勤手当',value:'8400',hikazei:true},{label:'皆勤手当',value:'5000'}],
      extraKojo:[] };
  }
  var state={ company:{name:'株式会社 ゼロアクト',addr:'',close:'末日',payday:'翌25日'},
    month:'2026-06', prefer:'auto', theme:THEMES[0], employees:[defEmp('山田 太郎')], open:{} };

  function compute(emp){
    return PayslipCalc.computePayslip({ shikyu:emp.shikyu, birthYmd:emp.birthYmd, payYm:state.month, fuyou:num(emp.fuyou), residentTax:num(emp.residentTax), extraKojo:emp.extraKojo });
  }
  function payDateStr(){ return '令和'+(Number((state.month||'2026-06').slice(0,4))-2018)+'年'+Number((state.month||'2026-06').slice(5,7))+'月 '+(state.company.payday||''); }
  function monthLabel(){ var y=Number((state.month||'2026-06').slice(0,4)), m=Number((state.month||'2026-06').slice(5,7)); var k=['','一','二','三','四','五','六','七','八','九','十','十一','十二']; return '令 和 '+(y-2018)+' 年 '+k[m]+' 月 分'; }

  /* ---------- ナビ ---------- */
  function showScreen(id){
    $$('.screen').forEach(function(s){ s.classList.toggle('active', s.id===id); });
    $$('.bn').forEach(function(b){ b.classList.toggle('on', b.dataset.scr===id); });
    if(id==='scr-input'){ $('#in-month').textContent=monthLabel(); renderInput(); }
    if(id==='scr-list') renderListView();
    if(id==='scr-print') renderPrint();
  }

  /* ---------- 設定 ---------- */
  function renderSettings(){
    $('#c-name').value=state.company.name; $('#c-addr').value=state.company.addr;
    $('#c-close').value=state.company.close; $('#c-payday').value=state.company.payday;
    var host=$('#emp-master'); host.innerHTML=state.employees.map(function(e,i){
      return '<div class="acc-h" data-mi="'+i+'" style="border-bottom:1px solid #EEF6F1">'
        +'<input class="finput m-name" data-i="'+i+'" value="'+attr(e.name)+'" placeholder="氏名" style="flex:1.4">'
        +'<input class="finput m-birth" data-i="'+i+'" value="'+attr(e.birthYmd)+'" placeholder="生年月日" style="flex:1">'
        +'<input class="finput m-fuyou" data-i="'+i+'" value="'+attr(e.fuyou)+'" placeholder="扶養" style="width:60px">'
        +'<input class="finput m-res" data-i="'+i+'" value="'+attr(e.residentTax)+'" placeholder="住民税" style="width:90px">'
        +'<button class="mini del m-del" data-i="'+i+'">×</button></div>';
    }).join('');
  }

  /* ---------- 入力（自動計算） ---------- */
  function rowsHTML(g,arr){
    return arr.map(function(it,ri){
      var hz=g==='shikyu'?'<label class="hz"><input type="checkbox" class="ck" data-g="'+g+'" data-ri="'+ri+'" '+(it.hikazei?'checked':'')+'>非課税</label>':'';
      return '<div class="row"><input class="lbl" data-g="'+g+'" data-ri="'+ri+'" data-f="label" value="'+attr(it.label)+'" placeholder="項目"><input class="val" data-g="'+g+'" data-ri="'+ri+'" data-f="value" value="'+attr(it.value)+'" placeholder="'+(g==='kintai'?'値':'金額')+'">'+hz+'<button class="b-del" data-g="'+g+'" data-ri="'+ri+'">×</button></div>';
    }).join('');
  }
  function calcBoxHTML(emp){
    var r=compute(emp);
    var lines=r.kojo.map(function(k){return '<div class="calc-line"><span>'+esc(k.label)+'</span><span class="v">'+yen(k.value)+'</span></div>';}).join('');
    return '<div class="calc-box"><div class="ch">自動計算（法定控除＋差引）標準報酬 '+yen(r.hyojun)+'</div>'
      +'<div class="calc-line"><span>支給合計</span><span class="v">'+yen(r.shikyuTotal)+'</span></div>'
      +lines
      +'<div class="calc-line tot"><span>控除合計</span><span class="v">'+yen(r.kojoTotal)+'</span></div>'
      +'<div class="calc-line net tot"><span>差引支給額</span><span class="v">'+yen(r.net)+'</span></div></div>';
  }
  function renderInput(){
    var host=$('#input-list');
    host.innerHTML=state.employees.map(function(e,i){
      var r=compute(e), open=state.open[e.id];
      return '<div class="acc'+(open?' open':'')+'" data-i="'+i+'">'
        +'<div class="acc-h" data-toggle="'+i+'"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(r.net)+'</span><span class="acc-cv">▾</span></div>'
        +'<div class="acc-body">'
          +'<div class="grp"><div class="grp-h">勤怠<button class="mini add" data-add="kintai" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('kintai',e.kintai)+'</div></div>'
          +'<div class="grp"><div class="grp-h">支給<button class="mini add" data-add="shikyu" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('shikyu',e.shikyu)+'</div></div>'
          +'<div class="grp"><div class="grp-h">法定外控除（社宅費・組合費等）<button class="mini add" data-add="extraKojo" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('extraKojo',e.extraKojo)+'</div></div>'
          +'<div class="calc-wrap">'+calcBoxHTML(e)+'</div>'
        +'</div></div>';
    }).join('');
  }
  function refreshCard(i){
    var e=state.employees[i]; var card=$('.acc[data-i="'+i+'"]'); if(!card) return;
    var r=compute(e);
    card.querySelector('.acc-net').textContent=yen(r.net);
    var cw=card.querySelector('.calc-wrap'); if(cw) cw.innerHTML=calcBoxHTML(e);
  }

  /* ---------- 一覧 / 集計 ---------- */
  function renderListView(){
    var host=$('#view-list');
    host.innerHTML=state.employees.map(function(e){
      var r=compute(e), open=state.open['L'+e.id];
      var pay=r.shikyu.map(function(s){return '<div class="dl"><span>'+esc(s.label)+'</span><span class="v">'+yen(s.value)+'</span></div>';}).join('');
      var ded=r.kojo.map(function(k){return '<div class="dl"><span>'+esc(k.label)+'</span><span class="v">'+yen(k.value)+'</span></div>';}).join('');
      return '<div class="acc'+(open?' open':'')+'" data-lid="'+e.id+'">'
        +'<div class="acc-h" data-ltoggle="'+e.id+'"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(r.net)+'</span><span class="acc-cv">▾</span></div>'
        +'<div class="acc-body"><div class="det det-2"><div><div class="ch" style="font-size:11px;font-weight:700;color:#2E7D54;margin:4px 0">支給</div>'+pay+'</div><div><div class="ch" style="font-size:11px;font-weight:700;color:#2E7D54;margin:4px 0">控除</div>'+ded+'</div></div>'
        +'<div class="dl" style="margin-top:8px;font-weight:700;border-bottom:none"><span>差引支給額</span><span class="v" style="color:#2E7D54">'+yen(r.net)+'</span></div></div></div>';
    }).join('');
  }
  function renderSumView(){
    var rows=state.employees.map(function(e){var r=compute(e);return {name:e.name,s:r.shikyuTotal,k:r.kojoTotal,n:r.net};});
    var tot=rows.reduce(function(a,x){return {s:a.s+x.s,k:a.k+x.k,n:a.n+x.n};},{s:0,k:0,n:0});
    var body=rows.map(function(x){return '<tr><td>'+esc(x.name)+'</td><td class="num">'+yen(x.s)+'</td><td class="num">'+yen(x.k)+'</td><td class="num">'+yen(x.n)+'</td></tr>';}).join('');
    $('#view-sum').innerHTML='<div class="card"><div class="card-h">月次集計（'+monthLabel().replace(/ /g,'')+'）</div>'
      +'<table class="sumtab"><thead><tr><th>従業員</th><th>支給合計</th><th>控除合計</th><th>差引支給</th></tr></thead>'
      +'<tbody>'+body+'<tr class="total"><td>全員合計（'+rows.length+'名）</td><td class="num">'+yen(tot.s)+'</td><td class="num">'+yen(tot.k)+'</td><td class="num">'+yen(tot.n)+'</td></tr></tbody></table>'
      +'<p class="hint">年次集計・賃金台帳・社保一覧・源泉徴収簿は月次データ蓄積（DB保存）後に自動生成します（STEP6）。</p></div>';
  }

  /* ---------- 印刷 / PDF ---------- */
  function buildPeople(emps){
    return emps.map(function(e){ var r=compute(e); return { name:e.name, company:state.company.name, payDate:payDateStr(),
      kintai:e.kintai, shikyu:r.shikyu, kojo:r.kojo, net:r.net, shikyuTotal:r.shikyuTotal, kojoTotal:r.kojoTotal }; });
  }
  function renderPrint(){
    $('#p-month').value=state.month;
    var sel=$('#p-emp'); sel.innerHTML='<option value="__all">全員（自動レイアウト）</option>'+state.employees.map(function(e,i){return '<option value="'+i+'">'+esc(e.name)+'</option>';}).join('');
    $('#theme-row').innerHTML=THEMES.map(function(t,i){return '<span class="sw'+(state.theme.accent===t.accent?' on':'')+'" data-ti="'+i+'" title="'+t.name+'" style="background:'+t.accent+'"></span>';}).join('');
    doPreview();
  }
  function doPreview(){
    var v=$('#p-emp').value;
    var emps = v==='__all' ? state.employees : [state.employees[+v]];
    var out=Render.build(buildPeople(emps), {month:monthLabel()}, state.prefer, state.theme);
    var f=$('#frame');
    f.srcdoc=out.html;
    var pw=out.orientation==='landscape'?1123:794, ph=out.orientation==='landscape'?794:1123;
    var wrap=$('.preview-wrap'); var s=Math.min(1,(wrap.clientWidth-32)/pw);
    f.style.width=pw+'px'; f.style.height=ph+'px'; f.style.transform='scale('+s+')'; f.style.transformOrigin='top left';
    f.style.marginRight=(-(pw*(1-s)))+'px'; f.style.marginBottom=(-(ph*(1-s)))+'px';
  }

  /* ---------- events ---------- */
  function bind(){
    $$('.bn').forEach(function(b){ b.addEventListener('click',function(){ showScreen(b.dataset.scr); }); });
    $('#g-month').addEventListener('change',function(){ state.month=this.value||state.month; if($('#scr-input').classList.contains('active')){$('#in-month').textContent=monthLabel();renderInput();} });

    // 設定
    ['name','addr','close','payday'].forEach(function(k){ var el=$('#c-'+k); if(el) el.addEventListener('input',function(){ state.company[k]=this.value; }); });
    $('#b-add-emp').addEventListener('click',function(){ state.employees.push(defEmp('従業員 '+(state.employees.length+1))); renderSettings(); });
    $('#emp-master').addEventListener('input',function(e){ var i=+e.target.dataset.i; if(isNaN(i))return; var emp=state.employees[i]; if(!emp)return;
      if(e.target.classList.contains('m-name'))emp.name=e.target.value;
      else if(e.target.classList.contains('m-birth'))emp.birthYmd=e.target.value;
      else if(e.target.classList.contains('m-fuyou'))emp.fuyou=e.target.value;
      else if(e.target.classList.contains('m-res'))emp.residentTax=e.target.value;
    });
    $('#emp-master').addEventListener('click',function(e){ if(e.target.classList.contains('m-del')){ var i=+e.target.dataset.i; if(state.employees.length<=1){alert('最低1名必要です');return;} state.employees.splice(i,1); renderSettings(); } });

    // 入力 accordion
    var il=$('#input-list');
    il.addEventListener('click',function(e){
      var tg=e.target.closest('[data-toggle]');
      if(tg){ var i=+tg.dataset.toggle; var emp=state.employees[i]; state.open[emp.id]=!state.open[emp.id]; il.querySelector('.acc[data-i="'+i+'"]').classList.toggle('open'); return; }
      if(e.target.dataset.add){ var ai=+e.target.dataset.i, g=e.target.dataset.add; state.employees[ai][g].push({label:'',value:''}); renderInput(); return; }
      if(e.target.classList.contains('b-del')){ var card=e.target.closest('.acc'); var ci=+card.dataset.i; var g=e.target.dataset.g, ri=+e.target.dataset.ri; state.employees[ci][g].splice(ri,1); renderInput(); return; }
    });
    il.addEventListener('input',function(e){
      var card=e.target.closest('.acc'); if(!card)return; var ci=+card.dataset.i; var emp=state.employees[ci]; if(!emp)return;
      var g=e.target.dataset.g, ri=+e.target.dataset.ri, f=e.target.dataset.f;
      if(e.target.classList.contains('ck')){ emp[g][ri].hikazei=e.target.checked; refreshCard(ci); return; }
      if(g&&!isNaN(ri)&&f){ emp[g][ri][f]=e.target.value; refreshCard(ci); }
    });

    // 一覧/集計
    $$('.seg-b').forEach(function(b){ b.addEventListener('click',function(){ $$('.seg-b').forEach(function(x){x.classList.toggle('on',x===b);}); var v=b.dataset.view; $('#view-list').style.display=v==='list'?'':'none'; $('#view-sum').style.display=v==='sum'?'':'none'; if(v==='sum')renderSumView(); else renderListView(); }); });
    $('#view-list').addEventListener('click',function(e){ var tg=e.target.closest('[data-ltoggle]'); if(!tg)return; var id=tg.dataset.ltoggle; state.open['L'+id]=!state.open['L'+id]; $('#view-list .acc[data-lid="'+id+'"]').classList.toggle('open'); });

    // 印刷
    $('#p-emp').addEventListener('change',doPreview);
    $('#p-month').addEventListener('change',function(){ state.month=this.value||state.month; doPreview(); });
    $('#theme-row').addEventListener('click',function(e){ if(!e.target.classList.contains('sw'))return; state.theme=THEMES[+e.target.dataset.ti]; renderPrint(); });
    $('#b-print').addEventListener('click',function(){ var f=$('#frame'); try{f.contentWindow.focus();f.contentWindow.print();}catch(err){window.print();} });
    $('#b-pdf').addEventListener('click',function(){ alert('PDF保存/送付はSTEP5でpdf-lib配線します（今は印刷からPDF保存可）'); });
    window.addEventListener('resize',function(){ if($('#scr-print').classList.contains('active'))doPreview(); });
  }

  /* init */
  $('#g-month').value=state.month;
  renderSettings(); bind(); showScreen('scr-settings');
})();
