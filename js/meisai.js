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
  function ymLabel(ym, kind){ var y=(ym||'').slice(0,4), m=parseInt((ym||'').slice(5,7),10)||0; if(kind==='gensen') return '令和'+(y-2018)+'年 源泉徴収票'; return '令和'+(y-2018)+'年'+m+'月'+(kind==='bonus'?'（賞与）':'分'); }

  var token=(function(){ try{ return new URLSearchParams(location.search).get('t'); }catch(e){ return null; } })();
  // QR/リンクに初回コードを埋め込む(?c=)と、初回パスワード設定画面で自動入力=従業員はコード入力不要でパスワードを決めるだけ。
  var initFromUrl=(function(){ try{ return (new URLSearchParams(location.search).get('c')||'').trim(); }catch(e){ return ''; } })();
  var DEVKEY='meisai_dev_'+token;                 // この端末に記憶したdeviceToken
  var cred=null, docs=[];                          // 認証後の資格情報(deviceToken or password)

  if(!token){ show('sc-bad'); return; }

  // 起動: 端末記憶があれば認証スキップ
  var savedDev=(function(){ try{ return localStorage.getItem(DEVKEY)||null; }catch(e){ return null; } })();
  Store.meisaiAuth(token, savedDev).then(function(r){
    if(!r || !r.found){ show('sc-bad'); return; }
    if(r.remembered){ cred={ deviceToken:savedDev }; afterAuth(r.name); return; }   // 記憶済→パスワード省略
    if(!r.hasPassword){ show('sc-setup'); return; }                                  // 初回=パスワード設定(コードはリンクに内包・従業員は入力不要)
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

  // ① 初回パスワード設定(コードはリンク(?c=)に内包=従業員はパスワードを決めるだけ)
  $('setup-go').addEventListener('click', function(){
    var code=initFromUrl, pw=$('setup-pw').value||'', pw2=$('setup-pw2').value||'';
    $('setup-err').textContent='';
    if(!code){ $('setup-err').textContent='このリンクが正しくありません。会社から届いた最新のリンク（QR）をそのまま開いてください。'; return; }
    if(pw.length<8){ $('setup-err').textContent='パスワードは8文字以上にしてください。'; return; }
    if(pw!==pw2){ $('setup-err').textContent='パスワード(確認)が一致しません。'; return; }
    Store.meisaiSetPassword(token, code, pw).then(function(r){
      if(!r || !r.ok){ $('setup-err').textContent = (r&&r.locked)?'しばらくロックされています。時間をおいて再度お試しください。':(r&&r.weak)?'パスワードは8文字以上にしてください。':(r&&r.badInit)?'このリンクが正しくありません。会社から届いた最新のリンク（QR）をそのまま開いてください。':(r&&r.alreadySet)?'すでにパスワードが設定済みです。ログインしてください。':'設定できませんでした。'; if(r&&r.alreadySet)show('sc-login'); return; }
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
      var isGensen=(d.kind==='gensen');
      var sub=isGensen?'源泉徴収票':(d.kind==='bonus'?'賞与明細':'給与明細');
      var val=isGensen?'<span style="font-size:11px;color:#7aa08c">開いて確認</span>':yen(p.net);
      var row=document.createElement('div'); row.className='drow';
      row.innerHTML='<div><div class="dl">'+ymLabel(d.ym,d.kind)+(d.openedAt?'':'<span class="badge-new">未読</span>')+'</div><div class="ds">'+sub+'</div></div><div class="dv">'+val+'</div>';
      row.addEventListener('click', function(){ openDoc(i); });
      host.appendChild(row);
    });
  }

  // ⑤ 明細ビュー = 明細を原寸(794px)でiframe描画し、CSS transformで画面幅にフィット。
  //   ベクター描画なのでピンチズームで鮮明。iframeは確実に描画される(html2canvasの画像化はiOSで不安定なため不使用)。
  //   保存/印刷は代行請求書アプリと同じ「新窓に明細HTMLを書いて window.print」方式(A4いっぱいにくっきり)。
  var _isLand=false, _psHtml='', _psW=794, _psH=1123;
  function openDoc(i){
    var d=docs[i]; if(!d) return; var data=d.data||{};
    if(d.openedAt==null){ Store.markMeisaiOpened(d.id, token, cred).then(function(){ d.openedAt=new Date().toISOString(); }); }
    var pw=794, ph=1123, html; _isLand=false;
    try{
      if(d.kind==='gensen'){ html=data.gensenHtml||'<!doctype html><html><head><meta charset="UTF-8"></head><body><p style="padding:16px">源泉徴収票を表示できませんでした。</p></body></html>'; }
      else {
        var people=[data.person||{}], doc=data.doc||{month:ymLabel(d.ym,d.kind), kind:d.kind};
        // ★従業員の明細は常に1人=1人用・縦向き(hero)で全幅表示。会社の複数人テンプレ(例:col1_3=3人横)だと
        //   1人分が横幅の1/3しか埋めず両側が白(縮んで見える)ため、data.preferに関わらずcol2_1に固定。
        var out=window.Render.build(people, doc, 'col2_1', data.theme);
        html=out.html; if(out.orientation==='landscape'){ pw=1123; ph=794; _isLand=true; }
      }
    }catch(e){ return; }
    _psHtml=html;
    show('sc-view');
    renderPayslip(html, pw, ph);
    window.scrollTo(0,0);
  }
  // 原寸iframeに明細を描画→実際の高さを測り→画面幅にフィットするようtransform:scale。
  function renderPayslip(html, pw, ph){
    var f=$('frame'), load=$('ps-loading');
    _psW=pw; _psH=ph;
    if(load){ load.style.display=''; load.textContent='明細を読み込み中…'; }
    f.style.width=pw+'px'; f.style.height=ph+'px'; f.style.transform='none';
    f.onload=function(){
      setTimeout(function(){
        try{
          var idoc=f.contentDocument||f.contentWindow.document;
          var sheet=idoc.querySelector('.sheet,.page');
          var natH=Math.max(ph, sheet?sheet.scrollHeight:ph);
          _psH=natH; f.style.height=natH+'px';
          fitFrame();
          if(load){ load.style.display='none'; }
          // ★レイアウト確定のタイミングがiOSで遅れることがあるので複数回フィット(幅0で空振りした分を拾う)
          try{ requestAnimationFrame(fitFrame); }catch(e){}
          setTimeout(fitFrame, 250); setTimeout(fitFrame, 600);
        }catch(e){ fitFrame(); if(load){ load.style.display='none'; } }
      }, 120);
    };
    f.srcdoc=html;
  }
  // iframe(原寸_psW×_psH)を preview-wrap の内幅にフィットさせる。
  //   ★transformは「見た目」だけ縮小しレイアウトの箱は原寸のまま=横にはみ出て横スクロール+巨大余白になる。
  //     負マージンで箱ごと縮めて溢れを消す(本体アプリのfitPreviewと同方式・iOSで実績あり)。
  function fitFrame(){
    var f=$('frame'); if(!f) return;
    var wrap=f.parentNode; if(!wrap) return;
    var cw=wrap.clientWidth || Math.round(wrap.getBoundingClientRect().width) || document.documentElement.clientWidth;
    var avail=cw - 24; // padding 12+12
    if(avail<=0) return;
    var s=Math.min(1, avail/_psW);
    f.style.transformOrigin='top left';
    f.style.transform='scale('+s+')';
    f.style.marginRight=(-(_psW*(1-s)))+'px';   // レイアウト箱の幅を縮小分だけ詰める=横スクロール消滅
    f.style.marginBottom=(-(_psH*(1-s)))+'px';  // 高さも詰める=下の巨大余白消滅
    wrap.style.height='';                        // 折り畳んだiframeが高さを決める(明示height不要)
  }
  window.addEventListener('resize', function(){ var v=$('sc-view'); if(v && !v.classList.contains('hidden')) fitFrame(); });
  // ★レイアウト確定/画面回転で確実にフィットさせる(iOSはonload直後に幅が0のことがある対策)
  var _ro=null;
  try{ if(window.ResizeObserver){ _ro=new ResizeObserver(function(){ var v=$('sc-view'); if(v && !v.classList.contains('hidden')) fitFrame(); }); _ro.observe($('frame').parentNode); } }catch(e){}
  $('v-back').addEventListener('click', function(){ renderList(); show('sc-list'); });
  // PDFで保存 = ★jsPDFで自前生成(A4ぴったり1ページ・ブラウザのURL/日付フッター無し)。
  //   iOSのwebページ印刷(window.print)はURL/日付フッターが必ず付き、その余白ぶんで2ページ目(空白)が出るため不使用。
  //   明細をhtml2canvasで高精細(scale3=約288dpi)に焼き、A4 1枚に載せる→doc.save。iOSは標準PDFビューアで開く(戻れる)。
  $('v-pdf').addEventListener('click', function(){
    var load=$('ps-loading');
    var f=$('frame'), idoc=f&&(f.contentDocument||f.contentWindow.document);
    var target=idoc&&idoc.querySelector('.sheet,.page');
    if(!target || !(window.html2canvas) || !(window.jspdf&&window.jspdf.jsPDF)){ try{ window.print(); }catch(e){} return; } // 保険=ライブラリ未読込ならブラウザ印刷
    if(load){ load.style.display=''; load.textContent='PDFを作成中…'; }
    // ★A4寸法を固定で焼く(width/height両方指定)=iOSでも必ずA4比率のcanvasになる(縦潰れ防止)。
    var CW=_isLand?1123:794, CH=_isLand?794:1123;
    window.html2canvas(target, { scale:3, backgroundColor:'#ffffff', useCORS:true, width:CW, height:CH, windowWidth:CW, windowHeight:CH }).then(function(canvas){
      try{
        var jsPDF=window.jspdf.jsPDF;
        var pw=_isLand?842:595, ph=_isLand?595:842; // ★A4ページ(印刷がちゃんとA4になる)
        var doc=new jsPDF({ orientation:_isLand?'landscape':'portrait', unit:'pt', format:[pw,ph] });
        // ★A4ページのまま明細を横幅いっぱいに(比率維持=潰さない・左右余白ゼロ)。canvasがA4比より縦長でも
        //   幅いっぱいで載せ、はみ出た下端(明細の空白部分)はA4ページで自然に収まる=環境差でも常に幅いっぱい。
        var iw=canvas.width, ih=canvas.height;
        doc.addImage(canvas.toDataURL('image/jpeg',0.92), 'JPEG', 0, 0, pw, pw*ih/iw);
        // ★PDFの受け渡し=代行請求書アプリと同じ「blobを新しいタブで開く」方式。
        //   doc.save()(ダウンロード)はiOSで WebKitBlobResourceエラー が出るため不使用。ポップアップ不可時のみsaveにフォールバック。
        var url=URL.createObjectURL(doc.output('blob'));
        var w=window.open(url,'_blank');
        if(!w){ try{ doc.save('給与明細.pdf'); }catch(e){} }
        setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(e){} }, 60000);
        if(load){ load.style.display='none'; }
      }catch(e){ if(load){ load.textContent='PDFの作成に失敗しました。時間をおいて再度お試しください。'; setTimeout(function(){ if(load)load.style.display='none'; },2200); } }
    }).catch(function(){ if(load){ load.textContent='PDFの作成に失敗しました。時間をおいて再度お試しください。'; setTimeout(function(){ if(load)load.style.display='none'; },2200); } });
  });

  // ⑥ 年末調整 従業員セルフ申告(平易な質問→保存。会社が取り込む)
  // 年末調整の対象年: 通常11〜12月に実施。1〜3月に開くのは「前年分」の年調(会社は対象月=前年12月=前年で読む)なので前年に合わせる=年跨ぎでも会社側と一致
  var ND=window.NenchoDecl, _nd=new Date(), nenYear=(_nd.getMonth()<=2)?_nd.getFullYear()-1:_nd.getFullYear(), declState={};
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

  // ⑦ 従業員セルフ登録: 自分の情報(住所＋振込先)。住所は源泉徴収票に使います。
  // ★軽く★ 形式はラベルに（桁数・ハイフン・カナ）、例はplaceholderに。長い補足は先頭のleadに集約=各項目下の注記は置かない(スマホで濃くならない)。
  var PROFILE_FIELDS=[
    { k:'zip', label:'郵便番号（ハイフンあり）', ph:'150-0001' },
    { k:'address', label:'住所', ph:'東京都渋谷区〇〇1-2-3 〇〇マンション101' },
    { k:'furiBankName', label:'銀行名', ph:'みずほ銀行' },
    { k:'furiBankNo', label:'銀行コード（4桁）', ph:'0001', num:true, max:4 },
    { k:'furiBranchName', label:'支店名', ph:'本店' },
    { k:'furiBranchNo', label:'支店コード（3桁）', ph:'001', num:true, max:3 },
    { k:'furiYokin', label:'預金の種類', sel:['普通','当座','貯蓄'] },
    { k:'furiAccount', label:'口座番号（7桁）', ph:'1234567', num:true, max:7 },
    { k:'furiKana', label:'口座名義（半角カナ）', ph:'ﾔﾏﾀﾞ ﾊﾅｺ' }
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
