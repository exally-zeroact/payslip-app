/* auth.js — ログイン(メール+パスワード/Supabase auth)。app.js/store.jsの後に読み込む。
 * Supabase未設定(window.Store.auth無し)なら何もしない＝localStorageのみで動作。
 * ログイン後: クラウドに既存データがあれば読込、無ければ今のローカル状態をクラウドへ初回保存(移行)。
 */
(function(){
  'use strict';
  if(!(window.Store && Store.auth)) return; // クラウド未設定→ログイン不要
  var A=Store.auth;

  // ログイン画面は全アプリ共通の部品(js/exally-login.js)。見た目も文言もそこが一次情報。
  var LOGIN = window.ExallyLogin.mount({
    app: '給料明細',
    // Store.auth を supabase と同じ形にして渡す
    sb: { auth: {
      signInWithPassword: function(c){ return A.signIn(c.email, c.password); },
      signUp: function(c){ return A.signUp(c.email, c.password); }
    } },
    note: 'ログインすると、どの端末でも同じ内容で使えます。',
    onLogin: function(user){ afterLogin((user && user.email) || ''); }
  });
  var ov = LOGIN.el;

  function $(id){ return document.getElementById(id); }
  function show(){ LOGIN.show(); }
  function hide(){ LOGIN.hide(); }
  function msg(t,err){ if(err) LOGIN.error(t||''); }
  function jpErr(s){ if(window.ExallyLogin) return ExallyLogin.friendly({message:s});
    /* eslint-disable-next-line no-unreachable */ s=String(s||''); if(/Invalid login/i.test(s))return 'メールかパスワードが違います'; if(/already registered|User already/i.test(s))return 'このメールは登録済みです。ログインしてください'; if(/at least 6/i.test(s))return 'パスワードは6文字以上にしてください'; if(/valid email/i.test(s))return 'メールアドレスの形式が正しくありません'; return s; }

  var curEmail='';
  // プラン状態ゲート: 停止/期限切れなら利用させない。取得失敗やAccess未読込時は"締めない"(誤ロック回避)。
  function gateCheck(){
    if(!(Store.getAccount && window.Access)) return Promise.resolve({ ok:true, reason:'nogate' });
    return Store.getAccount().then(function(acc){
      if(!acc){ // 行が無い=初回=trialを自動作成してopen
        return (Store.ensureAccount?Store.ensureAccount():Promise.resolve()).then(function(){ return { ok:true, reason:'new' }; });
      }
      return Access.accessState(acc);
    }).catch(function(){ return { ok:true, reason:'error' }; });
  }
  function afterLogin(email){ curEmail=email||curEmail;
    gateCheck().then(function(gate){
      if(gate && !gate.ok){ showLock(); return; } // 停止アカウント=アプリを触らせない
      hide();
      if(window.PayslipReloadCloud) window.PayslipReloadCloud().then(function(loaded){ if(!loaded && window.PayslipPersistSave) window.PayslipPersistSave(); /* 新規=今のローカルを初回アップ */ });
      showLogout();
    });
  }
  // 利用停止アカウントの画面(ログイン画面と同じオーバーレイを流用してアプリを覆う)。
  function showLock(){
    var m=(window.Access&&Access.lockMessage)?Access.lockMessage():{ title:'このアカウントは現在ご利用いただけません', body:'' };
    ov.innerHTML='<div class="auth-card"><div class="auth-logo">Kyually</div>'
      +'<p class="lead" style="color:#92500A;font-weight:700;margin:8px 0 14px">'+m.title+'</p>'
      +(m.body?'<p class="lead" style="margin-top:-8px">'+m.body+'</p>':'')
      +'<button class="b2" id="auth-lock-out">別のアカウントでログイン</button></div>';
    show();
    var lo=document.getElementById('auth-lock-out'); if(lo) lo.onclick=function(){ A.signOut().then(function(){ location.reload(); }); };
  }
  function showLogout(){ var sm=$('store-mode'); if(sm){ sm.innerHTML='ログイン中: '+ (curEmail||'') +'<span class="auth-out" id="auth-logout">ログアウト</span>'; var lo=$('auth-logout'); if(lo) lo.onclick=function(){ A.signOut().then(function(){ location.reload(); }); }; } }


  // 起動時: セッションがあればそのまま、無ければログイン画面
  // ★初回のセッション復元(setSessionを含む)が終わるまで onChange の null で早まってログイン画面を出さない。
  var _authChecked = false;
  A.session().then(function(s){ _authChecked = true; if(s){ var em=(s.user&&s.user.email)||''; afterLogin(em); } else { show(); } });
  A.onChange(function(s){ if(_authChecked && !s){ show(); } });
})();
