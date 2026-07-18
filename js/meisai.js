/* meisai.js — 従業員向けWeb給与明細(パスワード方式)。
 * ?t=token → 初回:会社発行の初回コードで本人を縛り自分のパスワード設定 → 以後:パスワード(＋端末記憶deviceToken)。
 * ★電子交付に同意するまで明細データを画面に出さない(所得税法の電子交付要件)★。開封時に openedAt を記録。
 * 生年月日は使わない(同じ誕生日・推測に弱いため)。保存層は store.js(localStorage or Supabase RPC)。描画は render.js。 */
(function(){
  'use strict';
  var $=function(id){ return document.getElementById(id); };
  var SCREENS=['sc-bad','sc-setup','sc-login','sc-consent','sc-list','sc-view','sc-nencho','sc-furikomi'];
  function show(id){ SCREENS.forEach(function(s){ var el=$(s); if(el)el.classList.toggle('hidden', s!==id); }); }
  function yen(n){ n=Math.round(Number(n)||0); return '¥'+n.toLocaleString('en-US'); }
  function ymLabel(ym, kind){ var y=(ym||'').slice(0,4), m=parseInt((ym||'').slice(5,7),10)||0; return '令和'+(y-2018)+'年'+m+'月'+(kind==='bonus'?'（賞与）':'分'); }

  var token=(function(){ try{ return new URLSearchParams(location.search).get('t'); }catch(e){ return null; } })();
  var DEVKEY='meisai_dev_'+token;                 // この端末に記憶したdeviceToken
  var cred=null, docs=[];                          // 認証後の資格情報(deviceToken or password)

  if(!token){ show('sc-bad'); return; }

  // 起動: 端末記憶があれば認証スキップ
  var savedDev=(function(){ try{ return localStorage.getItem(DEVKEY)||null; }catch(e){ return null; } })();
  Store.meisaiAuth(token, savedDev).then(function(r){
    if(!r || !r.found){ show('sc-bad'); return; }
    if(r.remembered){ cred={ deviceToken:savedDev }; afterAuth(r.name); return; }   // 記憶済→パスワード省略
    if(!r.hasPassword){ show('sc-setup'); return; }                                  // 初回=パスワード設定
    show('sc-login');                                                                // 2回目以降=パスワード
  });

  // 認証後: 同意チェック→明細一覧(or 同意画面)
  function afterAuth(name){
    Store.getMeisaiDocs(token, cred).then(function(r){
      if(!r || r.unauth){ show('sc-login'); return; }
      if(r.needConsent){ show('sc-consent'); return; }
      docs=r.docs||[]; renderList(r.name||name); show('sc-list');
    });
  }

  // ① 初回パスワード設定(会社発行の初回コード＋新パスワード)
  $('setup-go').addEventListener('click', function(){
    var code=($('setup-code').value||'').trim(), pw=$('setup-pw').value||'', pw2=$('setup-pw2').value||'';
    $('setup-err').textContent='';
    if(!code){ $('setup-err').textContent='会社から渡された初回コードを入力してください。'; return; }
    if(pw.length<8){ $('setup-err').textContent='パスワードは8文字以上にしてください。'; return; }
    if(pw!==pw2){ $('setup-err').textContent='パスワード(確認)が一致しません。'; return; }
    Store.meisaiSetPassword(token, code, pw).then(function(r){
      if(!r || !r.ok){ $('setup-err').textContent = (r&&r.locked)?'初回コードを何度も間違えたため、しばらくロックされています。時間をおいて再度お試しください。':(r&&r.weak)?'パスワードは8文字以上にしてください。':(r&&r.badInit)?('初回コードが違います。'+(r.remaining!=null?'（あと'+r.remaining+'回でロックされます）':'')):(r&&r.alreadySet)?'すでにパスワードが設定済みです。ログインしてください。':'設定できませんでした。'; if(r&&r.alreadySet)show('sc-login'); return; }
      // 設定できたらそのままパスワードでログイン→端末記憶
      loginWith(pw);
    });
  });

  // ② パスワードでログイン
  $('login-go').addEventListener('click', function(){ loginWith($('login-pw').value||''); });
  $('login-pw').addEventListener('keydown', function(e){ if(e.key==='Enter')$('login-go').click(); });
  function loginWith(pw){
    var errEl=$('login-err'); if(errEl)errEl.textContent='';
    Store.meisaiVerifyPassword(token, pw).then(function(r){
      if(!r || !r.ok){ if(errEl)errEl.textContent = (r&&r.locked)?'パスワードを何度も間違えたため、しばらくロックされています。時間をおいて再度お試しください。':(r&&r.remaining!=null?'パスワードが違います（あと'+r.remaining+'回でロックされます）。':'パスワードが違います。'); return; }
      try{ localStorage.setItem(DEVKEY, r.deviceToken); }catch(e){}   // 端末に記憶(次回からパスワード不要)
      cred={ deviceToken:r.deviceToken };
      afterAuth();
    });
  }

  // ③ 電子交付の同意(認証済cred必須)
  $('consent-go').addEventListener('click', function(){
    Store.setMeisaiConsent(token, cred).then(function(r){
      if(!r || !r.ok){ show('sc-login'); return; }
      afterAuth();
    });
  });
  $('consent-no').addEventListener('click', function(){ show('sc-login'); });

  // ④ 明細一覧
  function renderList(name){
    $('list-title').textContent = (name?name+' さん の ':'')+'給与明細';
    var host=$('dlist'); host.innerHTML='';
    if(!docs.length){ host.innerHTML='<p class="hint">公開されている明細はまだありません。</p>'; return; }
    docs.forEach(function(d, i){
      var p=(d.data&&d.data.person)||{};
      var row=document.createElement('div'); row.className='drow';
      row.innerHTML='<div><div class="dl">'+ymLabel(d.ym,d.kind)+(d.openedAt?'':'<span class="badge-new">未読</span>')+'</div><div class="ds">'+(d.kind==='bonus'?'賞与明細':'給与明細')+'</div></div><div class="dv">'+yen(p.net)+'</div>';
      row.addEventListener('click', function(){ openDoc(i); });
      host.appendChild(row);
    });
  }

  // ⑤ 明細ビュー
  function openDoc(i){
    var d=docs[i]; if(!d) return; var data=d.data||{};
    var people=[data.person||{}], doc=data.doc||{month:ymLabel(d.ym,d.kind), kind:d.kind};
    try{
      var out=window.Render.build(people, doc, data.prefer, data.theme);
      var f=$('frame');
      f.srcdoc=out.html;
      var pw=out.orientation==='landscape'?1123:794, ph=out.orientation==='landscape'?794:1123;
      f.style.width=pw+'px'; f.style.height=ph+'px'; f.style.transformOrigin='top left';
      f.dataset.pw=pw; f.dataset.ph=ph;
      show('sc-view'); // 先に表示してからフィット(隠れてると幅0で負scaleになる)
      fitFrame(); requestAnimationFrame(fitFrame);
    }catch(e){ show('sc-view'); }
    if(d.openedAt==null){ Store.markMeisaiOpened(d.id, token, cred).then(function(){ d.openedAt=new Date().toISOString(); }); }
    window.scrollTo(0,0);
  }
  function fitFrame(){
    var f=$('frame'), wrap=document.querySelector('.preview-wrap'); if(!f||!wrap||!f.dataset.pw) return;
    var pw=+f.dataset.pw, ph=+f.dataset.ph, avail=wrap.clientWidth-24;
    var s = avail>0 ? Math.min(1, avail/pw) : 1; if(!(s>0.05)) s=Math.max(0.05, s||1);
    f.style.transform='scale('+s+')'; f.style.marginRight=(-(pw*(1-s)))+'px'; f.style.marginBottom=(-(ph*(1-s)))+'px';
  }
  $('v-back').addEventListener('click', function(){ renderList(); show('sc-list'); });
  $('v-pdf').addEventListener('click', function(){ var f=$('frame'); try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ window.print(); } });
  window.addEventListener('resize', function(){ if($('sc-view').classList.contains('hidden'))return; fitFrame(); });

  // ⑥ 年末調整 従業員セルフ申告(平易な質問→保存。会社が取り込む)
  var ND=window.NenchoDecl, nenYear=new Date().getFullYear(), declState={};
  (function(){ var y=$('nencho-year'); if(y) y.textContent=nenYear+'年'; })();
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function fmtN(v){ v=Number(String(v==null?'':v).replace(/[, ]/g,'')); return isNaN(v)||v===0?'':v.toLocaleString('en-US'); }
  function ynPill(key,on){ return '<span class="nw-yn" data-ynk="'+esc(key)+'"><b class="ynb'+(on?' on':'')+'" data-ynv="1">はい</b><b class="ynb'+(!on?' on':'')+'" data-ynv="0">いいえ</b></span>'; }
  function nenWizHTML(){
    if(!ND) return '<p class="hint">申告フォームを読み込めませんでした。</p>';
    return ND.GROUPS.map(function(g){
      var rows=ND.FIELDS.filter(function(f){ return f.group===g.id && (!f.when || !!declState[f.when]); }).map(function(f){
        var help=f.help?'<div class="nw-help">'+esc(f.help)+'</div>':'', input;
        if(f.type==='bool') input=ynPill(f.key, !!declState[f.key]);
        else if(f.type==='select') input='<select class="finput" data-nk="'+esc(f.key)+'">'+(f.options||[]).map(function(o){ return '<option value="'+esc(o[0])+'"'+((declState[f.key]||'')===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>';
        else { var unit=(f.type==='count')?'人':'円'; input='<input class="finput num" data-nk="'+esc(f.key)+'" inputmode="numeric" value="'+esc(fmtN(declState[f.key]))+'" placeholder="0"><span class="nw-unit">'+unit+'</span>'; }
        return '<div class="nw-row"><div class="nw-q">'+esc(f.q)+help+'</div><div class="nw-in">'+input+'</div></div>';
      }).join('');
      return '<div class="nw-group"><div class="nw-gt">'+esc(g.title)+'</div>'+rows+'</div>';
    }).join('');
  }
  function renderNenWiz(){ var host=$('nencho-wiz'); if(host) host.innerHTML=nenWizHTML(); }
  function openNencho(){
    var errEl=$('nencho-err'); if(errEl)errEl.textContent=''; $('nencho-saved').classList.add('hidden');
    Store.getNenchoDecl(token, cred, nenYear).then(function(r){
      declState = (r && r.found && r.decl) ? JSON.parse(JSON.stringify(r.decl)) : (ND?ND.blank():{});
      if(r && r.found){ var sv=$('nencho-saved'); sv.textContent='前回の申告を読み込みました。修正して再提出できます。'; sv.classList.remove('hidden'); }
      renderNenWiz(); show('sc-nencho'); window.scrollTo(0,0);
    });
  }
  var toN=$('to-nencho'); if(toN) toN.addEventListener('click', openNencho);
  var nBack=$('nencho-back'); if(nBack) nBack.addEventListener('click', function(){ renderList(); show('sc-list'); });
  var wiz=$('nencho-wiz');
  if(wiz){
    wiz.addEventListener('click', function(e){ var b=e.target.closest('.ynb'); if(!b)return; var pill=b.closest('[data-ynk]'); if(!pill)return;
      declState[pill.dataset.ynk]=(b.dataset.ynv==='1'); renderNenWiz(); }); // when依存行(配偶者の所得等)の出し入れ
    wiz.addEventListener('input', function(e){ var f=e.target.closest('[data-nk]'); if(!f||f.tagName==='SELECT')return; declState[f.dataset.nk]=f.value; });
    wiz.addEventListener('change', function(e){ var f=e.target.closest('[data-nk]'); if(!f||f.tagName!=='SELECT')return; declState[f.dataset.nk]=f.value; });
  }
  var nSave=$('nencho-save');
  if(nSave) nSave.addEventListener('click', function(){
    var errEl=$('nencho-err'); if(errEl)errEl.textContent='';
    var decl = ND ? ND.normalize(declState) : declState;
    Store.saveNenchoDecl(token, cred, nenYear, decl).then(function(r){
      if(!r || !r.ok){ if(errEl)errEl.textContent=(r&&r.unauth)?'ログインが必要です。もう一度開き直してください。':'保存できませんでした。通信環境をご確認ください。'; return; }
      declState=JSON.parse(JSON.stringify(decl)); renderNenWiz();
      var sv=$('nencho-saved'); sv.textContent='申告を保存しました。会社が確認して年末調整に反映します。修正があればこの画面から再提出できます。'; sv.classList.remove('hidden');
      window.scrollTo(0,0);
    });
  });

  // ⑦ 従業員セルフ登録: 振込先(給与の受け取り口座)
  var PROFILE_FIELDS=[
    { k:'furiBankName', label:'銀行名', ph:'みずほ銀行', help:'例：みずほ銀行／三菱UFJ銀行／ゆうちょ銀行 など。' },
    { k:'furiBankNo', label:'銀行コード（4桁）', ph:'0001', num:true, max:4, help:'通帳・キャッシュカード・銀行アプリで確認できます。分からなければ空欄でOK。' },
    { k:'furiBranchName', label:'支店名', ph:'本店', help:'' },
    { k:'furiBranchNo', label:'支店コード（3桁）', ph:'001', num:true, max:3, help:'' },
    { k:'furiYokin', label:'預金の種類', sel:['普通','当座','貯蓄'] },
    { k:'furiAccount', label:'口座番号（7桁）', ph:'1234567', num:true, max:7, help:'7桁より短い場合は前に0を付けて7桁にしてください。' },
    { k:'furiKana', label:'口座名義（カナ）', ph:'ﾔﾏﾀﾞ ﾊﾅｺ', help:'通帳のとおり（半角カナ）。空欄なら会社が氏名から補います。' }
  ];
  var profState={};
  function profFieldHTML(f){
    var v=profState[f.k]==null?'':profState[f.k], inner;
    if(f.sel) inner='<select class="finput" data-pk="'+esc(f.k)+'">'+f.sel.map(function(o){ return '<option'+(((v||f.sel[0])===o)?' selected':'')+'>'+esc(o)+'</option>'; }).join('')+'</select>';
    else inner='<input class="finput'+(f.num?' num':'')+'" data-pk="'+esc(f.k)+'" value="'+esc(v)+'"'+(f.num?' inputmode="numeric"':'')+(f.max?' maxlength="'+f.max+'"':'')+' placeholder="'+esc(f.ph||'')+'">';
    return '<div style="margin-bottom:12px"><label class="lbl">'+esc(f.label)+'</label>'+inner+(f.help?'<div class="hint" style="margin-top:3px">'+esc(f.help)+'</div>':'')+'</div>';
  }
  function renderProfForm(){ var host=$('furi-form'); if(host) host.innerHTML=PROFILE_FIELDS.map(profFieldHTML).join(''); }
  function openFurikomi(){
    var errEl=$('furi-err'); if(errEl)errEl.textContent=''; $('furi-saved').classList.add('hidden');
    Store.getEmpProfile(token, cred).then(function(r){
      profState = (r && r.found && r.data) ? JSON.parse(JSON.stringify(r.data)) : {};
      if(r && r.found){ var sv=$('furi-saved'); sv.textContent='前回の登録を読み込みました。修正して再登録できます。'; sv.classList.remove('hidden'); }
      renderProfForm(); show('sc-furikomi'); window.scrollTo(0,0);
    });
  }
  var toF=$('to-furikomi'); if(toF) toF.addEventListener('click', openFurikomi);
  var fBack=$('furi-back'); if(fBack) fBack.addEventListener('click', function(){ renderList(); show('sc-list'); });
  var fSave=$('furi-save');
  if(fSave) fSave.addEventListener('click', function(){
    var errEl=$('furi-err'); if(errEl)errEl.textContent='';
    var host=$('furi-form'), data={};
    PROFILE_FIELDS.forEach(function(f){ var el=host.querySelector('[data-pk="'+f.k+'"]'); var v=el?(''+el.value).trim():''; if(f.num) v=v.replace(/[^0-9]/g,''); data[f.k]=v; }); // コード/口座番号は数字のみ
    Store.saveEmpProfile(token, cred, data).then(function(r){
      if(!r || !r.ok){ if(errEl)errEl.textContent=(r&&r.unauth)?'ログインが必要です。もう一度開き直してください。':'保存できませんでした。通信環境をご確認ください。'; return; }
      profState=JSON.parse(JSON.stringify(data)); renderProfForm();
      var sv=$('furi-saved'); sv.textContent='振込先を登録しました。会社が確認して反映します。修正があればこの画面から再登録できます。'; sv.classList.remove('hidden');
      window.scrollTo(0,0);
    });
  });
})();
