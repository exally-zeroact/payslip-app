/* app.js — 給与明細アプリ UI */
(function(){
  'use strict';
  var $ = function(s,r){ return (r||document).querySelector(s); };
  var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };

  // ---- 既定データ ----
  function defaultPerson(name){
    return {
      name: name||'山田 太郎',
      kintai: [
        {label:'出勤日数',value:'21'},{label:'欠勤日数',value:'0'},{label:'有給取得',value:'1'},
        {label:'労働時間',value:'168:00'},{label:'残業時間',value:'10:00'},{label:'深夜時間',value:'0:00'}
      ],
      shikyu: [
        {label:'基本給',value:'250000'},{label:'残業手当',value:'19531'},{label:'住宅手当',value:'10000'},
        {label:'通勤手当',value:'8400',hikazei:true},{label:'皆勤手当',value:'5000'}
      ],
      kojo: [
        {label:'健康保険',value:'14123'},{label:'厚生年金',value:'26047'},{label:'雇用保険',value:'1611'},
        {label:'所得税',value:'6750'},{label:'住民税',value:'12500'}
      ]
    };
  }
  var state = {
    id: null,
    company: '株式会社 ゼロアクト',
    month: '令 和 八 年 六 月 分',
    payDate: '令和8年6月25日',
    prefer: 'auto',
    people: [ defaultPerson('山田 太郎') ]
  };

  function num(v){ var n=Number(String(v).replace(/[, ]/g,'')); return isNaN(n)?0:n; }
  function netOf(p){ return p.shikyu.reduce(function(a,x){return a+num(x.value);},0) - p.kojo.reduce(function(a,x){return a+num(x.value);},0); }

  // ---- editor 描画 ----
  function rowHTML(g, it){
    var hz = g==='shikyu' ? '<label class="hz"><input type="checkbox" class="ck-hz" '+(it.hikazei?'checked':'')+'>非課税</label>' : '';
    return '<div class="row"><input class="lbl" value="'+attr(it.label)+'" placeholder="項目名"><input class="val" value="'+attr(it.value)+'" placeholder="'+(g==='kintai'?'値':'金額')+'">'+hz+'<button class="b-del" title="削除">×</button></div>';
  }
  function attr(s){ return String(s==null?'':s).replace(/"/g,'&quot;'); }

  function renderEditor(){
    var host = $('#people'); host.innerHTML='';
    state.people.forEach(function(p, idx){
      var node = $('#tpl-person').content.cloneNode(true);
      var card = node.querySelector('.person');
      card.dataset.idx = idx;
      card.querySelector('.p-name').value = p.name||'';
      card.querySelector('.p-net').textContent = '差引 ¥'+netOf(p).toLocaleString('ja-JP');
      if(state.people.length<=1) card.querySelector('.b-delp').style.display='none';
      ['kintai','shikyu','kojo'].forEach(function(g){
        var rows = card.querySelector('.rows[data-g="'+g+'"]');
        rows.innerHTML = p[g].map(function(it){ return rowHTML(g,it); }).join('');
      });
      host.appendChild(node);
    });
    $('#count').textContent = state.people.length;
    $('#b-addp').disabled = state.people.length>=4;
  }

  // ---- state 読み取り (editor → state) ----
  function syncFromEditor(){
    state.company = $('#f-company').value;
    state.month   = $('#f-month').value;
    state.payDate = $('#f-paydate').value;
    state.prefer  = $('#f-prefer').value;
    $$('.person').forEach(function(card){
      var p = state.people[+card.dataset.idx]; if(!p) return;
      p.name = card.querySelector('.p-name').value;
      ['kintai','shikyu','kojo'].forEach(function(g){
        var rows = $$('.rows[data-g="'+g+'"] .row', card);
        p[g] = rows.map(function(r){
          var it = { label:r.querySelector('.lbl').value, value:r.querySelector('.val').value };
          if(g==='shikyu'){ var ck=r.querySelector('.ck-hz'); if(ck&&ck.checked) it.hikazei=true; }
          return it;
        });
      });
    });
  }

  // ---- preview ----
  var frameWrap;
  function ensureWrap(){
    if(frameWrap) return;
    var stage = $('.preview-stage'), frame = $('#frame');
    frameWrap = document.createElement('div');
    stage.replaceChild(frameWrap, frame);
    frameWrap.appendChild(frame);
  }
  function renderPreview(){
    var people = state.people.map(function(p){
      return { name:p.name, company:state.company, payDate:state.payDate,
               kintai:p.kintai, shikyu:p.shikyu, kojo:p.kojo,
               net: netOf(p),
               shikyuTotal: p.shikyu.reduce(function(a,x){return a+num(x.value);},0),
               kojoTotal: p.kojo.reduce(function(a,x){return a+num(x.value);},0) };
    });
    var out = Render.build(people, {month:state.month}, state.prefer);
    var frame = $('#frame');
    frame.srcdoc = out.html;
    var pw = out.orientation==='landscape' ? 1123 : 794;
    var ph = out.orientation==='landscape' ? 794 : 1123;
    ensureWrap();
    var stage = $('.preview-stage');
    var s = Math.min(1, (stage.clientWidth-48)/pw);
    frame.style.width = pw+'px'; frame.style.height = ph+'px';
    frame.style.transform = 'scale('+s+')'; frame.style.transformOrigin='top left';
    frameWrap.style.width = (pw*s)+'px'; frameWrap.style.height = (ph*s)+'px';
    var st = $('#status');
    var names = {cols:'横並び(支給左/控除右・中身2カラム)', vstack:'縦並び(支給上/控除下)', strips:'横ストリップ(A4横)'};
    var sizeTxt = out.orientation==='landscape'?'A4横':'A4縦';
    st.textContent = '自動選択: '+names[out.builder]+' / '+sizeTxt+' / '+state.people.length+'名'+(out.fits?'':' ⚠ 行数オーバー：項目を減らすか1人1枚に分けてください');
    st.className = 'preview-status'+(out.fits?'':' warn');
    window.__lastFrame = frame;
  }

  var t;
  function refresh(){ syncFromEditor(); state.people.forEach(function(p,i){ var c=$$('.person')[i]; if(c) c.querySelector('.p-net').textContent='差引 ¥'+netOf(p).toLocaleString('ja-JP'); }); clearTimeout(t); t=setTimeout(renderPreview, 120); }

  // ---- events ----
  function bind(){
    ['f-company','f-month','f-paydate'].forEach(function(id){ $('#'+id).addEventListener('input', refresh); });
    $('#f-prefer').addEventListener('change', refresh);
    $('#people').addEventListener('input', refresh);
    $('#people').addEventListener('change', refresh);
    $('#people').addEventListener('click', function(e){
      var card = e.target.closest('.person'); if(!card) return;
      var idx = +card.dataset.idx;
      if(e.target.classList.contains('b-add')){ syncFromEditor(); state.people[idx][e.target.dataset.g].push({label:'',value:''}); renderEditor(); renderPreview(); }
      else if(e.target.classList.contains('b-del')){ syncFromEditor(); var g=e.target.closest('.rows').dataset.g; var ri=$$('.rows[data-g="'+g+'"] .row',card).indexOf(e.target.closest('.row')); state.people[idx][g].splice(ri,1); renderEditor(); renderPreview(); }
      else if(e.target.classList.contains('b-delp')){ syncFromEditor(); state.people.splice(idx,1); renderEditor(); renderPreview(); }
    });
    $('#b-addp').addEventListener('click', function(){ if(state.people.length>=4) return; syncFromEditor(); state.people.push(defaultPerson('従業員 '+(state.people.length+1))); renderEditor(); renderPreview(); });
    $('#b-print').addEventListener('click', function(){ var f=$('#frame'); try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ window.print(); } });
    $('#b-new').addEventListener('click', function(){ if(!confirm('新規作成します。未保存の内容は消えます。')) return; state.id=null; state.people=[defaultPerson('山田 太郎')]; fillBar(); renderEditor(); renderPreview(); });
    $('#b-save').addEventListener('click', doSave);
    $('#b-load').addEventListener('click', doLoad);
  }

  function fillBar(){ $('#f-company').value=state.company; $('#f-month').value=state.month; $('#f-paydate').value=state.payDate; $('#f-prefer').value=state.prefer; }

  function doSave(){
    syncFromEditor();
    var batch = { id:state.id, title:(state.people[0].name||'明細')+' 他'+(state.people.length-1)+'名',
      company:state.company, month:state.month, payDate:state.payDate, prefer:state.prefer,
      people:state.people, updated_at:new Date().toISOString() };
    Store.save(batch).then(function(b){ state.id=b.id; alert('保存しました（'+Store.mode+'）'); }).catch(function(e){ alert('保存に失敗: '+e); });
  }
  function doLoad(){
    Store.list().then(function(list){
      if(!list.length){ alert('保存データがありません'); return; }
      var msg='読み込む明細の番号を入力:\n'+list.map(function(b,i){ return (i+1)+'. '+(b.title||b.id)+'（'+(b.company||'')+'）'; }).join('\n');
      var s=prompt(msg,'1'); if(!s) return; var i=parseInt(s,10)-1; if(isNaN(i)||!list[i]) return;
      Store.get(list[i].id).then(function(b){ if(!b) return; state.id=b.id; state.company=b.company; state.month=b.month; state.payDate=b.payDate; state.prefer=b.prefer||'auto'; state.people=b.people||[defaultPerson()]; fillBar(); renderEditor(); renderPreview(); });
    });
  }

  // ---- init ----
  fillBar(); renderEditor(); bind(); renderPreview();
  window.addEventListener('resize', function(){ clearTimeout(t); t=setTimeout(renderPreview,150); });
  $('#store-mode').textContent = '保存先: '+(Store.mode==='supabase'?'Supabase（クラウド）':'このブラウザ（localStorage）。Supabaseを使うには config.js で window.SUPA を設定');
})();
