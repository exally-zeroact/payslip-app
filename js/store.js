/* store.js — 給与明細データの保存層
 * 既定はブラウザ(localStorage)。window.SUPA={url,key} があれば Supabase に切替(supabase-js v2 を読み込み済み前提)。
 * データ単位 = 1バッチ(= 会社/支給日/月/従業員配列)。スキーマは supabase/schema.sql 参照。
 */
(function (global) {
  'use strict';
  var LS_KEY = 'payslip_batches_v1';
  var hasSupa = !!(global.SUPA && global.SUPA.url && global.SUPA.key && global.supabase);
  var sb = hasSupa ? global.supabase.createClient(global.SUPA.url, global.SUPA.key) : null;

  function lsAll(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); }catch(e){ return []; } }
  function lsWrite(arr){ localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
  function uid(){ return 'b_'+Math.abs(Date.now()).toString(36)+'_'+Math.floor(performance.now()).toString(36); }

  var Store = {
    mode: hasSupa ? 'supabase' : 'local',

    list: function(){
      if(hasSupa){
        return sb.from('payslip_batches').select('id,title,month,company,updated_at').order('updated_at',{ascending:false})
          .then(function(r){ return r.data||[]; });
      }
      return Promise.resolve(lsAll().map(function(b){ return {id:b.id,title:b.title,month:b.month,company:b.company,updated_at:b.updated_at}; })
        .sort(function(a,b){ return (b.updated_at||'').localeCompare(a.updated_at||''); }));
    },

    get: function(id){
      if(hasSupa){ return sb.from('payslip_batches').select('*').eq('id',id).single().then(function(r){ return r.data; }); }
      return Promise.resolve(lsAll().filter(function(b){ return b.id===id; })[0]||null);
    },

    save: function(batch){
      batch.updated_at = batch.updated_at || ''; // 呼び出し側でISO文字列を入れる(Date.now禁止環境対策)
      if(!batch.id) batch.id = uid();
      if(hasSupa){
        return sb.from('payslip_batches').upsert(batch).select().single().then(function(r){ return r.data; });
      }
      var arr = lsAll(); var i = arr.findIndex(function(b){ return b.id===batch.id; });
      if(i>=0) arr[i]=batch; else arr.push(batch);
      lsWrite(arr); return Promise.resolve(batch);
    },

    remove: function(id){
      if(hasSupa){ return sb.from('payslip_batches').delete().eq('id',id).then(function(){ return true; }); }
      lsWrite(lsAll().filter(function(b){ return b.id!==id; })); return Promise.resolve(true);
    }
  };

  // ── 認証(メール+パスワード) ──
  if(hasSupa){
    Store.auth = {
      session: function(){ return sb.auth.getSession().then(function(r){ return r.data && r.data.session; }); },
      user:    function(){ return sb.auth.getUser().then(function(r){ return r.data && r.data.user; }); },
      signIn:  function(email,pw){ return sb.auth.signInWithPassword({email:email,password:pw}); },
      signUp:  function(email,pw){ return sb.auth.signUp({email:email,password:pw}); },
      signOut: function(){ return sb.auth.signOut(); },
      onChange:function(cb){ sb.auth.onAuthStateChange(function(_e,s){ cb(s); }); }
    };
  }
  // ── アプリ状態をクラウドへ(棚分け: pay_companies=会社/設定・pay_employees=従業員) ──
  // RLSで本人(account_id=auth.uid)のみ。未ログイン時はnull/no-op(app.js側はlocalStorageで動作)
  if(hasSupa){
    function curUid(){ return sb.auth.getUser().then(function(r){ return r.data && r.data.user && r.data.user.id; }); }
    Store.cloudSaveState = function(state){
      return curUid().then(function(uid){ if(!uid) return null; var now=new Date().toISOString();
        var settings={ company:state.company, month:state.month, theme:state.theme, prefer:state.prefer, depts:state.depts, roles:state.roles, showRetired:state.showRetired };
        var emps=(state.employees||[]).map(function(e,i){ return { id:e.id, account_id:uid, sort:i, data:e, updated_at:now }; });
        var ids=emps.map(function(e){ return e.id; });
        return Promise.all([
          sb.from('pay_companies').upsert({ account_id:uid, data:settings, updated_at:now }),
          emps.length? sb.from('pay_employees').upsert(emps) : Promise.resolve(),
          sb.from('pay_employees').select('id').eq('account_id',uid).then(function(r){ var ex=(r.data||[]).map(function(x){return x.id;}); var rm=ex.filter(function(id){ return ids.indexOf(id)<0; }); return rm.length? sb.from('pay_employees').delete().in('id',rm) : null; })
        ]);
      });
    };
    Store.cloudLoadState = function(){
      return curUid().then(function(uid){ if(!uid) return null;
        return Promise.all([
          sb.from('pay_companies').select('data').eq('account_id',uid).maybeSingle(),
          sb.from('pay_employees').select('data,sort').eq('account_id',uid).order('sort',{ascending:true})
        ]).then(function(res){
          var co=res[0].data && res[0].data.data; var emps=(res[1].data||[]).map(function(r){ return r.data; });
          if(!co && !emps.length) return null; var s=co||{}; s.employees=emps; return s;
        });
      });
    };
  }
  // ── 月次明細(pay_payslips): 定時決定の4-6月を履歴から自動入力する素 ──
  // 同じ月×同じ従業員は上書き(id='ps_'+ym+'_'+employeeId)。未ログイン/未SUPAはlocalStorage層。
  var PS_KEY = 'payslip_payslips_v1';
  function psAll(){ try{ return JSON.parse(localStorage.getItem(PS_KEY)||'[]'); }catch(e){ return []; } }
  function psWrite(arr){ try{ localStorage.setItem(PS_KEY, JSON.stringify(arr)); }catch(e){} }
  Store.savePayslip = function(ym, employeeId, data){
    var id = 'ps_'+ym+'_'+employeeId;
    if(hasSupa){
      return sb.auth.getUser().then(function(r){ var uid=r.data&&r.data.user&&r.data.user.id; if(!uid) return null;
        return sb.from('pay_payslips').upsert({ id:id, account_id:uid, ym:ym, employee_id:employeeId, data:data, updated_at:new Date().toISOString() });
      });
    }
    var arr=psAll(); var i=arr.findIndex(function(x){ return x.id===id; }); var row={ id:id, ym:ym, employee_id:employeeId, data:data };
    if(i>=0) arr[i]=row; else arr.push(row); psWrite(arr); return Promise.resolve(row);
  };
  Store.getPayslipsByYm = function(ymFrom, ymTo){
    if(hasSupa){
      return sb.from('pay_payslips').select('ym,employee_id,data').gte('ym',ymFrom).lte('ym',ymTo)
        .then(function(r){ return r.data||[]; });
    }
    return Promise.resolve(psAll().filter(function(x){ return x.ym>=ymFrom && x.ym<=ymTo; })
      .map(function(x){ return { ym:x.ym, employee_id:x.employee_id, data:x.data }; }));
  };

  // ── Web明細(従業員向け配布・パスワード方式) ──
  // 会社が月次/賞与明細を「Web公開」→従業員は リンク(?t=token)で開き、初回だけ「会社発行の初回コード」で本人を縛って
  // 自分のパスワードを設定→以後はパスワード(＋端末記憶deviceToken)で閲覧。★電子交付の同意(所得税法)まで明細を1バイトも返さない★。
  // 生年月日PINは廃止(同じ誕生日・推測に弱い)。未読/開封(openedAt)を記録。本番=Supabase(schema/RPC)。ここはlocalStorage実装。
  var MPUB_KEY='payslip_meisai_pub_v1', MDOC_KEY='payslip_meisai_docs_v1';
  function mPub(){ try{ return JSON.parse(localStorage.getItem(MPUB_KEY)||'[]'); }catch(e){ return []; } }
  function mPubW(a){ try{ localStorage.setItem(MPUB_KEY, JSON.stringify(a)); }catch(e){} }
  function mDoc(){ try{ return JSON.parse(localStorage.getItem(MDOC_KEY)||'[]'); }catch(e){ return []; } }
  function mDocW(a){ try{ localStorage.setItem(MDOC_KEY, JSON.stringify(a)); }catch(e){} }
  // 簡易ハッシュ(localStorage用・非暗号)。★本番はSupabase RPCでpgcrypto crypt()/bcryptの適正ハッシュ★。
  function hashOf(s){ s=String(s||''); var h=5381; for(var i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))>>>0; } return 'h'+h.toString(36); }
  function rndToken(){ return 't'+Math.random().toString(36).slice(2,10)+Math.random().toString(36).slice(2,6); }
  function rndCode(){ var c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s=''; for(var i=0;i<8;i++){ s+=c[Math.floor(Math.random()*c.length)]; } return s; } // 紛らわしい文字を除いた8桁
  function findPub(token){ var pubs=mPub(); for(var i=0;i<pubs.length;i++){ if(pubs[i].token===token) return { pubs:pubs, i:i, p:pubs[i] }; } return { pubs:pubs, i:-1, p:null }; }
  // 認証: deviceToken(端末記憶) or password で本人確認。OKならpub返す。
  function authPub(p, cred){ cred=cred||{};
    if(cred.deviceToken && (p.deviceTokens||[]).indexOf(cred.deviceToken)>=0) return true;
    if(cred.password!=null && p.pwHash && p.pwHash===hashOf(cred.password)) return true;
    return false; }

  // 会社: 明細を公開。items=[{employeeId,name,ym,kind('monthly'|'bonus'),data(render.js用)}]。従業員ごとに token/初回コードを確保・doc upsert。返り=[{employeeId,name,token,link}]
  Store.publishMeisai = function(items){
    // TODO(supabase): pay_meisai_pub(token,account_id,employee_id,init_code,pw_hash,device_tokens,consent_at)＋pay_meisai_docs(...) にupsert(RLS=会社のみ)。
    var pubs=mPub(), docs=mDoc(), now=new Date().toISOString(), out=[];
    (items||[]).forEach(function(it){
      var p=pubs.filter(function(x){ return x.employeeId===it.employeeId; })[0];
      if(!p){ p={ token:rndToken(), employeeId:it.employeeId, initCode:rndCode(), pwHash:null, deviceTokens:[], consentAt:null, createdAt:now }; pubs.push(p); }
      // 既発行は token/初回コード/パスワード/同意 を保持(再公開で消さない)
      var id='md_'+p.token+'_'+it.ym+'_'+it.kind;
      var d={ id:id, token:p.token, ym:it.ym, kind:it.kind, name:it.name, data:it.data, publishedAt:now, openedAt:null };
      var di=docs.findIndex(function(x){ return x.id===id; }); if(di>=0){ d.openedAt=docs[di].openedAt; docs[di]=d; } else docs.push(d);
      out.push({ employeeId:it.employeeId, name:it.name, token:p.token, link:'meisai.html?t='+p.token });
    });
    mPubW(pubs); mDocW(docs); return Promise.resolve(out);
  };
  // 会社: 公開一覧。返り=[{employeeId,name,token,link,hasPassword,initCode(パスワード未設定の間だけ),consentAt,docs:[{ym,kind,openedAt}]}]
  Store.listMeisaiPub = function(){
    // TODO(supabase): 会社のpay_meisai_pub(init_code含む・会社はRLSで読める)＋docsをselect。
    var pubs=mPub(), docs=mDoc();
    return Promise.resolve(pubs.map(function(p){
      var ds=docs.filter(function(x){ return x.token===p.token; }).map(function(x){ return { ym:x.ym, kind:x.kind, name:x.name, publishedAt:x.publishedAt, openedAt:x.openedAt }; });
      var nm=(ds[0]&&ds[0].name)||''; var hasPw=!!p.pwHash;
      return { employeeId:p.employeeId, name:nm, token:p.token, link:'meisai.html?t='+p.token, hasPassword:hasPw, initCode:(hasPw?null:p.initCode), consentAt:p.consentAt, docs:ds };
    }));
  };
  // 従業員: トークンの状態(初回か/記憶済か)。★明細/コードは返さない★。返り={found,hasPassword,remembered,name}
  Store.meisaiAuth = function(token, deviceToken){
    // TODO(supabase): RPC meisai_auth(p_token,p_device) → found/has_password/remembered。
    var f=findPub(token); if(!f.p) return Promise.resolve({ found:false });
    var docs=mDoc().filter(function(x){ return x.token===token; }); var nm=(docs[0]&&docs[0].name)||'';
    var remembered=!!(deviceToken && (f.p.deviceTokens||[]).indexOf(deviceToken)>=0);
    return Promise.resolve({ found:true, hasPassword:!!f.p.pwHash, remembered:remembered, name:nm });
  };
  // 従業員: 初回パスワード設定(会社発行の初回コードで本人を縛る)。返り={ok} or {badInit} or {alreadySet}
  Store.meisaiSetPassword = function(token, initCode, password){
    // TODO(supabase): RPC meisai_set_password(p_token,p_init,p_pw) SECURITY DEFINER。init照合→pw_hash設定・init無効化。
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false, notFound:true });
    if(f.p.pwHash) return Promise.resolve({ ok:false, alreadySet:true });
    if(String(initCode||'').toUpperCase().trim()!==String(f.p.initCode||'')) return Promise.resolve({ ok:false, badInit:true });
    if(String(password||'').length<4) return Promise.resolve({ ok:false, weak:true });
    f.p.pwHash=hashOf(password); f.p.initCode=null; mPubW(f.pubs);
    return Promise.resolve({ ok:true });
  };
  // 従業員: パスワード照合→OKで端末記憶用deviceToken発行。返り={ok,deviceToken} or {bad}
  Store.meisaiVerifyPassword = function(token, password){
    // TODO(supabase): RPC meisai_verify(p_token,p_pw)→deviceToken(サーバ保存)。
    var f=findPub(token); if(!f.p || !f.p.pwHash) return Promise.resolve({ ok:false });
    if(f.p.pwHash!==hashOf(password)) return Promise.resolve({ ok:false, bad:true });
    var dt=rndToken(); if(!f.p.deviceTokens)f.p.deviceTokens=[]; f.p.deviceTokens.push(dt); mPubW(f.pubs);
    return Promise.resolve({ ok:true, deviceToken:dt });
  };
  // 従業員: 明細取得。cred={deviceToken}or{password}。★認証NG/同意前は docs を1件も返さない★。返り={docs,name}|{needConsent,name}|{unauth}
  Store.getMeisaiDocs = function(token, cred){
    // TODO(supabase): RPC get_meisai(p_token,p_device) SECURITY DEFINER。認証＋同意済ならdocs返す。anon直readは不可。
    var f=findPub(token); if(!f.p) return Promise.resolve({ unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ unauth:true });
    var docs=mDoc().filter(function(x){ return x.token===token; }).sort(function(a,b){ return (b.ym||'').localeCompare(a.ym||''); });
    var nm=(docs[0]&&docs[0].name)||'';
    if(!f.p.consentAt) return Promise.resolve({ needConsent:true, name:nm });
    return Promise.resolve({ name:nm, consentAt:f.p.consentAt,
      docs:docs.map(function(x){ return { id:x.id, ym:x.ym, kind:x.kind, name:x.name, data:x.data, openedAt:x.openedAt }; }) });
  };
  // 従業員: 電子交付に同意(認証必須)。返り={ok,consentAt} or {unauth}
  Store.setMeisaiConsent = function(token, cred){
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false });
    if(!authPub(f.p, cred)) return Promise.resolve({ ok:false, unauth:true });
    if(!f.p.consentAt){ f.p.consentAt=new Date().toISOString(); mPubW(f.pubs); }
    return Promise.resolve({ ok:true, consentAt:f.p.consentAt });
  };
  // 会社: 初回コード再発行(＝旧パスワード/記憶を無効化・本人が再設定)。返り={ok,initCode}
  Store.reissueMeisaiInit = function(token){
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false });
    f.p.initCode=rndCode(); f.p.pwHash=null; f.p.deviceTokens=[]; mPubW(f.pubs);
    return Promise.resolve({ ok:true, initCode:f.p.initCode });
  };
  // 従業員: 明細を開いた(openedAt記録)。
  Store.markMeisaiOpened = function(docId){
    var docs=mDoc(); var i=docs.findIndex(function(x){ return x.id===docId; });
    if(i>=0 && !docs[i].openedAt){ docs[i].openedAt=new Date().toISOString(); mDocW(docs); }
    return Promise.resolve(true);
  };

  global.Store = Store;
})(window);
