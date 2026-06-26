/* auth.js — ログイン(メール+パスワード/Supabase auth)。app.js/store.jsの後に読み込む。
 * Supabase未設定(window.Store.auth無し)なら何もしない＝localStorageのみで動作。
 * ログイン後: クラウドに既存データがあれば読込、無ければ今のローカル状態をクラウドへ初回保存(移行)。
 */
(function(){
  'use strict';
  if(!(window.Store && Store.auth)) return; // クラウド未設定→ログイン不要
  var A=Store.auth;

  var st=document.createElement('style');
  st.textContent='#auth-overlay{position:fixed;inset:0;z-index:1000;background:linear-gradient(160deg,#EAF6EF,#F0FAF4);display:none;align-items:center;justify-content:center;padding:20px;font-family:"Noto Sans JP",sans-serif;}'
    +'.auth-card{width:100%;max-width:360px;background:#fff;border:1px solid #D4EDE1;border-radius:18px;box-shadow:0 10px 36px rgba(30,60,40,.12);padding:26px 22px;}'
    +'.auth-logo{font-size:22px;font-weight:800;color:#1a4a2e;text-align:center;margin-bottom:4px;}.auth-logo small{display:block;font-size:10px;letter-spacing:.18em;color:#7A9A87;font-weight:500;margin-top:2px;}'
    +'.auth-card p.lead{font-size:12px;color:#7A9A87;text-align:center;margin:8px 0 16px;}'
    +'.auth-card input{width:100%;padding:12px 12px;margin-bottom:10px;border:1.5px solid #D4EDE1;border-radius:10px;font-size:15px;color:#1a4a2e;-webkit-appearance:none;}'
    +'.auth-card input:focus{outline:none;border-color:#52B788;}'
    +'#auth-msg{font-size:12px;min-height:16px;margin:2px 0 10px;text-align:center;}'
    +'.auth-card .b1{width:100%;padding:12px;border:none;border-radius:10px;background:#3D9E72;color:#fff;font-size:15px;font-weight:700;cursor:pointer;}'
    +'.auth-card .b2{width:100%;padding:11px;margin-top:8px;border:1.5px solid #D4EDE1;border-radius:10px;background:#fff;color:#3D6B53;font-size:14px;font-weight:700;cursor:pointer;}'
    +'.auth-out{margin-left:8px;color:#C0392B;text-decoration:underline;cursor:pointer;font-size:12px;}';
  document.head.appendChild(st);

  var ov=document.createElement('div'); ov.id='auth-overlay';
  ov.innerHTML='<div class="auth-card"><div class="auth-logo">給与明細<small>ZEROACT</small></div>'
    +'<p class="lead">ログインすると、どの端末でも同じ内容で使えます。</p>'
    +'<input id="auth-email" type="email" placeholder="メールアドレス" autocomplete="username">'
    +'<input id="auth-pw" type="password" placeholder="パスワード（6文字以上）" autocomplete="current-password">'
    +'<div id="auth-msg"></div>'
    +'<button class="b1" id="auth-login">ログイン</button>'
    +'<button class="b2" id="auth-signup">新規登録（はじめての方）</button></div>';
  document.body.appendChild(ov);

  function $(id){ return document.getElementById(id); }
  function show(){ ov.style.display='flex'; }
  function hide(){ ov.style.display='none'; }
  function msg(t,err){ var m=$('auth-msg'); m.textContent=t||''; m.style.color=err?'#C0392B':'#3D6B53'; }
  function jpErr(s){ s=String(s||''); if(/Invalid login/i.test(s))return 'メールかパスワードが違います'; if(/already registered|User already/i.test(s))return 'このメールは登録済みです。ログインしてください'; if(/at least 6/i.test(s))return 'パスワードは6文字以上にしてください'; if(/valid email/i.test(s))return 'メールアドレスの形式が正しくありません'; return s; }

  var curEmail='';
  function afterLogin(email){ curEmail=email||curEmail; hide();
    if(window.PayslipReloadCloud) window.PayslipReloadCloud().then(function(loaded){ if(!loaded && window.PayslipPersistSave) window.PayslipPersistSave(); /* 新規=今のローカルを初回アップ */ });
    showLogout();
  }
  function showLogout(){ var sm=$('store-mode'); if(sm){ sm.innerHTML='ログイン中: '+ (curEmail||'') +'<span class="auth-out" id="auth-logout">ログアウト</span>'; var lo=$('auth-logout'); if(lo) lo.onclick=function(){ A.signOut().then(function(){ location.reload(); }); }; } }

  $('auth-login').onclick=function(){ var e=$('auth-email').value.trim(), p=$('auth-pw').value; if(!e||!p){msg('メールとパスワードを入力してください',true);return;} msg('ログイン中…'); A.signIn(e,p).then(function(r){ if(r.error)msg(jpErr(r.error.message),true); else afterLogin(e); }); };
  $('auth-signup').onclick=function(){ var e=$('auth-email').value.trim(), p=$('auth-pw').value; if(!e){msg('メールアドレスを入力してください',true);return;} if(p.length<6){msg('パスワードは6文字以上にしてください',true);return;} msg('登録中…'); A.signUp(e,p).then(function(r){ if(r.error)msg(jpErr(r.error.message),true); else { afterLogin(e); } }); };
  $('auth-pw').addEventListener('keydown',function(ev){ if(ev.key==='Enter') $('auth-login').click(); });

  // 起動時: セッションがあればそのまま、無ければログイン画面
  A.session().then(function(s){ if(s){ var em=(s.user&&s.user.email)||''; afterLogin(em); } else { show(); } });
  A.onChange(function(s){ if(!s){ show(); } });
})();
