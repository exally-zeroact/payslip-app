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

  // アプリ全体の状態(会社+従業員マスタ等)をクラウド保存。window.SUPA未設定ならlocalStorageのみ(app.js側)で扱う
  function accountId(){ var k='payslip_account'; var v=null; try{ v=localStorage.getItem(k); }catch(e){} if(!v){ v=uid(); try{ localStorage.setItem(k,v); }catch(e){} } return v; }
  if(hasSupa){
    Store.cloudSaveState = function(stateObj){ return sb.from('payslip_state').upsert({ id: accountId(), data: stateObj }).then(function(r){ return r.data; }); };
    Store.cloudLoadState = function(){ return sb.from('payslip_state').select('data').eq('id', accountId()).single().then(function(r){ return r.data && r.data.data; }); };
  }
  global.Store = Store;
})(window);
