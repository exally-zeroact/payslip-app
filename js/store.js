/* store.js — 給与明細データの保存層
 * 既定はブラウザ(localStorage)。window.SUPA={url,key} があれば Supabase に切替(supabase-js v2 を読み込み済み前提)。
 * データ単位 = 1バッチ(= 会社/支給日/月/従業員配列)。スキーマは supabase/schema.sql 参照。
 */
(function (global) {
  'use strict';
  var LS_KEY = 'payslip_batches_v1';
  var hasSupa = !!(global.SUPA && global.SUPA.url && global.SUPA.key && global.supabase);
  var sb = hasSupa ? global.supabase.createClient(global.SUPA.url, global.SUPA.key, {
    // ログイン状態を端末に保持(iOSホーム画面PWA等でも維持を狙う)。
    // ★detectSessionInUrl=true: メール確認リンク(確認ON時)で戻ると URL に access/refresh トークンが載る→
    //   これを解析してセッションを成立させる為に必要。通常のメール+パスワードのみの利用では URL にトークンが
    //   無いので副作用なし(=既定値true・回帰なし)。確認OFFのままでも安全。
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  // ── 全件ページング(PostgREST既定 max_rows=1000 で"黙って"切れるのを根治) ──
  //  build=(from,to)=>完成クエリ。必ず .select(cols,{count:'exact'}) と .range(from,to) を付けて返す。
  //  count で総数を見て、全ページ取り切るまで .range を回す。返り={ data, error, count }。
  //  count が取れない応答は最初の非空ページで止める(飲み屋 fetchAll と同じ安全側)。
  //  ★これを通さない .select() は1000件超で賃金台帳/年末調整/明細一覧などが黙って過少になる★。
  function fetchAllQ(build){
    var out=[], from=0, size=1000;
    function step(){
      return Promise.resolve(build(from, from+size-1)).then(function(r){
        if(r.error) return { data:null, error:r.error };
        var got=r.data||[]; out=out.concat(got);
        if(!got.length || r.count==null || out.length>=r.count)
          return { data:out, error:null, count:(r.count==null?out.length:r.count) };
        from+=got.length; return step(); // ★size固定でなく実受信数で進める(上限<ページ幅でも漏れない)
      });
    }
    return step();
  }

  function lsAll(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); }catch(e){ return []; } }
  function lsWrite(arr){ localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
  function uid(){ return 'b_'+Math.abs(Date.now()).toString(36)+'_'+Math.floor(performance.now()).toString(36); }

  var Store = {
    mode: hasSupa ? 'supabase' : 'local',

    list: function(){
      if(hasSupa){
        return fetchAllQ(function(a,b){ return sb.from('payslip_batches').select('id,title,month,company,updated_at',{count:'exact'}).order('updated_at',{ascending:false}).range(a,b); })
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
    // ★iOSホーム画面PWA(standalone)等でSupabase内蔵ストレージが起動間に失われる場合の保険:
    //   セッション(refresh_token)を独自キーにもバックアップし、起動時にgetSessionが空なら復元する。
    // ★保険キーはSupabaseプロジェクト別にする。本番(payslip-app)とテスト(payslip-app-test)は
    //   同一オリジン(exally-zeroact.github.io)でlocalStorageを共有するため、共通キーだと互いの
    //   セッションを上書きし合い、主トークンが飛んだ時に別プロジェクトのトークンで復元失敗→毎回ログインになる。
    var _projRef=(function(){ try{ return (global.SUPA.url.match(/\/\/([^.]+)\./)||[])[1]||''; }catch(e){ return ''; } })();
    var BK = 'kyually-session-backup' + (_projRef ? ('-'+_projRef) : '');
    try{ if(sb.auth && typeof sb.auth.onAuthStateChange==='function'){
      sb.auth.onAuthStateChange(function(ev, s){
        // ★消すのは「明示的サインアウト」時だけ。起動時のINITIAL_SESSION(null)では消さない
        //   =内蔵ストレージが空でも独自バックアップから復元できるようにする(iOS standalone対策の要)。
        if(ev === 'SIGNED_OUT'){ try{ localStorage.removeItem(BK); }catch(e){} return; }
        if(s && s.refresh_token){ try{ localStorage.setItem(BK, JSON.stringify({ a:s.access_token, r:s.refresh_token })); }catch(e){} }
      });
    } }catch(e){}

    Store.auth = {
      session: function(){
        return sb.auth.getSession().then(function(r){
          var s = r.data && r.data.session;
          if(s) return s;
          // 内蔵ストレージが空でも、独自バックアップから復元を試みる(standalone対策)
          var raw=null; try{ raw = localStorage.getItem(BK); }catch(e){}
          if(!raw) return null;
          var b=null; try{ b = JSON.parse(raw); }catch(e){}
          if(!b || !b.r) return null;
          return sb.auth.setSession({ access_token:b.a, refresh_token:b.r })
            .then(function(rr){ return (rr.data && rr.data.session) || null; })
            .catch(function(){ return null; });
        });
      },
      user:    function(){ return sb.auth.getUser().then(function(r){ return r.data && r.data.user; }); },
      signIn:  function(email,pw){ return sb.auth.signInWithPassword({email:email,password:pw}); },
      signUp:  function(email,pw){ return sb.auth.signUp({email:email,password:pw}); },
      signOut: function(){ try{ localStorage.removeItem(BK); }catch(e){} return sb.auth.signOut(); },
      onChange:function(cb){ sb.auth.onAuthStateChange(function(_e,s){ cb(s); }); }
    };
  }
  // ── アプリ状態をクラウドへ(棚分け: pay_companies=会社/設定・pay_employees=従業員) ──
  // RLSで本人(account_id=auth.uid)のみ。未ログイン時はnull/no-op(app.js側はlocalStorageで動作)
  if(hasSupa){
    function curUid(){ return sb.auth.getUser().then(function(r){ return r.data && r.data.user && r.data.user.id; }); }
    // ★このセッションでクラウドと同期できたか(読めた or 書けた)。差分削除はこれがtrueの時だけ許可
    //  =クラウド読込に失敗した古い/空の端末が、本番の従業員を物理削除するのを防ぐ(データ消失対策)。
    var cloudSynced = false;
    // ★楽観ロック用: 最後に把握した pay_companies(設定=全置換で最も危険)の updated_at。
    //  読込時・自分の保存成功時に更新。保存前にクラウドの現在値と違えば「別端末が後から更新」=conflictで上書きしない。
    var lastCompanyUpdatedAt = null;
    Store.cloudSaveState = function(state){
      return curUid().then(function(uid){ if(!uid) return { ok:false, reason:'no-user' }; var now=new Date().toISOString();
        // ★employees以外の全スナップショット項目を保存(確定印/年末調整/賞与/カスタム給テンプレ/onboard等も載せる=端末替えで消えない)
        var settings={}; for(var k in state){ if(Object.prototype.hasOwnProperty.call(state,k) && k!=='employees') settings[k]=state[k]; }
        var emps=(state.employees||[]).map(function(e,i){ return { id:e.id, account_id:uid, sort:i, data:e, updated_at:now }; });
        var ids=emps.map(function(e){ return e.id; });
        // ★競合検知: 一度でも同期していれば(lastCompanyUpdatedAt!=null)、保存直前にクラウドの現在updated_atを確認。
        //  自分が最後に把握した値と違う=別端末が後から書いた→上書きせず conflict を返す(app.js側で再読込を促す)。
        return sb.from('pay_companies').select('updated_at').eq('account_id',uid).maybeSingle().then(function(cur){
          var cloudUA = cur && cur.data && cur.data.updated_at;
          // ★上書きせずconflictにする条件: クラウドに既存データがあり、それが「自分が最後に把握した値」と違う。
          //  別端末が後から書いた場合だけでなく、この端末がまだクラウドを読めていない(lastUA=null)のに本番データがある場合も含む
          //  =古い/新規端末が本番のsettings(確定・年調・会社設定)を静かに巻き戻すのを防ぐ(P0)。空クラウド(cloudUA=null)は新規保存OK。
          if(cloudUA && cloudUA!==lastCompanyUpdatedAt){
            // neverSynced=この端末がまだクラウドを読めていない(別端末の更新でなく"未読込")→app側で文言を分ける(誤解防止)
            return { ok:false, reason:'conflict', cloudUpdatedAt:cloudUA, neverSynced:(lastCompanyUpdatedAt==null) };
          }
          return doSave();
        }).catch(function(){
          // 競合確認クエリ自体が失敗: 同期実績あり(手元が本番の正と確定済み)ならブラインド保存(可用性優先)。
          //  未同期(cloudSynced=false)なら安全側=上書きせず失敗を返す(app側はローカル保持のまま警告=データ消失しない)。
          return cloudSynced ? doSave() : { ok:false, reason:'sync-check-failed' };
        });
        function doSave(){
        var ops=[
          // ★.select('updated_at').single()=DBが実際に保存した updated_at を受け取り、競合基準に使う(下記)。
          sb.from('pay_companies').upsert({ account_id:uid, data:settings, updated_at:now }).select('updated_at').single(),
          emps.length? sb.from('pay_employees').upsert(emps) : Promise.resolve({ error:null })
        ];
        // ★差分削除は「同期済み(cloudSynced)かつ手元に従業員が居る」時だけ=空/古い端末が本番を消さない
        if(cloudSynced && emps.length>0){
          ops.push(fetchAllQ(function(a,b){ return sb.from('pay_employees').select('id',{count:'exact'}).eq('account_id',uid).range(a,b); }).then(function(r){ var ex=(r.data||[]).map(function(x){return x.id;}); var rm=ex.filter(function(id){ return ids.indexOf(id)<0; }); return rm.length? sb.from('pay_employees').delete().in('id',rm) : { error:null }; }));
        }
        return Promise.all(ops).then(function(res){
          var bad=res.filter(function(x){ return x && x.error; })[0];
          // ★競合基準は必ず「DBが返した updated_at」にする。JS生成の now(…Z) はDB返却(…+00:00)と書式が違い、
          //  文字列比較で毎回不一致=読込直後や2回目保存(スクロール等の自動保存)で誤conflictが多発する(P0根治)。
          if(!bad){ cloudSynced=true; lastCompanyUpdatedAt=(res[0] && res[0].data && res[0].data.updated_at) || now; }
          return { ok:!bad, reason: bad?((bad.error&&bad.error.message)||'error'):null };
        }).catch(function(e){ return { ok:false, reason:(e&&e.message)||'exception' }; });
        }
      });
    };
    Store.cloudLoadState = function(){
      return curUid().then(function(uid){ if(!uid) return null;
        return Promise.all([
          sb.from('pay_companies').select('data,updated_at').eq('account_id',uid).maybeSingle(),
          fetchAllQ(function(a,b){ return sb.from('pay_employees').select('data,sort',{count:'exact'}).eq('account_id',uid).order('sort',{ascending:true}).range(a,b); })
        ]).then(function(res){
          var co=res[0].data && res[0].data.data; var emps=(res[1].data||[]).map(function(r){ return r.data; });
          cloudSynced=true; // クラウドと通信できた=同期済み(空でも=新規アカウントとして差分削除を許可)
          lastCompanyUpdatedAt=(res[0].data && res[0].data.updated_at)||null; // ★競合検知の基準=読込時のクラウドupdated_at
          if(!co && !emps.length) return null; var s=co||{}; s.employees=emps; return s;
        });
      });
    };
    // ── アカウントのプラン状態(exally_entitlements): 司さんが 使える/停止 を制御する層 ──
    // ★Exally共通テーブル: 1人×1アプリ=1行(account_id,app,plan)。請求書/給料明細/今後のアプリを1箇所で管理。
    //   このアプリの識別子=APP。他アプリは app 値を変えて同じテーブルを読むだけ(DB変更不要でアプリ追加可)。
    //   本人は自分の行を"読むだけ"(RLS)。plan変更は司さん(ダッシュボード/service role)のみ。
    var APP = 'payslip';
    Store.getAccount = function(){
      return curUid().then(function(uid){ if(!uid) return null;
        return sb.from('exally_entitlements').select('plan,expires_at').eq('account_id',uid).eq('app',APP).maybeSingle()
          .then(function(r){ return r.data || null; });
      });
    };
    // 初回ログインで(このアプリの)行が無ければ trial 行を自動作成(insertポリシーで plan='trial' 固定)。
    // 管理画面で「誰か」を表示するため email も入れる(自分の行のみ)。
    Store.ensureAccount = function(){
      return sb.auth.getUser().then(function(r){ var u=r.data&&r.data.user; var uid=u&&u.id; if(!uid) return null; var email=u.email||null;
        return sb.from('exally_entitlements').select('account_id').eq('account_id',uid).eq('app',APP).maybeSingle().then(function(rr){
          if(rr.data) return { plan:'trial', existed:true };
          return sb.from('exally_entitlements').insert({ account_id:uid, app:APP, plan:'trial', email:email }).then(function(){ return { plan:'trial', existed:false }; });
        });
      });
    };
  }
  // ── 月次/賞与明細(pay_payslips): 定時決定の4-6月・年末調整の年集計の素 ──
  // 同じ月×同じ従業員は上書き。月次 id='ps_'+ym+'_'+eid / 賞与 id='psb_'+ym+'_'+eid(同月に給与と賞与が併存しても衝突しない)。
  //  ★kind('monthly'|'bonus')を data.kind に埋め込む→取得側で用途別にフィルタ(定時決定/前月比は賞与を除外・年調は含める)★。
  //  DBスキーマ非変更(kindは既存 data jsonb 内)。未kind=旧データ=monthly扱い。未ログイン/未SUPAはlocalStorage層。
  var PS_KEY = 'payslip_payslips_v1';
  function psAll(){ try{ return JSON.parse(localStorage.getItem(PS_KEY)||'[]'); }catch(e){ return []; } }
  function psWrite(arr){ try{ localStorage.setItem(PS_KEY, JSON.stringify(arr)); }catch(e){} }
  Store.savePayslip = function(ym, employeeId, data, kind){
    kind = (kind==='bonus')?'bonus':'monthly';
    var id = (kind==='bonus'?'psb_':'ps_')+ym+'_'+employeeId;
    var d = data||{}; d.kind = kind; // 取得側フィルタ用に用途を記録
    if(hasSupa){
      return sb.auth.getUser().then(function(r){ var uid=r.data&&r.data.user&&r.data.user.id; if(!uid) return null;
        return sb.from('pay_payslips').upsert({ id:id, account_id:uid, ym:ym, employee_id:employeeId, data:d, updated_at:new Date().toISOString() });
      });
    }
    var arr=psAll(); var i=arr.findIndex(function(x){ return x.id===id; }); var row={ id:id, ym:ym, employee_id:employeeId, data:d };
    if(i>=0) arr[i]=row; else arr.push(row); psWrite(arr); return Promise.resolve(row);
  };
  Store.getPayslipsByYm = function(ymFrom, ymTo){
    if(hasSupa){
      return fetchAllQ(function(a,b){ return sb.from('pay_payslips').select('ym,employee_id,data',{count:'exact'}).gte('ym',ymFrom).lte('ym',ymTo).range(a,b); })
        .then(function(r){ return r.data||[]; });
    }
    return Promise.resolve(psAll().filter(function(x){ return x.ym>=ymFrom && x.ym<=ymTo; })
      .map(function(x){ return { ym:x.ym, employee_id:x.employee_id, data:x.data }; }));
  };

  // ── K4: Exally台帳(pay_ledger)を期間で読む。二度手間ゼロの源。RLSで自分のアカウント分のみ・削除済み(deleted_at)は除く ──
  //  ★count:'exact' で全部読めたか検知。count>rows.length なら PostgREST上限(既定1000)で"黙って切れた"=合計が過少→truncated:true。
  //  返り: { rows:[{id,employee_id,ymd,data}], count, truncated }。未ログイン/ローカルは空(台帳はクラウド専用)。
  Store.getLedger = function(fromYmd, toYmd){
    if(hasSupa){
      return fetchAllQ(function(a,b){ return sb.from('pay_ledger').select('id,employee_id,ymd,data', { count:'exact' })
          .is('deleted_at', null).gte('ymd', fromYmd).lte('ymd', toYmd).order('ymd', { ascending:true }).range(a,b); })
        .then(function(r){
          if(r.error) return { rows:[], count:0, truncated:false, error:(r.error.message||'error') };
          var rows=r.data||[]; var count=(r.count==null)?rows.length:r.count;
          return { rows:rows, count:count, truncated:(count > rows.length) }; // 全ページ取得後は基本 false(切れ検知は保険)
        }).catch(function(e){ return { rows:[], count:0, truncated:false, error:(e&&e.message)||'exception' }; });
    }
    return Promise.resolve({ rows:[], count:0, truncated:false }); // 台帳はクラウド専用(未ログイン=空)
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
    if(hasSupa){ // 会社側=authセッション必須(account_id=auth.uid()・RLS)。既存pub(employee_id)は保持し無ければinit_code付きで作成→doc upsert
      return Promise.all((items||[]).map(function(it){
        return sb.from('pay_meisai_pub').select('token').eq('employee_id', it.employeeId).limit(1).then(function(r){
          var ex=(r.data&&r.data[0]);
          var pubP = ex ? Promise.resolve(ex.token)
            : sb.from('pay_meisai_pub').insert({ employee_id:it.employeeId, init_code:rndCode() }).select('token').single().then(function(ir){ return ir.data&&ir.data.token; });
          return pubP.then(function(token){
            if(!token) return null;
            var id='md_'+token+'_'+it.ym+'_'+it.kind;
            return sb.from('pay_meisai_docs').upsert({ id:id, token:token, ym:it.ym, kind:it.kind, data:it.data }).then(function(){
              return { employeeId:it.employeeId, name:it.name, token:token, link:'meisai.html?t='+token };
            });
          });
        });
      })).then(function(arr){ return arr.filter(Boolean); });
    }
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
  // empIds(現在の名簿=在籍+退職者のemployee_id配列)を渡すと、名簿に居る人だけに絞る。
  //  ★削除済み(名簿に無い)employee_idの公開行は一覧に出さない=既存の幽霊も即消える。empIds未指定なら従来どおり全件。
  Store.listMeisaiPub = function(empIds){
    var keep = Array.isArray(empIds) ? function(id){ return empIds.indexOf(id)>=0; } : function(){ return true; };
    if(hasSupa){ // 会社側=RLSで自分の発行分のみ。init_code/pw_hashは自分の行なので読める(従業員anonは直read不可)
      return Promise.all([
        fetchAllQ(function(a,b){ return sb.from('pay_meisai_pub').select('token,employee_id,init_code,pw_hash,consent_at',{count:'exact'}).range(a,b); }),
        fetchAllQ(function(a,b){ return sb.from('pay_meisai_docs').select('token,ym,kind,published_at,opened_at,data',{count:'exact'}).range(a,b); })
      ]).then(function(res){
        var pubs=(res[0].data||[]), docs=(res[1].data||[]);
        return pubs.filter(function(p){ return keep(p.employee_id); }).map(function(p){
          var ds=docs.filter(function(x){ return x.token===p.token; }).map(function(x){ return { ym:x.ym, kind:x.kind, name:(x.data&&x.data.person&&x.data.person.name)||'', publishedAt:x.published_at, openedAt:x.opened_at }; });
          var nm=(ds[0]&&ds[0].name)||''; var hasPw=!!p.pw_hash;
          return { employeeId:p.employee_id, name:nm, token:p.token, link:'meisai.html?t='+p.token, hasPassword:hasPw, initCode:(hasPw?null:p.init_code), consentAt:p.consent_at, docs:ds };
        });
      });
    }
    var pubs=mPub(), docs=mDoc();
    return Promise.resolve(pubs.filter(function(p){ return keep(p.employeeId); }).map(function(p){
      var ds=docs.filter(function(x){ return x.token===p.token; }).map(function(x){ return { ym:x.ym, kind:x.kind, name:x.name, publishedAt:x.publishedAt, openedAt:x.openedAt }; });
      var nm=(ds[0]&&ds[0].name)||''; var hasPw=!!p.pwHash;
      return { employeeId:p.employeeId, name:nm, token:p.token, link:'meisai.html?t='+p.token, hasPassword:hasPw, initCode:(hasPw?null:p.initCode), consentAt:p.consentAt, docs:ds };
    }));
  };
  // 従業員削除時=Web明細リンクを失効(その従業員の全公開行の認証情報をクリア=get_meisaiが明細を返さない=リンク死)。
  //  ★pay_meisai_docs(公開明細)は物理削除しない=pub行を消すとcascadeで消えるため、行は残し認証情報だけ無効化する(既存方針=お金の記録は残す)。
  //  オフライン/未ログインは no-op で安全に(RLSで auth.uid()=null は0行更新)。
  Store.unpublishMeisai = function(employeeId){
    if(!employeeId) return Promise.resolve({ ok:false });
    if(hasSupa){
      return sb.from('pay_meisai_pub').update({ init_code:null, pw_hash:null, device_tokens:[], consent_at:null, fail_count:0, locked_until:null })
        .eq('employee_id', employeeId).then(function(r){ return { ok:!r.error }; }).catch(function(){ return { ok:false }; });
    }
    try{ var pubs=mPub(); var changed=false; pubs.forEach(function(p){ if(p.employeeId===employeeId){ p.initCode=null; p.pwHash=null; p.deviceTokens=[]; p.consentAt=null; changed=true; } }); if(changed) mPubW(pubs); }catch(e){}
    return Promise.resolve({ ok:true });
  };
  // 従業員: トークンの状態(初回か/記憶済か)。★明細/コードは返さない★。返り={found,hasPassword,remembered,name}
  Store.meisaiAuth = function(token, deviceToken){
    if(hasSupa){ // 従業員=匿名RPC(明細/コードは返らない)。氏名は認証後にdocsから
      return sb.rpc('meisai_auth', { p_token:token, p_device:deviceToken||null }).then(function(r){
        var d=r.data||{}; if(!d.found) return { found:false };
        return { found:true, hasPassword:!!d.has_password, remembered:!!d.remembered, locked:!!d.locked, name:'' };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ found:false });
    var remembered=!!(deviceToken && (f.p.deviceTokens||[]).indexOf(deviceToken)>=0);
    var docs=mDoc().filter(function(x){ return x.token===token; });
    var nm=remembered ? ((docs[0]&&docs[0].name)||'') : ''; // ★氏名は認証済(端末記憶)のみ返す。認証前は個人特定情報を出さない
    return Promise.resolve({ found:true, hasPassword:!!f.p.pwHash, remembered:remembered, name:nm });
  };
  // 従業員: 初回パスワード設定(会社発行の初回コードで本人を縛る)。返り={ok} or {badInit} or {alreadySet}
  Store.meisaiSetPassword = function(token, initCode, password){
    if(hasSupa){
      return sb.rpc('meisai_set_password', { p_token:token, p_init:initCode, p_pw:password }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, badInit:!!d.bad_init, alreadySet:!!d.already_set, weak:!!d.weak, locked:!!d.locked, remaining:d.remaining };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false, notFound:true });
    if(f.p.pwHash) return Promise.resolve({ ok:false, alreadySet:true });
    if(String(initCode||'').toUpperCase().trim()!==String(f.p.initCode||'')) return Promise.resolve({ ok:false, badInit:true });
    if(String(password||'').length<8) return Promise.resolve({ ok:false, weak:true });
    f.p.pwHash=hashOf(password); f.p.initCode=null; mPubW(f.pubs);
    return Promise.resolve({ ok:true });
  };
  // 従業員: パスワード照合→OKで端末記憶用deviceToken発行。返り={ok,deviceToken} or {bad}
  Store.meisaiVerifyPassword = function(token, password){
    if(hasSupa){
      return sb.rpc('meisai_verify', { p_token:token, p_pw:password }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, deviceToken:d.device_token, locked:!!d.locked, remaining:d.remaining };
      });
    }
    var f=findPub(token); if(!f.p || !f.p.pwHash) return Promise.resolve({ ok:false });
    if(f.p.pwHash!==hashOf(password)) return Promise.resolve({ ok:false, bad:true });
    var dt=rndToken(); if(!f.p.deviceTokens)f.p.deviceTokens=[]; f.p.deviceTokens.push(dt); mPubW(f.pubs);
    return Promise.resolve({ ok:true, deviceToken:dt });
  };
  // 従業員: 明細取得。cred={deviceToken}or{password}。★認証NG/同意前は docs を1件も返さない★。返り={docs,name}|{needConsent,name}|{unauth}
  Store.getMeisaiDocs = function(token, cred){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('get_meisai', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null }).then(function(r){
        var d=r.data||{}; if(d.unauth) return { unauth:true };
        // get_meisaiは各docのopened_atを返す(per-doc未読)。既読化はmark_meisai_openedで1件ずつ。氏名は先頭docのdata.personから
        var ds=(d.docs||[]).map(function(x){ return { id:x.id, ym:x.ym, kind:x.kind, name:(x.data&&x.data.person&&x.data.person.name)||'', data:x.data, openedAt:x.openedAt||null }; });
        var nm=(ds[0]&&ds[0].name)||'';
        if(d.need_consent) return { needConsent:true, name:nm };
        return { name:nm, docs:ds };
      });
    }
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
    if(hasSupa){ cred=cred||{};
      return sb.rpc('set_meisai_consent', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, unauth:!!d.unauth };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false });
    if(!authPub(f.p, cred)) return Promise.resolve({ ok:false, unauth:true });
    if(!f.p.consentAt){ f.p.consentAt=new Date().toISOString(); mPubW(f.pubs); }
    return Promise.resolve({ ok:true, consentAt:f.p.consentAt });
  };
  // 会社: 初回コード再発行(＝旧パスワード/記憶を無効化・本人が再設定)。返り={ok,initCode}
  Store.reissueMeisaiInit = function(token){
    if(hasSupa){ var code=rndCode(); // 会社側=RLSで自分の行のみ。旧PW/端末記憶/同意/ロックを全リセット(別人が再設定→前任者の同意を引き継がない=電子交付要件)
      return sb.from('pay_meisai_pub').update({ init_code:code, pw_hash:null, device_tokens:[], consent_at:null, fail_count:0, locked_until:null }).eq('token', token).then(function(r){
        return { ok:!r.error, initCode:code };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false });
    f.p.initCode=rndCode(); f.p.pwHash=null; f.p.deviceTokens=[]; f.p.consentAt=null; mPubW(f.pubs); // ★同意もリセット=別人が再設定した時に前任者の同意を引き継がない(電子交付要件)
    return Promise.resolve({ ok:true, initCode:f.p.initCode });
  };
  // 従業員: 明細を開いた(その1件だけopenedAt記録)。cloud=RPC mark_meisai_opened(認証必須)。cred={deviceToken}|{password}
  Store.markMeisaiOpened = function(docId, token, cred){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('mark_meisai_opened', { p_token:token, p_id:docId, p_device:cred.deviceToken||null, p_pw:cred.password||null }).then(function(r){ return !!(r.data&&r.data.ok); });
    }
    var docs=mDoc(); var i=docs.findIndex(function(x){ return x.id===docId; });
    if(i>=0 && !docs[i].openedAt){ docs[i].openedAt=new Date().toISOString(); mDocW(docs); }
    return Promise.resolve(true);
  };

  // ── 年末調整 従業員セルフ申告(Web明細から本人が入力→会社が取り込む) ──
  //  本番=Supabase RPC(save_nencho_decl/get_nencho_decl・認証は明細と同じdevice/pw)。localStorage層は下のMNCH。
  //  declは lib/nencho-declaration.js の normalize済オブジェクト(サーバは中身を検証せず保管)。
  var MNCH_KEY='payslip_nencho_decl_v1';
  function mNch(){ try{ return JSON.parse(localStorage.getItem(MNCH_KEY)||'[]'); }catch(e){ return []; } }
  function mNchW(a){ try{ localStorage.setItem(MNCH_KEY, JSON.stringify(a)); }catch(e){} }
  // 従業員: 申告を保存(認証必須)。返り={ok} or {unauth}
  Store.saveNenchoDecl = function(token, cred, year, decl){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('save_nencho_decl', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null, p_year:year, p_decl:decl||{} }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, unauth:!!d.unauth, badYear:!!d.bad_year, locked:!!d.locked };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false, unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ ok:false, unauth:true });
    var now=new Date().toISOString(), all=mNch();
    var i=all.findIndex(function(x){ return x.token===token && x.year===year; });
    var row={ token:token, employeeId:f.p.employeeId, year:year, decl:decl||{}, submittedAt:(i>=0?all[i].submittedAt:now), updatedAt:now };
    if(i>=0) all[i]=row; else all.push(row); mNchW(all);
    return Promise.resolve({ ok:true });
  };
  // 従業員: 自分の申告を取得(前回の続き/確認)。返り={found,decl,submittedAt,updatedAt} or {unauth}
  Store.getNenchoDecl = function(token, cred, year){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('get_nencho_decl', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null, p_year:year }).then(function(r){
        var d=r.data||{}; if(d.unauth) return { unauth:true }; if(!d.found) return { found:false };
        return { found:true, decl:d.decl||{}, submittedAt:d.submittedAt, updatedAt:d.updatedAt };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ unauth:true });
    var row=mNch().filter(function(x){ return x.token===token && x.year===year; })[0];
    if(!row) return Promise.resolve({ found:false });
    return Promise.resolve({ found:true, decl:row.decl||{}, submittedAt:row.submittedAt, updatedAt:row.updatedAt });
  };
  // 会社: 提出済みの申告一覧(その年)。RLSで自分の発行分のみ。返り=[{employeeId,decl,submittedAt,updatedAt}]
  Store.listNenchoDecl = function(year){
    if(hasSupa){
      return fetchAllQ(function(a,b){ return sb.from('pay_nencho_decl').select('employee_id,decl,submitted_at,updated_at',{count:'exact'}).eq('year', year).range(a,b); }).then(function(r){
        return (r.data||[]).map(function(x){ return { employeeId:x.employee_id, decl:x.decl||{}, submittedAt:x.submitted_at, updatedAt:x.updated_at }; });
      });
    }
    return Promise.resolve(mNch().filter(function(x){ return x.year===year; }).map(function(x){ return { employeeId:x.employeeId, decl:x.decl||{}, submittedAt:x.submittedAt, updatedAt:x.updatedAt }; }));
  };

  // ── 従業員セルフ登録: 振込先(本人がWeb明細から登録→会社が従業員マスタへ取り込む) ──
  //  本番=Supabase RPC(save_emp_profile/get_emp_profile・認証は明細と同じ)。localStorage層は下のMPRF。
  var MPRF_KEY='payslip_emp_profile_v1';
  function mPrf(){ try{ return JSON.parse(localStorage.getItem(MPRF_KEY)||'[]'); }catch(e){ return []; } }
  function mPrfW(a){ try{ localStorage.setItem(MPRF_KEY, JSON.stringify(a)); }catch(e){} }
  // 従業員: 振込先を保存(認証必須)。返り={ok} or {unauth}
  Store.saveEmpProfile = function(token, cred, data){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('save_emp_profile', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null, p_data:data||{} }).then(function(r){
        var d=r.data||{}; return { ok:!!d.ok, unauth:!!d.unauth, locked:!!d.locked };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ ok:false, unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ ok:false, unauth:true });
    var now=new Date().toISOString(), all=mPrf();
    var i=all.findIndex(function(x){ return x.token===token; });
    var row={ token:token, employeeId:f.p.employeeId, data:data||{}, submittedAt:(i>=0?all[i].submittedAt:now), updatedAt:now };
    if(i>=0) all[i]=row; else all.push(row); mPrfW(all);
    return Promise.resolve({ ok:true });
  };
  // 従業員: 自分の登録を取得。返り={found,data,submittedAt,updatedAt} or {unauth}
  Store.getEmpProfile = function(token, cred){
    if(hasSupa){ cred=cred||{};
      return sb.rpc('get_emp_profile', { p_token:token, p_device:cred.deviceToken||null, p_pw:cred.password||null }).then(function(r){
        var d=r.data||{}; if(d.unauth) return { unauth:true }; if(!d.found) return { found:false };
        return { found:true, data:d.data||{}, submittedAt:d.submittedAt, updatedAt:d.updatedAt };
      });
    }
    var f=findPub(token); if(!f.p) return Promise.resolve({ unauth:true });
    if(!authPub(f.p, cred)) return Promise.resolve({ unauth:true });
    var row=mPrf().filter(function(x){ return x.token===token; })[0];
    if(!row) return Promise.resolve({ found:false });
    return Promise.resolve({ found:true, data:row.data||{}, submittedAt:row.submittedAt, updatedAt:row.updatedAt });
  };
  // 会社: 提出済みの振込先一覧。RLSで自分の発行分のみ。返り=[{employeeId,data,submittedAt,updatedAt}]
  Store.listEmpProfile = function(){
    if(hasSupa){
      return fetchAllQ(function(a,b){ return sb.from('pay_emp_profile').select('employee_id,data,submitted_at,updated_at',{count:'exact'}).range(a,b); }).then(function(r){
        return (r.data||[]).map(function(x){ return { employeeId:x.employee_id, data:x.data||{}, submittedAt:x.submitted_at, updatedAt:x.updated_at }; });
      });
    }
    return Promise.resolve(mPrf().map(function(x){ return { employeeId:x.employeeId, data:x.data||{}, submittedAt:x.submittedAt, updatedAt:x.updatedAt }; }));
  };

  // 中央の法定データ(statutory テーブル)を取得。全アプリ共通・anon読取可。localやDB無しは[]=libのハードコードで動く(フォールバック)。
  Store.getStatutory = function(){
    if(hasSupa){ return fetchAllQ(function(a,b){ return sb.from('statutory').select('kind,year,data',{count:'exact'}).range(a,b); }).then(function(r){ return r.data||[]; }).catch(function(){ return []; }); }
    return Promise.resolve([]);
  };

  global.Store = Store;
})(window);
