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

  global.Store = Store;
})(window);
