/* app.js — 給与明細アプリ（ミント4タブ / STEP2 従業員マスタ拡張） */
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
  var PAYTYPES=['月給','時給','日給'];
  var HELP={
    fuyou:{ t:'💡 扶養人数とは？（配偶者含む）', b:'所得税の計算に使う「扶養親族等の数」です。次の合計人数を入れます。\n\n● <b>源泉控除対象配偶者</b>：1人と数える\n　＝あなたが扶養している配偶者で、配偶者の年収が約150万円以下が目安。\n● <b>控除対象扶養親族</b>：16歳以上で扶養している家族（子・親など）の人数。\n\n※年齢はその年の<b>12月31日時点</b>で判定。<b>16歳未満は数えません（0人）</b>。\n※共働きで配偶者に十分な収入がある場合、配偶者は0。\n\n例）専業主婦の妻＋高校生1人＋5歳の子 → <b>2</b>（妻1＋高校生1。5歳は16歳未満で0）' }
  };
  function openHelp(k){ var h=HELP[k]; if(!h)return; var t=document.getElementById('help-t'),b=document.getElementById('help-b'); t.textContent=h.t; b.innerHTML=h.b; document.getElementById('help-ov').classList.add('on'); }
  // 支給/控除(法定外) のチップ候補
  var SUP_POOL=['基本給','役職手当','残業手当','深夜手当','休日手当','住宅手当','家族手当','通勤手当','皆勤手当','資格手当','精勤手当','調整手当'];
  var KOJO_POOL=['社宅費','組合費','財形貯蓄','生命保険','親睦会費','旅行積立'];

  function prefOptions(sel){
    var K=(window.SHAKAIHOKEN_HYO&&window.SHAKAIHOKEN_HYO.KENKO_RITSU)||{tokyo:{name:'東京都'}};
    return Object.keys(K).map(function(code){return '<option value="'+code+'"'+(code===sel?' selected':'')+'>'+esc(K[code].name)+'</option>';}).join('');
  }
  function prefRate(code){ var K=(window.SHAKAIHOKEN_HYO&&window.SHAKAIHOKEN_HYO.KENKO_RITSU)||{}; return (K[code]&&K[code].jugyoin)||0.04955; }

  function defEmp(name){
    return { id:uid(), name:name||'山田 太郎', no:'', birthYmd:'1980-05-15', dept:'', role:'',
      payType:'月給', base:'250000', hourly:'1200', fuyou:'1', pref:'tokyo', commute:'8400', residentTax:'12500', bank:'',
      kintai:[{label:'出勤日数',value:'21'},{label:'欠勤日数',value:'0'},{label:'有給取得',value:'1'},{label:'労働時間',value:'168:00'},{label:'残業時間',value:'10:00'},{label:'深夜時間',value:'0:00'}],
      shikyu:[{label:'基本給',value:'250000'},{label:'残業手当',value:'19531'},{label:'住宅手当',value:'10000'}],
      extraKojo:[] };
  }
  var state={ company:{name:'株式会社 ゼロアクト',addr:'',close:'末日',payday:'翌25日'},
    month:'2026-06', prefer:'auto', theme:THEMES[0], depts:['営業部'], roles:['課長','主任','一般'],
    employees:[defEmp('山田 太郎')], open:{} };

  // 通勤手当を shikyu に同期（commute>0なら通勤手当(非課税)行を用意）
  function syncCommute(e){
    var idx=e.shikyu.findIndex(function(x){return /通勤/.test(x.label);});
    var v=num(e.commute);
    if(v>0){ if(idx<0) e.shikyu.push({label:'通勤手当',value:String(v),hikazei:true}); else { e.shikyu[idx].value=String(v); e.shikyu[idx].hikazei=true; } }
    else if(idx>=0) e.shikyu.splice(idx,1);
  }
  function compute(e){
    syncCommute(e);
    return PayslipCalc.computePayslip({ shikyu:e.shikyu, birthYmd:e.birthYmd, payYm:state.month, fuyou:num(e.fuyou), residentTax:num(e.residentTax), healthRate:prefRate(e.pref), extraKojo:e.extraKojo });
  }
  function payDateStr(){ return '令和'+(Number((state.month||'2026-06').slice(0,4))-2018)+'年'+Number((state.month||'2026-06').slice(5,7))+'月 '+(state.company.payday||''); }
  function monthLabel(){ var y=Number((state.month||'2026-06').slice(0,4)), m=Number((state.month||'2026-06').slice(5,7)); var k=['','一','二','三','四','五','六','七','八','九','十','十一','十二']; return '令 和 '+(y-2018)+' 年 '+k[m]+' 月 分'; }

  /* ---------- ナビ ---------- */
  function showScreen(id){
    $$('.screen').forEach(function(s){ s.classList.toggle('active', s.id===id); });
    $$('.bn').forEach(function(b){ b.classList.toggle('on', b.dataset.scr===id); });
    if(id==='scr-settings') renderEmpMaster();
    if(id==='scr-input'){ $('#in-month').textContent=monthLabel(); renderInput(); }
    if(id==='scr-list') renderListView();
    if(id==='scr-print') renderPrint();
  }

  /* ---------- 設定: 会社情報 ---------- */
  function fillCompany(){ $('#c-name').value=state.company.name; $('#c-addr').value=state.company.addr; $('#c-close').value=state.company.close; $('#c-payday').value=state.company.payday; }

  /* ---------- 設定: 従業員マスタ ---------- */
  function deptSelect(e){
    var opts=state.depts.map(function(d){return '<option'+(d===e.dept?' selected':'')+'>'+esc(d)+'</option>';}).join('');
    return '<select class="finput m-f" data-f="dept"><option value=""'+(e.dept?'':' selected')+'>（未分類）</option>'+opts+'<option value="__new">＋新規カテゴリ</option></select>';
  }
  function roleSelect(e){
    var opts=state.roles.map(function(r){return '<option'+(r===e.role?' selected':'')+'>'+esc(r)+'</option>';}).join('');
    return '<select class="finput m-f" data-f="role"><option value=""'+(e.role?'':' selected')+'>（なし）</option>'+opts+'<option value="__new">＋新規</option></select>';
  }
  function chips(e,pool,key){
    var have=e[key].map(function(x){return x.label;});
    var fixed = key==='shikyu' ? ['通勤手当'] : []; // 通勤は通勤手当フィールドで管理
    return pool.map(function(lab){
      if(fixed.indexOf(lab)>=0) return '';
      var on=have.indexOf(lab)>=0;
      return '<span class="chip'+(on?' on':'')+'" data-chip="'+key+'" data-lab="'+attr(lab)+'">'+(on?'✓ ':'')+esc(lab)+'</span>';
    }).join('');
  }
  function empCardBody(e,i){
    return '<div class="mco-body">'
      +'<div class="frow"><div class="flabel">氏名</div><input class="finput m-f" data-f="name" value="'+attr(e.name)+'"></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">従業員番号<span class="hint2">任意</span></div><input class="finput m-f" data-f="no" value="'+attr(e.no)+'"></div>'
        +'<div class="frow"><div class="flabel">生年月日</div><input class="finput m-f" data-f="birthYmd" type="date" value="'+attr(e.birthYmd)+'"></div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">部署</div>'+deptSelect(e)+'</div>'
        +'<div class="frow"><div class="flabel">役職</div>'+roleSelect(e)+'</div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">給与形態</div><select class="finput m-f" data-f="payType">'+PAYTYPES.map(function(p){return '<option'+(p===e.payType?' selected':'')+'>'+p+'</option>';}).join('')+'</select></div>'
        +'<div class="frow"><div class="flabel">'+(e.payType==='時給'?'時給単価':e.payType==='日給'?'日給額':'基本給')+'<span class="hint2">円</span></div><input class="finput num m-f" data-f="'+(e.payType==='時給'?'hourly':'base')+'" value="'+attr(e.payType==='時給'?e.hourly:e.base)+'"></div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">扶養人数<span class="hint2">配偶者含</span><span class="help-i" data-help="fuyou">💡</span></div><input class="finput num m-f" data-f="fuyou" value="'+attr(e.fuyou)+'"></div>'
        +'<div class="frow"><div class="flabel">都道府県<span class="hint2">健保率</span></div><select class="finput m-f" data-f="pref">'+prefOptions(e.pref)+'</select></div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">通勤手当<span class="hint2">非課税</span></div><input class="finput num m-f" data-f="commute" value="'+attr(e.commute)+'"></div>'
        +'<div class="frow"><div class="flabel">住民税<span class="hint2">円/月</span></div><input class="finput num m-f" data-f="residentTax" value="'+attr(e.residentTax)+'"></div></div>'
      +'<div class="frow"><div class="flabel">振込先<span class="hint2">任意</span></div><input class="finput m-f" data-f="bank" value="'+attr(e.bank)+'" placeholder="○○銀行 普通 1234567"></div>'
      +'<div class="sec-lb">支給項目（タップでON/OFF・通勤は上の欄）</div><div class="chip-row">'+chips(e,SUP_POOL,'shikyu')+'</div>'
      +'<div class="addcustom"><input class="finput ac-inp" data-g="shikyu" placeholder="自由な項目名（例：特別手当）"><button class="btn-ghost ac-btn" data-g="shikyu" style="padding:10px 12px">＋追加</button></div>'
      +'<div class="sec-lb">控除項目（法定は自動・任意分のみ）</div><div class="chip-row">'+chips(e,KOJO_POOL,'extraKojo')+'</div>'
      +'<div class="addcustom"><input class="finput ac-inp" data-g="extraKojo" placeholder="自由な項目名（例：寮費）"><button class="btn-ghost ac-btn" data-g="extraKojo" style="padding:10px 12px">＋追加</button></div>'
      +'<div style="text-align:right;margin-top:10px"><button class="m-del-emp btn-ghost" style="color:#C0392B;border-color:#f3c9c4;padding:8px 14px">この従業員を削除</button></div>'
      +'</div>';
  }
  function renderEmpMaster(){
    fillCompany();
    var host=$('#emp-list'); if(!host) return;
    // 部署でグループ化（誰も部署無しなら見出し非表示）
    var anyDept=state.employees.some(function(e){return e.dept;});
    var groups={}; var order=[];
    state.employees.forEach(function(e,i){ var g=e.dept||'未分類'; if(!groups[g]){groups[g]=[];order.push(g);} groups[g].push(i); });
    var html='';
    order.forEach(function(g){
      if(anyDept) html+='<div class="grp-hd">'+esc(g)+'（'+groups[g].length+'名）</div>';
      groups[g].forEach(function(i){
        var e=state.employees[i], op=state.open[e.id];
        html+='<div class="mco'+(op?' open':'')+'" data-i="'+i+'">'
          +'<div class="mco-hd" data-toggle="'+i+'"><span class="mco-nm">'+esc(e.name||'（無名）')+'</span><span class="mco-sub">'+esc(e.payType)+(e.role?' / '+esc(e.role):'')+'</span><span class="mco-cv">▾</span></div>'
          +(op?empCardBody(e,i):'')+'</div>';
      });
    });
    host.innerHTML=html;
  }

  /* ---------- 入力（自動計算） ---------- */
  function rowsHTML(g,arr){
    return arr.map(function(it,ri){
      var hz=g==='shikyu'?'<label class="row-hz" style="display:flex;align-items:center;gap:3px;font-size:10px;color:#7A9A87"><input type="checkbox" class="ck" data-g="'+g+'" data-ri="'+ri+'" '+(it.hikazei?'checked':'')+'>非課税</label>':'';
      return '<div class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:5px"><input class="finput" data-g="'+g+'" data-ri="'+ri+'" data-f="label" value="'+attr(it.label)+'" style="flex:1.3" placeholder="項目"><input class="finput num" data-g="'+g+'" data-ri="'+ri+'" data-f="value" value="'+attr(it.value)+'" style="flex:1" placeholder="'+(g==='kintai'?'値':'金額')+'">'+hz+'<button class="b-del m-del" data-g="'+g+'" data-ri="'+ri+'">×</button></div>';
    }).join('');
  }
  function calcBoxHTML(e){
    var r=compute(e);
    var lines=r.kojo.map(function(k){return '<div class="calc-line"><span>'+esc(k.label)+'</span><span class="v">'+yen(k.value)+'</span></div>';}).join('');
    return '<div class="calc-box"><div class="ch">自動計算（法定控除＋差引）標準報酬 '+yen(r.hyojun)+(r.netNegative?' ⚠差引マイナス':'')+'</div>'
      +'<div class="calc-line"><span>支給合計</span><span class="v">'+yen(r.shikyuTotal)+'</span></div>'+lines
      +'<div class="calc-line tot"><span>控除合計</span><span class="v">'+yen(r.kojoTotal)+'</span></div>'
      +'<div class="calc-line net tot"><span>差引支給額</span><span class="v">'+yen(r.net)+'</span></div></div>';
  }
  function renderInput(){
    var host=$('#input-list'); if(!host) return;
    host.innerHTML=state.employees.map(function(e,i){
      var r=compute(e), open=state.open['I'+e.id];
      return '<div class="acc'+(open?' open':'')+'" data-i="'+i+'">'
        +'<div class="acc-h" data-toggle="'+i+'"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(r.net)+'</span><span class="acc-cv">▾</span></div>'
        +'<div class="acc-body">'
          +'<div class="grp"><div class="grp-h">勤怠<button class="mini add" data-add="kintai" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('kintai',e.kintai)+'</div></div>'
          +'<div class="grp"><div class="grp-h">支給<button class="mini add" data-add="shikyu" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('shikyu',e.shikyu)+'</div></div>'
          +'<div class="grp"><div class="grp-h">法定外控除<button class="mini add" data-add="extraKojo" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('extraKojo',e.extraKojo)+'</div></div>'
          +'<div class="calc-wrap">'+calcBoxHTML(e)+'</div></div></div>';
    }).join('');
  }
  function refreshCard(i){ var e=state.employees[i]; var card=$('#input-list .acc[data-i="'+i+'"]'); if(!card) return; var r=compute(e); card.querySelector('.acc-net').textContent=yen(r.net); var cw=card.querySelector('.calc-wrap'); if(cw) cw.innerHTML=calcBoxHTML(e); }

  /* ---------- 一覧 / 集計 ---------- */
  function renderListView(){
    var host=$('#view-list'); if(!host) return;
    host.innerHTML=state.employees.map(function(e){
      var r=compute(e), open=state.open['L'+e.id];
      var pay=r.shikyu.map(function(s){return '<div class="dl"><span>'+esc(s.label)+'</span><span class="v">'+yen(s.value)+'</span></div>';}).join('');
      var ded=r.kojo.map(function(k){return '<div class="dl"><span>'+esc(k.label)+'</span><span class="v">'+yen(k.value)+'</span></div>';}).join('');
      return '<div class="acc'+(open?' open':'')+'" data-lid="'+e.id+'"><div class="acc-h" data-ltoggle="'+e.id+'"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(r.net)+'</span><span class="acc-cv">▾</span></div>'
        +'<div class="acc-body"><div class="det det-2"><div><div style="font-size:11px;font-weight:700;color:#2E7D54;margin:4px 0">支給</div>'+pay+'</div><div><div style="font-size:11px;font-weight:700;color:#2E7D54;margin:4px 0">控除</div>'+ded+'</div></div>'
        +'<div class="dl" style="margin-top:8px;font-weight:700;border-bottom:none"><span>差引支給額</span><span class="v" style="color:#2E7D54">'+yen(r.net)+'</span></div></div></div>';
    }).join('');
  }
  function renderSumView(){
    var rows=state.employees.map(function(e){var r=compute(e);return {name:e.name,dept:e.dept||'未分類',s:r.shikyuTotal,k:r.kojoTotal,n:r.net};});
    var tot=rows.reduce(function(a,x){return {s:a.s+x.s,k:a.k+x.k,n:a.n+x.n};},{s:0,k:0,n:0});
    var body=rows.map(function(x){return '<tr><td>'+esc(x.name)+'</td><td class="num">'+yen(x.s)+'</td><td class="num">'+yen(x.k)+'</td><td class="num">'+yen(x.n)+'</td></tr>';}).join('');
    $('#view-sum').innerHTML='<div class="card"><div class="card-h">月次集計（'+monthLabel().replace(/ /g,'')+'）</div>'
      +'<table class="sumtab"><thead><tr><th>従業員</th><th>支給合計</th><th>控除合計</th><th>差引支給</th></tr></thead>'
      +'<tbody>'+body+'<tr class="total"><td>全員合計（'+rows.length+'名）</td><td class="num">'+yen(tot.s)+'</td><td class="num">'+yen(tot.k)+'</td><td class="num">'+yen(tot.n)+'</td></tr></tbody></table>'
      +'<p class="hint">年次・部署別/役職別・賃金台帳・社保一覧はDB保存後に自動生成（STEP6）。</p></div>';
  }

  /* ---------- 印刷 / PDF ---------- */
  function buildPeople(emps){ return emps.map(function(e){ var r=compute(e); return { name:e.name, company:state.company.name, payDate:payDateStr(), kintai:e.kintai, shikyu:r.shikyu, kojo:r.kojo, net:r.net, shikyuTotal:r.shikyuTotal, kojoTotal:r.kojoTotal }; }); }
  function renderPrint(){
    $('#p-month').value=state.month;
    var sel=$('#p-emp'); sel.innerHTML='<option value="__all">全員（自動レイアウト）</option>'+state.employees.map(function(e,i){return '<option value="'+i+'">'+esc(e.name)+'</option>';}).join('');
    $('#theme-row').innerHTML=THEMES.map(function(t,i){return '<span class="sw'+(state.theme.accent===t.accent?' on':'')+'" data-ti="'+i+'" title="'+t.name+'" style="display:inline-block;width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #D4EDE1'+(state.theme.accent===t.accent?',0 0 0 2px #52B788':'')+';background:'+t.accent+';cursor:pointer"></span>';}).join('');
    doPreview();
  }
  function doPreview(){
    var v=$('#p-emp').value; var emps=v==='__all'?state.employees:[state.employees[+v]];
    var out=Render.build(buildPeople(emps), {month:monthLabel()}, state.prefer, state.theme);
    var f=$('#frame'); f.srcdoc=out.html;
    var pw=out.orientation==='landscape'?1123:794, ph=out.orientation==='landscape'?794:1123;
    var wrap=$('.preview-wrap'); var s=Math.min(1,(wrap.clientWidth-32)/pw);
    f.style.width=pw+'px'; f.style.height=ph+'px'; f.style.transform='scale('+s+')'; f.style.transformOrigin='top left';
    f.style.marginRight=(-(pw*(1-s)))+'px'; f.style.marginBottom=(-(ph*(1-s)))+'px';
  }

  /* ---------- events ---------- */
  function bind(){
    $$('.bn').forEach(function(b){ b.addEventListener('click',function(){ showScreen(b.dataset.scr); }); });
    // 💡 ヘルプ（全画面共通）
    document.addEventListener('click',function(e){ var hi=e.target.closest('.help-i'); if(hi){ openHelp(hi.dataset.help); } });
    $('#help-x').addEventListener('click',function(){ $('#help-ov').classList.remove('on'); });
    $('#help-ov').addEventListener('click',function(e){ if(e.target===this) this.classList.remove('on'); });
    $('#g-month').addEventListener('change',function(){ state.month=this.value||state.month; if($('#scr-input').classList.contains('active')){$('#in-month').textContent=monthLabel();renderInput();} });

    // 設定 seg
    $('#set-seg').addEventListener('click',function(ev){ var b=ev.target.closest('.seg-b'); if(!b)return; $$('.seg-b',this).forEach(function(x){x.classList.toggle('on',x===b);}); var s=b.dataset.set; $('#set-company').style.display=s==='company'?'':'none'; $('#set-emp').style.display=s==='emp'?'':'none'; if(s==='emp')renderEmpMaster(); });
    ['name','addr','close','payday'].forEach(function(k){ var el=$('#c-'+k); if(el) el.addEventListener('input',function(){ state.company[k]=this.value; }); });
    $('#b-add-emp').addEventListener('click',function(){ var e=defEmp('従業員 '+(state.employees.length+1)); state.employees.push(e); state.open[e.id]=true; renderEmpMaster(); });

    // 従業員マスタ操作
    var el=$('#emp-list');
    el.addEventListener('click',function(ev){
      var card=ev.target.closest('.mco');
      var tg=ev.target.closest('[data-toggle]');
      if(tg){ var ti=+tg.dataset.toggle; var e=state.employees[ti]; state.open[e.id]=!state.open[e.id]; renderEmpMaster(); return; }
      if(!card) return; var i=+card.dataset.i; var emp=state.employees[i];
      if(ev.target.classList.contains('chip')){ var key=ev.target.dataset.chip, lab=ev.target.dataset.lab; var arr=emp[key]; var idx=arr.findIndex(function(x){return x.label===lab;}); if(idx>=0)arr.splice(idx,1); else arr.push({label:lab,value:'0'}); renderEmpMaster(); return; }
      if(ev.target.classList.contains('ac-btn')){ var g=ev.target.dataset.g; var inp=ev.target.previousElementSibling; var val=(inp.value||'').trim(); if(val){ emp[g].push({label:val,value:'0'}); renderEmpMaster(); } return; }
      if(ev.target.classList.contains('m-del-emp')){ if(state.employees.length<=1){alert('最低1名必要です');return;} state.employees.splice(i,1); renderEmpMaster(); return; }
    });
    el.addEventListener('change',function(ev){
      var card=ev.target.closest('.mco'); if(!card)return; var i=+card.dataset.i; var emp=state.employees[i]; var f=ev.target.dataset.f; if(!f)return;
      if((f==='dept'||f==='role')&&ev.target.value==='__new'){ var label=f==='dept'?'部署':'役職'; var nv=(prompt('新しい'+label+'名',''))||''; nv=nv.trim(); if(nv){ var list=f==='dept'?state.depts:state.roles; if(list.indexOf(nv)<0)list.push(nv); emp[f]=nv; } renderEmpMaster(); return; }
      emp[f]=ev.target.value; if(f==='payType'||f==='dept'||f==='role') renderEmpMaster();
    });
    el.addEventListener('input',function(ev){ var card=ev.target.closest('.mco'); if(!card)return; var i=+card.dataset.i; var emp=state.employees[i]; var f=ev.target.dataset.f; if(f&&!ev.target.matches('select')) emp[f]=ev.target.value; var nm=card.querySelector('.mco-nm'); if(f==='name'&&nm)nm.textContent=ev.target.value||'（無名）'; });

    // 入力 accordion
    var il=$('#input-list');
    il.addEventListener('click',function(e){
      var tg=e.target.closest('[data-toggle]');
      if(tg){ var i=+tg.dataset.toggle; var emp=state.employees[i]; state.open['I'+emp.id]=!state.open['I'+emp.id]; il.querySelector('.acc[data-i="'+i+'"]').classList.toggle('open'); return; }
      if(e.target.dataset.add){ var ai=+e.target.dataset.i, g=e.target.dataset.add; state.employees[ai][g].push({label:'',value:''}); renderInput(); return; }
      if(e.target.classList.contains('m-del')&&e.target.closest('#input-list')){ var card=e.target.closest('.acc'); var ci=+card.dataset.i; var g=e.target.dataset.g, ri=+e.target.dataset.ri; state.employees[ci][g].splice(ri,1); renderInput(); return; }
    });
    il.addEventListener('input',function(e){ var card=e.target.closest('.acc'); if(!card)return; var ci=+card.dataset.i; var emp=state.employees[ci]; var g=e.target.dataset.g, ri=+e.target.dataset.ri, f=e.target.dataset.f; if(e.target.classList.contains('ck')){emp[g][ri].hikazei=e.target.checked;refreshCard(ci);return;} if(g&&!isNaN(ri)&&f){emp[g][ri][f]=e.target.value;refreshCard(ci);} });

    // 一覧/集計
    $$('.seg-b[data-view]').forEach(function(b){ b.addEventListener('click',function(){ $$('.seg-b[data-view]').forEach(function(x){x.classList.toggle('on',x===b);}); var v=b.dataset.view; $('#view-list').style.display=v==='list'?'':'none'; $('#view-sum').style.display=v==='sum'?'':'none'; if(v==='sum')renderSumView(); else renderListView(); }); });
    $('#view-list').addEventListener('click',function(e){ var tg=e.target.closest('[data-ltoggle]'); if(!tg)return; var id=tg.dataset.ltoggle; state.open['L'+id]=!state.open['L'+id]; $('#view-list .acc[data-lid="'+id+'"]').classList.toggle('open'); });

    // 印刷
    $('#p-emp').addEventListener('change',doPreview);
    $('#p-month').addEventListener('change',function(){ state.month=this.value||state.month; doPreview(); });
    $('#theme-row').addEventListener('click',function(e){ if(!e.target.dataset.ti)return; state.theme=THEMES[+e.target.dataset.ti]; renderPrint(); });
    $('#b-print').addEventListener('click',function(){ var f=$('#frame'); try{f.contentWindow.focus();f.contentWindow.print();}catch(err){window.print();} });
    $('#b-pdf').addEventListener('click',function(){ alert('PDF保存/送付はSTEP5でpdf-lib配線します（今は印刷からPDF保存可）'); });
    window.addEventListener('resize',function(){ if($('#scr-print').classList.contains('active'))doPreview(); });
  }

  /* init */
  $('#g-month').value=state.month;
  fillCompany(); bind(); showScreen('scr-settings');
  if(location.hash.indexOf('emp')>=0){ var b=$('#set-seg .seg-b[data-set="emp"]'); if(b)b.click(); if(state.employees[0]){state.open[state.employees[0].id]=true;} renderEmpMaster(); }
  if(location.hash==='#emphelp'){ openHelp('fuyou'); }
  var sm=$('#store-mode'); if(sm) sm.textContent='保存先: '+(window.Store?Store.mode:'local')==='supabase'?'Supabase（クラウド）':'このブラウザ（localStorage）';
})();
