/* meisai.js — 従業員向けWeb給与明細(パスワード方式)。
 * ?t=token → 初回:会社発行の初回コードで本人を縛り自分のパスワード設定 → 以後:パスワード(＋端末記憶deviceToken)。
 * ★電子交付に同意するまで明細データを画面に出さない(所得税法の電子交付要件)★。開封時に openedAt を記録。
 * 生年月日は使わない(同じ誕生日・推測に弱いため)。保存層は store.js(localStorage or Supabase RPC)。描画は render.js。 */
(function(){
  'use strict';
  var $=function(id){ return document.getElementById(id); };
  var SCREENS=['sc-bad','sc-setup','sc-login','sc-consent','sc-list','sc-view'];
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
      if(!r || !r.ok){ $('setup-err').textContent = (r&&r.badInit)?'初回コードが違います。':(r&&r.alreadySet)?'すでにパスワードが設定済みです。ログインしてください。':'設定できませんでした。'; if(r&&r.alreadySet)show('sc-login'); return; }
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
      if(!r || !r.ok){ if(errEl)errEl.textContent='パスワードが違います。'; return; }
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
})();
