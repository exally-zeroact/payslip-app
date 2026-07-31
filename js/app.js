/* app.js — 給与明細アプリ（ミント4タブ / STEP2 従業員マスタ拡張） */
(function(){
  'use strict';
  var $=function(s,r){return (r||document).querySelector(s);};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
  /* -- 計算/警告エンジンへの委譲 --
   * 月次給与の計算は lib/payroll-monthly.js、黄警告は lib/payroll-warnings.js が唯一の真実源。
   * app.js に計算式は置かない(グリッド/チャット/CI が同じ物を呼べるようにするため)。
   * ctxOf() が state(対象月・会社設定・36協定履歴)をエンジンへ渡す唯一の橋。 */
  function PM(){ return (typeof PayrollMonthly!=='undefined')?PayrollMonthly:(typeof window!=='undefined'&&window.PayrollMonthly); }
  function PW(){ return (typeof PayrollWarnings!=='undefined')?PayrollWarnings:(typeof window!=='undefined'&&window.PayrollWarnings); }
  function ctxOf(){ return { company: state.company, month: state.month, otHist: state._otHist }; }
  var num=function(v){ return PM().num(v); }; // 数値化は lib/payroll-monthly.js へ移設(単一定義)
  var yen=function(n){return '¥'+Math.round(n).toLocaleString('ja-JP');};
  var fmtN=function(v){var n=num(v);return n?n.toLocaleString('ja-JP'):(v===0||v==='0'?'0':'');};
  function activeEmps(){ return state.employees.filter(function(e){return !e.retired;}); } // 稼働中(退職を除く)
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  var attr=function(s){return String(s==null?'':s).replace(/"/g,'&quot;');};
  var uid=function(){return 'e'+Math.abs(Date.now()%1e7).toString(36)+Math.floor(performance.now()).toString(36);};

  // Excelで使える色パレット(標準色+濃淡+定番)。アクセント/罫線/文字を別々に選ぶ
  var PALETTE=['#000000','#23261f','#404040','#595959','#808080','#A6A6A6','#BFBFBF','#D9D9D9','#E7E6E6','#F2F2F2',
    '#C00000','#FF0000','#E36C0A','#FFC000','#FFFF00','#92D050','#00B050','#00B0F0','#0070C0','#002060','#7030A0',
    '#6f5a3e','#b6a06d','#cfc9b8','#2f4858','#9bb2c2','#7a3b3b','#caa0a0','#1f4e3d','#3D9E72','#9ad9bb','#7f6000','#833c00','#203864'];
  // 既定テーマ(焦茶系・文字は濃いインク・罫線は淡グレー)
  var DEFAULT_THEME={accent:'#6f5a3e', line:'#cfc9b8', ink:'#23261f'};
  var COLOR_TARGETS=[['accent','アクセント色'],['line','罫線の色'],['ink','文字の色']];
  // 配色プリセット(明細全体の色を一括切替。個別微調整は下のピッカーで)
  var THEME_PRESETS=[
    {name:'クラシック紺', accent:'#2E4A6B', line:'#C8D2DE', ink:'#1a2733'},
    {name:'セピア',       accent:'#6f5a3e', line:'#cfc9b8', ink:'#23261f'},
    {name:'グレー',       accent:'#595959', line:'#D9D9D9', ink:'#23261f'},
    {name:'ミント',       accent:'#3D9E72', line:'#C8ECD8', ink:'#1a4a2e'},
    {name:'モノクロ',     accent:'#404040', line:'#BFBFBF', ink:'#000000'}
  ];
  var PAYTYPES=['月給','時給','日給','歩合','役員','カスタム'];
  function PR(){ return (typeof PayRule!=='undefined')?PayRule:(window&&window.PayRule); }
  // カスタム給の既定spec(固定 +「歩合 か 時給×時間 の高い方」)。payType=カスタムに切替時にlazy初期化。
  function defPayRule(){ return PM().defPayRule(); }
  // 保存/クラウドから読んだ従業員に既定値をマージ(会社と同じ防御)。旧保存で欠けた新項目をundefinedにしない=将来のクラッシュ防止(D2)。
  //  ネストも既定で埋める(warimashi/shaho)=浅いassignだけだと部分オブジェクトが残るため。
  function mergeEmp(x){ var e=Object.assign(defEmp(), x||{});
    if(!e.shortTimeType && x && x.shortTime===true) e.shortTimeType='part'; // 旧shortTime(真偽・UIは15日表示)→短時間就労者(パート・15日特例)へ移行
    var d=defEmp(); e.warimashi=Object.assign({}, d.warimashi, x&&x.warimashi); if(e.warimashi&&!e.warimashi.detail) e.warimashi.detail=d.warimashi.detail;
    e.shaho=Object.assign({}, d.shaho, x&&x.shaho); if(!Array.isArray(e.shaho.months)) e.shaho.months=d.shaho.months;
    if(!Array.isArray(e.kintai)) e.kintai=d.kintai; if(!Array.isArray(e.shikyu)) e.shikyu=d.shikyu; if(!Array.isArray(e.extraKojo)) e.extraKojo=[];
    return e; }
  function ensurePayRule(e){ return PM().ensurePayRule(e); }
  // 段階制の段(下限/率)を設定。key='i:idx:tidx:from|rate'。from=整数円 / rate=小数%許容。
  function prTierSet(e,key,val){ var p=String(key).split(':'); var part=ensurePayRule(e).variable.parts[+p[1]]; if(!part)return; if(!part.tiers)part.tiers=[]; var tr=part.tiers[+p[2]]; if(!tr){ tr={from:'',rate:''}; part.tiers[+p[2]]=tr; }
    if(p[3]==='rate'){ var v=String(val).replace(/[^0-9.]/g,''); var dot=v.indexOf('.'); if(dot>=0)v=v.slice(0,dot+1)+v.slice(dot+1).replace(/\./g,''); tr.rate=v; }
    else { tr.from=String(val).replace(/[^0-9]/g,''); } }
  function PPARSE(){ return (typeof PayParse!=='undefined')?PayParse:(window&&window.PayParse); }
  // 雑入力の解釈結果を従業員に反映(payType+base/hourly/payRule)
  function applyParse(e,r){ if(!r||!r.ok)return; if(r.payType) e.payType=r.payType; // payType=null=手当のみ反映(給与形態は据え置き)
    if(r.fields.hourly!=null) e.hourly=r.fields.hourly;
    if(r.fields.base!=null) e.base=r.fields.base;
    if(r.fields.payRule){ e.payRule=JSON.parse(JSON.stringify(r.fields.payRule)); }
    if(e.payType==='カスタム') ensurePayRule(e);
    // 手当の雑入力反映: 通勤はe.commute(syncで通勤手当行へ)・他はshikyuへupsert(同名は上書き)
    if(r.fields.commute!=null) e.commute=r.fields.commute;
    if(Array.isArray(r.fields.shikyu)){ if(!Array.isArray(e.shikyu))e.shikyu=[]; r.fields.shikyu.forEach(function(t){ var i=e.shikyu.findIndex(function(x){return (x.label||'')===t.label;}); if(i>=0) e.shikyu[i].value=t.value; else e.shikyu.push({label:t.label,value:t.value}); }); }
    syncBasePay(e); syncCommute(e);
  }
  // 解釈の「数字例つき確認」テキスト。例の当月値でbasePayを計算して見せる=人が誤読を捕まえる(silent-wrong防止)
  function parseExampleText(r){
    var pr=PR(); if(!pr) return '';
    if(r.payType==='時給') return '例：160時間なら 基本給 '+yen(Math.round(num(r.fields.hourly)*160))+'（時給×時間）';
    if(r.payType==='日給') return '例：20日出勤なら 基本給 '+yen(num(r.fields.base)*20)+'（日給×日数）';
    if(r.payType==='月給') return '基本給（固定）'+yen(num(r.fields.base));
    if(r.payType==='カスタム'&&r.fields.payRule){
      var ctx={ workMin:9600, workDays:20, sales:1000000, count:100, commission:200000 };
      var res=pr.basePay(r.fields.payRule, ctx);
      var used=[]; var pts=(r.fields.payRule.variable&&r.fields.payRule.variable.parts)||[];
      if(pts.some(function(p){return p.type==='hourly';})) used.push('160時間');
      if(pts.some(function(p){return p.type==='daily';})) used.push('20日');
      if(pts.some(function(p){return p.type==='rate'||p.type==='tiered';})) used.push('売上100万');
      if(pts.some(function(p){return p.type==='piece';})) used.push('件数100');
      if(pts.some(function(p){return p.type==='commission';})) used.push('歩合20万');
      return '例：'+(used.join('・')||'当月値')+'なら 基本給 '+yen(res.base)+(res.chosen?'（採用：'+res.chosen.label+' '+yen(res.chosen.value)+'）':'');
    }
    return '';
  }
  // ── 給与パターン(テンプレ): 給料の「決め方＋既定の支給/控除項目」を名前付きで保存→他の従業員に適用 ──
  //  ★人ごとの値(氏名/生年月日/扶養/都道府県/通勤/歩合額/売上等)は含めない=給与"構造"だけをテンプレ化★
  // ★B6: base/hourly(＝個人ごとの給与額)はパターンに含めない=適用しても各人の給与額は変わらない(「人ごとの値は不変」の原則・適用ダイアログの文言と一致)。payType/決め方/保障給率/所定/項目 の"構造"だけをテンプレ化。
  var PAY_PATTERN_FIELDS=['payType','hourlyGuarantee','annualHolidays','dailyWorkH','dailyWorkM','minashiH'];
  function makePayPattern(e,name){
    var p={ id:uid(), name:(name||'パターン'), pay:{} };
    PAY_PATTERN_FIELDS.forEach(function(k){ p.pay[k]=e[k]; });
    p.pay.payRule = e.payRule?JSON.parse(JSON.stringify(e.payRule)):null;
    p.pay.shikyuTpl=(e.shikyu||[]).filter(function(x){return !/基本給/.test(x.label||'');}).map(function(x){return x.label;}); // 基本給(自動)除く支給ラベル
    p.pay.kojoTpl=(e.extraKojo||[]).map(function(x){return x.label;});
    p.pay.wbInclude=(e.wbInclude||[]).slice(); p.pay.wbExclude=(e.wbExclude||[]).slice();
    return p;
  }
  function applyPayPattern(e,p){
    if(!p||!p.pay)return; var pay=p.pay;
    PAY_PATTERN_FIELDS.forEach(function(k){ if(k in pay) e[k]=pay[k]; });
    e.payRule = pay.payRule?JSON.parse(JSON.stringify(pay.payRule)):e.payRule;
    var base=(e.shikyu||[]).filter(function(x){return /基本給/.test(x.label||'');}); // 既存の基本給(自動)は保持
    e.shikyu=base.concat((pay.shikyuTpl||[]).map(function(lab){return {label:lab,value:'0'};}));
    e.extraKojo=(pay.kojoTpl||[]).map(function(lab){return {label:lab,value:'0'};});
    e.wbInclude=(pay.wbInclude||[]).slice(); e.wbExclude=(pay.wbExclude||[]).slice();
    syncBasePay(e);
  }
  // spec+当月コンテキストで基本給を評価(PayRule)。ctx=労働時間/出勤日数/売上。
  //  ★K4: 台帳(pay_ledger)を取り込んだ月は e._ledgerCtx(台帳集計)を使う=二度手間ゼロ・単一ソース(§5-2)。
  //     _ledgerCtx は `_`始まりなので保存されず、取り込みの度に台帳から再導出される。
  function payRuleCtx(e){ return PM().payRuleCtx(e); }
  function payRuleResult(e){ return PM().payRuleResult(e); }
  // ★K4: 台帳(pay_ledger)行を従業員ごとに単一ソース集計→各従業員に _ledgerCtx を載せる純関数(テスト対象)。
  //  rows=[{employee_id,ymd,data}](Store.getLedgerの返り)。単一ソース(§5-2)=同じ(emp,ymd)は台帳のみ・dailyEntriesは台帳に無い日だけ補完。
  //  返り: { applied:[名前...], matched, unmatched:[台帳にあるがKyuallyに居ないemployee_id...] }
  function applyLedgerToEmployees(employees, rows){
    var LA=(typeof LedgerAgg!=='undefined')?LedgerAgg:(window&&window.LedgerAgg); if(!LA) return { applied:[], matched:0, unmatched:[] };
    (employees||[]).forEach(function(e){ if(e){ delete e._ledgerCtx; delete e._ledgerHikazei; } }); // 前回取り込みの残りを一旦消す(台帳から外れた人にstale ctxを残さない)
    var byEmp={}; (rows||[]).forEach(function(r){ if(r&&r.employee_id) (byEmp[r.employee_id]=byEmp[r.employee_id]||[]).push(r); });
    var empById={}; (employees||[]).forEach(function(e){ if(e&&e.id) empById[e.id]=e; });
    var applied=[], unmatched=[];
    Object.keys(byEmp).forEach(function(eid){
      var e=empById[eid]; if(!e){ unmatched.push(eid); return; }
      var dailyRows=(e.dailyEntries||[]).filter(function(d){return d&&d.ymd;}).map(function(d){
        return { ymd:d.ymd, data:{ minutes:hmToMin(d.hm), amount:num(d.amount), count:num(d.count), hikazei:!!d.hikazei } };
      });
      var agg=LA.unifyEmployee(byEmp[eid], dailyRows); // 台帳=正・同日はdailyを捨てる(倍計上防止)
      e._ledgerCtx=agg.ctx; e._ledgerHikazei=agg.hikazeiAmount;
      applied.push(e.name||eid);
    });
    return { applied:applied, matched:applied.length, unmatched:unmatched };
  }
  // state.month('YYYY-MM')の月初〜月末(YYYY-MM-DD)。
  function monthYmdRange(ym){ var s=String(ym||''); var y=parseInt(s.slice(0,4),10), m=parseInt(s.slice(5,7),10); if(!y||!m) return null;
    var last=new Date(y, m, 0).getDate(); var mm=('0'+m).slice(-2); return { from:s.slice(0,7)+'-01', to:s.slice(0,7)+'-'+('0'+last).slice(-2) }; }
  // ★台帳を当月ぶん読んで取り込む(二度手間ゼロ)。切れ検知(§1)=合計を出さず中止。
  function importLedgerForMonth(){
    if(!window.Store||!Store.getLedger){ uiAlert('クラウド未接続のため台帳を読めません。'); return Promise.resolve({ok:false,reason:'no-store'}); }
    var rng=monthYmdRange(state.month); if(!rng){ uiAlert('対象月が不正です。'); return Promise.resolve({ok:false,reason:'bad-month'}); }
    return Store.getLedger(rng.from, rng.to).then(function(res){
      if(res&&res.error){ uiAlert('台帳の読み込みに失敗しました：'+res.error); return {ok:false,reason:'error'}; }
      if(res&&res.truncated){ uiAlert('台帳の件数が多く、全部を読み切れませんでした（'+res.count+'件中'+res.rows.length+'件）。期間を短く分けて取り込んでください。合計がずれるため取り込みを中止しました。'); return {ok:false,reason:'truncated'}; }
      var r=applyLedgerToEmployees(state.employees, (res&&res.rows)||[]);
      renderInput(); if(typeof doPreview==='function') doPreview();
      if(window.persistSaveDebounced) persistSaveDebounced();
      var msg=r.matched?('台帳から'+r.matched+'人ぶんを取り込みました（'+state.month+'）。'):'当月の台帳データはありませんでした。';
      if(r.unmatched&&r.unmatched.length) msg+='\n※ 台帳にあるがこのアプリに未登録の人が'+r.unmatched.length+'人います（従業員登録が必要です）。';
      uiAlert(msg);
      return {ok:true, matched:r.matched, unmatched:r.unmatched};
    }).catch(function(e){ uiAlert('台帳の取り込み中にエラー：'+((e&&e.message)||e)); return {ok:false,reason:'exception'}; });
  }
  // 就業状況。産休/育休=社保免除(自動off・上書き可)、介護休/病休=社保継続、休業=会社都合(休業手当)
  var WORK_STATUS=[['normal','通常'],['sankyu','産休'],['ikukyu','育休'],['kaigokyu','介護休'],['byoukyu','病気休職'],['kyugyo','休業(会社都合)']];
  var WS_LABEL=function(k){ var f=WORK_STATUS.find(function(x){return x[0]===k;}); return f?f[1]:'通常'; };
  var HELP={
    migrate:{ t:'💡 他ソフトから移行（一括）', b:'今お使いの給与ソフト（freee・マネーフォワード・弥生・ジョブカン・給料王など）や自作Excelから出した<b>CSV/Excelを1ファイル投げるだけ</b>で、<b>全従業員をまとめて</b>取り込みます（人数ぶんの手作業は不要）。\n\n● 取り込む列は<b>見出しで自動判定</b>（表記ゆれOK）：氏名／従業員番号／生年月日／基本給／各手当／通勤／扶養／時給／都道府県／住民税。\n● 「先月の総支給・差引・各控除」の列があれば、<b>先月分を再現して「1円まで合うか」突合</b>し、確認してから移行できます。\n● 取り込む前に<b>どの列を何として読むか</b>を確認・訂正できます（勝手に埋めません。読めない項目は空欄＝要入力）。\n\n※CSVはExcel(Shift-JIS)・UTF-8を自動判別。写真/PDFの読み取りは少人数向けの別機能です。' },
    kintaicsv:{ t:'💡 勤怠CSV取込', b:'他社の勤怠システム（KING OF TIME・ジョブカン勤怠など）や自作Excelから出した<b>勤怠CSV</b>を取り込んで、当月の入力に反映します。<b>打刻機能は持ちません</b>（集計済みCSVを流し込むだけ）。\n\n● 取り込む列（見出しで自動判定・表記ゆれOK）：氏名／出勤日数／欠勤／有給／労働時間／残業／深夜／休日。\n● 氏名で従業員に自動照合（「従業員番号」列があればそれを優先）。一致しない人は反映されず一覧で表示します。\n● 労働/残業/深夜/休日の時間は「160:30」「160.5」「160」どれでもOK。\n● 反映後も各自 手修正できます（上書きされるのは取り込んだ項目だけ）。\n\n※CSVはExcel(Shift-JIS)・UTF-8どちらも自動判別します。' },
    furidata:{ t:'💡 総合振込データ（全銀ファイル）', b:'給与を銀行の<b>「総合振込」</b>でまとめて振り込むためのデータです。\n\n● <b>全銀ファイル</b>＝銀行のインターネットバンキング等に取り込む固定長データ（全銀協規定形式・Shift-JIS）。手入力の振込を無くせます。\n● <b>振込一覧Excel</b>＝銀行のWeb画面に手で入れる場合や、確認用の一覧。\n\n【必要な準備】\n① 各従業員の<b>設定 ▸ 従業員マスタ ▸ 総合振込データ用</b>に、銀行コード(4桁)・支店コード(3桁)・科目・口座番号(7桁)・受取人名(半角ｶﾅ)を入力。\n② ここの<b>委託者情報</b>（委託者コード・自社の銀行/支店/口座）を入力。値は取引銀行から通知されます。\n\n※振込金額＝各人の<b>差引支給額（手取り）</b>。振込先が未入力の人は全銀ファイルから除外されます（一覧Excelには載ります）。' },
    bonusPrev:{ t:'💡 賞与の所得税と「前月の給与（社保後）」', b:'賞与（ボーナス）の所得税は、月給とは別の<b>「賞与に対する源泉徴収税額の算出率の表」</b>で決まります。\n\n● 使う数字＝<b>前月の給与から社会保険料（健保・厚年・雇用・介護）を引いた後の金額</b>と<b>扶養人数</b>。\n● この2つで「税率（％）」が決まり、賞与額（社保を引いた後）にかけて所得税を出します。\n● 前月の給与をこのアプリで計算・保存していれば<b>自動</b>で入ります。無ければ手入力してください（給与明細の「差引」ではなく、社会保険料を引いた額）。\n\n【特例＝手計算になる場合】\n● 前月に給与が無い、または\n● 賞与（社保後）が前月給与（社保後）の<b>10倍を超える</b>とき\n→ この表が使えず、<b>月額表</b>で計算します（税額が変わるため手計算が必要）。' },
    fuyou:{ t:'💡 扶養人数とは？（配偶者含む）', b:'所得税の計算に使う「扶養親族等の数」です。次の合計人数を入れます。\n\n● <b>源泉控除対象配偶者</b>：1人と数える\n　＝あなたが扶養している配偶者で、配偶者の年収が約150万円以下が目安。\n● <b>控除対象扶養親族</b>：16歳以上で扶養している家族（子・親など）の人数。\n\n※年齢はその年の<b>12月31日時点</b>で判定。<b>16歳未満は数えません（0人）</b>。\n※共働きで配偶者に十分な収入がある場合、配偶者は0。\n\n例）専業主婦の妻＋高校生1人＋5歳の子 → <b>2</b>（妻1＋高校生1。5歳は16歳未満で0）' },
    shaho:{ t:'💡 社会保険（標準報酬月額）とは？', b:'毎月の健康保険・厚生年金・介護は「標準報酬月額」という<b>基準額×料率</b>で決まり、<b>原則1年は固定</b>（残業が多い月でも変わりません）。決め方は4つ：\n\n● <b>毎年の見直し(定時決定)</b>…毎年4〜6月の総支給の平均で決定（支払基礎日数17日以上の月で平均）。9月分〜翌8月分に適用。\n● <b>入社したばかり(資格取得)</b>…実績が無いので入社時の見込み月額で決定。\n● <b>給料が変わった(随時改定)</b>…固定給が変わり3か月平均で2等級以上動いたら途中改定。\n● <b>金額が分かる(直接入力)</b>…決定通知書・額表の額をそのまま。\n\n※支払基礎日数＝給料を払った対象日数。月給は原則その月の暦日数。17日未満の月は平均から外します。' },
    warimashi:{ t:'💡 割増賃金（残業・深夜・休日）', b:'残業などの<b>時間を入れるだけ</b>で、率は法令から自動で計算します。\n\n● 残業（時間外）…<b>1.25倍</b>／月60時間を超えた分は<b>1.5倍</b>\n● 深夜（夜22時〜朝5時）…<b>+0.25</b>（残業中の深夜は合計1.5倍）\n● 法定休日の出勤…<b>1.35倍</b>\n\n1時間あたりの単価は「割増の基礎（基本給＋一律の手当）÷ 1か月平均所定労働時間」で自動算出。時間は<b>「時間」「分」で1分単位</b>、空欄は0です。端数は基発150号どおり処理します。' },
    shoteibase:{ t:'💡 割増の単価のもと', b:'残業代などの「1時間あたり単価」を出すための情報です。\n\n● <b>年間所定休日</b>…会社が決めた1年の休みの日数（例：120日）\n● <b>1日の所定労働</b>…1日の決められた労働時間（例：8時間）\n\n1か月平均所定労働時間 ＝ (365−年間所定休日)×1日所定 ÷ 12。\nこれで単価＝割増基礎÷この時間。法律(施行規則19条)どおりの出し方です。' },
    kaisharule:{ t:'💡 会社の決まり', b:'残業代などの計算に使う会社のルールです。使う項目だけ表示し、いらない項目はタップで外せます（会社ごとに自由）。<b>設定したものだけを計算</b>します。深夜帯など法律で決まっている所は固定です。' },
    teikyu:{ t:'💡 休みの日（法定休日）', b:'お店・会社の休みの曜日です。複数えらべます。\n\n● <b>法定休日</b>…法律で「週1日（または4週4日）」与える義務のある休み。出勤すると<b>1.35倍</b>。\n● <b>法定外の休み（所定休日）</b>…それ以外の休み（週休2日の2日目など）。出勤しても割増は週40時間を超えた分の<b>時間外1.25倍</b>だけ。\n\n複数選んだ場合、法律上の休み(法定休日)はアプリが自動で1日特定します（通常は後ろの曜日）。日曜だけ＝週休1日（現場系）もOK。' },
    shotei:{ t:'💡 1日の働く時間（所定労働）', b:'1日の決められた労働時間（例：8時間）。休憩は含みません。\n残業代の1時間単価（月給÷1か月平均所定労働時間）の計算に使います。' },
    annual:{ t:'💡 年間の休み', b:'1年間の休日数（例：120日）。\nフルタイム(1日8時間)だと法律の目安は約105日以上。少ないと「年間の労働時間が法律の目安を超える」と黄色で教えますが、残業として割増計算すれば<b>保存も計算もできます</b>（ブロックしません）。' },
    design:{ t:'💡 明細のデザイン', b:'給与明細の見た目を決めます（ここが毎月の既定）。\n\n● <b>レイアウト</b>…縦1人（1人1枚）／2カラム（1枚に2人）／横ストリップ（横向きに数人）。人数が多くても<b>自動で複数ページに分けて全員</b>出ます。\n● <b>色</b>…アクセント・罫線・文字を別々に。Excelで使える色から選べます。\n● <b>初期設定に戻す</b>…レイアウトと色を最初の状態に戻します。\n\n印刷タブで「その回だけ」変えることもできます。' },
    workstatus:{ t:'💡 就業状況（産休・育休・休職など）', b:'休んでいる人の区分です。給与計算に自動で反映します（すべて手で調整できます）。\n\n● <b>産休・育休</b>…社会保険（健保・厚年・介護）が<b>免除</b>＝自動で0に。給与は無給が一般的（入力で調整）。出産手当金・育児休業給付金は健保/雇用保険から出るお金で<b>給与には含めません</b>。\n● <b>介護休・病気休職</b>…社会保険は<b>継続</b>（無給でも本人負担が出ます）。介護休業給付金・傷病手当金は別途（給与でない）。\n● <b>休業（会社都合）</b>…<b>休業手当＝平均賃金の60%以上</b>を支給に入れます（課税・社保の対象）。\n\n※自動の社保オフは「法定控除」のチップで個別に戻せます。' },
    houshu:{ t:'💡 源泉区分（報酬・料金の源泉徴収／所得税法204条）', b:'業務委託でも、<b>所得税法204条の掲載報酬</b>を払う場合は源泉徴収が必要です（区分ごとに計算式が違います）。\n\n● <b>非該当（運転代行・運送・軽貨物 等）</b>…源泉なし・支払調書なし（既定）。<b>全部の業務委託に源泉は掛けません。</b>\n● <b>一般・士業（原稿料/講演/デザイン/弁護士/税理士 等）</b>…支払額×10.21%（1回100万円超の部分は20.42%）。\n● <b>司法書士等</b>…（支払額−1万円）×10.21%。\n● <b>外交員等</b>…（その月の報酬−12万円※同月の給与控除後）×10.21%。\n● <b>その他（要確認）</b>…区分が曖昧なら非該当扱い（源泉なし）にして、当たる場合のみ具体区分を選択。\n\n税額は復興特別所得税込み（×1.021）・1円未満切り捨て。対象額は原則<b>税込</b>。支払調書は同一人・年間で 士業/原稿料 5万円超・外交員等 50万円超 で提出（翌年1/31）。<b>最終判断は会社</b>（アプリは目安・ブロックしません）。' },
    emptype:{ t:'💡 雇用形態（従業員／業務委託）', b:'給与計算の大枠を決めます。\n\n● <b>従業員（正社員/パート）</b>…労働者。社会保険・源泉徴収・住民税・年末調整あり（従来どおり）。\n● <b>業務委託（個人事業主）</b>…外注先への<b>報酬</b>。<b>控除なしの報酬明細</b>（源泉・社保・住民税・年末調整なし＝支給＝支払額）。運転代行・運送などの外注はこちら。\n\n【源泉徴収】業務委託でも源泉が要るのは原稿料・デザイン・士業・モデル・ホステス等の<b>限定8区分だけ</b>。運転・運送は対象外＝源泉しません（国税庁No.2792）。\n\n【偽装請負に注意】契約が業務委託でも、<b>実態が労働者</b>なら社会保険・労働法の対象になり得ます（総合判断）。当てはまる要素が多いと「従業員の可能性」を黄色でお知らせします（ブロックはしません・最終判断は会社で）。' },
    taxclass:{ t:'💡 所得税の区分（甲・乙・丙）', b:'所得税の源泉徴収の区分です。\n\n● <b>甲欄</b>…「扶養控除等申告書」を提出している人（＝メインの勤務先）。扶養を加味して計算。通常はこちら。\n● <b>乙欄</b>…申告書を未提出の人（副業・掛け持ちの2か所目など）。税率が高め・扶養は加味しません。\n● <b>丙欄</b>…<b>日雇い</b>（日々雇い入れられる人・継続2か月以内）。日額表 丙欄×出勤日数で計算。2か月を超えたら甲/乙へ。\n\n年分（令和7/令和8）は給与の対象月から自動で正しい税額表を選びます。' },
    shahoTiming:{ t:'💡 社会保険料の当月／翌月徴収', b:'社会保険料（健保・厚年・介護）を<b>いつの給与から天引きするか</b>です。\n\n● <b>翌月徴収</b>（法律の原則・健保167条/厚年84条）…前月分の保険料を当月の給与から控除。<b>入社した月は天引きなし</b>（翌月から）、<b>月末退職の月は2か月分</b>（前月＋当月）を最終給与から控除。\n● <b>当月徴収</b>…当月分をその月の給与から控除（会社の慣行）。\n\n※このアプリの既定は<b>当月</b>（今までの計算と同じ）。翌月に切り替えると入社月・退職月の天引きが上記のとおり変わります。雇用保険はどちらも実支払額×率です。' },
    webmeisai:{ t:'💡 Web明細（従業員へ配布）', b:'給与明細を<b>従業員のスマホ/PCで閲覧</b>できるように公開します。\n\n● 「Web明細で公開」を押すと、対象月の在籍者ぶんの明細が公開され、<b>従業員ごとのリンク＋初回コード</b>ができます。\n● 従業員に<b>リンクと初回コード</b>を渡してください（LINE/メール/手渡しでOK）。従業員はリンクを開き、初回だけ<b>初回コードで自分のパスワードを設定</b>→<b>電子交付に同意</b>すると明細を見られます（所得税法の要件）。\n● 次回からは<b>パスワードだけ（その端末では省略）</b>。パスワードを忘れた/漏れたら「初回コード再発行」で再設定できます。\n● 誰が見たか（未読/開封）を一覧で確認できます。\n\n※本番運用はクラウド保存が必要です（同意するまで明細は表示されません）。' },
    commute:{ t:'💡 通勤手当（非課税）', b:'通勤手当は一定額まで所得税が<b>非課税</b>です。\n\n● <b>公共交通（電車・バス）</b>…月15万円まで非課税。\n● <b>マイカー等</b>…片道距離で月額が決まる（2km未満は全額課税〜95km以上66,400円・国税庁No.2585 令和8年4月〜）。\n\n限度を超えた分は課税されます。※所得税の非課税であって、社会保険・雇用保険では全額が算定基礎に入ります。' },
    legalkojo:{ t:'💡 法定控除（健保・厚年・雇用・所得税・住民税）', b:'給料から天引きする法律上の控除です。原則はかかりますが、<b>使わないものは外せます</b>（タップでオフ）。\n\n● 役員（労働者でない）→ <b>雇用保険は対象外</b>＝外す\n● 社会保険に未加入のパート → 健保・厚年を外す\n● 乙欄/別途納付など → 所得税を外す\n\n外すとその控除は計算しません（課税のもとからも引きません）。最終判断は会社で。' },
    warimashiBasis:{ t:'💡 割増の「基礎」に入れる手当', b:'残業代の単価を計算する“もとの賃金”です。手当の<b>名前でなく実態</b>で決めます（労基法37条5項・規則21条）。\n\n<b>外せる手当（限定列挙の7種）</b>…家族・通勤・別居・子女教育・住宅・臨時・1か月超ごとの手当。ただし<b>実態が伴う場合だけ</b>。\n● 例：住宅手当が「全員に一律定額」→ 住宅費用に応じていない＝<b>基礎に入れる</b>。\n● 例：通勤手当・扶養人数で変わる家族手当→ <b>外せる</b>。\n\n上記以外の手当は原則すべて基礎に入ります。タップで含む/外すを切替えできます。' },
    koyoGyoshu:{ t:'💡 雇用保険の業種', b:'業種で雇用保険の料率が変わります。\n\n● 一般の事業／建設・農林水産・清酒製造（高め）。\n● 雇用保険は<b>通勤手当も含む賃金総額</b>に料率を掛けます。\n● <b>料率は対象月の年度で自動</b>（令和8は引下げ：一般0.50%・建設/農林0.60%）。' },
    paymentDays:{ t:'💡 支払基礎日数の数え方', b:'社会保険の<b>定時決定（毎年4〜6月）</b>で「支払基礎日数17日以上の月」を平均して標準報酬を決めます。その日数の数え方です。\n\n● 年金機構の一般扱い＝<b>月給は暦日数／日給・時給は出勤日数</b>。\n● 会社の運用に合わせて変更できます（暦日数／所定労働日数／出勤日数）。' },
    kekkin:{ t:'💡 欠勤控除の計算', b:'月給は<b>日給月給制（欠勤分を控除）が標準</b>です（民法624条 ノーワーク・ノーペイ）。\n\n● 10日欠勤すれば10日分減ります。1日あたり＝<b>月給÷分母×欠勤日数</b>。\n● 分母＝月平均所定労働日数（既定）／当月の暦日数／当月の所定労働日数 から選べます。\n● 役員等で減額しない場合のみ「<b>完全月給制</b>」に。\n● 時給・日給は元々 日数・時間で按分されます。' },
    daikyu:{ t:'💡 代休・振替休日の使い分け', b:'<b>振替休日</b>＝事前に休日と労働日を入れ替え。その出勤は<b>通常労働（割増なし）</b>。割増の「法定休日」に入れず、ふつうの労働時間に入れてください（週40時間を超えた分だけ時間外1.25倍）。\n\n<b>代休</b>＝先に休日労働→後で別の日に休む。休日労働は<b>割増あり</b>（法定休日1.35倍／所定休日は時間外1.25倍）。休む日は入力の「代休取得」へ。\n\n代休で休む日を無給にするか（日給制向け）有給にするか（月給は相殺）は会社規程によります。「代休で休んだ日を出勤から差し引く」をオンにすると出勤から控除します。' },
    saiteigengaku:{ t:'💡 最低賃金の減額の特例', b:'一定の労働者は、<b>都道府県労働局長の許可</b>があれば最低賃金を一定率まで<b>減額</b>できます（最賃法7条）。\n\n<b>対象（5区分）</b>\n● 精神・身体の障害により著しく労働能力の低い方\n● 試用期間中の方\n● 認定職業訓練を受けている方（基礎的な技能習得中）\n● 軽易な業務に従事する方\n● 断続的労働に従事する方\n\n<b>使い方</b>…<b>許可を受けている場合だけ</b>、許可された<b>減額率（％）</b>を入れます。判定は「最低賃金×（1−率）」（円未満切上げ・労働者有利）で行います。\n\n※許可が無い場合は空欄（0）のまま。率は会社が勝手に決めるものではなく、労働局長の審査で決まります。' },
    juminzei:{ t:'💡 住民税（市区町村の税金）', b:'住民税は前年の所得に応じて<b>市区町村が金額を決める</b>税金です。自分で計算する必要はありません。\n\n● 毎年5〜6月ごろ、市区町村から会社へ<b>「特別徴収税額の決定通知書」</b>が届きます。その<b>月額をそのまま入力</b>します（6月〜翌5月の12か月分・端数は6月に寄せます）。\n● <b>特別徴収</b>＝会社が給与から天引きして納める（原則こちら）。\n● <b>普通徴収</b>＝本人が自分で納める。\n\n※入社直後や設立直後で通知書がまだ無いときは<b>0円のままでOK</b>（通知が来たら入れます）。「年額から自動」を選ぶと年額を12分割した概算を出しますが、正は通知書の額です。' },
    chingindaicho:{ t:'💡 賃金台帳とは？', b:'賃金台帳は、従業員ごとに毎月の<b>労働時間・支給・控除</b>を記録する帳簿で、<b>労働基準法108条</b>で作成・保存が義務づけられています（賃金台帳・出勤簿・労働者名簿で「法定三帳簿」）。\n\n● 各月を入力タブで<b>「今月を確定」</b>すると、その月がこの台帳に自動で入ります。\n● Excelで出力して保存・提出できます。\n\n※未確定（下書き）の月は台帳に載りません。確定した月だけが記録されます。' },
    santeikiso:{ t:'💡 算定基礎届とは？', b:'算定基礎届は、毎年<b>7月10日まで</b>に日本年金機構へ出す届で、<b>4〜6月の給与</b>から社会保険の「標準報酬月額」（保険料計算のものさし）を決め直すものです（その年9月〜翌8月に適用）。\n\nこの一覧は、その届出や<b>納付額の確認の“素”</b>として使えます（正式な届出書そのものの作成はしません）。' },
    genzenbo:{ t:'💡 源泉徴収簿とは？', b:'源泉徴収簿は、従業員ごとに1年間の<b>給与・賞与・源泉徴収した所得税</b>をまとめた帳簿で、<b>年末調整の計算の土台</b>になります。\n\nこのアプリでは、<b>確定した月次・賞与</b>から自動で集計してExcel出力できます（各人の年収・源泉税・社会保険料が並びます）。' },
    hyojunbonus:{ t:'💡 標準賞与額とは？', b:'標準賞与額は、<b>賞与の社会保険料を計算するための金額</b>です。賞与額（税引き前）から<b>1,000円未満を切り捨て</b>た額を使います。\n\n保険料がかかる上限：\n● 健康保険＝<b>年度累計573万円</b>まで\n● 厚生年金＝<b>1回あたり150万円</b>まで\n\n※所得税のほうは別の「算出率の表」で、前月給与と扶養人数から率が決まります。' },
    toukyu:{ t:'💡 等級（標準報酬の等級）', b:'等級は、社会保険の<b>「標準報酬月額」が保険料額表の何段目か</b>を表す番号です。報酬が上がると等級も上がります（健康保険は50等級・厚生年金は32等級）。\n\n<b>随時改定（月額変更届）</b>では、固定給が変わってから3か月の平均が、<b>従前と2等級以上ちがう</b>と届出が必要かを判断します。差が1等級以内なら対象外です。' },
    shimebi:{ t:'💡 締め日・支給日', b:'給与の対象期間と支払日を決めます（会社の給与規程どおりに）。\n\n● <b>締め日</b>＝計算の対象期間の区切り（例：<b>末日締め</b>＝その月の1日〜末日ぶんを計算）。\n● <b>支給日</b>＝その給与を実際に払う日（例：<b>翌月25日</b>＝当月ぶんを翌月25日に支払う）。\n\n「当月／翌月」＋「◯日」で、対象月からいつ払うかを指定します。※この設定は明細の表示と社保の当月／翌月徴収の目安に使い、税額そのものは変わりません。' },
    shime:{ t:'💡 締め方（期間で分ける）', b:'1か月を<b>期間で分けて、期間ごとに報酬明細</b>を出せます（代行の 1〜10／11〜20／21〜末＝月3回 など）。\n\n● <b>月まとめ</b>…従来どおり月1枚。\n● <b>半月</b>…1〜15／16〜末の2期間。\n● <b>10日締め</b>…1〜10／11〜20／21〜末の3期間（月3回）。\n● <b>任意N日</b>…N日ごとに区切ります。\n\n入力タブで<b>日付・金額</b>を入れると、締め方に合わせて期間ごとの明細に自動で振り分きます。\n\n【業務委託】控除なしの報酬明細がそのまま期間ごとに出ます。\n【従業員】社会保険・所得税は<b>月額でまとめて</b>計算するため、期間明細は<b>支給額の概算</b>です（正式な控除は月次明細で。黄色でお知らせします）。' },
    daily:{ t:'💡 日払い・週払い（日別入力）', b:'支給サイクルが<b>日払い・週払い</b>のとき、日ごとに<b>日付・労働時間・支給額</b>を入れます。\n\n● 所得税は税区分ごとに<b>日額表</b>で日ごとに計算します（甲＝扶養反映／乙／丙＝日雇い）。\n● <b>丙欄（日雇い）</b>は継続2か月以内が対象。2か月を超えたら甲／乙へ。\n\n明細には日別の内訳が出ます。' }
  };
  function openHelp(k){ var h=HELP[k]; if(!h)return; var t=document.getElementById('help-t'),b=document.getElementById('help-b'); t.textContent=h.t; b.innerHTML=h.b; document.getElementById('help-ov').classList.add('on'); }
  // 支給/控除(法定外) のチップ候補
  // 残業/深夜/休日手当は「割増」機能で自動計算するためチップから除外(二重計上・単価膨張防止)
  var SUP_POOL=['基本給','役職手当','住宅手当','家族手当','通勤手当','皆勤手当','資格手当','精勤手当','調整手当'];
  var KOJO_POOL=['社宅費','組合費','財形貯蓄','生命保険','親睦会費','旅行積立'];
  // カスタム項目名のサジェスト(全8社未対応の空白UX): 会社が過去に使った項目名＋定番を候補表示→再入力の手間/表記ゆれを減らす
  var SUGGEST_SHIKYU=['役職手当','資格手当','精勤手当','皆勤手当','住宅手当','家族手当','扶養手当','調整手当','出張手当','食事手当','技能手当','営業手当','単身赴任手当','地域手当','特別手当'];
  var SUGGEST_KOJO=['社宅費','寮費','組合費','財形貯蓄','親睦会費','旅行積立','貸付金返済','制服代','昼食代'];
  function usedItemNames(group){ var s={}; (state.employees||[]).forEach(function(e){ (e[group]||[]).forEach(function(x){ var l=((x&&x.label)||'').trim(); if(l && !/基本給|通勤手当/.test(l)) s[l]=1; }); }); return Object.keys(s); }
  function itemSuggestOptions(group){ var used=usedItemNames(group==='shikyu'?'shikyu':'extraKojo'), curated=(group==='shikyu'?SUGGEST_SHIKYU:SUGGEST_KOJO), seen={}, out=[]; used.concat(curated).forEach(function(n){ if(n && !seen[n]){ seen[n]=1; out.push(n); } }); return out; } // 実使用を先頭(MRU的)＋定番
  function itemSuggestHTML(){ return '<datalist id="dl-item-shikyu">'+itemSuggestOptions('shikyu').map(function(n){return '<option value="'+attr(n)+'"></option>';}).join('')+'</datalist><datalist id="dl-item-kojo">'+itemSuggestOptions('kojo').map(function(n){return '<option value="'+attr(n)+'"></option>';}).join('')+'</datalist>'; }
  // 賞与の追加支給/控除の項目名サジェスト(賞与で使った名前＋賞与の定番)
  var SUGGEST_BONUS_SHIKYU=['特別賞与','寸志','決算賞与','報奨金','インセンティブ','業績賞与'];
  var SUGGEST_BONUS_KOJO=['親睦会費','貸付金返済','旅行積立','財形貯蓄','社宅費'];
  function bonusItemSuggestOptions(group){ var used={}, byEmp=(state.bonus&&state.bonus.byEmp)||{}; Object.keys(byEmp).forEach(function(id){ var en=byEmp[id]||{}; ((group==='shikyu'?en.addShikyu:en.addKojo)||[]).forEach(function(it){ var l=((it&&it.label)||'').trim(); if(l) used[l]=1; }); }); var curated=(group==='shikyu'?SUGGEST_BONUS_SHIKYU:SUGGEST_BONUS_KOJO), seen={}, out=[]; Object.keys(used).concat(curated).forEach(function(n){ if(n&&!seen[n]){ seen[n]=1; out.push(n); } }); return out; }
  function bonusItemSuggestHTML(){ return '<datalist id="dl-bonus-shikyu">'+bonusItemSuggestOptions('shikyu').map(function(n){return '<option value="'+attr(n)+'"></option>';}).join('')+'</datalist><datalist id="dl-bonus-kojo">'+bonusItemSuggestOptions('kojo').map(function(n){return '<option value="'+attr(n)+'"></option>';}).join('')+'</datalist>'; }
  var LEGAL_KOJO=[['health','健康保険'],['kaigo','介護保険'],['pension','厚生年金'],['employ','雇用保険'],['incomeTax','所得税'],['resident','住民税']];
  // 雇用保険 従業員負担(令和7年度・業種別)
  // 雇用保険 労働者負担(厚労省)。区分は全国共通の3種で網羅。料率は年度で自動選択(所得税と同様)
  var EMPLOY_GYOSHU=[['ippan','一般の事業'],['kensetsu','建設の事業'],['norin','農林水産・清酒製造']];
  // 雇用保険料率は lib/koyo-hoken.js を単一ソースに(年度別・労働保険年度4月切替・厚労省照合済)。app側は薄いラッパで委譲。
  function KH(){ return (typeof KoyoHoken!=='undefined')?KoyoHoken:(window&&window.KoyoHoken); }
  function employRateOf(code,year){ return PM().employRateOf(code, year, ctxOf()); }

  // ライブラリは const SHAKAIHOKEN_HYO 定義で window に付かない→bare参照で取得
  function SHH(){ try{ if(typeof SHAKAIHOKEN_HYO!=='undefined'&&SHAKAIHOKEN_HYO) return SHAKAIHOKEN_HYO; }catch(e){} return (typeof window!=='undefined'&&window.SHAKAIHOKEN_HYO)||null; }
  function SAI(){ try{ if(typeof SAITEI_CHINGIN!=='undefined'&&SAITEI_CHINGIN) return SAITEI_CHINGIN; }catch(e){} return (typeof window!=='undefined'&&window.SAITEI_CHINGIN)||null; }
  function SC(){ try{ if(typeof ShiharaiChosho!=='undefined'&&ShiharaiChosho) return ShiharaiChosho; }catch(e){} return (typeof window!=='undefined'&&window.ShiharaiChosho)||null; } // K3 支払調書/源泉
  // 最賃算入判定(最賃法4条3項・施行規則1条)。★最賃に算入しないのは=割増(所定外/休日/深夜)・通勤・家族・精皆勤・臨時/1か月超(賞与等)・控除行・基本給(baseで別計上)★。
  //  それ以外の手当(役職/職務/住宅/技能/資格/営業/地域/調整/食事/単身赴任 等)は算入。割増基礎(isInBasis)とは除外リストが異なる=別関数。
  function isInMinWage(label){ return PW().isInMinWage(label); }
  function minWageTeate(e){ return PW().minWageTeate(e); }
  function minWageInfo(e){ return PW().minWageInfo(e, ctxOf()); }
  function mwWarnText(mw){ return PW().mwWarnText(mw); }
  function hoshoInfo(e){ return PW().hoshoInfo(e); }
  function hoshoWarnText(){ return PW().hoshoWarnText(); }
  function rateFloorWarn(co){ return PW().rateFloorWarn(co); }
  function annualHoursInfo(e){ return PW().annualHoursInfo(e, ctxOf()); }
  function annualHoursWarnText(r){ return PW().annualHoursWarnText(r); }
  function warimashiMins(w){ return PM().warimashiMins(w); }
  function laborLimitItems(e){ return PW().laborLimitItems(e, ctxOf()); }
  function laborLimitWarn(e){ return PW().laborLimitWarn(e, ctxOf()); }
  function laborLimitText(e){ return PW().laborLimitText(e, ctxOf()); }
  function shahoOffWarn(e){ return PW().shahoOffWarn(e, ctxOf()); }
  function fullTimeWeeklyH(){ return PW().fullTimeWeeklyH(ctxOf()); }
  function shoteiMonthlyWage(e){ return PW().shoteiMonthlyWage(e, ctxOf()); }
  function shahoKanyuWarn(e){ return PW().shahoKanyuWarn(e, ctxOf()); }
  function statutoryStaleWarn(){ return PW().statutoryStaleWarn(ctxOf()); }
  function empWarnings(e){ return PW().empWarnings(e, ctxOf()); }
  function prefOptions(sel){
    var S=SHH(); var K=(S&&S.KENKO_RITSU)||{tokyo:{name:'東京都'}};
    return Object.keys(K).map(function(code){return '<option value="'+code+'"'+(code===sel?' selected':'')+'>'+esc(K[code].name)+'</option>';}).join('');
  }
  // 健保従業員負担率(対象月payYmの社保年度で自動選択)＋子育て支援金(令和8/4〜)。両方healthRateに含めて社保計算へ渡す。
  function prefRate(code, payYm){ return PM().prefRate(code, payYm); }

  // ★新規従業員のひな型は"骨組みだけ"=決めつけ金額を持たない(基本給/時給/通勤/住民税/住宅手当は空=要入力)。
  //  勝手に手当や額が付くのを防ぐ。payType/pref/taxClass/fuyou/kintai 等の構造は既定を維持。
  function defEmp(name){
    return { id:uid(), name:name||'従業員 1', no:'', birthYmd:'1980-05-15', dept:'', role:'', employmentType:'employee', houshuKubun:'none',
      payType:'月給', base:'', hourly:'', commissionAmt:'', hourlyGuarantee:'', salesAmt:'', pieceCount:'', payRule:null, fuyou:'1', nenshoFuyo:'', pref:'tokyo', commute:'', commuteType:'public', commuteKm:'', residentTax:'', residentTaxMode:'monthly', residentTaxAnnual:'', residentTaxIkkatsu:false, juminCollect:'special', bank:'',
      furiBankName:'', furiBankNo:'', furiBranchName:'', furiBranchNo:'', furiYokin:'普通', furiAccount:'', furiKana:'',
      annualHolidays:'', dailyWorkH:'', dailyWorkM:'', workedH:'160', workedM:'0', weeklyScheduledH:'', dailyEntries:[],
      kintai:[{label:'出勤日数',value:'21'},{label:'欠勤日数',value:'0'},{label:'有給取得',value:'1'}],
      shikyu:[{label:'基本給',value:''}],
      apply:{}, taxClass:'ko', honninShogai:false, honninKafuHitorioya:'', honninKinrou:false, shortTimeType:'', minWageReduce:'', retired:false, workStatus:'normal', leavePay:'', leaveStartYmd:'', leaveEndYmd:'', leaveDaysInMonth:'',
      warimashi:{ mode:'easy', otH:'', otM:'', nightH:'', nightM:'', holidayH:'', holidayM:'',
        detail:{ ot:{h:'',m:''}, otNight:{h:'',m:''}, over60:{h:'',m:''}, over60Night:{h:'',m:''}, night:{h:'',m:''}, holiday:{h:'',m:''}, holidayNight:{h:'',m:''} } },
      wbInclude:[], wbExclude:[],
      extraKojo:[],
      shaho:{ mode:'auto', months:[{pay:'',days:'30'},{pay:'',days:'30'},{pay:'',days:'30'}], mikomi:'', manual:'' } };
  }
  var WDAYS=['日','月','火','水','木','金','土'];
  var RULE_ITEMS=[['teikyu','休みの日'],['companyHol','会社独自の休日'],['shotei','1日の働く時間'],['annual','年間の休み'],['warimashiRate','割増の率'],['koyoGyoshu','雇用保険の業種'],['paymentDays','支払基礎日数の数え方'],['shahoTiming','社保の当月／翌月徴収'],['kekkin','欠勤控除の計算'],['minashi','固定残業（みなし）'],['daikyu','代休・振替休日'],['shoyo','賞与の有無']];
  // 会社の既定値(毎回新規オブジェクト=共有参照事故防止)。ロード時はこれにマージ=古い保存で欠けた項目がundefinedにならない。
  function defCompany(){ return { name:'株式会社 ゼロアクト',addr:'',close:'末日',paydayRel:'next',paydayDay:'25', payCycle:'monthly', shimeMethod:'monthly', shimeN:'10',
      holidays:[0], dailyWorkH:'8', dailyWorkM:'0', annualHolidays:'120', shakaTokutei:false,
      ruleOn:{teikyu:true,shotei:true,annual:true,warimashiRate:true,koyoGyoshu:true},
      rateOt:'', rateHoliday:'', rateNight:'', rateOver60:'', gyoshu:'ippan', rousaiRate:'',
      furiCode:'', furiName:'', furiBankNo:'', furiBankName:'', furiBranchNo:'', furiBranchName:'', furiYokin:'普通', furiAccount:'', furiDate:'' }; }
  // 対象月の既定=当月(初回起動時)。保存済みがあればロード時に上書きされる(過去月固定を防ぐ)。
  function curYm(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2); }
  var state={ company: defCompany(),
    month:curYm(), prefer:'col2_1', theme:{accent:'#6f5a3e',line:'#cfc9b8',ink:'#23261f'}, depts:['営業部'], roles:['課長','主任','一般'],
    employees:[defEmp('従業員 1')], open:{},
    inputMode:'monthly', printMode:'monthly', empFilter:'active', bonus:{ payYm:'', payDay:'', byEmp:{} }, confirmed:{}, nencho:{}, onboardDone:false, onboardOutput:false, payPatterns:[], dailySlipLayout:'1col', inputView:'card' };

  function carCommuteNonTax(km){ return PM().carCommuteNonTax(km); }
  function commuteLimit(e){ return PM().commuteLimit(e); }
  function syncCommute(e){ return PM().syncCommute(e); }
  // 支払基礎日数の区分(日本年金機構)。一般=17日/短時間就労者(パート)=17日、3か月とも17日未満なら15日以上の月/短時間労働者(特定適用の社保加入)=11日。
  function stType(e){ return (e&&e.shortTimeType)||''; }
  function stLabel(e){ var t=stType(e); return t==='tanjikan'?'短時間労働者（社保）':t==='part'?'短時間就労者（パート）':''; }
  function santeiRule(e){ return PM().santeiRule(e); }
  function gekkakuTh(e){ return PM().gekkakuTh(e); }
  function shahoBasisOf(e){ return PM().shahoBasisOf(e); }
  function isInBasis(e,label){ return PM().isInBasis(e,label); }
  function warimashiBasis(e){ return PM().warimashiBasis(e); }
  // 割増の基礎に入れる手当チップ(従業員マスタの詳細に表示。毎月でなく一度決める設定)
  function basisBoxHTML(e){
    var labels=(e.shikyu||[]).map(function(x){return x.label;}).filter(function(l){return l && !/割増/.test(l);});
    if(!labels.length) return '';
    var wiz=labels.map(function(l){ var on=isInBasis(e,l); return '<span class="wb-chip'+(on?' on':'')+'" data-wb="'+attr(l)+'">'+(on?'✓ ':'')+esc(l)+'</span>'; }).join('');
    return '<div class="wb-box"><div class="wb-h">割増の基礎に入れる手当<span class="help-i" data-help="warimashiBasis">💡</span></div><div class="wb-chips">'+wiz+'</div><div class="wb-note">通勤・家族手当は既定で外す。住宅手当などは全員一律なら入れる（実態で・詳しくは💡）。</div></div>';
  }
  function dmin(o){ return PM().dmin(o); }
  function warimashiOf(e){ return PM().warimashiOf(e, ctxOf()); }
  function kintaiVal(e,re){ return PM().kintaiVal(e,re); }
  function workedMin(e){ return PM().workedMin(e); }
  function workedLabel(e){ return PM().workedLabel(e); }
  function effShukkin(e){ return PM().effShukkin(e, ctxOf()); }
  function syncBasePay(e){ return PM().syncBasePay(e, ctxOf()); }
  // 在籍判定・入社/退職月の日割は lib/zaiseki.js(純関数・テスト可能)に集約。bare参照で解決。
  function ZK(){ return (typeof Zaiseki!=='undefined')?Zaiseki:(window&&window.Zaiseki); }
  function JZ(){ return (typeof Juminzei!=='undefined')?Juminzei:(window&&window.Juminzei); }
  function residentTaxOf(e){ return PM().residentTaxOf(e, ctxOf()); }
  function isActiveInMonth(e, ym){ return PM().isActiveInMonth(e, ym); }
  function prorateInfo(e, ym){ return PM().prorateInfo(e, ym); }
  function HD(){ return (typeof Holidays!=='undefined')?Holidays:(window&&window.Holidays); } // 祝日エンジン(app.js内の他所からも参照する)
  function scheduledDaysOf(ym){ return PM().scheduledDaysOf(ym, ctxOf()); }
  function leaveNoWorkInfo(e, ym){ return PM().leaveNoWorkInfo(e, ym, ctxOf()); }
  function jintekiOf(e, taxClass){ return PM().jintekiOf(e, taxClass); }
  function compute(e){ return PM().compute(e, ctxOf()); }
  function applyNenchoAdj(e, r){ return PM().applyNenchoAdj(e, r, ctxOf()); }
  function payDateObj(){ return PM().payDateObj(ctxOf()); }
  function payDateStr(){ return PM().payDateStr(ctxOf()); }
  function updatePaydayPreview(){ var el=$('#payday-preview'); if(el) el.textContent='→ 支給日：'+payDateStr(); }
  // 支給サイクルの説明(表示のみ・計算方式は月単位で不変)。日払いは丙欄へ誘導。
  function payCycleNote(){ var el=$('#paycycle-note'); if(!el)return; var c=(state.company&&state.company.payCycle)||'monthly';
    var m={ monthly:'月に1回まとめて支給。', semimonthly:'月に2回に分けて支給。明細に区分を表示します。', weekly:'毎週支給。明細に「週払い」を表示します。', daily:'1日ごとに支給。<b>所得税は日額表</b>で日ごとに計算します（従業員ごとの税区分：甲＝扶養反映／乙／丙＝日雇い）。' };
    el.innerHTML=(m[c]||'')+'<br><span style="color:#6E907E">※月の社会保険・所得税の計算方式は変わりません（本設定は明細の表示と税区分の目安）。任意期間で締め直す本格計算は対象外。</span>'; }
  // K2 締め方(期間分割)。会社設定 shimeMethod/shimeN。Periods libで期間を算出。
  function shimeMethodOf(){ return (state.company&&state.company.shimeMethod)||'monthly'; }
  function shimeNOf(){ return num((state.company&&state.company.shimeN))||10; }
  // 期間分割が有効か。日払/週払(payCycle)は独自の日別スリップ経路を持つので相互排他=そちら優先(入力/印刷の分岐を一致させる)。
  function shimeSplit(){ var cyc=(state.company&&state.company.payCycle)||'monthly'; if(cyc==='daily'||cyc==='weekly') return false; return !!(window.Periods&&Periods.hasSplit(shimeMethodOf())); }
  function shimePeriods(ym){ return (window.Periods?Periods.buildPeriods(ym||state.month, shimeMethodOf(), shimeNOf()):[]); }
  function shimeNote(){ var el=$('#shime-note'); if(!el)return; var row=$('#c-shimen-row'); if(row) row.style.display=(shimeMethodOf()==='ndays')?'':'none';
    if(!shimeSplit()){ el.innerHTML='月1枚の明細（従来どおり）。'; return; }
    var ps=shimePeriods(); var labels=ps.map(function(p){return p.label;}).join('／');
    el.innerHTML='当月（'+esc(state.month)+'）は <b>'+ps.length+'期間</b>：'+esc(labels)+'。入力タブで<b>日付・金額</b>を入れると期間ごとの明細に振り分きます。'
      +'<br><span style="color:#6E907E">業務委託＝控除なしの報酬明細。従業員＝社保/所得税は月額基準のため期間明細は<b>概算</b>（黄色でお知らせ）。</span>'; }
  function monthLabel(){ var y=Number((state.month||'2026-06').slice(0,4)), m=Number((state.month||'2026-06').slice(5,7)); var k=['','一','二','三','四','五','六','七','八','九','十','十一','十二']; return '令 和 '+(y-2018)+' 年 '+k[m]+' 月 分'; }

  /* ---------- ナビ ---------- */
  function showScreen(id){
    $$('.screen').forEach(function(s){ s.classList.toggle('active', s.id===id); });
    $$('.bn').forEach(function(b){ b.classList.toggle('on', b.dataset.scr===id); });
    var TABN={'scr-settings':'設定','scr-input':'入力','scr-list':'一覧 / 集計','scr-print':'印刷'}; var at=$('#appbar-tab'); if(at) at.textContent=TABN[id]||''; // ヘッダー右はタブ名
    // 対象月はヘッダー右にグローバル表示(入力/一覧)。設定=月概念なし・印刷=画面内に月/賞与切替があるので非表示。タブ名と排他。
    var showMon=(id==='scr-input'||id==='scr-list'); var am=$('#appbar-month'); if(am) am.style.display=showMon?'flex':'none'; if(at) at.style.display=showMon?'none':'';
    $$('.scr-month').forEach(function(m){ m.value=state.month; }); // 全.scr-month(ヘッダー/印刷)を対象月に同期
    if(id==='scr-settings'){ renderOnboard(); renderEmpMaster(); loadEmpProfiles(); }
    if(id==='scr-input'){ $('#in-month').textContent=monthLabel(); renderInputArea(); }
    if(id==='scr-list') renderListActive();
    if(id==='scr-print') renderPrint();
  }

  /* ---------- A11y: 見た目ラベルを入力のaria-labelへ伝播(スクリーンリーダー用・見た目は不変) ---------- */
  // フォームは .frow>.flabel / .wi-row>.wi-l / .mini-l と <i>単位</i> で見た目上はラベル済みだが、
  // プログラム的な関連付けが無い(placeholderが数字のみ等)ためSRは入力の意味を読めない。
  // 見えているラベル文字列を集めて aria-label に写す。付加要素(💡/単位注記/small)は除外。将来の入力も自動でカバー。
  function _a11yLabelText(elm){
    var c=elm.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('.hint2,.help-i,small,.mco-cv'), function(n){ if(n.parentNode) n.parentNode.removeChild(n); });
    return (c.textContent||'').replace(/\s+/g,' ').trim();
  }
  function _a11yFindLabel(el){
    var f=el.closest('.frow'); if(f){ var x=f.querySelector('.flabel'); if(x) return _a11yLabelText(x); }
    var w=el.closest('.wi-row'); if(w){ var y=w.querySelector('.wi-l'); if(y) return _a11yLabelText(y); }
    var p=el.parentElement, hop=0;
    while(p && hop<4){ var m=p.querySelector(':scope > .mini-l'); if(m) return _a11yLabelText(m); p=p.parentElement; hop++; }
    return '';
  }
  function labelInputsA11y(root){
    try{
      root=root||document;
      var els=root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=button]),select,textarea');
      for(var i=0;i<els.length;i++){ var el=els[i];
        if(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')) continue;
        var lab=el.closest('label');
        // labelに内包される最初のcontrolだけ暗黙ラベルで名前あり(1labelは1controlのみ関連付く)。
        // 2つ目以降(例: 労働 時:分 の"分")は名前が付かないので下で生成する。
        if(lab && lab.querySelector('input:not([type=hidden]):not([type=button]):not([type=checkbox]):not([type=radio]),select,textarea')===el) continue;
        var unit=''; var nx=el.nextElementSibling; if(nx&&nx.tagName==='I') unit=(nx.textContent||'').trim(); // <i>時間</i>等の単位
        var base=_a11yFindLabel(el);
        if(!base && lab) base=_a11yLabelText(lab); // 同一label内2つ目以降はlabel自身のテキストを名前に
        if(!base){ var ph=(el.getAttribute('placeholder')||'').trim(); if(ph) base=ph; }
        var name=(base+(unit?(' '+unit):'')).replace(/\s+/g,' ').trim();
        // 数字/記号/単位だけ=名前として無意味 → 付けない(placeholderのままの方がマシ)
        if(name && !/^[\s0-9%.,＋+\-〜()円]*$/.test(name)) el.setAttribute('aria-label', name);
      }
      // div/b/span のトグル(開閉・モード・チップ・ヘルプ)をキーボード操作可能に(:focus-visible CSSが活きる)。
      //  クリックは委譲ハンドラなので tabindex+role だけ付ければ下のkeydownで click() 発火できる。
      var tg=root.querySelectorAll(A11Y_TOGGLE_SEL);
      for(var j=0;j<tg.length;j++){ var t=tg[j];
        if(t.tagName==='BUTTON'||t.tagName==='A'||t.tagName==='INPUT') continue;
        if(t.classList.contains('chip-dim')) continue; // 無効チップは操作対象外
        if(!t.hasAttribute('tabindex')) t.setAttribute('tabindex','0');
        // role=button は「フォーカス可能な子孫を含まない」トグルだけに付与(ARIAネスト違反回避)。
        //  複合見出し(.mco-hd 等・内部に▲▼ボタンを持つ)は tabindex のみでキーボード操作は残す。
        if(!t.getAttribute('role') && !t.querySelector('button,a,input,select,textarea,[tabindex]')) t.setAttribute('role','button');
      }
    }catch(_e){}
  }
  var A11Y_TOGGLE_SEL='.mco-hd,.emp-dtgl,.emp-sub-h,.sh-mode,.imode,.pmode,.dls,.chip,.help-i,.ef-b,.sh-seg b';

  /* ---------- 設定: 会社情報 ---------- */
  function fillCompany(){ $('#c-name').value=state.company.name||''; $('#c-addr').value=state.company.addr||''; $('#c-close').value=state.company.close||''; $('#c-payrel').value=state.company.paydayRel||'next'; $('#c-payday-day').value=state.company.paydayDay||''; var pc=$('#c-paycycle'); if(pc)pc.value=state.company.payCycle||'monthly'; var sm=$('#c-shime'); if(sm)sm.value=state.company.shimeMethod||'monthly'; var sn=$('#c-shimen'); if(sn)sn.value=state.company.shimeN||'10'; updatePaydayPreview(); payCycleNote(); shimeNote(); renderRuleChips(); renderCompanyRules(); renderDesign(); }
  // 初回オンボーディング(4ステップ案内・×で閉じたら二度と出ない)。"すぐ分かる"を底上げ。
  // はじめかたガイドの各ステップの達成判定(freee/MF流のライブToDo)。全完了で自動的に消える。
  function onboardSteps(){
    var emps=state.employees||[];
    var realEmp=emps.length>1 || emps.some(function(e){ return e.name && !/^(山田 太郎|日払 太郎)$/.test(String(e.name).trim()); });
    var conf=state.confirmed&&state.confirmed[state.month]; var inputDone=!!(conf&&Object.keys(conf).length);
    return [
      { done: !!(state.company&&String(state.company.name||'').trim() && !/^株式会社 ゼロアクト$/.test(String(state.company.name).trim())), label:'会社情報を入れる', sub:'会社名を自社に変更（初期はサンプル）', go:'company' },
      { done: realEmp, label:'従業員を追加する', sub:'サンプルの山田太郎は書き換え/削除でOK', go:'emp' },
      { done: inputDone, label:'当月を入力して確認', sub:'勤怠を入れて「今月を確定」', go:'input' },
      { done: !!state.onboardOutput, label:'明細を出力する', sub:'PDF/Web明細/Excel/振込データ', go:'print' }
    ];
  }
  function renderOnboard(){
    var box=$('#onboard-box'); if(!box) return;
    var steps=onboardSteps(), doneN=steps.filter(function(s){return s.done;}).length;
    if(state.onboardDone || doneN===steps.length){ box.innerHTML=''; return; } // 手動で閉じた or 全完了→自動で消える
    box.innerHTML='<div class="card ob-card">'
      +'<div class="ob-hd"><b>はじめかたガイド（'+doneN+'/'+steps.length+'）</b>'
      +'<button data-onboard-close="1" class="ob-x" title="あとで" aria-label="ガイドを閉じる">×</button></div>'
      +'<div class="ob-lead">未完のステップをタップすると、その画面へ移動します。</div>'
      +steps.map(function(s,i){ return '<button class="ob-step'+(s.done?' done':'')+'" data-onboard-goto="'+s.go+'">'
          +'<span class="ob-ck">'+(s.done?'✓':(i+1))+'</span>'
          +'<span class="ob-tx"><b>'+esc(s.label)+'</b><small>'+esc(s.sub)+'</small></span>'
          +(s.done?'<span class="ob-done-lb">完了</span>':'<span class="ob-arrow">›</span>')+'</button>'; }).join('')
      +'</div>';
  }
  function renderRuleChips(){
    var host=$('#rule-chips'); if(!host)return; var on=state.company.ruleOn||{};
    host.innerHTML=RULE_ITEMS.map(function(it){var o=!!on[it[0]];return '<span class="chip'+(o?' on':'')+'" data-rule="'+it[0]+'">'+(o?'✓ ':'')+it[1]+'</span>';}).join('');
  }
  // 会社の決まりの各項目=折りたたみ(既定は閉じ)。初回の過積載を解消(UX🟠#6)。タップで展開して編集。
  function ruleItemHTML(key,title,sub,helpKey,inner){
    var open=!!(state._ruleOpen&&state._ruleOpen[key]);
    return '<div class="rule-item'+(open?' open':'')+'">'
      +'<div class="ri-hd" data-rule-toggle="'+key+'"><span class="ri-ttl">'+title+(sub?'<span class="hint2">（'+esc(sub)+'）</span>':'')+'</span>'
        +(helpKey?'<span class="help-i" data-help="'+helpKey+'">💡</span>':'')+'<span class="ri-cv">▾</span></div>'
      +(open?'<div class="ri-body">'+inner+'<div style="text-align:right;margin-top:8px"><span class="ri-x" data-rule-x="'+key+'">× この項目を使わない</span></div></div>':'')
      +'</div>';
  }
  function renderCompanyRules(){
    var host=$('#rule-host'); if(!host)return; var c=state.company, on=c.ruleOn||{}, h='';
    // 社保の特定適用事業所(厚年被保険者51人以上)トグル。パートの社保「適用拡大」判定をONにする（既定OFF=小さい会社では出さない）。
    h+='<div class="cr-item" style="border:1px solid #E4EFE9;border-radius:12px;padding:10px 12px;margin-bottom:10px">'
      +'<label class="cr-chk" style="display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:#2E7D54;cursor:pointer"><input type="checkbox" data-cf="shakaTokutei"'+(c.shakaTokutei?' checked':'')+'>社会保険 51人以上（特定適用事業所）</label>'
      +'<div class="ri-note" style="margin-top:5px">厚生年金の被保険者が<b>常時51人以上</b>の会社はチェック。パートでも<b>週20時間以上・月88,000円以上・学生でない・2か月超の見込み</b>で社保加入の対象になります（2024年10月〜）。<b>50人以下ならチェック不要</b>（この判定は出しません）。</div></div>';
    if(on.teikyu){ h+=ruleItemHTML('teikyu','休みの日は？','法定休日','teikyu',
      '<div class="wdays">'+WDAYS.map(function(d,i){return '<span class="wday'+((c.holidays||[]).indexOf(i)>=0?' on':'')+'" data-wd="'+i+'">'+d+'</span>';}).join('')+'</div><div class="ri-note">複数えらべます。法律上の休み(法定休日)は自動で特定。例：日曜だけ＝週休1日(現場系OK)。</div>'); }
    if(on.companyHol){
      var coh=(c.companyHolidays||[]);
      var cohRows=coh.map(function(d,di){ return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px"><input type="date" class="finput" data-coh="'+di+'" value="'+attr(d)+'" style="flex:1"><button class="b-del" data-coh-del="'+di+'" style="width:30px" aria-label="この休日を削除">×</button></div>'; }).join('');
      h+=ruleItemHTML('companyHol','会社独自の休日','年末年始・夏季休暇など','','<div>'+cohRows+'</div><button class="mini add" data-coh-add="1" style="margin-top:4px">＋ 休日を追加</button><div class="ri-note">国民の祝日は<b>自動</b>です。ここは会社が独自に決めた休み（創立記念日・年末年始・夏季休暇など）だけ。当月の所定労働日数に反映します。</div>'); }
    if(on.shotei){ h+=ruleItemHTML('shotei','1日の働く時間','所定労働','shotei',
      '<span class="dur"><input class="cr-f cr-dur" data-cf="dailyWorkH" inputmode="numeric" value="'+attr(c.dailyWorkH)+'"><i>時間</i><input class="cr-f cr-dur" data-cf="dailyWorkM" inputmode="numeric" value="'+attr(c.dailyWorkM)+'"><i>分</i></span>'); }
    if(on.annual){
      var annCo=(window.Warimashi&&Warimashi.annualHoursCheck)?(function(){ var ly=parseInt(String(state.month||'').slice(0,4),10)||0, leap=(ly%4===0&&ly%100!==0)||(ly%400===0); return Warimashi.annualHoursCheck(c.annualHolidays, num(c.dailyWorkH)+num(c.dailyWorkM)/60, leap); })():null;
      var annWarn=(annCo&&annCo.over)?'<div class="cr-warn" style="margin:6px 2px 0">⚠ '+annualHoursWarnText(annCo)+'</div>':'';
      h+=ruleItemHTML('annual','年間の休み','日','annual','<input class="cr-f cr-wide" data-cf="annualHolidays" inputmode="numeric" value="'+attr(c.annualHolidays)+'">'+annWarn); }
    if(on.warimashiRate){
      var rr='<div class="rate-grid">'
        +'<div><div class="mini-l">残業</div><span class="dur"><input class="cr-f cr-rate" data-cf="rateOt" inputmode="numeric" value="'+attr(c.rateOt)+'" placeholder="125"><i>%</i></span></div>'
        +'<div><div class="mini-l">法定休日</div><span class="dur"><input class="cr-f cr-rate" data-cf="rateHoliday" inputmode="numeric" value="'+attr(c.rateHoliday)+'" placeholder="135"><i>%</i></span></div>'
        +'<div><div class="mini-l">深夜（上乗せ）</div><span class="dur"><input class="cr-f cr-rate" data-cf="rateNight" inputmode="numeric" value="'+attr(c.rateNight)+'" placeholder="25"><i>+%</i></span></div>'
        +'<div><div class="mini-l">月60時間超（上乗せ）</div><span class="dur"><input class="cr-f cr-rate" data-cf="rateOver60" inputmode="numeric" value="'+attr(c.rateOver60)+'" placeholder="25"><i>+%</i></span></div>'
        +'</div><div class="ri-note">空欄＝法定どおり自動（残業125%・休日135%・深夜+25%）。会社は上げられます（詳しくは💡）。</div>'
        +rateFloorWarn(c);
      h+=ruleItemHTML('warimashiRate','割増の率','残業・休日・深夜','warimashi',rr); }
    if(on.koyoGyoshu){
      var gopts=EMPLOY_GYOSHU.map(function(g){return '<option value="'+g[0]+'"'+(c.gyoshu===g[0]?' selected':'')+'>'+esc(g[1])+'（労'+(employRateOf(g[0])*100).toFixed(2)+'%）</option>';}).join('');
      h+=ruleItemHTML('koyoGyoshu','雇用保険の業種','一般/建設/農林','koyoGyoshu','<select class="cr-sel" data-cf="gyoshu">'+gopts+'</select><div class="ri-note">建設・農林水産・清酒製造は料率が高め。雇用保険は通勤手当も含む賃金総額に掛けます。<b>料率は対象月の年度で自動</b>（令和8は引下げ：一般0.50%・建設/農林0.60%）。</div>'); }
    if(on.paymentDays){
      var pm=c.paymentDaysMethod||'';
      var pmo=[['','自動（月給=暦日数 / 日給・時給=出勤日数）'],['calendar','暦日数（毎月その月の日数）'],['scheduled','所定労働日数（欠勤は差引）'],['worked','出勤日数']]
        .map(function(o){return '<option value="'+o[0]+'"'+(pm===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');
      h+=ruleItemHTML('paymentDays','支払基礎日数の数え方','定時決定の'+'17日判定','paymentDays','<select class="cr-sel" data-cf="paymentDaysMethod">'+pmo+'</select><div class="ri-note">定時決定(4〜6月)の17日判定の数え方。既定＝月給は暦日数/日給時給は出勤日数（詳しくは💡）。</div>'); }
    if(on.shahoTiming){
      var sto=[['current','当月徴収（今までどおり）'],['next','翌月徴収（法律の原則）']].map(function(o){return '<option value="'+o[0]+'"'+((c.shahoTiming||'current')===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');
      h+=ruleItemHTML('shahoTiming','社保の当月／翌月徴収','健保・厚年・介護','shahoTiming','<select class="cr-sel" data-cf="shahoTiming">'+sto+'</select><div class="ri-note">翌月徴収＝前月分を当月給与から控除（法律の原則）。<b>入社月は天引きなし・月末退職は最終給与で2か月分</b>。既定は<b>当月</b>（今までの計算どおり・詳しくは💡）。</div>'); }
    if(on.kekkin){
      var kmo=[['','月平均所定労働日数（既定）'],['calendar','当月の暦日数'],['scheduled','当月の所定労働日数']]
        .map(function(o){return '<option value="'+o[0]+'"'+((c.kekkinMethod||'')===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');
      h+=ruleItemHTML('kekkin','欠勤控除の計算','月給の欠勤・不就労','kekkin','<label class="cr-chk" style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" data-cf="kanzenGekkyu"'+(c.kanzenGekkyu?' checked':'')+'>完全月給制（欠勤しても控除しない）</label><div style="margin-top:6px;font-size:12px">1日あたりの分母：<select class="cr-sel" data-cf="kekkinMethod">'+kmo+'</select></div><div class="ri-note">月給は欠勤分を控除（日給月給制）が標準。役員等のみ完全月給制に（詳しくは💡）。</div>'); }
    if(on.minashi){ h+=ruleItemHTML('minashi','固定残業（みなし）','時間','','<input class="cr-f cr-wide" data-cf="minashiH" inputmode="numeric" value="'+attr(c.minashiH)+'" placeholder="0">'); }
    if(on.daikyu){ h+=ruleItemHTML('daikyu','代休・振替休日','使い分け','daikyu',
      '<div class="ri-note">振替休日＝割増なし（通常の労働時間へ）／代休＝割増あり＋休む日は入力の「代休取得」へ（詳しくは💡）。</div>'
      +'<label class="cr-chk" style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:8px"><input type="checkbox" data-cf="daikyuDeduct"'+(c.daikyuDeduct?' checked':'')+'>代休で休んだ日を出勤から差し引く（無給代休・日給制向け）</label>'); }
    if(on.shoyo){ h+=ruleItemHTML('shoyo','賞与の有無','','','<div class="ri-note">賞与（ボーナス）は<b>入力タブの「賞与」</b>に切り替えて計算できます（社保＝標準賞与額・源泉＝算出率表で自動／明細・Excelも賞与用）。</div>'); }
    host.innerHTML=h;
  }

  /* ---------- 設定: 従業員マスタ ---------- */
  function deptSelect(e){
    var opts=state.depts.map(function(d){return '<option'+(d===e.dept?' selected':'')+'>'+esc(d)+'</option>';}).join('');
    return '<select class="finput m-f" data-f="dept"><option value=""'+(e.dept?'':' selected')+'>（未分類）</option>'+opts+'<option value="__new">＋新規カテゴリ</option></select>';
  }
  function roleSelect(e){
    var opts=state.roles.map(function(r){return '<option'+(r===e.role?' selected':'')+'>'+esc(r)+'</option>';}).join('');
    return '<select class="finput m-f" data-f="role"><option value=""'+(e.role?'':' selected')+'>（なし）</option>'+opts+'<option value="__new">＋新規</option></select>';
  }
  function wsBadge(e){ return (e.workStatus&&e.workStatus!=='normal')?' <span class="ws-badge">'+esc(WS_LABEL(e.workStatus))+'</span>':''; }
  function wsNoteHTML(e){
    var s=e.workStatus||'normal'; if(s==='normal') return '';
    var msg={ sankyu:'産休：健保・厚年・介護を自動で免除(0)。給与は無給が一般的→入力で調整。出産手当金は健保へ申請(給与に含めない)。',
      ikukyu:'育休：社保を自動で免除(0)。育児休業給付金は雇用保険(給与でない)。給与は入力で調整。',
      kaigokyu:'介護休：社保は継続(無給でも本人負担あり)。介護休業給付金は雇用保険(給与でない)。',
      byoukyu:'病気休職：社保は継続(本人負担あり)。傷病手当金は健保(給与でない)。',
      kyugyo:'会社都合の休業：休業手当=平均賃金の60%以上を支給に入れる(課税・社保対象)。' }[s];
    var warn=(s==='kyugyo'&&num(e.leavePay)<=0)?'<div class="cr-warn">⚠ 休業手当が未入力(0)です。会社都合の休業は<b>平均賃金の60%以上</b>の支払いが必要(労基法26条)。「休暇中の金額」に入れてください。</div>'
      :(s==='kyugyo'&&e.payType==='月給'&&num(e.leavePay)>0&&num(e.leavePay)<0.4*num(e.base))?'<div class="cr-warn">⚠ 休業手当が<b>平均賃金の約60%</b>を下回っている可能性があります（労基法26条＝<b>平均賃金×60%以上</b>が必要）。金額をご確認ください（このまま保存・計算はできます）。</div>':'';
    // 産休/育休: 休業開始日/終了日(月末在籍基準)＋育休14日ルール用の当月日数
    var dates='';
    if(s==='sankyu'||s==='ikukyu'){
      dates='<div class="frow2" style="margin-top:6px">'
        +'<div class="frow"><div class="flabel">休業開始日<span class="hint2">任意</span></div><input type="date" class="finput m-f" data-f="leaveStartYmd" value="'+attr(e.leaveStartYmd)+'"></div>'
        +'<div class="frow"><div class="flabel">休業終了日<span class="hint2">予定可</span></div><input type="date" class="finput m-f" data-f="leaveEndYmd" value="'+attr(e.leaveEndYmd)+'"></div></div>'
        +(s==='ikukyu'?'<div class="frow"><div class="flabel">当月の育休日数<span class="hint2">14日ルール用・任意</span></div><input class="finput num m-f" data-f="leaveDaysInMonth" inputmode="numeric" value="'+attr(e.leaveDaysInMonth)+'" placeholder="同一月内に14日以上で免除"></div>':'')
        +'<div class="ri-note" style="margin-top:4px;color:#92500A">日付を入れると<b>その月の末日が休業中の月だけ</b>社保免除（年金機構・月末基準）。'+(s==='ikukyu'?'月末が育休でない短期月でも<b>同一月内14日以上</b>なら免除（令和4年10月改正）。賞与は連続1か月超で免除。':'賞与は産休中の支払月も免除。')+'<br>日付未入力なら<b>全月免除</b>（従来）のまま。</div>';
    }
    return warn+'<div class="ri-note" style="margin-top:6px">'+msg+'<br>※自動の社保オフは下の「法定控除」で個別に戻せます。</div>'+dates;
  }
  function chips(e,pool,key){
    var have=e[key].map(function(x){return x.label;});
    var fixed = key==='shikyu' ? ['通勤手当'] : []; // 通勤は通勤手当フィールドで管理
    return pool.map(function(lab){
      if(fixed.indexOf(lab)>=0) return '';
      var on=have.indexOf(lab)>=0;
      return '<span class="chip'+(on?' on':'')+'" data-chip="'+key+'" data-lab="'+attr(lab)+'">'+(on?'✓ ':'')+esc(lab)+'</span>';
    }).join('');
  }
  // カスタム給の「決め方」編集UI(固定給 + 変動{なし/1つ/高い方} + 部品)。歩合額/売上は毎月「入力」タブ。
  function payRuleEditor(e,i){
    var pr=ensurePayRule(e); var v=pr.variable||{mode:'none',parts:[]};
    var TYPES=[['hourly','時給×時間'],['daily','日給×日数'],['piece','件数×単価'],['commission','歩合(出来高)'],['rate','売上×率(%)'],['tiered','売上×段階率'],['fixed','固定額']];
    var amtPh=function(t){ return t==='hourly'?'時給':t==='daily'?'日給':t==='piece'?'単価':t==='rate'?'率%':t==='fixed'?'金額':''; };
    var partsHtml=(v.parts||[]).map(function(p,idx){ var isCom=(p.type==='commission'), isTiered=(p.type==='tiered');
      var head='<div class="bx-row">'
        +'<select class="finput pr-type" data-prtype="'+i+':'+idx+'" style="flex:1.3;min-width:0">'+TYPES.map(function(t){return '<option value="'+t[0]+'"'+(p.type===t[0]?' selected':'')+'>'+t[1]+'</option>';}).join('')+'</select>'
        +(isTiered?'':(isCom?'<span style="font-size:10px;color:#6E907E;flex:1">歩合額は毎月「入力」で</span>':'<input class="finput num pr-amt" data-pramt="'+i+':'+idx+'" inputmode="numeric" value="'+attr(fmtN(p.amount))+'" placeholder="'+amtPh(p.type)+'" style="width:90px">'))
        +'<button class="btn-ghost bx-del" data-prdel="'+i+':'+idx+'" aria-label="この項目を削除">×</button></div>';
      if(!isTiered) return head;
      var tiers=(p.tiers&&p.tiers.length)?p.tiers:[{from:0,rate:''}];
      var tiersHtml=tiers.map(function(tr,tidx){ return '<div class="bx-row" style="gap:4px;padding-left:8px">'
        +'<input class="finput num pr-tier-f" data-prtier="'+i+':'+idx+':'+tidx+':from" inputmode="numeric" value="'+attr(fmtN(tr.from))+'" placeholder="下限(円)" style="width:104px">'
        +'<span style="font-size:11px;color:#6E907E">円〜</span>'
        +'<input class="finput pr-tier-r" data-prtier="'+i+':'+idx+':'+tidx+':rate" inputmode="decimal" value="'+attr(tr.rate==null?'':tr.rate)+'" placeholder="率" style="width:58px">'
        +'<span style="font-size:11px;color:#6E907E">%</span>'
        +'<button class="btn-ghost bx-del" data-prtierdel="'+i+':'+idx+':'+tidx+'" aria-label="この段を削除">×</button></div>'; }).join('');
      return head+'<div class="pr-tiers" style="margin:2px 0 6px">'+tiersHtml
        +'<div class="addcustom"><button class="btn-ghost" data-prtieradd="'+i+':'+idx+'" style="padding:6px 10px">＋段を追加</button></div>'
        +'<div class="ri-note" style="margin:2px 2px 0">超過分だけその率（累進＝境目で急に増えない）。下限0円から順に。売上は毎月「入力」で。</div></div>';
    }).join('');
    var isMax=(v.mode==='max'), isOne=(v.mode==='one'), hasFix=num(pr.fixed)>0;
    // 決め方=実務の型。none=固定給/月給のみ・one=固定給+歩合(上乗せ)・max=完全歩合+保障(高い方)
    var modeNote = isMax ? '<b>完全歩合＋保障</b>の型。下の部品の"高い方"を採用します。時給×時間／日給×日数は労基27条の<b>保障給（下限）</b>になります（固定給は通常0）。'
      : isOne ? '<b>固定給＋歩合</b>の型。固定給（月給）に、下の歩合などを<b>上乗せ</b>します。'
      : '固定給（月給）だけ。変動なし。';
    var maxFixWarn = (isMax && hasFix) ? '<div class="cr-warn" style="margin:4px 2px 0">※「高い方（完全歩合＋保障）」では固定給は通常<b>0</b>です。固定給があるなら決め方を<b>「固定給＋歩合（上乗せ）」</b>にするのが自然です。</div>' : '';
    return '<div class="pr-box">'
      +'<div class="frow"><div class="flabel">固定給<span class="hint2">月給・'+(isMax?'高い方なら0':'無ければ0')+'</span></div><input class="finput num" data-prfixed="'+i+'" inputmode="numeric" value="'+attr(fmtN(pr.fixed))+'" placeholder="0"></div>'
      +'<div class="frow"><div class="flabel">決め方</div><select class="finput" data-prmode="'+i+'">'
        +'<option value="none"'+(v.mode==='none'?' selected':'')+'>固定給（月給）だけ</option>'
        +'<option value="one"'+(v.mode==='one'?' selected':'')+'>固定給＋歩合（上乗せ）</option>'
        +'<option value="max"'+(v.mode==='max'?' selected':'')+'>高い方を採用（完全歩合＋保障）</option></select></div>'
      +'<div class="ri-note" style="margin:2px 2px 6px">'+modeNote+'</div>'+maxFixWarn
      +(v.mode!=='none'?(isMax?'<div class="hint" style="margin:2px 2px 4px;color:#3D6B53">高い方を採用する候補（歩合系＋保障）</div>':'<div class="hint" style="margin:2px 2px 4px;color:#3D6B53">上乗せする歩合など</div>')+partsHtml+'<div class="addcustom"><button class="btn-ghost" data-pradd="'+i+'" style="padding:8px 12px">＋'+(isMax?'候補':'項目')+'を追加</button></div>':'')
      +'<div class="ri-note" style="margin:4px 2px 0">例）完全歩合＋保障＝決め方「高い方」・候補〔売上×率:35〕〔時給×時間:1200（保障）〕・固定給0。／固定給＋歩合＝決め方「上乗せ」・固定給18万・項目〔歩合〕。歩合額・売上は毎月「入力」タブで。</div>'
      +'</div>';
  }
  // 給与パターンの適用select＋保存ボタン(従業員カード基本欄)
  function payPatternRow(e,i){
    var pats=state.payPatterns||[];
    return '<div class="frow"><div class="flabel">給与パターン<span class="hint2">任意</span></div>'
      +'<div style="display:flex;gap:6px;align-items:center">'
      +(pats.length?'<select class="finput pat-apply" data-i="'+i+'" style="flex:1"><option value="">— 選んで適用 —</option>'+pats.map(function(p){return '<option value="'+attr(p.id)+'">'+esc(p.name)+'</option>';}).join('')+'</select>':'<span style="flex:1;font-size:11px;color:#6E907E">まだパターンがありません</span>')
      +'<button class="btn-ghost pat-save" data-i="'+i+'" style="padding:9px 10px;white-space:nowrap;font-size:12px">この設定を保存</button></div></div>'
      +'<div class="hint" style="margin:2px 2px 8px">'+(pats.length?'選ぶと 給与形態・決め方・支給/控除項目 をこの人に反映（氏名・扶養・通勤などは変わりません）。':'「この設定を保存」で いまの給与形態・決め方・項目 を"パターン"化 → 他の人へ一括適用できます。')+'</div>';
  }
  // 給与パターンを複数の従業員へ一括適用(1人ずつでなく、選んだ人に一度に反映)
  function openBulkPatternApply(){
    var pats=state.payPatterns||[]; if(!pats.length){ uiAlert('先に、どれかの人で「この設定を保存」して給与パターンを作ってください。'); return; }
    var cands=state.employees.map(function(e,i){return {e:e,i:i};}).filter(function(x){ return !x.e.retired && !empOnLeave(x.e); }); // 在籍中のみ
    if(!cands.length){ uiAlert('適用できる在籍中の従業員がいません。'); return; }
    var sel={ patId:pats[0].id, ids:{} }; cands.forEach(function(x){ sel.ids[x.e.id]=true; }); // 既定は全員チェック
    var html=''
      +'<div class="frow"><div class="flabel">適用するパターン</div><select class="finput" id="bp-pat">'+pats.map(function(p){return '<option value="'+attr(p.id)+'">'+esc(p.name)+'</option>';}).join('')+'</select></div>'
      +'<div class="sec-lb" style="margin-top:10px;display:flex;align-items:center;gap:8px">適用する人<button class="btn-ghost" id="bp-all" style="padding:4px 10px;font-size:11px">全員 ON/OFF</button></div>'
      +'<div id="bp-emps" style="max-height:44vh;overflow:auto">'+cands.map(function(x){ return '<label class="bp-row" style="display:flex;align-items:center;gap:9px;padding:8px 4px;border-top:1px dashed #eaf3ee;font-size:13px;cursor:pointer"><input type="checkbox" class="bp-ck" data-eid="'+attr(x.e.id)+'" checked style="width:20px;height:20px;accent-color:#3D9E72"><span>'+esc(x.e.name||'（無名）')+'<span style="color:#8aa89a;font-size:11px;margin-left:4px">'+esc(x.e.payType||'')+'</span></span></label>'; }).join('')+'</div>'
      +'<div class="ri-note" style="margin-top:10px">給与形態・決め方・支給/控除項目が置き換わります。<b>氏名・扶養・通勤・給与額（基本給/時給）は変わりません。</b></div>';
    uiModal({ title:'給与パターンを一括適用', html:html, buttons:[{label:'キャンセル',val:false},{label:'適用',val:true,primary:true}],
      onRender:function(host){
        host.querySelector('#bp-pat').addEventListener('change',function(){ sel.patId=this.value; });
        host.addEventListener('change',function(ev){ var ck=ev.target.closest('.bp-ck'); if(ck) sel.ids[ck.dataset.eid]=ck.checked; });
        host.querySelector('#bp-all').addEventListener('click',function(){ var cks=host.querySelectorAll('.bp-ck'); var turnOn=[].some.call(cks,function(c){return !c.checked;}); [].forEach.call(cks,function(c){ c.checked=turnOn; sel.ids[c.dataset.eid]=turnOn; }); });
      }
    }).then(function(okv){
      if(!okv) return;
      var pat=(state.payPatterns||[]).find(function(x){return x.id===sel.patId;}); if(!pat) return;
      var ids=Object.keys(sel.ids).filter(function(id){return sel.ids[id];});
      if(!ids.length){ uiAlert('適用する人が選ばれていません。'); return; }
      var n=0; state.employees.forEach(function(e){ if(ids.indexOf(e.id)>=0){ applyPayPattern(e,pat); n++; } });
      renderEmpMaster(); if(window.persistSaveDebounced)persistSaveDebounced(); toast('「'+pat.name+'」を '+n+'名に適用しました');
    });
  }
  // 雑入力ウィザード(給料の決め方を言葉で→読み取る→数字例つき確認→設定)
  function parseRow(e,i){
    return '<div class="frow"><div class="flabel">雑に書いて作る<span class="hint2">任意</span></div>'
      +'<div style="display:flex;gap:6px;align-items:center"><input class="finput parse-in" data-i="'+i+'" placeholder="例：売上の3.5割か時給1200の高い方"><button class="btn-ghost parse-go" data-i="'+i+'" style="white-space:nowrap;padding:9px 12px">読み取る</button></div></div>'
      +'<div class="hint" style="margin:2px 2px 8px">給料の決め方を言葉で書いて「読み取る」→ 内容を"数字例つき"で確認して設定できます（時給/月給/日給/歩合/売上×率/件数×単価/固定＋歩合/高い方/段階制「◯万まで◯％超◯％」）。</div>';
  }
  // K3 源泉区分セレクタ(業務委託のみ)。該当区分=源泉プレビュー・非該当/その他=源泉なしの注記。
  function houshuKubunRow(e){
    var _SC=SC(); if(!_SC) return '';
    var cur=e.houshuKubun||'none';
    var opts=_SC.KUBUN_ORDER.map(function(k){ var o=_SC.KUBUN[k]; return '<option value="'+k+'"'+(cur===k?' selected':'')+'>'+esc(o.label)+'</option>'; }).join('');
    var k=_SC.kubunOf(cur), note='';
    if(k.gensen){
      var r=compute(e); var g=(r&&r.kojo)?r.kojo.filter(function(x){return /源泉/.test(x.label);}).reduce(function(a,x){return a+num(x.value);},0):0;
      note='<div class="hint" style="margin:2px 2px 8px;color:#3B7A5A">この区分は<b>源泉徴収の対象</b>＝明細に「源泉徴収税」が出ます（当月概算 '+yen(g)+'）。支払調書は年間'+(k.threshold?yen(k.threshold)+'超':'')+'で提出対象。対象額は<b>税込</b>で計算します。</div>';
    } else if(cur==='sonota'){
      note='<div class="hint" style="margin:2px 2px 8px;color:#8A5A00">区分が曖昧な時は「その他（非該当扱い）」＝源泉なし。掲載報酬に当たる場合のみ具体区分を選択（掛け過ぎ厳禁・最終判断は会社）。</div>';
    } else {
      note='<div class="hint" style="margin:2px 2px 8px;color:#6E907E">非該当（運転代行・運送等）＝源泉なし・支払調書の対象外（支給＝支払額）。</div>';
    }
    return '<div class="frow" style="margin:2px 2px 2px"><div class="flabel">源泉区分<span class="hint2">204条・該当時のみ源泉</span><span class="help-i" data-help="houshu">💡</span></div>'
      +'<select class="finput m-f" data-f="houshuKubun">'+opts+'</select></div>'+note;
  }
  function empCardBody(e,i){
    var dOpen=!!state.open['D'+e.id];
    var payField=(e.payType==='時給'?'hourly':e.payType==='歩合'?'hourlyGuarantee':'base');
    var amtLabel=(e.payType==='時給'?'時給単価':e.payType==='日給'?'日給額':e.payType==='役員'?'役員報酬':e.payType==='歩合'?'保障給の時給':'基本給');
    // ── 基本（常時表示）: これだけで登録と概算が成立 ──
    var isContractor=(e.employmentType==='contractor');
    var basic=''
      +'<div class="frow"><div class="flabel">氏名</div><input class="finput m-f" data-f="name" value="'+attr(e.name)+'"></div>'
      +'<div class="chip-row" style="margin:2px 0 8px;align-items:center"><span style="font-size:11px;color:#3D6B53;font-weight:700;margin-right:2px">雇用形態</span>'
        +[['employee','従業員（正社員/パート）'],['contractor','業務委託（個人事業主）']].map(function(o){ var on=(e.employmentType||'employee')===o[0]; return '<span class="chip'+(on?' on':'')+'" data-emptype="'+o[0]+'">'+(on?'✓ ':'')+o[1]+'</span>'; }).join('')
        +'<span class="help-i" data-help="emptype">💡</span></div>'
      +(isContractor
        ? '<div class="cr-warn" style="margin:0 2px 10px">⚠ 控除なしの<b>報酬明細</b>（源泉・社保・住民税・年末調整なし＝支給＝支払額）。<b>実態が従業員なら</b>社会保険・労働法の対象になる可能性があります（偽装請負）。'
          +'<details style="margin-top:5px"><summary style="cursor:pointer;color:#8A5A00;font-weight:700">次のどれかに当てはまると「従業員の可能性」▾</summary>'
          +'<ul style="margin:6px 0 0;padding-left:18px;line-height:1.8">'
          +'<li>仕事の依頼を断る自由がない</li>'
          +'<li>勤務時間・場所を会社が指定・管理している</li>'
          +'<li>本人が他人に代わってもらえない（代替不可）</li>'
          +'<li>報酬が時間・日給ベースで、欠勤控除や残業手当がある</li>'
          +'</ul><div style="font-size:11px;color:#6E907E;margin-top:5px">補足：車両・機材が会社負担／他社の仕事ができない専属 も労働者性を強めます。最終判断は総合判断＝このアプリは<b>可能性の目安</b>で、ブロックはしません。</div>'
          +'<div style="font-size:11px;color:#8A5A00;margin-top:5px">※ 士業・原稿料・デザイン料など<b>源泉徴収が必要な報酬</b>（所得税法204条）は、下の<b>「源泉区分」</b>で選ぶと明細に源泉が反映されます。運転代行・運送は源泉不要＝「非該当」のまま。</div></details></div>'
        : '')
      +(isContractor ? houshuKubunRow(e) : '')
      +(e.payType==='カスタム'
        ? '<div class="frow"><div class="flabel">給与形態</div><select class="finput m-f" data-f="payType">'+PAYTYPES.map(function(p){return '<option'+(p===e.payType?' selected':'')+'>'+p+'</option>';}).join('')+'</select></div>'+payRuleEditor(e,i)
        : '<div class="frow2"><div class="frow"><div class="flabel">給与形態</div><select class="finput m-f" data-f="payType">'+PAYTYPES.map(function(p){return '<option'+(p===e.payType?' selected':'')+'>'+p+'</option>';}).join('')+'</select></div>'
          +'<div class="frow"><div class="flabel">'+amtLabel+'<span class="hint2">円'+(e.payType==='歩合'?'/時':'')+'</span></div><input class="finput num m-f" data-f="'+payField+'" inputmode="numeric" value="'+attr(fmtN(e[payField]))+'"></div></div>'
          +(e.payType==='歩合'?'<div class="ri-note" style="margin:-4px 2px 8px">歩合給額は毎月「入力」タブで。基本給＝歩合実績と保障給（保障時給×総労働時間）の高い方（労基27条）。割増は歩合給÷総労働時間に上乗せ。</div>':''))
      +parseRow(e,i)
      +payPatternRow(e,i)
      +(function(){ var mw=minWageInfo(e); if(!mw) return '';
        var banner = mw.ok ? '' : '<div class="cr-warn" style="margin:0 2px 8px">⚠ '+mwWarnText(mw)+'</div>';
        // 減額特例(最賃法7条・労働局長許可)の入力=最賃割れ警告が出ている時 or 既に率が入っている時だけ薄く出す(通常は非表示=クラッターにしない)
        var showReduce = (!mw.ok) || num(e.minWageReduce)>0;
        var reduceRow = showReduce ? '<div class="frow" style="margin:0 2px 8px"><div class="flabel">最賃 減額特例<span class="hint2">%・労働局長の許可がある場合のみ</span><span class="help-i" data-help="saiteigengaku">💡</span></div><input class="finput num m-f" data-f="minWageReduce" inputmode="numeric" value="'+attr(e.minWageReduce)+'" placeholder="0" style="max-width:120px"></div>' : '';
        return banner+reduceRow; })()
      +(function(){ var h=hoshoInfo(e); return (h&&!h.ok)?'<div class="cr-warn" style="margin:0 2px 8px">⚠ '+hoshoWarnText()+'</div>':''; })()
      +(function(){ var a=annualHoursInfo(e); return (a&&a.over)?'<div class="cr-warn" style="margin:0 2px 8px">⚠ '+annualHoursWarnText(a)+'</div>':''; })()
      +'<div class="frow2"><div class="frow"><div class="flabel">都道府県<span class="hint2">健保率</span></div><select class="finput m-f" data-f="pref">'+prefOptions(e.pref)+'</select></div>'
        +'<div class="frow"><div class="flabel">通勤手当<span class="hint2">円/月</span><span class="help-i" data-help="commute">💡</span></div><input class="finput num m-f" data-f="commute" inputmode="numeric" value="'+attr(fmtN(e.commute))+'"></div></div>';
    // ── 詳細（折りたたみ・既定で閉じる）──
    // 詳細を4サブ折畳に分割(約20項目の壁を解消)。各フィールドHTMLは不変=配線(data-f/handler)そのまま。
    function subOpen(k){ return !!(state.open['DS'+e.id+k]); }
    function subsec(k,title,body){ var o=subOpen(k); return '<div class="emp-sub"><div class="emp-sub-h" data-dsub="'+i+':'+k+'">'+title+'<span class="mco-cv" style="margin-left:auto;transform:'+(o?'rotate(180deg)':'none')+'">▾</span></div>'+(o?'<div class="emp-sub-b">'+body+'</div>':'')+'</div>'; }
    var gZaiseki=''
      +'<div class="frow2"><div class="frow"><div class="flabel">従業員番号<span class="hint2">任意</span></div><input class="finput m-f" data-f="no" value="'+attr(e.no)+'"></div>'
        +'<div class="frow"><div class="flabel">生年月日</div><input class="finput m-f" data-f="birthYmd" type="date" value="'+attr(e.birthYmd)+'"></div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">入社日<span class="hint2">任意</span></div><input class="finput m-f" data-f="joinYmd" type="date" value="'+attr(e.joinYmd)+'"></div>'
        +'<div class="frow"><div class="flabel">退職日<span class="hint2">任意</span></div><input class="finput m-f" data-f="taishokuYmd" type="date" value="'+attr(e.taishokuYmd)+'"></div></div>'
      +'<div class="ri-note" style="margin:-4px 2px 8px">入社日・退職日を入れると、その月は<b>在籍日数で日割</b>・退職月の社保は<b>退職日が月末か否か</b>で自動判定。退職月の翌月以降は給与計算の対象から自動で外れます（日割は就業規則の定めに合わせて確認）。</div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">部署</div>'+deptSelect(e)+'</div>'
        +'<div class="frow"><div class="flabel">役職</div>'+roleSelect(e)+'</div></div>'
      +'<div class="frow"><div class="flabel">就業状況<span class="hint2">産休/育休/休職等</span><span class="help-i" data-help="workstatus">💡</span></div><select class="finput m-f" data-f="workStatus">'+WORK_STATUS.map(function(w){return '<option value="'+w[0]+'"'+((e.workStatus||'normal')===w[0]?' selected':'')+'>'+w[1]+'</option>';}).join('')+'</select>'+wsNoteHTML(e)+'</div>'
      +(empOnLeave(e)?'<div class="frow"><div class="flabel">休暇中の支給額<span class="hint2">円/月</span></div><input class="finput num m-f" data-f="leavePay" inputmode="numeric" value="'+attr(fmtN(e.leavePay))+'" placeholder="0（無給）"></div>':'')
      +'<div class="frow2"><div class="frow"><div class="flabel">年間所定休日<span class="hint2">日/年</span><span class="help-i" data-help="shoteibase">💡</span></div><input class="finput num m-f" data-f="annualHolidays" value="'+attr(e.annualHolidays)+'"></div>'
        +'<div class="frow"><div class="flabel">1日の所定労働</div><span class="dur"><input class="finput m-f dur-in" data-f="dailyWorkH" inputmode="numeric" value="'+attr(e.dailyWorkH)+'"><i>時</i><input class="finput m-f dur-in" data-f="dailyWorkM" inputmode="numeric" value="'+attr(e.dailyWorkM)+'"><i>分</i></span></div></div>'
      +'<div class="frow"><div class="flabel">週の所定労働時間<span class="hint2">時間/週・パートの社保判定に使用</span></div><input class="finput num m-f" data-f="weeklyScheduledH" inputmode="decimal" value="'+attr(e.weeklyScheduledH)+'" placeholder="例：20"></div>'
      +'<div class="ri-note" style="margin:-4px 2px 8px">パート・アルバイトの<b>社会保険の加入対象か</b>の目安に使います（正社員の3/4以上、または週20時間以上など）。空欄なら判定しません。</div>';
    var gZei=''
      +'<div class="frow2"><div class="frow"><div class="flabel">扶養人数<span class="hint2">配偶者含・16歳以上</span><span class="help-i" data-help="fuyou">💡</span></div><input class="finput num m-f" data-f="fuyou" value="'+attr(e.fuyou)+'"></div>'
        +'<div class="frow"><div class="flabel">16歳未満の扶養<span class="hint2">人・住民税用</span></div><input class="finput num m-f" data-f="nenshoFuyo" inputmode="numeric" value="'+attr(e.nenshoFuyo)+'" placeholder="0"></div></div>'
      +((e.taxClass||'ko')==='ko'
        ? '<div class="chip-row" style="margin:-2px 0 4px;align-items:center"><span style="font-size:11px;color:#3D6B53;font-weight:700;margin-right:2px">本人の事情</span>'
          +'<span class="chip'+(e.honninShogai?' on':'')+'" data-honnin="shogai">'+(e.honninShogai?'✓ ':'')+'障害者</span>'
          +'<span class="chip'+(e.honninKafuHitorioya==='kafu'?' on':'')+'" data-honnin="kafu">'+(e.honninKafuHitorioya==='kafu'?'✓ ':'')+'寡婦</span>'
          +'<span class="chip'+(e.honninKafuHitorioya==='hitorioya'?' on':'')+'" data-honnin="hitorioya">'+(e.honninKafuHitorioya==='hitorioya'?'✓ ':'')+'ひとり親</span>'
          +'<span class="chip'+(e.honninKinrou?' on':'')+'" data-honnin="kinrou">'+(e.honninKinrou?'✓ ':'')+'勤労学生</span></div>'
          +'<div class="hint" style="margin:0 2px 10px;font-size:10px;color:#527A66">該当すると甲欄の源泉税で「扶養親族等の数」に＋1（該当ごと）。扶養親族が障害者の場合は年末調整で精算します。</div>'
        : '')
      +'<div class="chip-row" style="margin:-2px 0 10px;align-items:center"><span style="font-size:11px;color:#3D6B53;font-weight:700;margin-right:2px">所得税区分</span>'
        +[['ko','甲（通常）'],['otsu','乙（副業）'],['hei','丙（日雇い）']].map(function(o){ var on=(e.taxClass||'ko')===o[0]; return '<span class="chip'+(on?' on':'')+'" data-taxc="'+o[0]+'">'+(on?'✓ ':'')+o[1]+'</span>'; }).join('')
        +'<span class="help-i" data-help="taxclass" style="margin-left:4px">💡</span></div>'
      +(e.taxClass==='hei'?'<div class="sh-warn" style="margin:-4px 0 10px">丙欄＝<b>日雇い</b>（日々雇い・継続2か月以内）向け。所得税＝<b>日額表 丙欄（令和8年分）×出勤日数</b>で計算します（日給・扶養や甲乙の算式は使いません）。2か月を超えたら甲/乙へ。'+(e.payType!=='日給'?'<br><b>⚠ 丙は給与形態＝日給が前提です。現在「'+esc(e.payType)+'」なので丙は適用せず甲欄で計算しています。</b>':'')+'</div>':'')
      +'<div class="frow2"><div class="frow"><div class="flabel">住民税<span class="hint2">徴収方法</span><span class="help-i" data-help="juminzei">💡</span></div><select class="finput m-f" data-f="residentTaxMode"><option value="monthly"'+(e.residentTaxMode==='annual'?'':' selected')+'>月額を直接（通知書）</option><option value="annual"'+(e.residentTaxMode==='annual'?' selected':'')+'>年額から自動（12分割）</option></select></div>'
        +(e.residentTaxMode==='annual'
          ? '<div class="frow"><div class="flabel">年税額<span class="hint2">円/年・通知書</span></div><input class="finput num m-f" data-f="residentTaxAnnual" inputmode="numeric" value="'+attr(fmtN(e.residentTaxAnnual))+'"></div>'
          : '<div class="frow"><div class="flabel">月額<span class="hint2">円/月</span></div><input class="finput num m-f" data-f="residentTax" inputmode="numeric" value="'+attr(fmtN(e.residentTax))+'"></div>')
        +'</div>'
      +(e.residentTaxMode==='annual'
        ? '<div class="hint" style="margin:-4px 2px 10px">当月（'+esc(state.month)+'）の天引き額 <b>'+yen(residentTaxOf(e))+'</b>'
          +((e.taishokuYmd&&/^\d{4}-(0[6-9]|1[0-2])/.test(e.taishokuYmd))?' <span class="chip'+(e.residentTaxIkkatsu?' on':'')+'" data-rtik="1" style="cursor:pointer">'+(e.residentTaxIkkatsu?'✓ ':'')+'退職時に残額を一括</span>':'')
          +'<div style="color:#92500A;margin-top:3px">特別徴収は6月〜翌5月。<b>通知書の額が正</b>（自動は端数を6月に合算した概算）。1〜4月退職は残額一括（法定）、6〜12月退職は普通徴収へ（申出で一括）。</div></div>'
        : '')
      +'<div class="chip-row" style="margin:-2px 0 10px;align-items:center"><span style="font-size:11px;color:#3D6B53;font-weight:700;margin-right:2px">住民税の納め方</span>'
        +[['special','特別徴収（給与天引き）'],['ordinary','普通徴収（本人納付）']].map(function(o){ var on=(e.juminCollect||'special')===o[0]; return '<span class="chip'+(on?' on':'')+'" data-jumincol="'+o[0]+'">'+(on?'✓ ':'')+o[1]+'</span>'; }).join('')
        +'<span class="hint" style="font-size:10px;color:#527A66;margin-left:4px">給与支払報告書の総括表で人員を内訳します。</span></div>';
    var gShaho=''
      +shahoSection(e)
      +'<div class="sec-lb" style="border-top:1px dashed #d4eae0">法定控除（使わないものは外せる）<span class="help-i" data-help="legalkojo">💡</span></div>'
      +'<div class="chip-row">'+LEGAL_KOJO.map(function(lk){
          if(lk[0]==='kaigo'){ var kt=(window.PayrollCalc&&PayrollCalc.isKaigoTarget(e.birthYmd,state.month)); if(!kt) return '<span class="chip chip-dim" title="40〜64歳が対象。生年月日から自動">介護保険（対象外）</span>'; var ko=(e.apply&&e.apply.kaigo===false); return '<span class="chip chip-auto'+(ko?'':' on')+'" data-apply="kaigo" title="40〜64歳=自動で対象">'+(ko?'':'✓ ')+'介護保険（自動）</span>'; }
          var off=(e.apply&&e.apply[lk[0]]===false); return '<span class="chip chip-auto'+(off?'':' on')+'" data-apply="'+lk[0]+'">'+(off?'':'✓ ')+esc(lk[1])+'</span>';
        }).join('')+'</div>'+shahoOffWarn(e)+shahoKanyuWarn(e);
    var gTeate=''
      +'<div class="frow"><div class="flabel">通勤方法</div><select class="finput m-f" data-f="commuteType"><option value="public"'+(e.commuteType!=='car'?' selected':'')+'>公共交通</option><option value="car"'+(e.commuteType==='car'?' selected':'')+'>マイカー等</option></select></div>'
      +(e.commuteType==='car'?'<div class="frow2"><div class="frow"><div class="flabel">片道距離<span class="hint2">km</span></div><input class="finput num m-f" data-f="commuteKm" value="'+attr(e.commuteKm)+'"></div><div class="frow"><div class="flabel">非課税限度<span class="hint2">自動</span></div><input class="finput num" value="'+yen(commuteLimit(e))+'" readonly style="background:#f7fcf9;color:#3D6B53"></div></div>':'<div class="hint" style="margin:-4px 0 10px">公共交通＝月15万まで非課税。マイカーは距離別（自動）。</div>')
      +'<div class="frow2"><div class="frow"><div class="flabel">郵便番号<span class="hint2">ハイフンあり</span></div><input class="finput m-f" data-f="zip" value="'+attr(e.zip)+'" placeholder="150-0001"></div>'
        +'<div class="frow"><div class="flabel">住所<span class="hint2">源泉徴収票用</span></div><input class="finput m-f" data-f="address" value="'+attr(e.address)+'" placeholder="東京都渋谷区〇〇1-2-3 〇〇マンション101"></div></div>'
      +'<div class="frow"><div class="flabel">振込先<span class="hint2">明細に表示・任意</span></div><input class="finput m-f" data-f="bank" value="'+attr(e.bank)+'" placeholder="○○銀行 普通 1234567"></div>'
      +'<div class="sec-lb" style="border-top:1px dashed #d4eae0">総合振込データ用<span class="hint2">銀行に送る全銀ファイル用・任意</span></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">銀行名</div><input class="finput m-f" data-f="furiBankName" value="'+attr(e.furiBankName)+'" placeholder="ﾐｽﾞﾎ"></div>'
        +'<div class="frow"><div class="flabel">銀行コード<span class="hint2">4桁</span></div><input class="finput m-f" data-f="furiBankNo" inputmode="numeric" maxlength="4" value="'+attr(e.furiBankNo)+'" placeholder="0001"></div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">支店名</div><input class="finput m-f" data-f="furiBranchName" value="'+attr(e.furiBranchName)+'" placeholder="ﾎﾝﾃﾝ"></div>'
        +'<div class="frow"><div class="flabel">支店コード<span class="hint2">3桁</span></div><input class="finput m-f" data-f="furiBranchNo" inputmode="numeric" maxlength="3" value="'+attr(e.furiBranchNo)+'" placeholder="001"></div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">科目</div><select class="finput m-f" data-f="furiYokin"><option'+((e.furiYokin==='普通'||!e.furiYokin)?' selected':'')+'>普通</option><option'+(e.furiYokin==='当座'?' selected':'')+'>当座</option><option'+(e.furiYokin==='貯蓄'?' selected':'')+'>貯蓄</option></select></div>'
        +'<div class="frow"><div class="flabel">口座番号<span class="hint2">7桁</span></div><input class="finput m-f" data-f="furiAccount" inputmode="numeric" maxlength="7" value="'+attr(e.furiAccount)+'" placeholder="1234567"></div></div>'
      +'<div class="frow"><div class="flabel">受取人名（半角ｶﾅ）<span class="hint2">空欄なら氏名から自動変換</span></div><input class="finput m-f" data-f="furiKana" value="'+attr(e.furiKana)+'" placeholder="ﾔﾏﾀﾞ ﾊﾅｺ"></div>'
      +'<div class="sec-lb">支給項目（タップでON/OFF・通勤は上の欄）</div><div class="chip-row">'+chips(e,SUP_POOL,'shikyu')+'</div>'
      +'<div class="addcustom"><input class="finput ac-inp" data-g="shikyu" list="dl-item-shikyu" placeholder="自由な項目名（例：特別手当）"><button class="btn-ghost ac-btn" data-g="shikyu" style="padding:10px 12px">＋追加</button></div>'
      +basisBoxHTML(e)
      +'<div class="sec-lb">控除項目（法定は自動・任意分のみ）</div><div class="chip-row">'+chips(e,KOJO_POOL,'extraKojo')+'</div>'
      +'<div class="addcustom"><input class="finput ac-inp" data-g="extraKojo" list="dl-item-kojo" placeholder="自由な項目名（例：寮費）"><button class="btn-ghost ac-btn" data-g="extraKojo" style="padding:10px 12px">＋追加</button></div>';
    // 業務委託=税・社保は無関係なので節ごと差し替え(個別トグルを触らせない=固まらない・複雑化しない)。従業員は従来どおり。
    var contractorPanel='<div class="emp-sub"><div class="emp-sub-b"><div class="ri-note" style="margin:8px 2px">業務委託（個人事業主）＝<b>控除なしの報酬明細</b>。源泉徴収・社会保険・住民税・年末調整はありません（支給＝支払額）。<br>※源泉が要るのは原稿料・士業など<b>限定8区分だけ</b>。運転代行・運送の外注は対象外＝源泉しません（国税庁No.2792）。従業員に切り替えると従来のフル控除に戻ります。</div></div></div>';
    var detail=(isContractor
        ? subsec('zaiseki','在籍・勤務',gZaiseki)+contractorPanel+subsec('teate','手当・振込・控除',gTeate)
        : subsec('zaiseki','在籍・勤務',gZaiseki)+subsec('zei','税・住民税',gZei)+subsec('shaho','社会保険',gShaho)+subsec('teate','通勤・手当・振込・控除',gTeate))
      +'<div style="display:flex;justify-content:space-between;margin-top:10px">'
        +'<button class="m-retire btn-ghost" style="color:#7A6A2E;border-color:#e6dcb0;padding:8px 14px">'+(e.retired?'復帰させる':'退職にする')+'</button>'
        +'<button class="m-del-emp btn-ghost" style="color:#C0392B;border-color:#f3c9c4;padding:8px 14px">この従業員を削除</button></div>';
    return '<div class="mco-body">'+basic
      +'<div class="emp-dtgl" data-dtoggle="'+i+'">詳細設定（社保・控除・手当・在籍など）<span class="mco-cv" style="margin-left:auto;transform:'+(dOpen?'rotate(180deg)':'none')+'">▾</span></div>'
      +(dOpen?'<div class="emp-detail">'+detail+'</div>':'')
      +'</div>';
  }
  var SH_MODES=[['auto','基本給から自動','見込み不要'],['teiji','毎年の見直し','4〜6月'],['shutoku','入社したばかり','資格取得'],['zuiji','給料が変わった','随時改定'],['manual','金額が分かる','直接入力']];
  // 随時改定(月額変更届)の該当判定を表示(社労士: 2等級差・全月17日以上・固定的賃金変動・4か月目適用)。届出は人が行う前提の"目安"。
  function zuijiJudgeHTML(e){
    var s=e.shaho||{}; var PC=window.PayrollCalc;
    if(!(PC&&PC.zuijiKaitei)) return '';
    var z=PC.zuijiKaitei({ months:(s.months||[]).map(function(m){return {pay:num(m&&m.pay),days:num(m&&m.days)};}), prevHyojun:num(s.prevHyojun), fixedChanged:!!s.fixedChanged, henkoYm:s.henkoYm });
    // 厚年・健保それぞれの答えを1行ずつ出す(随時改定は保険ごとに届け出る)
    function insLine(lbl, ins){
      if(!(ins.prevGrade>0||ins.newGrade>0)) return '';
      var tag=ins.eligible?'<b style="color:#2E7D54">該当</b>':'<span style="color:#7A8B83">対象外</span>';
      return '<div class="zk-ins">'+lbl+'：従前 '+ins.prevGrade+'等級（'+yen(ins.prevHyojun)+'）→ 改定後 '+ins.newGrade+'等級（'+yen(ins.newHyojun)+'）／'+ins.diff+'等級差　'+tag+'</div>';
    }
    if(z.eligible){
      return '<div class="zk-hit"><div class="zk-t">✓ 随時改定に該当します（'+esc(z.which||'')+'）</div>'
        +insLine('厚生年金', z.pension)+insLine('健康保険', z.health)
        +(z.applyYm?'<div class="zk-d">適用：<b>'+z.applyYm+'</b>から（変動月の4か月目）'+((z.pension.eligible!==z.health.eligible)?'　※該当した保険だけ届け出ます':'')+'</div>':'')
        +'<div class="zk-note">※ 届出（月額変更届）は事業主が年金事務所へ。このアプリは要件の目安です。</div></div>';
    }
    return '<div class="zk-miss"><div class="zk-t">今のところ随時改定には該当しません</div>'
      +insLine('厚生年金', z.pension)+insLine('健康保険', z.health)
      +(z.reasons&&z.reasons.length?'<ul class="zk-rs">'+z.reasons.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>':'')
      +(z.avg>0?'<div class="zk-note">3か月平均 '+yen(z.avg)+'。2等級以上の差＋固定給変動＋全月17日以上で届出対象になります。</div>':'')+'</div>';
  }
  function refreshZuiji(i){ var e=state.employees[i]; var card=$('#emp-list .mco[data-i="'+i+'"]'); if(!card)return; var box=card.querySelector('.zk-box'); if(box) box.innerHTML=zuijiJudgeHTML(e); }
  function shahoSection(e){
    var s=e.shaho||{mode:'auto',months:[]}; var mode=s.mode||'auto';
    var r=compute(e), sb=shahoBasisOf(e);
    // 2段: 既定は「自動(基本給から)」を主役に。他4モードは「詳しく」を開いた時だけ(既に詳細選択済なら開いて表示)
    var shdOpen = !!(state.open&&state.open['SHD'+e.id]) || mode!=='auto';
    var seg;
    if(shdOpen){
      seg='<div class="sh-seg">'+SH_MODES.map(function(m){return '<b class="sh-mode'+(mode===m[0]?' on':'')+'" data-mode="'+m[0]+'">'+m[1]+'<span class="j">'+m[2]+'</span></b>';}).join('')+'</div>';
      // 支払基礎日数の区分(算定基礎届・月額変更届の日数基準が変わる)。通常17日/パート=17日(なければ15日)/短時間労働者(社保)=11日
      seg+='<div class="chip-row" style="margin:-2px 0 4px"><span style="font-size:11px;color:#3D6B53;font-weight:700;margin-right:2px">勤務区分</span>'
        +[['','通常（17日）'],['part','短時間就労者・パート（15日特例）'],['tanjikan','短時間労働者・社保（11日）']].map(function(o){ var on=(stType(e)===o[0]); return '<span class="chip'+(on?' on':'')+'" data-sttype="'+o[0]+'">'+(on?'✓ ':'')+o[1]+'</span>'; }).join('')+'</div>'
        +'<div class="hint" style="margin:0 2px 8px;font-size:10px;color:#527A66">算定基礎届・月額変更届の支払基礎日数の基準が変わります（通常17日／パートは17日、無ければ15日／社保の短時間被保険者は11日）。</div>';
    } else {
      seg='<div class="sh-auto-lead">✓ 標準報酬は<b>基本給から自動</b>で計算（見込み・4〜6月の入力は不要）</div>'
        +'<div class="sh-dtgl" data-shd="'+e.id+'">詳しく（定時決定・入社時・随時改定・直接入力）<span class="mco-cv" style="margin-left:6px">▾</span></div>';
    }
    var body='';
    if(shdOpen){
    if(mode==='auto'){
      body+='<div class="sh-tip">入力した<b>基本給＋手当（通勤含む）</b>から標準報酬を自動で当て、社会保険を計算します。<b>見込みや4〜6月の入力は不要</b>。正式な決定額があれば右の他タブで上書きできます。</div>';
    } else if(mode==='teiji'||mode==='zuiji'){
      var ms=s.months||[]; var labels=mode==='teiji'?['4月','5月','6月']:['1か月目','2か月目','3か月目'];
      var th=(stType(e)==='tanjikan'?11:stType(e)==='part'?15:17); // shahoBasisOfと同じ支払基礎日数のしきい値(除外表示用)
      body+='<div class="sh-tip">'+(mode==='teiji'?'4・5・6月の<b>総支給額</b>(手当含む・賞与除く)と<b>支払基礎日数</b>。月給は原則その月の暦日数。':'昇給/降給後の<b>連続3か月</b>を入力。')+'<b>'+th+'日未満の月は自動で除外</b>。</div>';
      body+='<div class="f3">'+labels.map(function(lab,k){var mm=ms[k]||{};var ex=(num(mm.days)>0&&num(mm.days)<th);return '<div class="mcol'+(ex?' ex':'')+'"><div class="mlb">'+lab+'</div><input class="finput num sh-pay" data-k="'+k+'" value="'+attr(mm.pay)+'" placeholder="総支給"><div class="drow"><span>支払基礎日数</span><input class="dinp sh-days" data-k="'+k+'" value="'+attr(mm.days)+'"></div></div>';}).join('')+'</div>';
      if(sb.excluded&&sb.excluded.length) body+='<div class="exinfo">✓ '+sb.excluded.map(function(x){return labels[x];}).join('・')+'は支払基礎日数が'+th+'日未満のため<b>ルール上この月を計算から外しました</b>（あなたのミスではありません）。残りの月の平均で算定します。</div>';
      if(mode==='teiji') body+='<div style="text-align:right;margin-top:2px"><span class="sh-refetch" data-refetch="1" style="font-size:12px;color:#3D9E72;text-decoration:underline;cursor:pointer">過去の4〜6月から自動入力</span></div>';
      if(mode==='zuiji'){
        body+='<div class="zk-inp"><div class="frow"><div class="flabel">変動があった月<span class="hint2">昇給・降給した月</span></div><input type="month" class="finput sh-henko" value="'+attr(s.henkoYm)+'"></div>'
          +'<div class="frow"><div class="flabel">従前の標準報酬月額<span class="hint2">円・変動前</span><span class="help-i" data-help="toukyu">💡</span></div><input class="finput num sh-prevhyojun" value="'+attr(s.prevHyojun)+'" placeholder="200000"></div>'
          +'<div class="nw-row" style="margin:2px 0 6px"><div class="nw-q">固定的賃金（基本給・手当など）が変わりましたか？<div class="nw-help">昇給・降給・手当の新設/廃止など。残業だけの増減は含みません。</div></div><div class="nw-in">'+ynPill('shfixed','1',!!s.fixedChanged)+'</div></div></div>';
        body+='<div class="zk-box">'+zuijiJudgeHTML(e)+'</div>';
      }
    } else if(mode==='shutoku'){
      body+='<div class="sh-tip">入社時は実績が無いので<b>入社月の見込み月額</b>（基本給＋手当の見込み・通勤含む）で決定します。</div><div class="frow"><div class="flabel">見込み月額<span class="hint2">円</span></div><input class="finput num sh-mikomi" value="'+attr(s.mikomi)+'" placeholder="280000"></div>';
    } else {
      body+='<div class="sh-tip">決定通知書・保険料額表の<b>標準報酬月額</b>をそのまま入力します。</div><div class="frow"><div class="flabel">標準報酬月額<span class="hint2">円</span></div><input class="finput num sh-manual" value="'+attr(s.manual)+'" placeholder="340000"></div>';
    }
    } // shdOpen
    var period=mode==='auto'?'基本給ベース（自動・あとで上書き可）':mode==='teiji'?'その年9月〜翌8月（毎年見直し）':mode==='shutoku'?'入社月〜（次の見直しまで）':mode==='zuiji'?'変動の4か月目〜（次の見直しまで）':'通知書のとおり';
    var exempt=(e.workStatus==='sankyu'||e.workStatus==='ikukyu');
    return '<div class="sec-lb" style="border-top:1px dashed #d4eae0">社会保険（毎月の天引き）<span class="help-i" data-help="shaho">💡</span></div>'+seg+body+shahoHeroHTML(r,period,sb.undetermined,mode==='auto',exempt);
  }
  function shahoHeroHTML(r,period,undet,isAuto,exempt){
    if(exempt){
      return '<div class="sh-hero"><div class="lb">毎月この人から天引きする社会保険（本人負担）</div><div class="big">'+yen(0)+'<span style="font-size:12px;color:#3D9E72;font-family:\'Noto Sans JP\'"> 免除中</span></div>'
        +'<div class="bd">産休・育休中は健保・厚年・介護が<b>免除</b>（本人・会社とも0）</div></div>'
        +'<div class="sh-sub">※復帰したら就業状況を「通常」に戻すと自動で再開します。</div>';
    }
    var soho=r.si.health+r.si.pension+(r.si.kaigo||0);
    var tag=isAuto?' 自動':undet?' 暫定':'';
    var sohoParts=[]; // 年齢資格喪失(厚年70/健保75)で0の保険は表示しない
    if(r.si.health>0) sohoParts.push('健康保険 <b>'+yen(r.si.health)+'</b>');
    if(r.si.pension>0) sohoParts.push('厚生年金 <b>'+yen(r.si.pension)+'</b>');
    if(r.si.kaigo>0) sohoParts.push('介護保険 <b>'+yen(r.si.kaigo)+'</b>');
    return '<div class="sh-hero"><div class="lb">毎月この人から天引きする社会保険（本人負担）</div><div class="big">'+yen(soho)+(tag?'<span style="font-size:12px;color:#5C7E6C;font-family:\'Noto Sans JP\'">'+tag+'</span>':'')+'</div>'
      +'<div class="bd">'+(sohoParts.length?sohoParts.join('　＋　'):'年齢により社会保険の対象外です')+'</div></div>'
      +'<div class="sh-sub">もとになる「標準報酬月額」＝<b>'+yen(r.hyojun)+'</b>'+(isAuto?'（基本給＋手当から自動）':undet?'（暫定：当月支給ベース）':'（保険料計算の“ものさし”・自動で決まる）')+'／適用：'+period+'</div>';
  }
  function refreshShaho(i){
    var e=state.employees[i]; var card=$('#emp-list .mco[data-i="'+i+'"]'); if(!card)return;
    var r=compute(e); var mode=(e.shaho&&e.shaho.mode)||'auto';
    var period=mode==='auto'?'基本給ベース（自動・あとで上書き可）':mode==='teiji'?'その年9月〜翌8月（毎年見直し）':mode==='shutoku'?'入社月〜（次の見直しまで）':mode==='zuiji'?'変動の4か月目〜（次の見直しまで）':'通知書のとおり';
    var hero=card.querySelector('.sh-hero'); var sub=card.querySelector('.sh-sub');
    if(hero&&sub){ var tmp=document.createElement('div'); tmp.innerHTML=shahoHeroHTML(r,period,shahoBasisOf(e).undetermined,mode==='auto',(e.workStatus==='sankyu'||e.workStatus==='ikukyu')); hero.replaceWith(tmp.firstChild); card.querySelector('.sh-sub').replaceWith(tmp.lastChild); }
  }
  // 表示順(部署グループ+退職表示の順)の従業員index配列
  function empOnLeave(e){ return !!(e&&e.workStatus&&e.workStatus!=='normal'); }
  function empMatchesFilter(e){ var f=state.empFilter||'active'; if(f==='all')return true; if(f==='retired')return !!e.retired; if(f==='leave')return !e.retired&&empOnLeave(e); return !e.retired&&!empOnLeave(e); }
  function visibleEmpIdx(){ var arr=[]; var groups={},order=[]; state.employees.forEach(function(e,idx){ if(!empMatchesFilter(e))return; var g=e.dept||'未分類'; if(!groups[g]){groups[g]=[];order.push(g);} groups[g].push(idx); }); order.forEach(function(g){ groups[g].forEach(function(idx){ arr.push(idx); }); }); return arr; }
  // 従業員を表示順で1つ上(dir=-1)/下(dir=+1)へ。配列の並びを入替=入力/一覧/印刷/Excel 全部に反映・永続(sort:i)
  function moveEmp(i, dir){ var vis=visibleEmpIdx(); var p=vis.indexOf(i); var q=p+dir; if(p<0||q<0||q>=vis.length) return; var a=state.employees, j=vis[q]; var t=a[i]; a[i]=a[j]; a[j]=t; renderEmpMaster(); }
  // 従業員がWeb明細から登録した振込先(会社が従業員マスタへ取り込む)
  var PROFILE_KEYS=['zip','address','furiBankName','furiBankNo','furiBranchName','furiBranchNo','furiYokin','furiAccount','furiKana'];
  function applyEmpProfile(e, data){ if(!e||!data) return; PROFILE_KEYS.forEach(function(k){ if(data[k]!=null && data[k]!=='') e[k]=data[k]; }); if(!e.bank){ var disp=[data.furiBankName,data.furiYokin,data.furiAccount].filter(Boolean).join(' '); if(disp) e.bank=disp; } }
  function loadEmpProfiles(){ if(!(window.Store&&Store.listEmpProfile)) return; Store.listEmpProfile().then(function(list){ state._empProfiles={}; (list||[]).forEach(function(p){ if(p&&p.employeeId) state._empProfiles[p.employeeId]=p; }); renderEmpMaster(); }).catch(function(){}); }
  function pendingProfileEmps(){ var profs=state._empProfiles||{}, imp=state._profImported||{}; return state.employees.filter(function(e){ return !e.retired && profs[e.id] && !imp[e.id]; }); }
  function empProfileStripHTML(){
    var list=pendingProfileEmps(); if(!list.length) return '';
    return '<div class="prof-strip" style="background:#EAF7F0;border:1.5px solid #C8ECD8;border-radius:10px;padding:8px 10px;margin:0 0 8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">'
      +'<span style="font-size:12px;font-weight:700;color:#2E7D54;flex-basis:100%">🏦 本人がWebで振込先を登録しました（確認して取り込み）</span>'
      +list.map(function(e){ return '<button class="btn-ghost prof-import" data-profimport="'+attr(e.id)+'" style="padding:6px 12px;font-size:12px">'+esc(e.name||'（無名）')+' を取り込む</button>'; }).join('')
      +(list.length>1?'<button class="btn-ghost" data-profimportall="1" style="padding:6px 12px;font-size:12px;font-weight:700">全員まとめて取り込む</button>':'')
      +'</div>';
  }
  function importEmpProfile(eid){ var p=(state._empProfiles||{})[eid], e=state.employees.filter(function(x){return x.id===eid;})[0]; if(!p||!e) return false; applyEmpProfile(e,p.data); if(!state._profImported)state._profImported={}; state._profImported[eid]=true; return true; }
  function renderEmpMaster(){
    fillCompany();
    var host=$('#emp-list'); if(!host) return;
    // 部署でグループ化（誰も部署無しなら見出し非表示）
    var anyDept=state.employees.some(function(e){return e.dept;});
    // 絞り込み: active=在籍中(非退職&通常) / leave=休暇中 / retired=退職者 / all=全員
    var filt=state.empFilter||'active';
    var cActive=state.employees.filter(function(e){return !e.retired&&!empOnLeave(e);}).length;
    var cLeave=state.employees.filter(function(e){return !e.retired&&empOnLeave(e);}).length;
    var cRet=state.employees.filter(function(e){return !!e.retired;}).length;
    var FILTERS=[['active','在籍中',cActive],['leave','休暇中',cLeave],['retired','退職者',cRet],['all','全員',state.employees.length]];
    var groups={}; var order=[];
    state.employees.forEach(function(e,i){ if(!empMatchesFilter(e)) return; var g=e.dept||'未分類'; if(!groups[g]){groups[g]=[];order.push(g);} groups[g].push(i); });
    var html='<div class="emp-filter">'+FILTERS.map(function(f){ return '<b class="ef-b'+(filt===f[0]?' on':'')+'" data-empfilter="'+f[0]+'">'+f[1]+'<span class="ef-n">'+f[2]+'</span></b>'; }).join('')+'</div>';
    html+=itemSuggestHTML(); // カスタム項目名の候補(過去に使った名前＋定番)
    html+=empProfileStripHTML();
    var pats=state.payPatterns||[];
    if(pats.length) html+='<div class="pat-strip"><span class="pat-strip-l">給与パターン</span>'+pats.map(function(p){ return '<span class="pat-chip">'+esc(p.name)+'<b class="pat-del" data-patdel="'+attr(p.id)+'">×</b></span>'; }).join('')+(cActive>=1?'<button class="btn-ghost pat-bulk" style="padding:5px 12px;font-size:12px;white-space:nowrap">選んで一括適用</button>':'')+'</div>';
    html+='<div class="hint" style="margin:0 2px 8px">カードを左にスワイプ＝削除（または開いて下の「削除」）。休暇・退職もここで（カードを開いて設定）。'+(pats.length?'給与パターンは各カードの「給与パターン」で1人ずつ、または上の「選んで一括適用」で複数人へまとめて適用。':'')+'</div>';
    if(!order.length) html+='<p class="hint" style="margin:8px 2px">この絞り込みに該当する人はいません。</p>';
    order.forEach(function(g){
      if(anyDept) html+='<div class="grp-hd">'+esc(g)+'（'+groups[g].length+'名）</div>';
      groups[g].forEach(function(i){
        var e=state.employees[i], op=state.open[e.id];
        html+='<div class="mco'+(op?' open':'')+(e.retired?' mco-retired':'')+'" data-i="'+i+'">'
          +'<div class="mco-hd" data-toggle="'+i+'"><span class="mco-nm">'+esc(e.name||'（無名）')+'</span>'
            +'<span class="hd-chip'+(e.workStatus&&e.workStatus!=='normal'?' on':'')+'" data-goleave="'+i+'">'+(e.workStatus&&e.workStatus!=='normal'?esc(WS_LABEL(e.workStatus)):'休暇')+'</span>'
            +(e.retired?'<span class="hd-chip" style="color:#8a7a4e;border-color:#e6dcb0;cursor:default">退職済</span>':'')
            +'<span class="mco-sub">'+esc(e.payType)+(e.role?' / '+esc(e.role):'')+'</span>'
            +(visibleEmpIdx().length>1?'<span class="mco-ord"><button class="ord-b" data-moveup="'+i+'" title="上へ" aria-label="上へ移動">▲</button><button class="ord-b" data-movedn="'+i+'" title="下へ" aria-label="下へ移動">▼</button></span>':'')
            +'<span class="mco-cv">▾</span></div>'
          +(op?empCardBody(e,i):'')+'</div>';
      });
    });
    var _sy=window.scrollY; host.innerHTML=html; if(_sy) window.scrollTo(0,_sy); // 全再描画でスクロール位置が飛ぶのを防ぐ(H2)
    filterEmpSearch(); // 検索語があれば再描画後も絞り込みを維持(UX#9)
  }
  // 氏名検索(全競合が持つtable-stakes)。#emp-searchは静的なので再描画で焦点が飛ばない。カードを表示/非表示で絞る。
  function filterEmpSearch(){
    var inp=$('#emp-search'), host=$('#emp-list'); if(!inp||!host) return;
    var term=String(inp.value||'').trim().toLowerCase(); var cards=host.querySelectorAll('.mco'); var shown=0;
    cards.forEach(function(c){ var nm=((c.querySelector('.mco-nm')||{}).textContent||'').toLowerCase(); var hit=!term||nm.indexOf(term)>=0; c.style.display=hit?'':'none'; if(hit)shown++; });
    // 部署見出し(.grp-hd): 直後の可視カードが無ければ隠す
    host.querySelectorAll('.grp-hd').forEach(function(gh){ var any=false, n=gh.nextElementSibling; while(n && !n.classList.contains('grp-hd')){ if(n.classList.contains('mco')&&n.style.display!=='none'){any=true;break;} n=n.nextElementSibling; } gh.style.display=(term&&!any)?'none':''; });
    var cnt=$('#emp-search-count'); if(cnt) cnt.textContent=term?(shown+'名'):'';
  }

  /* ---------- 入力（自動計算） ---------- */
  function rowsHTML(g,arr){
    return arr.map(function(it,ri){
      var labelAuto=/通勤|出張|旅費|宿泊|日当/.test(it.label||'');
      // 支給行は非課税を“トグル”に(任意の手当を非課税にできる)。項目名で自動判定される通勤等はON固定(自動)
      var hz='';
      if(g==='shikyu'){
        // 非課税は名称一致(通勤/出張/旅費/宿泊/日当)なら既定ON・ただし外せる(課税の日当等に対応)。明示hikazei(true/false)があれば尊重。
        var isNT = (it.hikazei===true) || (it.hikazei==null && labelAuto);
        var ttl = labelAuto ? 'この名称は通常 非課税（外せます。課税の日当・出張手当ならチェックを外す）' : 'チェックで所得税の非課税にする(社保は対象)';
        hz = '<label class="row-hz" title="'+ttl+'" style="font-size:10px;color:'+(isNT?'#3D9E72':'#6E907E')+';font-weight:'+(isNT?'700':'400')+';white-space:nowrap;display:inline-flex;align-items:center;gap:2px"><input type="checkbox" class="ck" data-g="shikyu" data-ri="'+ri+'"'+(isNT?' checked':'')+'>非課税</label>';
      }
      return '<div class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:5px"><input class="finput" data-g="'+g+'" data-ri="'+ri+'" data-f="label" value="'+attr(it.label)+'" style="flex:1.3" placeholder="項目"><input class="finput num" data-g="'+g+'" data-ri="'+ri+'" data-f="value" value="'+attr(it.value)+'" style="flex:1" placeholder="'+(g==='kintai'?'値':'金額')+'">'+hz+'<button class="b-del m-del" data-g="'+g+'" data-ri="'+ri+'" aria-label="この項目を削除">×</button></div>';
    }).join('');
  }
  function fmtH(min){ var h=min/60; return (Math.round(h*100)/100)+'h'; }
  function wiResHTML(e){
    var w=e._wari||{total:0,unit:0,lines:[]};
    if(!(w.total>0)) return '<div class="wi-res wi-zero">時間を入れると割増賃金を自動計算します（率は法令から自動）</div>';
    var u=Math.round(w.unit).toLocaleString('ja-JP');
    var bk=(w.lines||[]).map(function(l){ var lu=(l.unit!=null)?Math.round(l.unit).toLocaleString('ja-JP'):u; return '<div class="wi-bk">'+esc(l.label)+'：¥'+lu+' × '+l.rate+' × '+fmtH(l.minutes)+' ＝ <b>'+yen(l.amount)+'</b></div>'; }).join('');
    var sub=w.split?'固定側と歩合側は単価が異なるため分けて計算・基発150号で端数処理':'1時間単価 ¥'+u+'・率は法令から自動・基発150号で端数処理';
    return '<div class="wi-res">割増賃金 <b>'+yen(w.total)+'</b><span class="wi-sub">'+sub+'</span><div class="wi-bkw">'+bk+'</div></div>';
  }
  function warimashiInputHTML(e){
    compute(e); var w=e.warimashi||{}, mode=w.mode||'easy';
    if(e.payType==='歩合'||e.payType==='カスタム'){ // 出来高払の上乗せ(残業/深夜+25%・法定休日+35%)=かんたん3枠。カスタムは固定側=通常割増+歩合側=上乗せを自動分解
      var durc=function(key,lab,sub){ return '<div class="wi-row"><span class="wi-l">'+lab+'<small>'+sub+'</small></span><span class="dur">'
        +'<input class="wi-f" data-wk="'+key+'H" inputmode="numeric" placeholder="0" value="'+attr(w[key+'H'])+'"><i>時間</i>'
        +'<input class="wi-f" data-wk="'+key+'M" inputmode="numeric" placeholder="0" value="'+attr(w[key+'M'])+'"><i>分</i></span></div>'; };
      var wnote=(e.payType==='カスタム')?'残業・深夜・法定休日の時間を入れると割増を自動計算。固定給部分は通常の割増、歩合部分は上乗せのみ、で自動的に分けて計算します。':'歩合の1時間単価＝歩合給÷総労働時間。残業・深夜は＋25%、法定休日は＋35%の上乗せのみ（1.0は歩合給に含むため）。';
      return '<div class="grp"><div class="grp-h">割増<span class="help-i" data-help="warimashi">💡</span></div>'
        +'<div class="wi-note2">'+wnote+'</div>'
        +durc('ot','残業した時間','＋25%')+durc('night','深夜の時間','夜22時〜朝5時＋25%')+durc('holiday','休日に出た時間','法定休日＋35%')
        +'<div class="wi-limitw">'+laborLimitWarn(e)+'</div><div class="wi-resw">'+wiResHTML(e)+'</div></div>'; }
    var seg='<div class="wi-seg"><b class="wi-mode'+(mode==='easy'?' on':'')+'" data-wm="easy">かんたん</b><b class="wi-mode'+(mode==='detail'?' on':'')+'" data-wm="detail">詳細（区分・検算）</b></div>';
    var body='';
    if(mode==='easy'){
      var dur=function(key,lab,sub){ return '<div class="wi-row"><span class="wi-l">'+lab+'<small>'+sub+'</small></span><span class="dur">'
        +'<input class="wi-f" data-wk="'+key+'H" inputmode="numeric" placeholder="0" value="'+attr(w[key+'H'])+'"><i>時間</i>'
        +'<input class="wi-f" data-wk="'+key+'M" inputmode="numeric" placeholder="0" value="'+attr(w[key+'M'])+'"><i>分</i></span></div>'; };
      body=dur('ot','残業した時間','ふつうの残業')+dur('night','深夜の時間','夜22時〜朝5時')+dur('holiday','休日に出た時間','法定休日の出勤');
    } else {
      var d=w.detail||{};
      body=Warimashi.DETAIL.map(function(dd){ var key=dd[0], o=d[key]||{}; return '<div class="wi-row"><span class="wi-l">'+dd[1]+'<small>'+Math.round(Warimashi.RATE[dd[2]]*100)+'%</small></span><span class="dur">'
        +'<input class="wi-df" data-wd="'+key+'" data-dp="h" inputmode="numeric" placeholder="0" value="'+attr(o.h)+'"><i>時間</i>'
        +'<input class="wi-df" data-wd="'+key+'" data-dp="m" inputmode="numeric" placeholder="0" value="'+attr(o.m)+'"><i>分</i></span></div>'; }).join('')
        +'<div class="wi-note2">残業のうち深夜は「時間外×深夜」、休日の深夜は「法定休日×深夜」に入れてください（重複は区分で表現）。</div>';
    }
    var co=state.company||{}; var mh=(e.minashiH!=null&&e.minashiH!=='')?e.minashiH:co.minashiH; var minashiH=num(mh);
    var minashiNote=minashiH>0?'<div class="wi-note2">⚠ 固定残業（みなし）<b>'+minashiH+'時間</b>を控除して計算中（超過分のみ）。固定残業代の金額は基本給/手当に含めて。</div>':'';
    return '<div class="grp"><div class="grp-h">割増（残業・深夜・休日）<span class="help-i" data-help="warimashi">💡</span></div>'
      +seg+body+minashiNote+'<div class="wi-limitw">'+laborLimitWarn(e)+'</div><div class="wi-resw">'+wiResHTML(e)+'</div></div>';
  }
  function calcBoxHTML(e){
    var r=compute(e);
    var lines=r.kojo.map(function(k){return '<div class="calc-line"><span>'+esc(k.label)+'</span><span class="v">'+yen(k.value)+'</span></div>';}).join('');
    return '<div class="calc-box"><div class="ch">自動計算（法定控除＋差引）標準報酬 '+yen(r.hyojun)+(r.netNegative?' ⚠差引マイナス':'')+'</div>'
      +'<div class="calc-line"><span>支給合計</span><span class="v">'+yen(r.shikyuTotal)+'</span></div>'+lines
      +'<div class="calc-line tot"><span>控除合計</span><span class="v">'+yen(r.kojoTotal)+'</span></div>'
      +'<div class="calc-line net tot"><span>差引支給額</span><span class="v">'+yen(r.net)+'</span></div></div>';
  }
  // 勤怠内の「労働時間」行（残業と同じ ◯時間◯分 の2枠で統一）
  function workedRowHTML(e,i){
    return '<div class="wi-row"><span class="wi-l">労働時間</span><span class="dur">'
      +'<input class="wi-df wk-f" data-wkf="workedH" data-i="'+i+'" inputmode="numeric" placeholder="0" value="'+attr(e.workedH)+'"><i>時間</i>'
      +'<input class="wi-df wk-f" data-wkf="workedM" data-i="'+i+'" inputmode="numeric" placeholder="0" value="'+attr(e.workedM)+'"><i>分</i></span></div>';
  }
  // 基本給の「自動計算」ノートだけを返す(入力欄と分離=refreshCardで焦点を飛ばさず更新)
  function basePayNoteOnly(e){
    if(e.payType==='時給'){ var hrs=workedMin(e)/60;
      return '<div class="hint" style="margin:-4px 2px 8px;color:#3D6B53">基本給（自動）＝ 時給 '+fmtN(e.hourly)+'円 × 労働時間 '+(Math.round(hrs*100)/100)+'h ＝ <b>'+yen(Math.round(num(e.hourly)*hrs))+'</b></div>'; }
    if(e.payType==='日給'){ var d=effShukkin(e); var dd=((state.company.ruleOn||{}).daikyu&&state.company.daikyuDeduct&&kintaiVal(e,/代休取得/)>0);
      return '<div class="hint" style="margin:-4px 2px 8px;color:#3D6B53">基本給（自動）＝ 日給 '+fmtN(e.base)+'円 × 出勤日数 '+d+'日'+(dd?'（代休控除後）':'')+' ＝ <b>'+yen(Math.round(num(e.base)*d))+'</b>（出勤日数は上の勤怠で）</div>'; }
    if(e.payType==='歩合'){ var wm=workedMin(e); var gp=window.Warimashi?Warimashi.guaranteePay(e.hourlyGuarantee,wm):Math.round(num(e.hourlyGuarantee)*wm/60); var ca=num(e.commissionAmt); var useG=gp>ca; var gh=Math.round(wm/60*100)/100;
      return '<div class="hint" style="margin:4px 2px 8px;color:'+(useG?'#92500A':'#3D6B53')+'">基本給（自動）＝ '+(useG?'保障給 <b>'+yen(gp)+'</b>（時給'+fmtN(e.hourlyGuarantee)+'円×'+gh+'h）を適用':'歩合実績 <b>'+yen(ca)+'</b>を適用')+(useG?'（歩合がこれを下回るため労基27条の保障給）':'（保障給'+yen(gp)+'円より高い）')+'</div>'; }
    if(e.payType==='カスタム'){ var prc=payRuleResult(e); var spc=ensurePayRule(e); var ch=prc&&prc.chosen, isMax=(spc.variable&&spc.variable.mode==='max'), hasVar=(spc.variable&&spc.variable.mode!=='none');
      return '<div class="hint" style="margin:4px 2px 8px;color:#3D6B53">基本給（自動）＝ '+(num(spc.fixed)>0?'固定 '+yen(num(spc.fixed))+(hasVar?' ＋ ':''):'')+((hasVar&&ch)?(isMax?'高い方 ':'')+'「'+esc(ch.label)+'」'+yen(ch.value)+' を採用':'')+' ＝ <b>'+yen(prc?prc.base:0)+'</b></div>'; }
    return '';
  }
  function basePayInputHTML(e,i){
    if(e.payType==='時給'||e.payType==='日給') return '<div class="basepay-note">'+basePayNoteOnly(e)+'</div>';
    if(e.payType==='歩合'){
      return '<div class="grp"><div class="grp-h">歩合給（出来高）</div>'
        +'<label class="ic-f ic-f2"><span>歩合給額<small>円</small></span><input class="finput num cm-f ic-in" data-cmf="commissionAmt" inputmode="numeric" placeholder="0" value="'+attr(fmtN(e.commissionAmt))+'"></label>'
        +'<div class="basepay-note">'+basePayNoteOnly(e)+'</div>'
        +'<div style="font-size:10px;color:#5C7E6C;margin:-4px 2px 8px">保障給の時給は「設定▸従業員マスタ」で。割増は下の「歩合の上乗せ」で。</div></div>'; }
    if(e.payType==='カスタム'){ var spc=ensurePayRule(e); var prts=(spc.variable&&spc.variable.parts)||[];
      var hasCom=prts.some(function(p){return p.type==='commission';}), hasRate=prts.some(function(p){return p.type==='rate'||p.type==='tiered';}), hasPiece=prts.some(function(p){return p.type==='piece';});
      var hh='<div class="grp"><div class="grp-h">給与（カスタム）</div>';
      if(hasCom) hh+='<label class="ic-f ic-f2"><span>歩合額<small>円</small></span><input class="finput num cm-f ic-in" data-cmf="commissionAmt" inputmode="numeric" placeholder="0" value="'+attr(fmtN(e.commissionAmt))+'"></label>';
      if(hasPiece) hh+='<label class="ic-f ic-f2"><span>当月の件数<small>件</small></span><input class="finput num cm-f ic-in" data-cmf="pieceCount" inputmode="numeric" placeholder="0" value="'+attr(fmtN(e.pieceCount))+'"></label>';
      if(hasRate) hh+='<label class="ic-f ic-f2"><span>当月の売上<small>円</small></span><input class="finput num cm-f ic-in" data-cmf="salesAmt" inputmode="numeric" placeholder="0" value="'+attr(fmtN(e.salesAmt))+'"></label>';
      hh+='<div class="basepay-note">'+basePayNoteOnly(e)+'</div>';
      hh+='<div style="font-size:10px;color:#5C7E6C;margin:-4px 2px 8px">決め方（固定・時給・率など）は「設定▸従業員マスタ」で。割増は下で。</div></div>';
      return hh; }
    return '<div class="basepay-note"></div>';
  }
  // 標準勤怠(出勤/欠勤/有給)。毎月の入力を展開不要で全員ぶん見せるため上段に常時表示する
  var KIN_STD=[['出勤日数',/出勤/],['欠勤日数',/欠勤/],['有給取得',/有給/]];
  function ensureKintai(e){ if(!e.kintai)e.kintai=[]; KIN_STD.forEach(function(s){ if(!e.kintai.some(function(k){return s[1].test(k.label||'');})) e.kintai.push({label:s[0],value:''}); });
    if((state.company.ruleOn||{}).daikyu){ [['代休取得',/代休取得/],['振替休日',/振替休日/]].forEach(function(s){ if(!e.kintai.some(function(k){return s[1].test(k.label||'');})) e.kintai.push({label:s[0],value:''}); }); } }
  // 代休・振替休日の入力(会社の決まりで有効時のみ・詳細側)
  function daikyuInputHTML(e){ if(!((state.company.ruleOn||{}).daikyu)) return '';
    function cell(lab,re){ var idx=kinIdx(e,re); var v=idx>=0?e.kintai[idx].value:''; return '<label class="ic-f"><span>'+lab+'(日)</span><input class="finput num ic-in" data-g="kintai" data-ri="'+idx+'" data-f="value" inputmode="numeric" value="'+attr(v)+'"></label>'; }
    var dd=state.company.daikyuDeduct;
    return '<div class="grp"><div class="grp-h">代休・振替休日</div>'
      +'<div class="ic-kin">'+cell('代休取得',/代休取得/)+cell('振替休日',/振替休日/)+'</div>'
      +'<div class="wi-note2">振替休日は<b>通常労働（割増なし）</b>＝割増の法定休日でなく労働時間へ。代休は<b>休日労働に割増あり</b>＋休む日をここへ。'+(dd?'代休取得は出勤から差し引きます（無給代休）。':'記録のみ・賃金は変えません（有給代休／月給相殺）。')+'</div></div>'; }
  function kinIdx(e,re){ var a=e.kintai||[]; for(var i=0;i<a.length;i++){ if(re.test(a[i].label||'')) return i; } return -1; }
  // 常時表示のコンパクト勤怠(出勤/欠勤/有給+労働時間)。✕なし・数値右揃え。1人ずつ展開せず全員ぶん一画面で入れられる
  function compactKinHTML(e){
    function cell(lab,re){ var idx=kinIdx(e,re); var v=idx>=0?e.kintai[idx].value:''; return '<label class="ic-f"><span>'+lab+'</span><input class="finput num ic-in" data-g="kintai" data-ri="'+idx+'" data-f="value" inputmode="numeric" value="'+attr(v)+'"></label>'; }
    var work='<label class="ic-f ic-f2"><span>労働(時:分)</span><span class="ic-hm"><input class="wk-f ic-in" data-wkf="workedH" inputmode="numeric" placeholder="0" value="'+attr(e.workedH)+'"><i>:</i><input class="wk-f ic-in" data-wkf="workedM" inputmode="numeric" placeholder="0" value="'+attr(e.workedM)+'"></span></label>';
    return '<div class="ic-kin">'+cell('出勤',/出勤/)+cell('欠勤',/欠勤/)+cell('有給',/有給/)+work+'</div>';
  }
  // 標準勤怠以外の勤怠行を“真のindex”で(詳細側・✕/＋で自由編集)
  function otherKinRows(e){
    return (e.kintai||[]).map(function(it,ri){
      if(/出勤|欠勤|有給|代休取得|振替休日/.test(it.label||'')) return '';
      return '<div class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:5px"><input class="finput" data-g="kintai" data-ri="'+ri+'" data-f="label" value="'+attr(it.label)+'" style="flex:1.3" placeholder="項目"><input class="finput num" data-g="kintai" data-ri="'+ri+'" data-f="value" value="'+attr(it.value)+'" style="flex:1" placeholder="値"><button class="b-del m-del" data-g="kintai" data-ri="'+ri+'" aria-label="この勤怠項目を削除">×</button></div>';
    }).join('');
  }
  // 前月比/差分: 先月の保存値(pay_payslips)と今月の計算(手取り)を比較
  function prevYmOf(ym){ ym=String(ym||'2026-06'); var y=+ym.slice(0,4),m=+ym.slice(5,7)-1; if(m<1){m=12;y--;} return y+'-'+('0'+m).slice(-2); }
  function loadPrev(){ if(!(window.Store&&Store.getPayslipsByYm)) return; var pm=prevYmOf(state.month); if(state._prevYm===pm) return; state._prevYm=pm;
    Store.getPayslipsByYm(pm,pm).then(function(rows){ var m={}; (rows||[]).forEach(function(r){ if(r&&r.data&&r.data.kind!=='bonus'&&r.data.net!=null) m[r.employee_id]=num(r.data.net); }); state._prev=m; // 前月比は月次のみ(賞与除外)
      if($('#scr-input')&&$('#scr-input').classList.contains('active')) renderInput();
      if($('#scr-list')&&$('#scr-list').classList.contains('active')) renderListView(); }).catch(function(){});
  }
  // 36協定の複数月/年チェック用に、直近11ヶ月の残業(otMin/holidayMin)を履歴から読む。当月はlive(warimashiMins)で合成。
  function loadOtHistory(){ if(!(window.Store&&Store.getPayslipsByYm)) return; var ym=state.month; if(state._otHistYm===ym) return; state._otHistYm=ym;
    var from=ymAddLocal(ym,-11), to=ymAddLocal(ym,-1); if(!from||!to) return;
    Store.getPayslipsByYm(from,to).then(function(rows){ var m={};
      (rows||[]).forEach(function(r){ if(r&&r.data&&r.data.kind!=='bonus'&&r.data.work){ (m[r.employee_id]=m[r.employee_id]||[]).push({ ym:String(r.ym), otMin:num(r.data.work.otMin), holidayMin:num(r.data.work.holidayMin) }); } });
      Object.keys(m).forEach(function(k){ m[k].sort(function(a,b){ return a.ym<b.ym?-1:1; }); });
      state._otHist=m;
      if($('#scr-input')&&$('#scr-input').classList.contains('active')) renderInput();
      if($('#scr-list')&&$('#scr-list').classList.contains('active')) renderListView(); }).catch(function(){}); // 表/一覧ビューもロード後に再描画(F2)
  }
  function diffBadge(e,r){ var pv=state._prev||{}; if(!(e.id in pv)) return ''; var d=r.net-pv[e.id]; if(d===0) return ''; var cls=d>0?'up':'dn'; var t=d>0?'▲+'+fmtN(d):'▼'+fmtN(-d); return '<span class="diffb '+cls+'" title="前月比('+state._prevYm+')">'+t+'</span>'; }
  // ── 確認(未入力)ハイブリッド: 自動の前月比＋手動の確認✓・変動なしは自動済扱い ──
  function empConfirmed(e){ var c=state.confirmed&&state.confirmed[state.month]; return !!(c&&c[e.id]); }
  function empAutoOk(e,r){ var pv=state._prev||{}; return (e.id in pv) && (r.net-pv[e.id])===0; } // 前月あり且つ変動なし=自動済扱い
  function empNeedsReview(e,r){ return !empConfirmed(e) && !empAutoOk(e,r); }      // 変化あり/新規 かつ 未確認
  function reviewCounts(){ var done=0,total=0; state.employees.forEach(function(e){ if(!isActiveInMonth(e,state.month))return; total++; var r=compute(e); if(empConfirmed(e)||empAutoOk(e,r))done++; }); return {done:done,total:total,need:total-done}; }
  function setConfirm(id,on){ if(!state.confirmed[state.month])state.confirmed[state.month]={}; if(on)state.confirmed[state.month][id]=true; else delete state.confirmed[state.month][id]; }
  function toast(msg){ try{ var t=document.getElementById('app-toast'); if(!t){ t=document.createElement('div'); t.id='app-toast'; t.style.cssText='position:fixed;left:50%;bottom:88px;transform:translateX(-50%);background:#2E7D54;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.22);z-index:9999;opacity:0;transition:opacity .25s;pointer-events:none'; document.body.appendChild(t); } t.textContent=msg; t.style.opacity='1'; clearTimeout(t._h); t._h=setTimeout(function(){ t.style.opacity='0'; },2200); }catch(e){} }
  // アプリ内モーダル(native alert/confirm/promptの置換)。Promiseで解決=非同期。DOMは動的生成(HTML変更不要)。
  //  uiAlert→Promise<true> / uiConfirm→Promise<bool> / uiPrompt→Promise<string|null(キャンセル)>
  function uiModal(opts){
    return new Promise(function(resolve){
      var ov=document.createElement('div'); ov.className='ui-modal-ov';
      var card=document.createElement('div'); card.className='ui-modal-card'; card.setAttribute('role','dialog');
      if(opts.title){ var t=document.createElement('div'); t.className='ui-modal-t'; t.textContent=opts.title; card.appendChild(t); }
      if(opts.msg){ var b=document.createElement('div'); b.className='ui-modal-b'; b.textContent=opts.msg; card.appendChild(b); }
      if(opts.html){ var hb=document.createElement('div'); hb.className='ui-modal-b'; hb.innerHTML=opts.html; card.appendChild(hb); if(opts.onRender) try{ opts.onRender(hb, function(v){ close(v); }); }catch(_){} }
      var inp=null;
      if(opts.input){ inp=document.createElement('input'); inp.type='text'; inp.className='ui-modal-in finput'; inp.value=opts.input.def||''; if(opts.input.placeholder)inp.placeholder=opts.input.placeholder; card.appendChild(inp); }
      var bw=document.createElement('div'); bw.className='ui-modal-btns';
      (opts.buttons||[{label:'OK',val:true,primary:true}]).forEach(function(bt){ var el=document.createElement('button'); el.className='ui-modal-btn'+(bt.primary?' primary':''); el.textContent=bt.label; el.addEventListener('click',function(){ close(bt.val); }); bw.appendChild(el); });
      card.appendChild(bw);
      function close(v){ if(ov.parentNode)ov.parentNode.removeChild(ov); document.removeEventListener('keydown',onKey); resolve(opts.input?(v?(inp.value):null):v); }
      function onKey(e){ if(e.key==='Escape'){ close(opts.input?false:false); } else if(e.key==='Enter'&&opts.input){ close(true); } }
      ov.addEventListener('click',function(e){ if(e.target===ov) close(opts.input?false:false); });
      document.addEventListener('keydown',onKey);
      ov.appendChild(card); document.body.appendChild(ov);
      if(inp) setTimeout(function(){ try{ inp.focus(); inp.select(); }catch(_){} },30);
    });
  }
  function uiAlert(msg,title){ return uiModal({title:title||'お知らせ', msg:msg, buttons:[{label:'OK',val:true,primary:true}]}); }
  function uiConfirm(msg,title){ return uiModal({title:title||'確認', msg:msg, buttons:[{label:'キャンセル',val:false},{label:'OK',val:true,primary:true}]}); }
  // 勤続年数(入社日〜退職日・1年未満切上)。片方欠けたら0。
  function kinzokuYears(joinYmd, retireYmd){
    var pa=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(joinYmd||'')), pb=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(retireYmd||''));
    if(!pa||!pb) return 0;
    var da=new Date(+pa[1],+pa[2]-1,+pa[3]), db=new Date(+pb[1],+pb[2]-1,+pb[3]); if(db<da) return 0;
    var y=db.getFullYear()-da.getFullYear(); var anniv=new Date(da.getFullYear()+y,da.getMonth(),da.getDate());
    if(anniv>db) y--; // まだ応当日前=満年数-1
    var full=new Date(da.getFullYear()+y,da.getMonth(),da.getDate());
    return (full.getTime()===db.getTime())? y : y+1; // 1日でも端数あれば切上
  }
  // 退職金(退職所得)の源泉徴収 計算モーダル。★月次給与とは別系統(分離課税)★
  function openTaishokuCalc(emp){
    var TS=(typeof TaishokuShotoku!=='undefined')?TaishokuShotoku:(window&&window.TaishokuShotoku);
    if(!TS){ uiAlert('退職所得モジュールが読み込まれていません'); return; }
    var nm=(emp&&emp.name)||'', jymd=(emp&&emp.joinYmd)||'', tymd=(emp&&emp.taishokuYmd)||'';
    var html=''
      +'<div class="ri-note" style="margin:0 0 10px">退職金は毎月の給与とは<b>別の税金（退職所得・分離課税）</b>です。ここで源泉徴収額を計算します。金額は毎月の入力欄に入れないでください。</div>'
      +'<div class="frow"><div class="flabel">氏名<span class="hint2">任意</span></div><input class="finput" id="ts-nm" value="'+attr(nm)+'"></div>'
      +'<div class="frow"><div class="flabel">退職金の額<span class="hint2">円</span></div><input class="finput num" id="ts-gross" inputmode="numeric" placeholder="例 20000000" value=""></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">入社日</div><input class="finput" id="ts-join" type="date" value="'+attr(jymd)+'"></div>'
      +'<div class="frow"><div class="flabel">退職日</div><input class="finput" id="ts-ret" type="date" value="'+attr(tymd)+'"></div></div>'
      +'<div class="nw-row"><div class="nw-q">「退職所得の受給に関する申告書」を提出していますか？<div class="nw-help">未提出だと一律20.42%で計算します。</div></div><div class="nw-in">'+ynPill('tsyn','report',true)+'</div></div>'
      +'<div class="nw-row"><div class="nw-q">役員等で勤続5年以下ですか？<div class="nw-help">はいの場合、1/2課税はありません。</div></div><div class="nw-in">'+ynPill('tsyn','officer',false)+'</div></div>'
      +'<div class="nw-row"><div class="nw-q">勤続5年以下の一般従業員ですか？（短期退職手当等）<div class="nw-help">はいの場合、300万円超の部分は1/2になりません。</div></div><div class="nw-in">'+ynPill('tsyn','short',false)+'</div></div>'
      +'<div id="ts-result" style="margin-top:10px"></div>';
    uiModal({ title:'退職金の税金（退職所得の源泉徴収）', html:html, buttons:[{label:'閉じる',val:true,primary:true}],
      onRender:function(host){
        function ynState(key){ var p=host.querySelector('[data-tsyn="'+key+'"][data-v="1"]'); return !!(p && /\bon\b/.test(p.className)); } // はい=data-v1のpillがon
        function upd(){
          var gross=num(host.querySelector('#ts-gross').value);
          var years=kinzokuYears(host.querySelector('#ts-join').value, host.querySelector('#ts-ret').value);
          var opts={ noReport:!ynState('report'), officer:ynState('officer'), shortTerm:ynState('short') };
          var r=TS.compute(Object.assign({gross:gross,years:years},opts));
          var el=host.querySelector('#ts-result');
          if(!gross||!years){ el.innerHTML='<div class="hint" style="color:#92500A">退職金の額と入社日・退職日を入れてください。</div>'; return; }
          el.innerHTML='<div class="calc-wrap"><div class="calc-box">'
            +'<div class="calc-line"><span>勤続年数（1年未満切上）</span><span class="v">'+years+'年</span></div>'
            +'<div class="calc-line"><span>退職所得控除</span><span class="v">'+yen(r.kojo)+'</span></div>'
            +'<div class="calc-line"><span>課税退職所得金額</span><span class="v">'+yen(r.kazei)+'</span></div>'
            +'<div class="calc-line"><span>所得税（復興特別所得税込）</span><span class="v">'+yen(r.incomeTax)+'</span></div>'
            +'<div class="calc-line"><span>住民税（分離・10%）</span><span class="v">'+yen(r.residentTax)+'</span></div>'
            +'<div class="calc-line net tot"><span>差引 手取り</span><span class="v">'+yen(r.net)+'</span></div>'
            +'</div><div class="hint" style="margin-top:6px">'+(opts.noReport?'※申告書未提出＝退職金×20.42%（住民税は別途分離）。':'※'+(opts.officer||opts.short?'1/2課税の制限を適用。':'(退職金−控除)×1/2に速算表。'))+'社会保険料は退職金にかかりません。</div></div>';
        }
        Array.prototype.forEach.call(host.querySelectorAll('input'), function(i){ i.addEventListener('input',upd); i.addEventListener('change',upd); });
        // はい/いいえピルのクリック: 同じkeyの2つのpillのon切替→再計算
        host.addEventListener('click',function(ev){ var b=ev.target.closest('[data-tsyn]'); if(!b)return; var key=b.dataset.tsyn, v=b.dataset.v==='1';
          Array.prototype.forEach.call(host.querySelectorAll('[data-tsyn="'+key+'"]'), function(p){ p.classList.toggle('on',(p.dataset.v==='1')===v); }); upd(); });
        upd();
      }
    });
  }
  function uiPrompt(label,def,placeholder){ return uiModal({title:label, input:{def:def||'',placeholder:placeholder||''}, buttons:[{label:'キャンセル',val:false},{label:'OK',val:true,primary:true}]}); }
  function prorateNote(e){ return PW().prorateNote(e); }
  // ── 勤怠CSV取込(他社勤怠/Excel→当月の給与入力へ。打刻は作らない) ──
  function findEmpForKintai(row){
    var emps=state.employees.filter(function(e){ return isActiveInMonth(e,state.month); });
    if(row.no){ var byNo=emps.filter(function(e){ return String(e.no||'').trim()!=='' && String(e.no).trim()===String(row.no).trim(); })[0]; if(byNo) return byNo; }
    var nm=String(row.name||'').replace(/\s|　/g,''); if(!nm) return null;
    return emps.filter(function(e){ return String(e.name||'').replace(/\s|　/g,'')===nm; })[0]||null;
  }
  function setKintaiVal(e, re, label, v){ if(v==null) return; var k=e.kintai||(e.kintai=[]); var it=null; for(var i=0;i<k.length;i++){ if(re.test(k[i].label||'')){ it=k[i]; break; } } if(it) it.value=String(v); else k.push({label:label,value:String(v)}); }
  function applyKintaiRows(rows){
    var applied=[], unmatched=[];
    rows.forEach(function(row){ var e=findEmpForKintai(row); if(!e){ unmatched.push(row.name); return; }
      setKintaiVal(e,/出勤/,'出勤日数',row.shukkin); setKintaiVal(e,/欠勤/,'欠勤日数',row.kekkin); setKintaiVal(e,/有給|有休/,'有給取得',row.yukyu);
      if(row.workedMin!=null){ e.workedH=String(Math.floor(row.workedMin/60)); e.workedM=String(row.workedMin%60); }
      if(row.otMin!=null||row.nightMin!=null||row.holidayMin!=null){ e.warimashi=e.warimashi||{}; e.warimashi.mode='easy';
        if(row.otMin!=null){ e.warimashi.otH=String(Math.floor(row.otMin/60)); e.warimashi.otM=String(row.otMin%60); }
        if(row.nightMin!=null){ e.warimashi.nightH=String(Math.floor(row.nightMin/60)); e.warimashi.nightM=String(row.nightMin%60); }
        if(row.holidayMin!=null){ e.warimashi.holidayH=String(Math.floor(row.holidayMin/60)); e.warimashi.holidayM=String(row.holidayMin%60); }
      }
      applied.push(e.name);
    });
    return { applied:applied, unmatched:unmatched };
  }
  function importKintaiCsv(text){
    if(typeof KintaiCsv==='undefined'){ uiAlert('CSVモジュールが読み込まれていません'); return; }
    var r=KintaiCsv.parse(text);
    if(r.warnings.length){ uiAlert('取り込めません:\n'+r.warnings.join('\n')); return; }
    if(!r.rows.length){ uiAlert('データ行がありません。'); return; }
    var matched=0, unmatched=[]; r.rows.forEach(function(row){ if(findEmpForKintai(row)) matched++; else unmatched.push(row.name); });
    var FN={shukkin:'出勤日数',kekkin:'欠勤日数',yukyu:'有給',worked:'労働時間',ot:'残業',night:'深夜',holiday:'休日'};
    var cols=r.recognized.filter(function(f){ return f!=='name'&&f!=='no'; }).map(function(f){ return FN[f]||f; }).join('・')||'(なし)';
    var msg='勤怠CSVを取り込みます（対象月 '+state.month+'）。\n\n認識した項目: '+cols+'\n反映される人: '+matched+'名'
      +(unmatched.length?'\n⚠ 未一致（氏名が従業員と不一致）: '+unmatched.slice(0,10).join('・')+(unmatched.length>10?' 他':''):'')
      +'\n\nこの内容で反映しますか？（反映後も各自 手修正できます）';
    if(matched===0){ uiAlert('一致する従業員がいません。CSVの氏名と従業員マスタの氏名を合わせてください。\n未一致: '+unmatched.join('・')); return; }
    uiConfirm(msg).then(function(ok){ if(!ok) return;
      var ap=applyKintaiRows(r.rows);
      renderInput(); persistSaveDebounced();
      toast(ap.applied.length+'名の勤怠を反映しました'+(ap.unmatched.length?'（未一致 '+ap.unmatched.length+'名）':''));
    });
  }

  // ── 他ソフトから一括移行(CSV/Excel→従業員マスタ＋先月突合。1ファイルで全員) ──
  function prevYmOf(ym){ var p=String(ym||'').split('-'); var y=+p[0]||new Date().getFullYear(), m=(+p[1]||1)-1; if(m<1){ m=12; y--; } return y+'-'+('0'+m).slice(-2); }
  function migYen(x){ var n=Number(x); return isNaN(n)?'—':('¥'+n.toLocaleString('ja-JP')); }
  // 県名→コード。★部分一致は禁止(京都→東京の誤変換を防ぐ)★ 完全一致→「都道府県」を落とした正規化名の完全一致→無ければ空。
  function prefToCode(nm){ nm=String(nm||'').replace(/\s|　/g,''); if(!nm) return ''; var S=(typeof SHH==='function')?SHH():null; var K=(S&&S.KENKO_RITSU)||{};
    var norm=function(x){ return String(x||'').replace(/[都道府県]$/,''); }; var exact='', nmatch='';
    Object.keys(K).forEach(function(c){ var n=K[c]&&K[c].name; if(!n) return; if(n===nm) exact=c; else if(norm(n)===norm(nm)) nmatch=c; });
    return exact||nmatch||''; }
  // ★捏造禁止★ defEmp(サンプル山田太郎)の実データを継承しない。移行で写像する項目は一旦空にし、CSVにある分だけ入れる(空欄=要入力)。
  function buildEmpFromRow(row){
    var e=defEmp(row.name);
    e.no=''; e.birthYmd=''; e.base=''; e.hourly=''; e.commute=''; e.residentTax=''; e.fuyou=''; e.pref=''; e.shikyu=[];
    if(row.no) e.no=String(row.no);
    if(row.birthYmd) e.birthYmd=row.birthYmd;
    if(row.fuyou!=='') e.fuyou=row.fuyou;
    if(row.hourly!=='') e.hourly=row.hourly;
    if(row.base!=='') e.base=row.base;
    if(row.commute!=='') e.commute=row.commute;
    if(row.residentTax!=='') e.residentTax=row.residentTax;
    if(row.pref){ var pc=prefToCode(row.pref); if(pc) e.pref=pc; } // 完全一致した県だけ設定(勝手に埋めない)
    if(row.shikyu && row.shikyu.length) e.shikyu=row.shikyu.map(function(s){ return { label:s.label, value:String(s.value) }; });
    return e;
  }
  function importMigration(r){
    if(!(window.MigrateMap)){ uiAlert('移行モジュールが読み込まれていません'); return; }
    if(!r){ uiAlert('ファイルを読み取れませんでした。'); return; }
    if(r.warnings && r.warnings.length){ uiAlert('取り込めません:\n'+r.warnings.join('\n')); return; }
    if(!r.rows.length){ uiAlert('データ行が見つかりません。1行目に見出し（氏名・基本給 等）が必要です。'); return; }
    var TAGJP={ name:'氏名', no:'従業員番号', birth:'生年月日', fuyou:'扶養', pref:'都道府県', hourly:'時給', base:'基本給', commute:'通勤手当', residentTax:'住民税', prevGross:'先月総支給', prevNet:'先月差引', prevDeductTotal:'先月控除計', prevHealth:'健保', prevKaigo:'介護', prevPension:'厚年', prevEmploy:'雇用', prevTax:'所得税' };
    var recog=[]; (r.headers||[]).forEach(function(h,i){ var tag=r.mapping&&r.mapping.tags[i]; if(tag==='allowance') recog.push(h+'→手当'); else if(tag&&TAGJP[tag]) recog.push(h+'→'+TAGJP[tag]); });
    var withPrev=r.rows.filter(function(x){ return x.prev && x.prev.net!==''; }).length;
    var msg='他ソフトのデータを一括取込します（'+r.rows.length+'名）。\n\n【自動で読み取った列】\n'+(recog.join('\n')||'(自動判定できた列がありません。見出しをご確認ください)')
      +'\n\n先月の金額（差引）がある人: '+withPrev+'名'
      +'\n\nこの内容で取り込みますか？（取込後も各自 手修正できます。氏名が既存と重複しても追加します）';
    uiConfirm(msg,'他ソフトから移行').then(function(okc){ if(!okc) return;
      var s=applyMigrationRows(r.rows);
      persistSaveDebounced();
      showScreen('scr-settings'); var eb=$('#set-seg .seg-b[data-set="emp"]'); if(eb)eb.click(); renderEmpMaster();
      var res='移行しました：'+s.added+'名を従業員マスタに追加。';
      if(s.match+s.mismatch+s.needInput>0){ res+='\n\n先月突合 ＝ 一致 '+s.match+'名'+(s.mismatch?('・要確認 '+s.mismatch+'名'):'')+(s.needInput?('・要入力 '+s.needInput+'名'):''); }
      if(s.needInput) res+='\n※「要入力」＝突合には 生年月日・都道府県・住民税 が必要です（先月の金額は取り込み済み。各カードで入力すると突合できます）。';
      if(s.mmList.length) res+='\n\n【要確認（先月と再計算が不一致）】\n'+s.mmList.join('\n')+'\n※住民税・都道府県（健保率）・社保の設定を各カードで合わせると一致します。';
      uiAlert(res,'移行の結果');
    });
  }
  // 適用ロジック(モーダル非依存=統合テストから直接呼べる)。取込＋先月突合＋履歴保存を行い集計を返す。
  function applyMigrationRows(rows){
    var prevYm=prevYmOf(state.month), added=0, match=0, mismatch=0, needInput=0, mmList=[];
    (rows||[]).forEach(function(row){
      var e=buildEmpFromRow(row); state.employees.push(e); added++;
      if(row.prev && row.prev.net!==''){
        var theirNet=num(row.prev.net);
        // ★突合は再計算に必要な実データ(生年月日・都道府県・住民税)が揃った時だけ。既定値での偽の再計算はしない★
        var canReconcile = e.birthYmd!=='' && e.pref!=='' && e.residentTax!=='';
        if(canReconcile){
          var ourNet=null, sm=state.month; state.month=prevYm;
          try{ ourNet=compute(e).net; } catch(_){ ourNet=null; } finally { state.month=sm; }
          if(ourNet!=null && ourNet===theirNet) match++;
          else { mismatch++; if(mmList.length<8) mmList.push(e.name+'（先月 '+migYen(theirNet)+' / 再計算 '+(ourNet==null?'—':migYen(ourNet))+'）'); }
        } else { needInput++; }
        // 先月履歴(相手の数字をfaithfulに)。凍結も立て、後続の自動保存で消えないよう守る。
        try{ if(window.Store&&Store.savePayslip){
          Store.savePayslip(prevYm, e.id, { name:e.name, net:theirNet, shikyuTotal:num(row.prev.gross), kojoTotal:num(row.prev.kojoTotal), shikyu:e.shikyu.map(function(s){ return { label:s.label, value:String(s.value) }; }), kojo:(row.prev.kojo||[]).map(function(k){ return { label:k.label, value:num(k.value) }; }), confirmed:true, migrated:true }, 'monthly');
          state.confirmed=state.confirmed||{}; (state.confirmed[prevYm]=state.confirmed[prevYm]||{})[e.id]=true;
        } }catch(_){ }
      }
    });
    return { added:added, match:match, mismatch:mismatch, needInput:needInput, mmList:mmList, prevYm:prevYm };
  }
  // ★K4: 台帳(Exallyで毎日入れた記録)から当月ぶんを取り込むバナー。クラウド接続時のみ表示。
  function ledgerImportBanner(){
    if(!(window.SUPA && window.Store && Store.getLedger)) return ''; // オフライン(ローカルのみ)は台帳が無いので出さない
    var imported=(state.employees||[]).some(function(e){ return e && e._ledgerCtx; });
    return '<div class="cal-box" style="background:#F0FAF4;border:1px solid #C8ECD8;border-radius:12px;padding:10px 12px;margin-bottom:12px">'
      +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">'
        +'<b style="color:#2E7D54;font-size:13px">🗒️ 台帳から取り込む</b>'
        +(imported?'<span style="font-size:11px;color:#3D9E72;font-weight:700">✓ 今月ぶんを取り込み済み</span>':'')
        +'<button data-ledger-import="1" style="margin-left:auto;padding:7px 12px;border:1px solid #3D9E72;background:#fff;color:#2E7D54;border-radius:9px;font-weight:700;font-size:12px;cursor:pointer">'+(imported?'台帳を再取り込み':'台帳から取り込む')+'（'+esc(state.month||'')+'）</button>'
      +'</div>'
      +'<div style="font-size:10.5px;color:#3D6B53;margin-top:5px">毎日つけた記録（売上・時間・件数）を読み込んで、代行など<b>売上や歩合で決まる基本給を自動計算</b>します。二度打ちは不要です。</div>'
      +'</div>';
  }
  function renderInput(){
    var host=$('#input-list'); if(!host) return; loadPrev(); loadOtHistory();
    var sche=scheduledDaysOf(state.month), H=HD();
    var hols=H?H.holidaysInMonth(state.month):[];
    var holStr=hols.length?hols.map(function(x){return x.day+'日 '+x.name;}).join('・'):'なし';
    var calHTML = sche==null ? '' :
      '<div class="cal-box" style="background:#F0FAF4;border:1px solid #C8ECD8;border-radius:12px;padding:10px 12px;margin-bottom:12px">'
      +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">'
        +'<b style="color:#2E7D54;font-size:13px">当月の所定労働日数 '+sche+'日</b>'
        +'<span style="font-size:10.5px;color:#5C7E6C">（休みの曜日・祝日・会社休を除く）</span>'
        +'<button class="cal-fill" data-fillsche="'+sche+'" style="margin-left:auto;padding:7px 12px;border:1px solid #3D9E72;background:#fff;color:#2E7D54;border-radius:9px;font-weight:700;font-size:12px;cursor:pointer">全員の出勤を所定('+sche+'日)で埋める</button>'
        +'<button data-csvimport="1" style="padding:7px 12px;border:1px solid #C8ECD8;background:#fff;color:#3D6B53;border-radius:9px;font-weight:700;font-size:12px;cursor:pointer" title="他社勤怠システム/Excelの勤怠CSVを取り込む">📄 勤怠CSV取込 <span class="help-i" data-help="kintaicsv" style="cursor:help">💡</span></button>'
      +'</div>'
      +'<div style="font-size:10.5px;color:#3D6B53;margin-top:5px">祝日: '+esc(holStr)+'</div>'
      +'<div style="font-size:10px;color:#5C7E6C;margin-top:3px">出勤日数は所定を初期表示。各自で手修正できます（赤で止めません）。会社独自の休みは「設定▸会社の決まり」で追加できます。</div>'
      +'</div>';
    var cnt=reviewCounts(), reviewOnly=!!state._reviewOnly;
    // 月の状態バッジ(下書き/確定済)=freee型「確定=凍結」の状態を可視化(UX🟠#7)。全員確認済=確定済(凍結)
    var monthConf=(cnt.total>0)&&state.employees.every(function(e){ return !isActiveInMonth(e,state.month)||empConfirmed(e); });
    var stateChip=monthConf?'<span class="mstate mstate-fixed" title="この月は確定=凍結済み。自動保存では上書きされません">🔒 確定済</span>':'<span class="mstate mstate-draft" title="下書き。編集すると自動保存されます">下書き</span>';
    var progHTML='<div class="cal-box" style="background:#fff;border:1px solid #d4eae0;border-radius:12px;padding:10px 12px;margin-bottom:12px">'
      +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">'
        +stateChip
        +'<b style="color:#2E7D54;font-size:13px">確認 '+cnt.done+'/'+cnt.total+'名</b>'
        +(cnt.need>0?'<span style="background:#fff8e1;border:1px solid #F4D8A8;color:#92500A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">未確認 '+cnt.need+'名</span>':'<span style="font-size:11px;color:#3D9E72;font-weight:700">✓ 全員確認済</span>')
        +'<label style="font-size:11px;color:#3D6B53;display:inline-flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" data-reviewonly'+(reviewOnly?' checked':'')+'>要確認だけ表示</label>'
        +'<span id="save-status" style="margin-left:auto;font-size:10.5px;color:#6E907E">'+(state._savedAt?'自動保存済 '+esc(state._savedAt):'')+'</span>'
      +'</div>'
      +'<div style="font-size:10px;color:#5C7E6C;margin-top:4px">前月と変わった人だけ「確認」を。変わっていない人は自動で確認済み扱いです。</div>'
      +'</div>';
    // 入力ビュー切替(カード/表)。2人以上のときだけ表を出す(1人は表の意味が薄い)
    var activeCount=state.employees.filter(function(e){return isActiveInMonth(e,state.month);}).length;
    var view=state.inputView||'card';
    var viewToggle=activeCount>1 ? '<div class="in-view-seg imode-seg" style="grid-template-columns:1fr 1fr;max-width:320px">'
      +'<b class="ivw'+(view==='card'?' on':'')+'" data-ivw="card">カードで1人ずつ</b>'
      +'<b class="ivw'+(view==='table'?' on':'')+'" data-ivw="table">表でまとめて</b></div>' : '';
    // 「今月を確定」ボタン(表/カード両ビューで共通)。★以前は表ビューで未定義=「undefined」表示+確定不可だった★
    var confirmBtn='<div style="display:flex;align-items:center;gap:10px;margin:14px 0 4px"><button class="btn-primary" data-confirm-month style="flex:0 0 auto;padding:11px 18px;font-size:14px">今月を確定（台帳・年調に反映）</button>'
      +(cnt.need>0?'<span style="font-size:11px;color:#92500A;font-weight:700">未確認 '+cnt.need+'名</span>':'<span style="font-size:11px;color:#3D9E72;font-weight:700">✓ 確認済</span>')
      +'<span style="font-size:10px;color:#5C7E6C"><b>保存は自動</b>です。「確定」は全員を確認済みにし、<b>賃金台帳・年末調整の集計対象</b>として今月を記録し、<b>従業員のWeb明細に自動公開</b>します（従業員はいつでも閲覧可・あとで直せます）。</span></div>';
    if(view==='table' && activeCount>1){ host.innerHTML=statutoryStaleWarn()+ledgerImportBanner()+calHTML+progHTML+viewToggle+renderInputTableHTML(reviewOnly)+confirmBtn; return; }
    var cards=state.employees.map(function(e,i){
      if(!isActiveInMonth(e,state.month)) return '';
      ensureKintai(e);
      if(sche!=null){ var soi=kinIdx(e,/出勤/); if(soi>=0 && (e.kintai[soi].value===''||e.kintai[soi].value==null)) e.kintai[soi].value=String(sche); }
      var r=compute(e);
      if(reviewOnly && !empNeedsReview(e,r)) return '';
      var open=state.open['I'+e.id], mw=minWageInfo(e);
      var cf=empConfirmed(e), nr=empNeedsReview(e,r);
      var confHTML = cf
        ? '<label class="emp-conf" style="font-size:10.5px;color:#3D9E72;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:2px;cursor:pointer"><input type="checkbox" class="econf" data-econf="'+i+'" checked>確認済</label>'
        : nr ? '<label class="emp-conf" style="font-size:10.5px;color:#92500A;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:2px;cursor:pointer"><input type="checkbox" class="econf" data-econf="'+i+'">確認</label>'
        : '';
      return '<div class="acc icard'+(open?' open':'')+'" data-i="'+i+'">'
        +'<div class="ic-top"><span class="acc-nm">'+esc(e.name)+wsBadge(e)+'</span><span class="acc-net">'+yen(r.net)+'</span><span class="diffb-wrap">'+diffBadge(e,r)+'</span>'+confHTML+'<button class="ic-detail" data-toggle="'+i+'">詳細<span class="acc-cv">▾</span></button></div>'
        +compactKinHTML(e)+prorateNote(e)
        +((mw&&!mw.ok)?'<div class="cr-warn" style="margin:0 12px 10px">⚠ '+mwWarnText(mw)+'。<b class="mw-fix" data-fix-emp="'+i+'">'+(e.payType==='時給'?'時給':'基本給')+'を直す →</b></div>':'')
        +'<div class="acc-body">'
          +basePayInputHTML(e,i)
          +dailyInputHTML(e,i)
          +(e.payType==='役員'?'':warimashiInputHTML(e))
          +daikyuInputHTML(e)
          +'<div class="grp"><div class="grp-h">その他の勤怠<button class="mini add" data-add="kintai" data-i="'+i+'" aria-label="勤怠項目を追加">＋</button></div><div class="rows">'+otherKinRows(e)+'</div></div>'
          +'<div class="grp"><div class="grp-h">支給<button class="mini add" data-add="shikyu" data-i="'+i+'" aria-label="支給項目を追加">＋</button></div><div class="rows">'+rowsHTML('shikyu',e.shikyu)+'</div></div>'
          +'<div class="grp"><div class="grp-h">法定外控除<button class="mini add" data-add="extraKojo" data-i="'+i+'" aria-label="控除項目を追加">＋</button></div><div class="rows">'+rowsHTML('extraKojo',e.extraKojo)+'</div></div>'
          +'<div class="calc-wrap">'+calcBoxHTML(e)+'</div></div></div>';
    }).join('');
    // 空状態(この月に在籍する従業員が0名)=次の一手CTA。カレンダーや確定ボタンだけが浮くのを防ぐ(UX🟠#8)
    if(activeCount===0){
      host.innerHTML=statutoryStaleWarn()+'<div class="empty-cta"><div class="ec-emoji">🧑‍💼</div>'
        +'<div class="ec-t">この月に給与計算する従業員がいません</div>'
        +'<div class="ec-s">「設定 ▸ 従業員マスタ」で従業員を追加すると、ここに当月の入力が出ます。</div>'
        +'<button class="btn-primary ec-btn" data-goto-empmaster>＋ 従業員を追加する</button></div>';
      return;
    }
    var emptyMsg=(reviewOnly && !cards) ? '<p class="hint" style="text-align:center;padding:18px 0">要確認の人はいません（全員確認済み）。</p>' : '';
    host.innerHTML=statutoryStaleWarn()+ledgerImportBanner()+calHTML+progHTML+viewToggle+cards+emptyMsg+confirmBtn;
  }
  // 表でまとめて入力(全従業員1画面・弥生の弱点/Exallyモデル)。列は既存と同じdata属性を再利用=同じハンドラで書ける。
  function renderInputTableHTML(reviewOnly){
    var sche=scheduledDaysOf(state.month);
    function kinCell(e,i,re){ var idx=kinIdx(e,re); var v=idx>=0?e.kintai[idx].value:''; return '<td class="tnum"><input class="finput num ic-in tcell" data-g="kintai" data-ri="'+idx+'" data-f="value" inputmode="numeric" value="'+attr(v)+'"></td>'; }
    function hmCell(hName,mName,hVal,mVal,cls,dsH,dsM){ return '<td class="tnum"><span class="thm"><input class="'+cls+' tcell" '+dsH+' inputmode="numeric" placeholder="0" value="'+attr(hVal)+'">:<input class="'+cls+' tcell" '+dsM+' inputmode="numeric" placeholder="0" value="'+attr(mVal)+'"></span></td>'; }
    // 割増(残業/深夜/休日)=かんたんのdata-wk。詳細モードの人は表では触らせない(カードへ誘導)=silent-wrong防止。役員は割増対象外(B4)。
    function wariCell(e,key){ var w=e.warimashi||{};
      if(e.payType==='役員') return '<td class="tnum tdim">—</td>'; // 役員は割増なし(カードも非表示)=表でも入れさせない
      if((w.mode||'easy')==='detail') return '<td class="tnum tdim">詳細<span class="thint">カードで</span></td>';
      return hmCell(0,0,w[key+'H'],w[key+'M'],'wi-f','data-wk="'+key+'H"','data-wk="'+key+'M"'); }
    // 歩合/売上/件数=給与形態で"必要な当月値を全部"出す(B3: max(売上,歩合)等で片方が出ないバグ修正・複数はセル内で縦積み)
    function cmInput(cmf,ph,val){ return '<input class="finput num cm-f tcell" data-cmf="'+cmf+'" inputmode="numeric" placeholder="'+ph+'" value="'+attr(fmtN(val))+'">'; }
    function extraCell(e){
      var ins=[];
      if(e.payType==='歩合'){ ins.push(cmInput('commissionAmt','歩合',e.commissionAmt)); }
      else if(e.payType==='カスタム'){ var prts=((ensurePayRule(e).variable||{}).parts)||[];
        if(prts.some(function(p){return p.type==='rate'||p.type==='tiered';})) ins.push(cmInput('salesAmt','売上',e.salesAmt));
        if(prts.some(function(p){return p.type==='piece';})) ins.push(cmInput('pieceCount','件数',e.pieceCount));
        if(prts.some(function(p){return p.type==='commission';})) ins.push(cmInput('commissionAmt','歩合',e.commissionAmt));
      }
      if(!ins.length) return '<td class="tnum tdim">—</td>';
      return '<td class="tnum"><span class="tstack">'+ins.join('')+'</span></td>'; }
    var rows=state.employees.map(function(e,i){
      if(!isActiveInMonth(e,state.month)) return '';
      ensureKintai(e);
      if(sche!=null){ var soi=kinIdx(e,/出勤/); if(soi>=0 && (e.kintai[soi].value===''||e.kintai[soi].value==null)) e.kintai[soi].value=String(sche); }
      var r=compute(e);
      if(reviewOnly && !empNeedsReview(e,r)) return '';
      var cf=empConfirmed(e), nr=empNeedsReview(e,r);
      var conf=cf?'<input type="checkbox" class="econf" data-econf="'+i+'" checked title="確認済">'
        :nr?'<input type="checkbox" class="econf" data-econf="'+i+'" title="要確認">':'<span class="thint">—</span>';
      var mw=minWageInfo(e); var mwWarn=(mw&&!mw.ok)?' <span class="tmw" title="'+attr(mwWarnText(mw))+'">⚠</span>':'';
      var llt=laborLimitText(e); var llWarn=llt?' <span class="tlw" title="'+attr(llt)+'">⚠</span>':''; // ④⑤ 36協定/年少者を表ビューにも(L-4)
      return '<tr class="trow" data-i="'+i+'"><td class="tnm">'+esc(e.name)+wsBadge(e)+mwWarn+llWarn+'</td>'
        +kinCell(e,i,/出勤/)+kinCell(e,i,/欠勤/)+kinCell(e,i,/有給/)
        +hmCell(0,0,e.workedH,e.workedM,'wk-f','data-wkf="workedH"','data-wkf="workedM"')
        +wariCell(e,'ot')+wariCell(e,'night')+wariCell(e,'holiday')
        +extraCell(e)
        +'<td class="tnet"><span class="tnet-v">'+yen(r.net)+'</span></td><td class="tdiff">'+diffBadge(e,r)+'</td>'
        +'<td class="tconf">'+conf+'</td></tr>';
    }).join('');
    if(!rows) return '<p class="hint" style="text-align:center;padding:18px 0">要確認の人はいません（全員確認済み）。</p>';
    return '<div class="in-table-wrap"><table class="in-table"><thead><tr>'
      +'<th class="tnm">氏名</th><th>出勤</th><th>欠勤</th><th>有給</th><th>労働<small>時:分</small></th><th>残業</th><th>深夜</th><th>休日</th><th>歩合/売上</th><th class="tnet">手取り</th><th>前月比</th><th>確認</th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table></div>'
      +'<p class="hint" style="margin:6px 2px">横スクロールできます。詳しい項目（支給の追加・法定外控除・日別など）は「カードで1人ずつ」で。時給/日給/歩合の金額は 設定▸従業員マスタ。</p>';
  }
  function refreshCard(i){ var e=state.employees[i];
    var trow=$('#input-list .trow[data-i="'+i+'"]'); if(trow){ var rt=compute(e); var nv=trow.querySelector('.tnet-v'); if(nv) nv.textContent=yen(rt.net); var td=trow.querySelector('.tdiff'); if(td) td.innerHTML=diffBadge(e,rt);
      var nmc=trow.querySelector('.tnm'); if(nmc){ var mw=minWageInfo(e); var mwc=nmc.querySelector('.tmw'); if(mw&&!mw.ok){ if(!mwc){ var sp=document.createElement('span'); sp.className='tmw'; sp.title=mwWarnText(mw); sp.textContent=' ⚠'; nmc.appendChild(sp); } else { mwc.title=mwWarnText(mw); } } else if(mwc){ mwc.remove(); }
        var llt=laborLimitText(e); var llc=nmc.querySelector('.tlw'); if(llt){ if(!llc){ var sp2=document.createElement('span'); sp2.className='tlw'; sp2.textContent=' ⚠'; nmc.appendChild(sp2); llc=sp2; } llc.title=llt; } else if(llc){ llc.remove(); } } // B7: 最賃⚠＋労働時間⚠(L-4)も即時更新
      return; } // 表モードは手取り/前月比/最賃⚠セルを更新(フォーカス維持)
    var card=$('#input-list .acc[data-i="'+i+'"]'); if(!card) return; var r=compute(e); card.querySelector('.acc-net').textContent=yen(r.net); var dw=card.querySelector('.diffb-wrap'); if(dw) dw.innerHTML=diffBadge(e,r); var bn=card.querySelector('.basepay-note'); if(bn) bn.innerHTML=basePayNoteOnly(e); var cw=card.querySelector('.calc-wrap'); if(cw) cw.innerHTML=calcBoxHTML(e); var wr=card.querySelector('.wi-resw'); if(wr) wr.innerHTML=wiResHTML(e); var lw=card.querySelector('.wi-limitw'); if(lw) lw.innerHTML=laborLimitWarn(e); } // ④⑤労働時間の黄警告もライブ更新

  // ───────── 賞与(ボーナス)モード ─────────
  function SZ(){ try{ if(typeof ShoyoZei!=='undefined'&&ShoyoZei) return ShoyoZei; }catch(e){} return (typeof window!=='undefined'&&window.ShoyoZei)||null; }
  function bonusYmOf(){ return (state.bonus&&state.bonus.payYm)||state.month; }
  function employYearOfYm(ym){ var k=KH(); return k?k.employYearOfYm(ym):2026; } // 単一ソース=koyo-hoken(労働保険年度4月切替)
  // 賞与支給月の前月の「社保控除後給与(kazei)」を履歴(pay_payslips)から取得
  function loadBonusPrev(){ if(!(window.Store&&Store.getPayslipsByYm)) return; var pm=prevYmOf(bonusYmOf()); if(state._bonusPrevYm===pm) return; state._bonusPrevYm=pm;
    Store.getPayslipsByYm(pm,pm).then(function(rows){ var m={}; (rows||[]).forEach(function(r){ if(r&&r.data&&r.data.kind!=='bonus'&&r.data.kazei!=null) m[r.employee_id]=num(r.data.kazei); }); state._bonusPrev=m; // 賞与税率の基準は前月「給与」(社保後)=賞与レコード除外
      if($('#scr-input')&&$('#scr-input').classList.contains('active')&&state.inputMode==='bonus') renderBonus(); }).catch(function(){});
  }
  // 健保573万上限用: 当年度(健保は4月〜翌3月)の「当月より前」の保存済み賞与の標準賞与額を自動合計→state._bonusYtd。
  function loadBonusYtd(){ if(!(window.Store&&Store.getPayslipsByYm)) return; var ym=bonusYmOf(); if(!ym) return; if(state._bonusYtdYm===ym) return; state._bonusYtdYm=ym;
    var y=+ym.slice(0,4), m=+ym.slice(5,7), fyStart=(m>=4?y:y-1)+'-04';
    Store.getPayslipsByYm(fyStart, ym).then(function(rows){ var acc={}; (rows||[]).forEach(function(r){ if(r&&r.data&&r.data.kind==='bonus'&&String(r.ym)<ym&&r.data.hyojun!=null) acc[r.employee_id]=(acc[r.employee_id]||0)+num(r.data.hyojun); }); state._bonusYtd=acc;
      if($('#scr-input')&&$('#scr-input').classList.contains('active')&&state.inputMode==='bonus') renderBonus(); }).catch(function(){});
  }
  function bonusEntry(e){ var b=state.bonus||(state.bonus={payYm:'',payDay:'',byEmp:{}}); if(!b.byEmp)b.byEmp={}; if(!b.byEmp[e.id])b.byEmp[e.id]={amount:'',prevAfter:'',ytd:''};
    var en=b.byEmp[e.id]; if(!en.addShikyu)en.addShikyu=[]; if(!en.addKojo)en.addKojo=[]; return en; } // addShikyu=追加支給[{label,value,hikazei}]・addKojo=任意控除[{label,value}]
  function computeBonus(e){
    var SZl=SZ(), S=SHH(), ym=bonusYmOf(), en=bonusEntry(e);
    var bonus=num(en.amount), prevMap=state._bonusPrev||{};
    // 追加支給: 課税分は賞与額に合算して社保/源泉の基準に(賞与性の支給=標準賞与額に含む)。非課税分は表示のみ(手取りには加算)。任意控除は手取りから差引。
    var addShikyu=(en.addShikyu||[]).map(function(it){ return { label:it.label, value:num(it.value), hikazei:!!it.hikazei }; });
    var addKojo=(en.addKojo||[]).map(function(it){ return { label:it.label, value:num(it.value) }; });
    var addTaxable=addShikyu.reduce(function(a,it){ return a+(it.hikazei?0:it.value); },0);
    var addNonTax=addShikyu.reduce(function(a,it){ return a+(it.hikazei?it.value:0); },0);
    var addKojoTotal=addKojo.reduce(function(a,it){ return a+it.value; },0);
    var base=bonus+addTaxable;               // 課税賞与総額=社保/源泉の基準
    var totalGross=bonus+addTaxable+addNonTax; // 総支給
    var manualPrev=(en.prevAfter!=null&&en.prevAfter!==''), histPrev=(e.id in prevMap);
    var prevAfter=manualPrev?num(en.prevAfter):(histPrev?prevMap[e.id]:null);
    var hasKaigo=(window.PayrollCalc&&PayrollCalc.isKaigoTarget)?PayrollCalc.isKaigoTarget(e.birthYmd,ym):false;
    // 健保573万上限用の既往賞与累計(標準賞与額)。手入力があれば優先、無ければ当年度(4-3月)の保存済み賞与から自動集計。
    var ytdMap=state._bonusYtd||{}; var manualYtd=(en.ytd!=null&&en.ytd!==''); var ytdVal=manualYtd?num(en.ytd):num(ytdMap[e.id]);
    var si=SZl?SZl.calcBonusSI({ bonus:base, healthRate:prefRate(e.pref,ym), kaigoRate:(S&&S.getKaigo)?S.getKaigo(ym).jugyoin:0.00795, hasKaigo:hasKaigo, employRate:employRateOf((state.company||{}).gyoshu, employYearOfYm(ym)), ytdKenpoBonus:ytdVal }):{total:0,health:0,pension:0,kaigo:0,employ:0,hyojun:0,kenpoBase:0,koseiBase:0};
    // 産休/育休の賞与社保免除(産休=賞与月末が産休中/育休=連続1か月超)。日付未設定=従来(workStatusで全免除)。雇用保険は実支払×率で残す。
    var bonusExempt=false;
    if(e.workStatus==='sankyu'||e.workStatus==='ikukyu'){
      var zb=ZK();
      var be=(zb&&zb.shahoExemptBonus)?zb.shahoExemptBonus({leaveType:e.workStatus,startYmd:e.leaveStartYmd,endYmd:e.leaveEndYmd,bonusYm:ym}):null;
      bonusExempt=(be==null)?true:be; // 日付未設定→従来どおり全免除
    }
    if(bonusExempt){ si={ total:si.employ, health:0, pension:0, kaigo:0, employ:si.employ, hyojun:si.hyojun, kenpoBase:si.kenpoBase, koseiBase:si.koseiBase }; }
    // 年齢資格: 厚年70歳到達で保険料0・健保75歳到達で後期高齢へ移行=0(月次計算 calc.js と対称)。
    var _PC=window.PayrollCalc;
    if(_PC){
      if(_PC.isPensionTarget && !_PC.isPensionTarget(e.birthYmd,ym)) si.pension=0;
      if(_PC.isHealthTarget && !_PC.isHealthTarget(e.birthYmd,ym)){ si.health=0; si.kaigo=0; }
      si.total=num(si.health)+num(si.pension)+num(si.kaigo)+num(si.employ);
    }
    // ★K1 業務委託=賞与でも控除ゼロの報酬(月次 calc.js と対称・単一方針)。源泉・社保なし=支給がそのまま手取り。
    var _contractor=(e.employmentType==='contractor');
    if(_contractor){ si={ total:0, health:0, pension:0, kaigo:0, employ:0, hyojun:si.hyojun, kenpoBase:si.kenpoBase, koseiBase:si.koseiBase }; }
    e._bonusExempt=bonusExempt;
    var tax={tax:0}, noPrev=false;
    if(_contractor){ /* 業務委託=源泉なし */ }
    else if(prevAfter==null) noPrev=true;
    else if(SZl) tax=SZl.calcBonusTax({ bonus:base, bonusSI:si.total, prevSalary:prevAfter, prevSI:0, fuyou:num(e.fuyou)+jintekiOf(e, e.taxClass==='otsu'?'otsu':'ko'), taxClass:e.taxClass, payYm:ym });
    var taxAmt=(noPrev||_contractor)?0:(tax.tax||0);
    return { bonus:bonus, base:base, totalGross:totalGross, addShikyu:addShikyu, addKojo:addKojo, addTaxable:addTaxable, addNonTax:addNonTax, addKojoTotal:addKojoTotal,
      prevAfter:prevAfter, fromHistory:(!manualPrev&&histPrev), noPrev:noPrev, ytdVal:ytdVal, ytdAuto:(!manualYtd&&ytdVal>0), si:si, tax:tax, taxAmt:taxAmt, net:totalGross-si.total-taxAmt-addKojoTotal };
  }
  function renderBonus(){
    var host=$('#bonus-view'); if(!host) return; loadBonusPrev(); loadBonusYtd();
    var b=state.bonus||{}, ym=bonusYmOf(), pm=prevYmOf(ym);
    var head='<div class="card" style="padding:12px;margin-bottom:10px">'
      +'<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">'
      +'<label style="font-size:12px;color:#2E7D54;font-weight:700">賞与支給月 <input type="month" class="finput finput-sm" data-bn="payYm" value="'+attr(ym)+'"></label>'
      +'<label style="font-size:12px;color:#2E7D54;font-weight:700">支給日 <input class="finput finput-sm" data-bn="payDay" value="'+attr(b.payDay)+'" placeholder="例 12月10日" style="width:110px"></label>'
      +'</div>'
      +'<div class="hint" style="margin:8px 0 0">賞与の所得税は<b>前月（'+esc(pm)+'）の給与から社会保険料を引いた額</b>と扶養人数で税率が決まります（国税庁 算出率表）。<span class="help-i" data-help="bonusPrev">💡</span> 前月を計算・保存していれば自動、無ければ各行で手入力してください。</div>'
      +'<div class="hint" style="margin:4px 0 0;color:#92500A">⚠ 健康保険は<b>年度累計573万円</b>まで（厚年は1回150万円まで）。年内2回目以降の賞与は、各行の<b>「本年度の既往賞与（標準賞与額）累計」</b>を入れると累計573万で自動調整します。</div>'
      +'<div class="hint" style="margin:4px 0 0">産休中の支払賞与は社保免除。育休は<b>賞与支払月末を含む連続1か月超の育休</b>のみ社保免除（厚年81条の2・令和4年改正）。従業員マスタの休業開始/終了日で自動判定（雇用保険は実額のため残ります）。</div></div>';
    var cards=state.employees.filter(function(e){return isActiveInMonth(e,ym);}).map(function(e){
      var c=computeBonus(e), en=bonusEntry(e);
      var prevBox = c.noPrev
        ? '<div class="cr-warn" style="margin:6px 0">⚠ <b>前月（'+esc(pm)+'）の給与から社会保険料を引いた額</b>が未取得です（賞与の税率の基準）。前月を計算・保存するか、ここに手入力してください（赤で止めません）。<div style="margin-top:5px">前月の給与（社保を引いた後） <input class="finput num" data-bp="'+e.id+'" inputmode="numeric" value="'+attr(en.prevAfter)+'" placeholder="円" style="width:130px"></div></div>'
        : '<div style="font-size:11px;color:#4b6b58;margin:5px 0">前月の給与（社保を引いた後）: <b>'+yen(c.prevAfter)+'</b> '+(c.fromHistory?'（前月'+esc(pm)+'から自動）':'（手入力）')+' <input class="finput num" data-bp="'+e.id+'" inputmode="numeric" value="'+attr(en.prevAfter)+'" placeholder="上書き" style="width:100px;margin-left:6px"></div>';
      var hyojun=c.si.hyojun||0, caps='';
      if(hyojun>0&&c.si.kenpoBase<hyojun) caps+='<span class="cap-badge">健保 年573万上限</span>';
      if(hyojun>0&&c.si.koseiBase<hyojun) caps+='<span class="cap-badge">厚年 1回150万上限</span>';
      var taxLine, warn='';
      if(c.noPrev){ taxLine='<div class="calc-line"><span>源泉所得税</span><span class="v">前月給与の入力待ち</span></div>'; }
      else if(c.tax.special && c.tax.specialComputed){ taxLine='<div class="calc-line"><span>源泉所得税（特例・月額表）</span><span class="v">'+yen(c.taxAmt)+'</span></div>'; warn='<div class="hint" style="margin:6px 0;color:#3D6B53">この賞与は<b>特例</b>（前月に給与がない、または賞与が前月給与（社保後）の<b>10倍超</b>）のため、算出率表でなく<b>月額表で自動計算</b>しました（'+(c.tax.months||6)+'か月で按分）。<span class="help-i" data-help="bonusPrev">💡</span></div>'; }
      else if(c.tax.special){ taxLine='<div class="calc-line"><span>源泉所得税</span><span class="v">月額表で要計算</span></div>'; warn='<div class="cr-warn" style="margin:6px 0">⚠ この賞与は<b>特例</b>です（前月に給与がない、または賞与が前月給与（社保後）の<b>10倍超</b>）。税額表が読み込めなかったため、源泉所得税は月額表で確認してください。<span class="help-i" data-help="bonusPrev">💡</span></div>'; }
      else { taxLine='<div class="calc-line"><span>源泉所得税（率 '+c.tax.rate+'%'+(c.tax.otsu?'・乙欄':'')+'）</span><span class="v">'+yen(c.taxAmt)+'</span></div>'; }
      // 追加支給/任意控除の編集UI(月次と同じ自由度)。data-bs*/bk*=賞与の追加項目
      var sItems=(en.addShikyu||[]).map(function(it,idx){ return '<div class="bx-row">'
        +'<input class="finput bx-lbl" data-bsl="'+e.id+':'+idx+'" list="dl-bonus-shikyu" value="'+attr(it.label)+'" placeholder="項目名">'
        +'<input class="finput num bx-val" data-bsv="'+e.id+':'+idx+'" inputmode="numeric" value="'+attr(fmtN(it.value))+'" placeholder="円">'
        +'<label class="bx-hik"><input type="checkbox" data-bsh="'+e.id+':'+idx+'"'+(it.hikazei?' checked':'')+'>非課税</label>'
        +'<button class="btn-ghost bx-del" data-bsx="'+e.id+':'+idx+'" aria-label="この支給項目を削除">×</button></div>'; }).join('');
      var kItems=(en.addKojo||[]).map(function(it,idx){ return '<div class="bx-row">'
        +'<input class="finput bx-lbl" data-bkl="'+e.id+':'+idx+'" list="dl-bonus-kojo" value="'+attr(it.label)+'" placeholder="項目名">'
        +'<input class="finput num bx-val" data-bkv="'+e.id+':'+idx+'" inputmode="numeric" value="'+attr(fmtN(it.value))+'" placeholder="円">'
        +'<button class="btn-ghost bx-del" data-bkx="'+e.id+':'+idx+'" aria-label="この控除項目を削除">×</button></div>'; }).join('');
      var editor='<div class="sec-lb" style="font-size:11px;margin-top:10px">追加の支給項目<span class="hint2">賞与に上乗せ・任意</span></div>'+sItems
        +'<div class="addcustom"><input class="finput ac-inp" data-bsaddl="'+e.id+'" list="dl-bonus-shikyu" placeholder="例：特別賞与・寸志"><button class="btn-ghost" data-bsadd="'+e.id+'" style="padding:9px 12px">＋支給</button></div>'
        +'<div class="sec-lb" style="font-size:11px">任意の控除項目<span class="hint2">法定は自動・これは任意分</span></div>'+kItems
        +'<div class="addcustom"><input class="finput ac-inp" data-bkaddl="'+e.id+'" list="dl-bonus-kojo" placeholder="例：親睦会費・貸付金返済"><button class="btn-ghost" data-bkadd="'+e.id+'" style="padding:9px 12px">＋控除</button></div>';
      var addSLines=(c.addShikyu||[]).map(function(it){ return '<div class="calc-line"><span>'+esc(it.label||'追加支給')+(it.hikazei?'（非課税）':'')+'</span><span class="v">'+yen(it.value)+'</span></div>'; }).join('');
      var addKLines=(c.addKojo||[]).map(function(it){ return '<div class="calc-line"><span>'+esc(it.label||'控除')+'</span><span class="v">'+yen(it.value)+'</span></div>'; }).join('');
      return '<div class="acc icard'+(num(en.amount)>0?' open':'')+'">'
        +'<div class="ic-top"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(c.net)+'</span></div>'
        +'<div style="padding:0 12px 12px">'
        +'<div style="display:flex;gap:8px;align-items:center;margin:6px 0"><span style="font-size:12px;color:#2E7D54;font-weight:700;min-width:54px">賞与額</span><input class="finput num" data-ba="'+e.id+'" inputmode="numeric" value="'+attr(en.amount)+'" placeholder="円" style="flex:1"></div>'
        +prevBox
        +'<div style="font-size:11px;color:#4b6b58;margin:5px 0">本年度の既往賞与（標準賞与額）累計 <input class="finput num" data-by="'+e.id+'" inputmode="numeric" value="'+attr(en.ytd)+'" placeholder="'+(c.ytdAuto?fmtN(c.ytdVal):'0')+'" style="width:110px"> 円 <span style="color:#6E907E">'+(c.ytdAuto?'（当年度の確定賞与から<b>自動 '+yen(c.ytdVal)+'</b>・上書き可）':'（2回目以降のみ・健保 年573万上限用）')+'</span></div>'
        +editor
        +(caps?'<div style="margin:4px 0">'+caps+'</div>':'')+warn
        +'<div class="calc-box"><div class="ch">賞与の自動計算（標準賞与額 '+yen(hyojun)+'）<span class="help-i" data-help="hyojunbonus">💡</span></div>'
          +'<div class="calc-line"><span>賞与額</span><span class="v">'+yen(c.bonus)+'</span></div>'
          +addSLines
          +(c.si.health>0?'<div class="calc-line"><span>健康保険</span><span class="v">'+yen(c.si.health)+'</span></div>':'')
          +(c.si.kaigo>0?'<div class="calc-line"><span>介護保険</span><span class="v">'+yen(c.si.kaigo)+'</span></div>':'')
          +(c.si.pension>0?'<div class="calc-line"><span>厚生年金</span><span class="v">'+yen(c.si.pension)+'</span></div>':'')
          +'<div class="calc-line"><span>雇用保険</span><span class="v">'+yen(c.si.employ)+'</span></div>'
          +taxLine
          +addKLines
          +'<div class="calc-line net tot"><span>差引支給額（手取り）</span><span class="v">'+yen(c.net)+'</span></div></div>'
        +'</div></div>';
    }).join('');
    var anyBonus=state.employees.some(function(e){ return isActiveInMonth(e,ym) && num(bonusEntry(e).amount)>0; });
    var footer = anyBonus
      ? '<div class="card" style="padding:12px;margin-top:6px"><button class="btn-primary" data-confirm-bonus style="width:100%">この賞与を確定（年調・台帳に反映）</button>'
        +'<div style="margin-top:8px;display:flex;justify-content:flex-end"><button class="btn-ghost" data-bonus-harau="1" style="padding:8px 12px;font-size:12px">賞与支払届をExcel出力</button></div>'
        +'<p class="hint" style="margin:8px 0 0">確定すると、この賞与（'+esc(ym)+'）を年末調整の自動集計と賃金台帳に反映します。あとで直せます。<b>定時決定（4〜6月の標準報酬）や前月比には賞与は含めません</b>（法令どおり）。<br>「賞与支払届」＝年金機構提出用（標準賞与額＝1,000円未満切捨・健保 年度573万／厚年1回150万上限）。被保険者整理番号は各自入力。</p></div>'
      : '';
    host.innerHTML=bonusItemSuggestHTML()+head+(cards||'<p class="hint">対象の従業員がいません。</p>')+footer;
  }
  // 賞与を pay_payslips に kind='bonus' で保存(年末調整の年集計・賃金台帳が拾う)。賞与額0は保存しない。
  //  ★定時決定/前月比は賞与を除外して集計する(取得側フィルタ)ので、この保存は法令上の月額報酬に混入しない。
  function saveBonusPayslips(){
    if(!(window.Store&&Store.savePayslip)) return; var ym=bonusYmOf(); if(!ym) return;
    state.employees.filter(function(e){ return isActiveInMonth(e,ym); }).forEach(function(e){
      var en=bonusEntry(e); if(num(en.amount)<=0) return;
      try{ var c=computeBonus(e); var si=c.si||{};
        var shikyu=[{label:'賞与',value:c.bonus,hikazei:false}]; (c.addShikyu||[]).forEach(function(it){ shikyu.push({label:it.label||'追加支給',value:it.value,hikazei:!!it.hikazei}); }); // 課税/非課税を保持=年調の課税集計が正確に
        Store.savePayslip(ym, e.id, { name:e.name, shikyuTotal:c.totalGross, kazei:c.base, net:c.net,
          confirmed:true, // 賞与は「賞与を確定」でのみ保存=常に確定済み
          hyojun:num(si.hyojun), // 標準賞与額=健保573万 年度累計(ytd)の自動集計に使う
          shikyu:shikyu, tax:num(c.taxAmt),
          siTotal:si.total||0, si:{ health:num(si.health), kaigo:num(si.kaigo), pension:num(si.pension), employ:num(si.employ) },
          dept:(e.dept||'') }, 'bonus');
      }catch(_e){}
    });
  }
  // 賞与支払届(被保険者賞与支払届): 当月の賞与から 賞与額(通貨=社保対象賞与)・標準賞与額(1000円未満切捨) を届の一覧に。
  //  出典=日本年金機構「被保険者賞与支払届」。整理番号は各自入力・マイナンバーは扱わない(届は整理番号/基礎年金番号)。現物は通貨のみ。
  var BONUS_HARAU_COLS=['被保険者整理番号','氏名','生年月日','賞与支払年月日','賞与額(通貨)','賞与額(現物)','合計','標準賞与額','備考'];
  function bonusHarauRows(){
    var ym=bonusYmOf(), payDay=String((state.bonus&&state.bonus.payDay)||'').trim();
    return state.employees.filter(function(e){ return isActiveInMonth(e,ym) && num(bonusEntry(e).amount)>0; }).map(function(e){
      var c=computeBonus(e), si=c.si||{}, tsuka=num(c.base); // 社保対象賞与=課税賞与総額
      var notes=[]; if(!payDay)notes.push('賞与支払日を入力してください'); if(isOver70(e,ym+'-01'))notes.push('70歳以上'); if(c.si.kenpoBase<si.hyojun)notes.push('健保 年573万上限'); if(c.si.koseiBase<si.hyojun)notes.push('厚年 150万上限');
      // 賞与支払年月日は様式で年月日必須=支払日未入力なら空にして要入力(月だけの値を出さない)
      return { name:e.name||'', birthYmd:e.birthYmd||'', payDate:payDay||'', tsuka:tsuka, genbutsu:0, goukei:tsuka, hyojun:num(si.hyojun), note:notes.join('／') };
    });
  }
  function bonusHarauAoa(rows){ var aoa=[BONUS_HARAU_COLS]; rows.forEach(function(x){ aoa.push(['', x.name, x.birthYmd, x.payDate, x.tsuka||'', x.genbutsu||0, x.goukei||'', x.hyojun||'', x.note]); }); return aoa; }
  function downloadBonusHarau(){ if(!window.PayslipXlsx) return; var rows=bonusHarauRows(); if(!rows.length){ uiAlert('賞与額が入力された従業員がいません。'); return; }
    PayslipXlsx.downloadSheets([{name:'賞与支払届', aoa:bonusHarauAoa(rows)}], { filename:'賞与支払届_'+bonusYmOf()+'.xlsx' }); }
  function renderInputArea(){
    var ml=$('#input-list'), bv=$('#bonus-view'), hint=$('#in-hint'), bonus=(state.inputMode==='bonus');
    $$('.imode').forEach(function(x){ x.classList.toggle('on', x.dataset.imode===state.inputMode); });
    if(ml) ml.style.display=bonus?'none':''; if(bv) bv.style.display=bonus?'':'none'; if(hint) hint.style.display=bonus?'none':'';
    if(bonus) renderBonus(); else renderInput();
  }

  /* ---------- 一覧 / 集計 ---------- */
  // 一覧/集計タブの「表示中サブビュー」を再描画(月変更・タブ再表示で集計/帳票/年末調整も追従=stale防止)
  function renderListActive(){ var v=state.listView||'list'; if(v==='sum')renderSumView(); else if(v==='cho')renderChoView(); else if(v==='nen')renderNenView(); else renderListView(); }
  function renderListView(){
    var host=$('#view-list'); if(!host) return; loadPrev(); loadOtHistory();
    host.innerHTML=statutoryStaleWarn()+state.employees.filter(function(e){return isActiveInMonth(e,state.month);}).map(function(e){
      var r=compute(e), open=state.open['L'+e.id];
      var pay=r.shikyu.map(function(s){return '<div class="dl"><span>'+esc(s.label)+'</span><span class="v">'+yen(s.value)+'</span></div>';}).join('');
      var ded=r.kojo.map(function(k){return '<div class="dl"><span>'+esc(k.label)+'</span><span class="v">'+yen(k.value)+'</span></div>';}).join('');
      return '<div class="acc'+(open?' open':'')+'" data-lid="'+e.id+'"><div class="acc-h" data-ltoggle="'+e.id+'"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(r.net)+'</span>'+diffBadge(e,r)+'<span class="acc-cv">▾</span></div>'
        +'<div class="acc-body"><div class="det det-2"><div><div style="font-size:11px;font-weight:700;color:#2E7D54;margin:4px 0">支給</div>'+pay+'</div><div><div style="font-size:11px;font-weight:700;color:#2E7D54;margin:4px 0">控除</div>'+ded+'</div></div>'
        +'<div class="dl" style="margin-top:8px;font-weight:700;border-bottom:none"><span>差引支給額</span><span class="v" style="color:#2E7D54">'+yen(r.net)+'</span></div></div></div>';
    }).join('');
  }
  function renderSumView(){
    // 母集合は入力/印刷と統一(isActiveInMonth=当月在籍)
    var warnList=[];
    var rows=state.employees.filter(function(e){return isActiveInMonth(e,state.month);}).map(function(e){
      var r=compute(e), si=r.si||{};
      var ws=empWarnings(e); if(ws.length) warnList.push({name:e.name, w:ws});
      return { name:e.name, s:r.shikyuTotal, k:r.kojoTotal, n:r.net,
        health:num(si.health), kaigo:num(si.kaigo), pension:num(si.pension), employ:num(si.employ),
        tax:num(r.incomeTax), jumin:num(r.residentTax) };
    });
    var t=rows.reduce(function(a,x){return {s:a.s+x.s,k:a.k+x.k,n:a.n+x.n,health:a.health+x.health,kaigo:a.kaigo+x.kaigo,pension:a.pension+x.pension,employ:a.employ+x.employ,tax:a.tax+x.tax,jumin:a.jumin+x.jumin};},{s:0,k:0,n:0,health:0,kaigo:0,pension:0,employ:0,tax:0,jumin:0});
    var body=rows.map(function(x){return '<tr><td>'+esc(x.name)+'</td><td class="num">'+yen(x.s)+'</td><td class="num">'+yen(x.k)+'</td><td class="num">'+yen(x.n)+'</td></tr>';}).join('');
    var shakaiHonnin=t.health+t.kaigo+t.pension; // 健保+厚年+介護の本人負担計
    var mlabel=monthLabel().replace(/ /g,'');
    var kh=function(l,v){ return '<div class="pay-row"><span>'+l+'</span><span class="num">'+yen(v)+'</span></div>'; };
    var warnCard = warnList.length ? ('<div class="card" style="border-color:#F4D8A8;background:#fffdf7"><div class="card-h" style="color:#92500A">⚠ 要確認（'+warnList.length+'名）</div>'
      + warnList.map(function(x){ return '<div class="pay-row"><span><b>'+esc(x.name)+'</b></span><span style="font-size:11.5px;color:#92500A;text-align:right">'+x.w.map(esc).join('<br>')+'</span></div>'; }).join('')
      + '<p class="hint" style="margin-top:6px">この一覧・Excel（給与集計）にのみ表示。従業員へ渡す明細には出しません。</p></div>') : '';
    $('#view-sum').innerHTML=warnCard+'<div class="card"><div class="card-h">月次集計（'+mlabel+'）</div>'
      +'<table class="sumtab"><thead><tr><th>従業員</th><th>支給合計</th><th>控除合計</th><th>差引支給</th></tr></thead>'
      +'<tbody>'+body+'<tr class="total"><td>全員合計（'+rows.length+'名）</td><td class="num">'+yen(t.s)+'</td><td class="num">'+yen(t.k)+'</td><td class="num">'+yen(t.n)+'</td></tr></tbody></table>'
      +'</div>'
      +'<div class="card"><div class="card-h">控除の内訳（本人負担・'+mlabel+'）</div>'
        +'<table class="sumtab"><tbody>'
        +'<tr><td>健康保険</td><td class="num">'+yen(t.health)+'</td></tr>'
        +(t.kaigo>0?'<tr><td>介護保険</td><td class="num">'+yen(t.kaigo)+'</td></tr>':'')
        +'<tr><td>厚生年金</td><td class="num">'+yen(t.pension)+'</td></tr>'
        +'<tr><td>雇用保険</td><td class="num">'+yen(t.employ)+'</td></tr>'
        +'<tr><td>源泉所得税</td><td class="num">'+yen(t.tax)+'</td></tr>'
        +'<tr><td>住民税</td><td class="num">'+yen(t.jumin)+'</td></tr>'
        +'<tr class="total"><td>控除合計</td><td class="num">'+yen(t.k)+'</td></tr>'
        +'</tbody></table></div>'
      +'<div class="card"><div class="card-h">納付の目安（'+mlabel+'）</div>'
        +kh('源泉所得税 <span class="pay-sub">税務署へ・原則翌月10日</span>', t.tax)
        +kh('住民税（特別徴収）<span class="pay-sub">市区町村へ・翌月10日</span>', t.jumin)
        +kh('社会保険 健保＋厚年＋介護 <span class="pay-sub">労使折半・本人＋会社</span>', shakaiHonnin*2)
        +kh('　└ うち本人負担（給与天引き）', shakaiHonnin)
        +kh('雇用保険 本人負担 <span class="pay-sub">会社負担は労働保険で年度精算</span>', t.employ)
        +'<p class="hint" style="color:#92500A;margin-top:8px">⚠ 目安です。社会保険は<b>労使折半で本人負担の約2倍</b>（＋子ども・子育て拠出金は会社のみ別途）。正確な納付額は<b>納入告知書・決定通知書</b>でご確認ください。雇用保険は労働保険として年度で申告・精算します。</p>'
      +'</div>';
  }

  /* ---------- 帳票（賃金台帳・社保一覧・部署別集計） ---------- */
  function CD(){ return window.ChinginDaicho; }
  // 賃金台帳/年末調整は「確定済み」の明細だけ集計(未確定の下書き月を混入させない)。旧データ(confirmed無し)は後方互換で集計対象。
  function confirmedRecs(recs){ return (recs||[]).filter(function(r){ return r && r.data && r.data.confirmed!==false; }); }
  function fmtMinLbl(min){ min=num(min); if(!min)return ''; return Math.floor(min/60)+':'+('0'+(min%60)).slice(-2); }
  function activeMonthEmps(){ return state.employees.filter(function(e){return isActiveInMonth(e,state.month);}); }
  // 社保一覧(月次・現計算)
  function shakaiRows(){ return activeMonthEmps().map(function(e){ var r=compute(e), si=r.si||{}; return { name:e.name, dept:e.dept||'未分類', hyojun:num(r.hyojun), health:num(si.health), kaigo:num(si.kaigo), pension:num(si.pension), employ:num(si.employ), sum:num(si.health)+num(si.kaigo)+num(si.pension)+num(si.employ) }; }); }
  function shakaiListHTML(){ var rows=shakaiRows(); var mlabel=monthLabel().replace(/ /g,'');
    var t=rows.reduce(function(a,x){return {health:a.health+x.health,kaigo:a.kaigo+x.kaigo,pension:a.pension+x.pension,employ:a.employ+x.employ,sum:a.sum+x.sum};},{health:0,kaigo:0,pension:0,employ:0,sum:0});
    var body=rows.map(function(x){ return '<tr><td>'+esc(x.name)+'</td><td class="num">'+yen(x.hyojun)+'</td><td class="num">'+yen(x.health)+'</td><td class="num">'+yen(x.kaigo)+'</td><td class="num">'+yen(x.pension)+'</td><td class="num">'+yen(x.employ)+'</td><td class="num">'+yen(x.sum)+'</td></tr>'; }).join('');
    return '<div class="card"><div class="card-h">社会保険一覧（本人負担・'+mlabel+'）<span class="help-i" data-help="santeikiso">💡</span><button class="btn-ghost" data-choxlsx="shakai" style="margin-left:auto;padding:5px 12px;font-size:12px">Excel</button></div>'
      +'<div style="overflow-x:auto"><table class="sumtab" style="min-width:520px"><thead><tr><th>従業員</th><th>標準報酬</th><th>健保</th><th>介護</th><th>厚年</th><th>雇用</th><th>本人計</th></tr></thead>'
      +'<tbody>'+body+'<tr class="total"><td>合計</td><td class="num">—</td><td class="num">'+yen(t.health)+'</td><td class="num">'+yen(t.kaigo)+'</td><td class="num">'+yen(t.pension)+'</td><td class="num">'+yen(t.employ)+'</td><td class="num">'+yen(t.sum)+'</td></tr></tbody></table></div>'
      +'<p class="hint" style="margin-top:6px">当月の計算値。会社負担は健保・厚年・介護がほぼ同額（折半）、雇用は会社率で別途。算定基礎届・納付確認の素にどうぞ。</p></div>'; }
  // 部署別集計(月次・現計算)
  function deptRows(){ return activeMonthEmps().map(function(e){ var r=compute(e); return { dept:e.dept||'未分類', name:e.name, s:r.shikyuTotal, k:r.kojoTotal, n:r.net }; }); }
  function deptSummaryHTML(){ var g=CD()?CD().deptGroups(deptRows()):{groups:[],total:{s:0,k:0,n:0}}; var mlabel=monthLabel().replace(/ /g,'');
    var body=g.groups.map(function(gr){ return '<tr class="dept-h"><td colspan="4">'+esc(gr.dept)+'（'+gr.rows.length+'名）</td></tr>'
      + gr.rows.map(function(x){ return '<tr><td style="padding-left:16px">'+esc(x.name)+'</td><td class="num">'+yen(x.s)+'</td><td class="num">'+yen(x.k)+'</td><td class="num">'+yen(x.n)+'</td></tr>'; }).join('')
      + '<tr class="total"><td>'+esc(gr.dept)+' 小計</td><td class="num">'+yen(gr.sub.s)+'</td><td class="num">'+yen(gr.sub.k)+'</td><td class="num">'+yen(gr.sub.n)+'</td></tr>'; }).join('');
    return '<div class="card"><div class="card-h">部署別集計（'+mlabel+'）<button class="btn-ghost" data-choxlsx="dept" style="margin-left:auto;padding:5px 12px;font-size:12px">Excel</button></div>'
      +'<table class="sumtab"><thead><tr><th>部署 / 従業員</th><th>支給合計</th><th>控除合計</th><th>差引支給</th></tr></thead>'
      +'<tbody>'+body+'<tr class="total" style="background:#E7F5EC"><td>総合計</td><td class="num">'+yen(g.total.s)+'</td><td class="num">'+yen(g.total.k)+'</td><td class="num">'+yen(g.total.n)+'</td></tr></tbody></table>'
      +'<p class="hint" style="margin-top:6px">部署は従業員マスタの「部署」で設定。未設定は「未分類」。</p></div>'; }
  /* ---------- 算定基礎届(定時決定・4〜6月→標準報酬) ---------- */
  // 算定の核: 4〜6月の{days,pay}から、支払基礎日数がthreshold(17・短時間11)以上の月だけ平均→報酬月額→標準報酬(健保/厚年)。
  //  出典=日本年金機構「被保険者報酬月額算定基礎届」(17日以上の月の報酬合計÷該当月数=平均額→標準報酬月額表)。
  function santeiKisoRow(months, threshold, fallback){
    var SHH=(typeof SHAKAIHOKEN_HYO!=='undefined')?SHAKAIHOKEN_HYO:(window&&window.SHAKAIHOKEN_HYO);
    var withData=months.filter(function(m){ return num(m.days)>0 || num(m.pay)>0; });
    var qualifying=months.filter(function(m){ return num(m.days)>=threshold; });
    if(!qualifying.length && fallback>0){ qualifying=months.filter(function(m){ return num(m.days)>=fallback; }); } // パート短時間就労者=17日が無ければ15日以上の月(年金機構の特例)
    var use = qualifying.length ? qualifying : withData; // それも無ければ有る月で(要確認・実務は個別対応)
    var soukei=use.reduce(function(a,m){ return a+num(m.pay); },0);
    var cnt=use.length;
    var heikin = cnt ? Math.floor(soukei/cnt) : 0; // 平均額=総計÷該当月数(円未満切捨)
    var decP=(SHH&&SHH.gradeOf)?SHH.gradeOf(heikin):{hyojun:0,tokyu:0};
    var decH=(SHH&&SHH.gradeOfHealth)?SHH.gradeOfHealth(heikin):{hyojun:0,tokyu:0};
    return { soukei:soukei, heikin:heikin, count:cnt, allQualify:(withData.length>0 && qualifying.length===withData.length), noQualify:(qualifying.length===0),
      decPension:decP.hyojun, decPensionGrade:decP.tokyu, decHealth:decH.hyojun, decHealthGrade:decH.tokyu };
  }
  // 賃金台帳(年間・従業員別・確定済み月から)
  function chinginDaichoHTML(L, year){
    var CDm=CD(); var note='<p class="hint" style="margin:0 0 10px">「今月を確定」で保存した月だけ反映（労基法108条の賃金台帳）。<span class="help-i" data-help="chingindaicho">💡</span>横スクロール可。<button class="btn-ghost" data-choxlsx="daicho" style="margin-left:8px;padding:4px 10px;font-size:11px">Excel</button></p>';
    if(!L.length) return note+'<div class="card"><p class="hint">従業員がいません。</p></div>';
    var months=[]; for(var mm=1;mm<=12;mm++)months.push(mm);
    var cards=L.map(function(row){ var t=CDm.ledgerTotals(row), lab=CDm.ledgerLabels(row);
      if(t.savedMonths===0) return '<div class="card"><div class="card-h">'+esc(row.name)+'（'+year+'年）</div><p class="hint">この年の確定済み月がありません。</p></div>';
      function rowT(label,getRaw,totalRaw,fmt){ fmt=fmt||yen; return '<tr><td class="dc-lb">'+esc(label)+'</td>'+months.map(function(m){ var d=row.monthly[m]; return '<td class="num">'+(d?fmt(getRaw(d)):'')+'</td>'; }).join('')+'<td class="num tot">'+fmt(totalRaw)+'</td></tr>'; }
      var head='<tr><th>項目</th>'+months.map(function(m){return '<th>'+m+'月</th>';}).join('')+'<th>年計</th></tr>';
      var b='';
      b+=rowT('労働日数',function(d){return (d.work||{}).days;},t.days,function(v){return num(v)||'';});
      b+=rowT('労働時間',function(d){return (d.work||{}).workMin;},t.workMin,fmtMinLbl);
      b+=rowT('時間外',function(d){return (d.work||{}).otMin;},t.otMin,fmtMinLbl);
      b+=rowT('深夜',function(d){return (d.work||{}).nightMin;},t.nightMin,fmtMinLbl);
      b+=rowT('法定休日',function(d){return (d.work||{}).holidayMin;},t.holidayMin,fmtMinLbl);
      lab.shikyu.forEach(function(l){ b+=rowT(l,function(d){return CDm.itemVal(d.shikyu,l);},t.shikyu[l],yen); });
      b+=rowT('総支給',function(d){return d.shikyuTotal;},t.shikyuTotal,yen);
      lab.kojo.forEach(function(l){ b+=rowT(l,function(d){return CDm.itemVal(d.kojo,l);},t.kojo[l],yen); });
      b+=rowT('控除計',function(d){return d.kojoTotal;},t.kojoTotal,yen);
      b+='<tr class="dc-net">'+rowT('差引支給',function(d){return d.net;},t.net,yen).replace('<tr>','').replace('</tr>','')+'</tr>';
      return '<div class="card"><div class="card-h">'+esc(row.name)+'（'+year+'年・確定'+t.savedMonths+'か月）</div>'
        +'<div class="dc-wrap"><table class="dc-tab"><thead>'+head+'</thead><tbody>'+b+'</tbody></table></div></div>';
    }).join('');
    return note+cards;
  }
  function renderChinginDaicho(sub){ var host=$('#view-cho'); var year=parseInt(String(state.month||'').slice(0,4),10)||2026;
    if(!(window.Store&&Store.getPayslipsByYm)){ host.innerHTML=sub+'<div class="card"><p class="hint">履歴保存が未対応です（保存を有効化してください）。</p></div>'; return; }
    Store.getPayslipsByYm(year+'-01', year+'-12').then(function(recs){ recs=confirmedRecs(recs).filter(function(r){return r.data.kind!=='bonus';}); host.innerHTML=sub+chinginDaichoHTML(CD().buildLedger(recs, year, state.employees), year); }) // 賃金台帳(月次)は賞与除外
      .catch(function(){ host.innerHTML=sub+'<div class="card"><p class="hint">読込に失敗しました。</p></div>'; }); }
  function choSub(v){ return '<div class="seg" style="margin-bottom:10px;flex-wrap:wrap">'
    +'<button class="seg-b'+(v==='shakai'?' on':'')+'" data-cho="shakai">社保一覧</button>'
    +'<button class="seg-b'+(v==='dept'?' on':'')+'" data-cho="dept">部署別</button>'
    +'<button class="seg-b'+(v==='daicho'?' on':'')+'" data-cho="daicho">賃金台帳</button>'
    +'<button class="seg-b'+(v==='santei'?' on':'')+'" data-cho="santei">算定基礎届</button>'
    +'<button class="seg-b'+(v==='gekkaku'?' on':'')+'" data-cho="gekkaku">月額変更届</button>'
    +'<button class="seg-b'+(v==='roudou'?' on':'')+'" data-cho="roudou">労働保険</button>'
    +'<button class="seg-b'+(v==='shikaku'?' on':'')+'" data-cho="shikaku">資格取得・喪失</button>'
    +'<button class="seg-b'+(v==='chosho'?' on':'')+'" data-cho="chosho">支払調書</button></div>'; }
  // 算定基礎届: 確定済みの4〜6月明細(総支給・支払基礎日数)から各人の標準報酬を決定して一覧化(年金機構提出の素)。
  var SANTEI_COLS=['被保険者整理番号','氏名','生年月日','従前(健保)','従前(厚年)','4月 日数','4月 報酬','5月 日数','5月 報酬','6月 日数','6月 報酬','総計','平均額','決定 標準報酬(健保)','等級(健保)','決定 標準報酬(厚年)','等級(厚年)','備考'];
  function santeiRows(recs, year, emps){
    var SHH=(typeof SHAKAIHOKEN_HYO!=='undefined')?SHAKAIHOKEN_HYO:(window&&window.SHAKAIHOKEN_HYO);
    var byEmp={}; (recs||[]).forEach(function(r){ var m=parseInt(String(r.ym).slice(5,7),10); if(m<4||m>6)return; var d=r.data||{}; (byEmp[r.employee_id]||(byEmp[r.employee_id]={}))[m]={ days:num(d.paymentDays), pay:num(d.shikyuTotal) }; });
    return (emps||[]).filter(function(e){ return isActiveInMonth(e, year+'-07'); }).map(function(e){ // 算定基礎日=7/1の被保険者(退職済/退職日が7月前=除外)。退職判定は在籍単一ソースに統一
      var mo=byEmp[e.id]||{}, months=[4,5,6].map(function(m){ return mo[m]||{days:0,pay:0}; }), rule=santeiRule(e);
      var row=santeiKisoRow(months, rule.primary, rule.fallback);
      var sb=shahoBasisOf(e), prevHoshu=(sb&&sb.hoshu>0)?sb.hoshu:0;
      var prevP=(SHH&&prevHoshu)?SHH.gradeOf(prevHoshu).hyojun:0, prevH=(SHH&&prevHoshu)?SHH.gradeOfHealth(prevHoshu).hyojun:0;
      var notes=[]; if(stLabel(e))notes.push(stLabel(e)); if(isOver70(e,year+'-07'))notes.push('70歳以上'); if(row.noQualify)notes.push(rule.primary+'日以上の月なし=要確認');
      var hasData=months.some(function(m){return m.days>0||m.pay>0;});
      return { emp:e, name:e.name||'', birthYmd:e.birthYmd||'', months:months, prevH:prevH, prevP:prevP, r:row, note:notes.join('／'), hasData:hasData };
    });
  }
  function isOver70(e, ym){ if(!e.birthYmd)return false; var b=/^(\d{4})-(\d{2})/.exec(e.birthYmd), t=/^(\d{4})-(\d{2})/.exec(ym); if(!b||!t)return false; return (parseInt(t[1])-parseInt(b[1]))-((parseInt(t[2])<parseInt(b[2]))?1:0) >= 70; }
  function santeiAoa(rows, year){
    var aoa=[SANTEI_COLS]; rows.forEach(function(x){ var m=x.months, r=x.r;
      aoa.push(['', x.name, x.birthYmd, x.prevH||'', x.prevP||'', m[0].days||'', m[0].pay||'', m[1].days||'', m[1].pay||'', m[2].days||'', m[2].pay||'', r.soukei||'', r.heikin||'', r.decHealth||'', r.decHealthGrade||'', r.decPension||'', r.decPensionGrade||'', x.note]); });
    return aoa;
  }
  function santeiHTML(rows, year){
    var note='<p class="hint" style="margin:0 0 10px">確定済みの<b>'+year+'年4〜6月</b>の明細（総支給・支払基礎日数）から標準報酬を決定（'+year+'年9月〜適用）。<span class="help-i" data-help="santeikiso">💡</span>被保険者整理番号は年金機構の番号を各自入力。横スクロール可。<button class="btn-ghost" data-choxlsx="santei" style="margin-left:8px;padding:4px 10px;font-size:11px">Excel</button></p>';
    var withData=rows.filter(function(x){return x.hasData;});
    if(!withData.length) return note+'<div class="card"><p class="hint">4〜6月の確定済み明細がありません。各月を「今月を確定」で保存してください。</p></div>';
    var head='<tr>'+SANTEI_COLS.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
    var body=withData.map(function(x){ var m=x.months, r=x.r;
      var cells=['', x.name, x.birthYmd, x.prevH?yen(x.prevH):'', x.prevP?yen(x.prevP):'', (m[0].days||''), (m[0].pay?yen(m[0].pay):''), (m[1].days||''), (m[1].pay?yen(m[1].pay):''), (m[2].days||''), (m[2].pay?yen(m[2].pay):''), yen(r.soukei), yen(r.heikin), yen(r.decHealth), r.decHealthGrade, yen(r.decPension), r.decPensionGrade, x.note];
      return '<tr>'+cells.map(function(c,i){ return '<td class="'+(i>=3&&i<=16?'num':'')+'">'+esc(String(c))+'</td>'; }).join('')+'</tr>';
    }).join('');
    return note+'<div class="card"><div class="card-h">算定基礎届（'+year+'年4〜6月）</div><div class="dc-wrap"><table class="dc-tab"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>';
  }
  function renderSantei(sub){ var host=$('#view-cho'); var year=parseInt(String(state.month||'').slice(0,4),10)||2026;
    if(!(window.Store&&Store.getPayslipsByYm)){ host.innerHTML=sub+'<div class="card"><p class="hint">履歴保存が未対応です。</p></div>'; return; }
    Store.getPayslipsByYm(year+'-04', year+'-06').then(function(recs){ recs=confirmedRecs(recs).filter(function(r){return r.data.kind!=='bonus';});
      state._santeiRows=santeiRows(recs, year, state.employees); host.innerHTML=sub+santeiHTML(state._santeiRows, year); })
      .catch(function(){ host.innerHTML=sub+'<div class="card"><p class="hint">読込に失敗しました。</p></div>'; }); }
  // 月額変更届(被保険者報酬月額変更届): 固定的賃金が変わった人を、変動月からの確定明細3か月で随時改定判定→該当者を届に。
  //  出典=日本年金機構(随時改定・被保険者報酬月額変更届)。要件=①固定的賃金の変動 ②変動月から継続3か月すべて支払基礎日数17日(短時間11日)以上 ③従前と2等級以上差。適用=変動月の4か月目。
  //  ★変動月・従前の標準報酬・固定給変動の有無は従業員設定(随時改定)から、実際の報酬は確定明細から。マイナンバー不使用(整理番号は各自入力)。
  var GEKKAKU_COLS=['被保険者整理番号','氏名','生年月日','変動月','従前(健保)','従前(厚年)','①日数','①報酬','②日数','②報酬','③日数','③報酬','総計','平均額','改定 標準報酬(健保)','等級(健保)','改定 標準報酬(厚年)','等級(厚年)','適用月','該当','備考'];
  function ymAddLocal(ym,n){ var mo=/^(\d{4})-(\d{1,2})$/.exec(String(ym||'')); if(!mo)return ''; var y=+mo[1], m=+mo[2]+n; while(m>12){m-=12;y++;} while(m<1){m+=12;y--;} return y+'-'+('0'+m).slice(-2); }
  function gekkakuRows(recs, emps){
    var PC=window.PayrollCalc;
    var byEmp={}; (recs||[]).forEach(function(r){ if((r.data||{}).kind==='bonus')return; (byEmp[r.employee_id]||(byEmp[r.employee_id]={}))[r.ym]={ days:num((r.data||{}).paymentDays), pay:num((r.data||{}).shikyuTotal), has:true }; });
    return (emps||[]).filter(function(e){ if(!isActiveInMonth(e, state.month))return false; var s=e.shaho||{}; return !!s.henkoYm && (s.fixedChanged || num(s.prevHyojun)>0); }).map(function(e){ // 在籍単一ソースに統一(退職者は随時改定対象外)
      var s=e.shaho||{}, henko=s.henkoYm, th=gekkakuTh(e);
      var yms=[henko, ymAddLocal(henko,1), ymAddLocal(henko,2)];
      var mo=byEmp[e.id]||{}, months=yms.map(function(ym){ var d=mo[ym]; return { ym:ym, days:d?d.days:0, pay:d?d.pay:0, has:!!d }; });
      var prevHyojun=num(s.prevHyojun)>0?num(s.prevHyojun):((shahoBasisOf(e)||{}).hoshu||0);
      var z=(PC&&PC.zuijiKaitei)?PC.zuijiKaitei({ months:months.map(function(m){return {pay:m.pay,days:m.days};}), prevHyojun:prevHyojun, fixedChanged:!!s.fixedChanged, henkoYm:henko, threshold:th }):null;
      var hasData=months.every(function(m){return m.has;});
      var notes=[]; if(!s.fixedChanged)notes.push('固定的賃金の変動を要確認'); if(!hasData)notes.push('3か月の確定明細が未そろい'); if(z&&hasData&&!z.allDays)notes.push('3か月17日以上でない'); if(isOver70(e, ymAddLocal(henko,3)))notes.push('70歳以上'); if(z&&z.gradeDiff<2)notes.push('2等級差なし');
      return { emp:e, name:e.name||'', birthYmd:e.birthYmd||'', henko:henko, months:months, z:z, hasData:hasData, note:notes.join('／') };
    });
  }
  function gekkakuAoa(rows){
    var aoa=[GEKKAKU_COLS]; rows.forEach(function(x){ var m=x.months, z=x.z||{}, hp=z.health||{}, pp=z.pension||{}; var soukei=(m[0].pay||0)+(m[1].pay||0)+(m[2].pay||0);
      aoa.push(['', x.name, x.birthYmd, x.henko, hp.prevHyojun||'', pp.prevHyojun||'', m[0].days||'', m[0].pay||'', m[1].days||'', m[1].pay||'', m[2].days||'', m[2].pay||'', soukei||'', z.avg||'', hp.newHyojun||'', hp.newGrade||'', pp.newHyojun||'', pp.newGrade||'', z.applyYm||'', z.eligible?'該当':'非該当', x.note]); });
    return aoa;
  }
  function gekkakuHTML(rows){
    var note='<p class="hint" style="margin:0 0 10px">従業員設定で<b>随時改定（変動月・従前の標準報酬・固定給変動）</b>を入れた人を、<b>変動月からの確定明細3か月</b>で判定。2等級以上差＋3か月17日（短時間11日）以上＋固定給変動で「該当」＝届出対象（変動月の4か月目〜適用）。<span class="help-i" data-help="toukyu">💡</span>被保険者整理番号は各自入力。横スクロール可。<button class="btn-ghost" data-choxlsx="gekkaku" style="margin-left:8px;padding:4px 10px;font-size:11px">Excel（該当者）</button></p>';
    if(!rows.length) return note+'<div class="card"><p class="hint">随時改定の候補がいません。従業員マスタで対象者の社会保険を「給料が変わった（随時改定）」にし、変動月・従前の標準報酬を入力してください。</p></div>';
    var head='<tr>'+GEKKAKU_COLS.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
    var body=rows.map(function(x){ var m=x.months, z=x.z||{}, hp=z.health||{}, pp=z.pension||{}; var soukei=(m[0].pay||0)+(m[1].pay||0)+(m[2].pay||0);
      var cells=['', x.name, x.birthYmd, x.henko, hp.prevHyojun?yen(hp.prevHyojun):'', pp.prevHyojun?yen(pp.prevHyojun):'', (m[0].days||''), (m[0].pay?yen(m[0].pay):''), (m[1].days||''), (m[1].pay?yen(m[1].pay):''), (m[2].days||''), (m[2].pay?yen(m[2].pay):''), yen(soukei), z.avg?yen(z.avg):'', hp.newHyojun?yen(hp.newHyojun):'', (hp.newGrade||''), pp.newHyojun?yen(pp.newHyojun):'', (pp.newGrade||''), (z.applyYm||''), (z.eligible?'該当':'非該当'), x.note];
      return '<tr'+(z.eligible?' style="background:#EAF7EF"':'')+'>'+cells.map(function(c,i){ return '<td class="'+((i>=4&&i<=17)?'num':'')+'">'+esc(String(c))+'</td>'; }).join('')+'</tr>';
    }).join('');
    return note+'<div class="card"><div class="card-h">月額変更届（随時改定）</div><div class="dc-wrap"><table class="dc-tab"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>';
  }
  function renderGekkaku(sub){ var host=$('#view-cho'); var year=parseInt(String(state.month||'').slice(0,4),10)||2026;
    if(!(window.Store&&Store.getPayslipsByYm)){ host.innerHTML=sub+'<div class="card"><p class="hint">履歴保存が未対応です。</p></div>'; return; }
    Store.getPayslipsByYm((year-1)+'-01', year+'-12').then(function(recs){ recs=confirmedRecs(recs); // 変動月は各人バラバラ=前年〜当年を広めに取得
      state._gekkakuRows=gekkakuRows(recs, state.employees); host.innerHTML=sub+gekkakuHTML(state._gekkakuRows); })
      .catch(function(){ host.innerHTML=sub+'<div class="card"><p class="hint">読込に失敗しました。</p></div>'; }); }
  // 労働保険 年度更新(算定基礎賃金集計表): 労働保険年度(4月〜翌3月)の確定明細から、労災対象(全労働者・役員除く)と
  //  雇用保険対象(被保険者)の賃金総額を月別集計→年度計→保険料(雇用保険=全体率で自動・労災=業種別率を会社入力)。
  //  出典=労働保険料徴収法。★雇用保険 全体率は koyo-hoken.js(厚労省照合済)★。マイナンバー不使用。
  function roudouFYof(){ var y=parseInt(String(state.month||'').slice(0,4),10)||2026, m=parseInt(String(state.month||'').slice(5,7),10)||1; return (m>=4)?y:y-1; }
  var ROUDOU_COLS=['月','労災 対象人数','労災 賃金','雇用保険 対象人数','雇用保険 賃金'];
  function roudouRows(recs, fy, emps){
    var byId={}; (emps||[]).forEach(function(e){ byId[e.id]=e; });
    var yms=[]; for(var i=0;i<12;i++){ var mm=4+i, yy=fy; if(mm>12){ mm-=12; yy=fy+1; } yms.push(yy+'-'+('0'+mm).slice(-2)); }
    var byYm={}; (recs||[]).forEach(function(r){ (byYm[r.ym]||(byYm[r.ym]=[])).push(r); });
    var rows=yms.map(function(ym){
      var rousaiW=0, koyoW=0, rSet={}, kSet={};
      (byYm[ym]||[]).forEach(function(r){ var e=byId[r.employee_id]; if(!e)return; var w=num((r.data||{}).shikyuTotal); if(w<=0)return;
        var isRousai=(e.payType!=='役員');                                      // 労災=全労働者(役員は労働者でない=対象外)
        var isKoyo=isRousai && !(e.apply&&e.apply.employ===false);             // 雇用保険=被保険者(雇用保険オフ=非加入)
        if(isRousai){ rousaiW+=w; rSet[e.id]=1; }
        if(isKoyo){ koyoW+=w; kSet[e.id]=1; }
      });
      return { ym:ym, rousaiCount:Object.keys(rSet).length, rousaiWage:rousaiW, koyoCount:Object.keys(kSet).length, koyoWage:koyoW };
    });
    return rows;
  }
  // 労働保険料の端数(労働保険料徴収法)=①賃金総額の1,000円未満切捨→②率を乗じる→③保険料額の1円未満切捨。
  function roudouRyo(wageTotal, rate){ if(rate==null) return null; var base=Math.floor(wageTotal/1000)*1000; return Math.floor(base*rate); }
  function roudouSummary(recs, fy, emps){
    var rows=roudouRows(recs, fy, emps);
    var rousaiWageTotal=rows.reduce(function(a,x){return a+x.rousaiWage;},0), koyoWageTotal=rows.reduce(function(a,x){return a+x.koyoWage;},0);
    var gyoshu=(state.company||{}).gyoshu||'ippan', k=KH();
    var koyoFull=(k&&k.fullRate)?k.fullRate(gyoshu, fy):null;                  // 雇用保険 全体率(労働者＋事業主・厚労省照合済)。未収録年度=null
    var koyoRyo=roudouRyo(koyoWageTotal, koyoFull);                            // 賃金1000円未満切捨→×率→1円未満切捨
    var rousaiPermil=num((state.company||{}).rousaiRate);                       // 労災率(‰)は業種別=会社入力
    var rousaiRyo=(rousaiPermil>0)?roudouRyo(rousaiWageTotal, rousaiPermil/1000):null;
    return { rows:rows, fy:fy, rousaiWageTotal:rousaiWageTotal, koyoWageTotal:koyoWageTotal, gyoshu:gyoshu, koyoFull:koyoFull, koyoRyo:koyoRyo, rousaiPermil:rousaiPermil, rousaiRyo:rousaiRyo };
  }
  function roudouAoa(sum, fy){
    var aoa=[['労働保険 算定基礎賃金集計表　'+fy+'年度（労働保険年度 '+fy+'-04〜'+(fy+1)+'-03）'], [(state.company||{}).name||''], [], ROUDOU_COLS.slice()];
    sum.rows.forEach(function(x){ aoa.push([x.ym, x.rousaiCount||'', x.rousaiWage||'', x.koyoCount||'', x.koyoWage||'']); });
    aoa.push(['年度計', '', sum.rousaiWageTotal||'', '', sum.koyoWageTotal||'']);
    aoa.push([]);
    var gLabel={ippan:'一般の事業',kensetsu:'建設の事業',norin:'農林水産・清酒製造'}[sum.gyoshu]||sum.gyoshu;
    aoa.push(['【保険料の概算】']);
    aoa.push(['雇用保険 業種', gLabel]);
    aoa.push(['雇用保険 全体率(‰)', sum.koyoFull!=null?(sum.koyoFull*1000):'（率未収録・申告書でご確認）']);
    aoa.push(['雇用保険料（賃金計×全体率）', sum.koyoRyo!=null?sum.koyoRyo:'—']);
    aoa.push(['労災 保険率(‰・業種別=入力)', sum.rousaiPermil>0?sum.rousaiPermil:'（未入力）']);
    aoa.push(['労災保険料（賃金計×労災率）', sum.rousaiRyo!=null?sum.rousaiRyo:'—']);
    aoa.push([]);
    aoa.push(['※ 賃金＝総支給（通勤手当・賞与含む）。役員は労災・雇用とも対象外、雇用保険オフの人は雇用保険の対象外。労災率は業種別のため申告書の率を入力してください。']);
    return aoa;
  }
  function roudouHTML(sum, fy){
    var gLabel={ippan:'一般の事業',kensetsu:'建設の事業',norin:'農林水産・清酒製造'}[sum.gyoshu]||sum.gyoshu;
    var note='<p class="hint" style="margin:0 0 10px">確定済み明細から<b>'+fy+'年度（'+fy+'-04〜'+(fy+1)+'-03）</b>の賃金総額を集計。労災＝全労働者（役員除く）、雇用保険＝被保険者。<span class="help-i" data-help="koyoGyoshu">💡</span>横スクロール可。<button class="btn-ghost" data-choxlsx="roudou" style="margin-left:8px;padding:4px 10px;font-size:11px">Excel</button></p>';
    var anyData=sum.rows.some(function(x){return x.rousaiWage>0||x.koyoWage>0;});
    if(!anyData) return note+'<div class="card"><p class="hint">'+fy+'年度の確定済み明細がありません。各月を「今月を確定」で保存してください。</p></div>';
    var head='<tr>'+ROUDOU_COLS.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
    var body=sum.rows.map(function(x){ return '<tr><td>'+esc(x.ym)+'</td><td class="num">'+(x.rousaiCount||'')+'</td><td class="num">'+(x.rousaiWage?yen(x.rousaiWage):'')+'</td><td class="num">'+(x.koyoCount||'')+'</td><td class="num">'+(x.koyoWage?yen(x.koyoWage):'')+'</td></tr>'; }).join('');
    body+='<tr class="dc-net"><td>年度計</td><td class="num"></td><td class="num">'+yen(sum.rousaiWageTotal)+'</td><td class="num"></td><td class="num">'+yen(sum.koyoWageTotal)+'</td></tr>';
    var koyoRateTxt=sum.koyoFull!=null?('全体 '+(sum.koyoFull*1000).toFixed(1)+'‰（労働者＋事業主・自動）'):'率未収録（申告書でご確認）';
    var ryoBox='<div class="card" style="margin-top:10px"><div class="card-h">保険料の概算</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:14px 24px;padding:4px 2px;font-size:13px">'
      +'<div><div class="hint">雇用保険（'+esc(gLabel)+'・'+koyoRateTxt+'）</div><b style="font-size:16px">'+(sum.koyoRyo!=null?yen(sum.koyoRyo):'—')+'</b></div>'
      +'<div><div class="hint">労災（業種別の率を入力）</div><span style="display:inline-flex;align-items:center;gap:6px"><input class="finput num" data-rousai-rate="1" inputmode="decimal" value="'+attr(sum.rousaiPermil>0?sum.rousaiPermil:'')+'" placeholder="例 3.0" style="width:80px">‰　<b id="roudou-rousai-ryo" style="font-size:16px">'+(sum.rousaiRyo!=null?yen(sum.rousaiRyo):'—')+'</b></span></div>'
      +'</div><p class="hint" style="margin:8px 0 0">雇用保険 全体率は年度で自動（厚労省照合）。労災率は業種別のため<b>申告書の率を入力</b>してください。賃金＝総支給（通勤・賞与含む）。</p></div>';
    return note+'<div class="card"><div class="card-h">労働保険 算定基礎賃金集計表（'+fy+'年度）</div><div class="dc-wrap"><table class="dc-tab"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>'+ryoBox;
  }
  function renderRoudou(sub){ var host=$('#view-cho'); var fy=roudouFYof();
    if(!(window.Store&&Store.getPayslipsByYm)){ host.innerHTML=sub+'<div class="card"><p class="hint">履歴保存が未対応です。</p></div>'; return; }
    Store.getPayslipsByYm(fy+'-04', (fy+1)+'-03').then(function(recs){ recs=confirmedRecs(recs);
      state._roudouSum=roudouSummary(recs, fy, state.employees); host.innerHTML=sub+roudouHTML(state._roudouSum, fy); })
      .catch(function(){ host.innerHTML=sub+'<div class="card"><p class="hint">読込に失敗しました。</p></div>'; }); }
  // 資格取得届・喪失届(健康保険・厚生年金保険 被保険者資格取得届/喪失届): 入社日=資格取得日、退職日翌日=資格喪失日。
  //  取得は標準報酬(取得時見込み=shahoBase)、喪失は喪失日＋理由(退職)。出典=日本年金機構。★マイナンバー不使用(基礎年金番号/整理番号は各自)★。
  function ymdPlus1(ymd){ var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd||'')); if(!m) return ''; // 資格喪失日=退職日の翌日(暦日繰上げ・月末/年末対応)
    var y=+m[1], mo=+m[2], d=+m[3], dim=new Date(y, mo, 0).getDate(); d++; if(d>dim){ d=1; mo++; if(mo>12){ mo=1; y++; } }
    return y+'-'+('0'+mo).slice(-2)+'-'+('0'+d).slice(-2); }
  function isKaigoNow(e, ymd){ var pc=window.PayrollCalc; var ym=String(ymd||'').slice(0,7)||state.month; return (pc&&pc.isKaigoTarget)?!!pc.isKaigoTarget(e.birthYmd, ym):false; }
  var SHIKAKU_COLS=['区分','被保険者整理番号','氏名','生年月日','資格取得日／喪失日','標準報酬月額(健保)','等級(健保)','標準報酬月額(厚年)','等級(厚年)','喪失理由','備考'];
  function shikakuRows(emps){
    var SHH=(typeof SHAKAIHOKEN_HYO!=='undefined')?SHAKAIHOKEN_HYO:(window&&window.SHAKAIHOKEN_HYO);
    var rows=[];
    (emps||[]).forEach(function(e){ var yakuin=(e.payType==='役員'); // 役員も健保・厚年の被保険者=取得/喪失の対象(備考で区別)
      var sb=shahoBasisOf(e), hoshu=(sb&&sb.hoshu>0)?sb.hoshu:0;
      var decH=(SHH&&hoshu)?SHH.gradeOfHealth(hoshu):null, decP=(SHH&&hoshu)?SHH.gradeOf(hoshu):null;
      // 取得届: 入社日あり
      if(e.joinYmd){ var notesA=[]; if(yakuin)notesA.push('役員'); if(isKaigoNow(e,e.joinYmd))notesA.push('介護保険 第2号'); if(stLabel(e))notesA.push(stLabel(e)); if(isOver70(e,String(e.joinYmd).slice(0,7)))notesA.push('70歳以上');
        rows.push({ kind:'取得', name:e.name||'', birthYmd:e.birthYmd||'', date:e.joinYmd, decH:decH?decH.hyojun:0, decHGrade:decH?decH.tokyu:0, decP:decP?decP.hyojun:0, decPGrade:decP?decP.tokyu:0, reason:'', note:notesA.join('／') }); }
      // 喪失届: 退職日あり=喪失日を計算。★退職ボタンだけ(retired)で退職日未入力の人も静かに落とさず、要入力として拾う★
      if(e.taishokuYmd){ var lossYmd=ymdPlus1(e.taishokuYmd); var notesL=[]; if(yakuin)notesL.push('役員'); if(isOver70(e,String(e.taishokuYmd).slice(0,7)))notesL.push('70歳以上');
        rows.push({ kind:'喪失', name:e.name||'', birthYmd:e.birthYmd||'', date:lossYmd, decH:0, decHGrade:0, decP:0, decPGrade:0, reason:'退職等', note:notesL.join('／') }); }
      else if(e.retired){ var notesR=[]; if(yakuin)notesR.push('役員'); notesR.push('退職日を入力してください'); // retired=trueだが退職日未入力→喪失届が漏れないよう要入力で表示
        rows.push({ kind:'喪失', name:e.name||'', birthYmd:e.birthYmd||'', date:'', decH:0, decHGrade:0, decP:0, decPGrade:0, reason:'退職等', note:notesR.join('／') }); }
    });
    return rows;
  }
  function shikakuAoa(rows){
    var aoa=[['健康保険・厚生年金保険 被保険者 資格取得届／資格喪失届'], [(state.company||{}).name||''], [], SHIKAKU_COLS.slice()];
    rows.forEach(function(x){ aoa.push([ x.kind, '', x.name, x.birthYmd, x.date, x.decH||'', x.decHGrade||'', x.decP||'', x.decPGrade||'', x.reason, x.note ]); });
    aoa.push([]); aoa.push(['※ 資格取得日＝入社日、資格喪失日＝退職日の翌日。標準報酬は取得時の見込み（届出後に決定通知）。被保険者整理番号・基礎年金番号は各自記入。マイナンバーは扱いません（各自記入）。']);
    return aoa;
  }
  function shikakuHTML(rows){
    var note='<p class="hint" style="margin:0 0 10px">従業員マスタの<b>入社日＝資格取得日</b>、<b>退職日の翌日＝資格喪失日</b>から一覧化。標準報酬は取得時の見込み。<span class="help-i" data-help="shaho">💡</span>被保険者整理番号は各自入力。横スクロール可。<button class="btn-ghost" data-choxlsx="shikaku" style="margin-left:8px;padding:4px 10px;font-size:11px">Excel</button></p>';
    if(!rows.length) return note+'<div class="card"><p class="hint">入社日・退職日が入力された従業員がいません。従業員マスタの「在籍・勤務」で入社日／退職日を入れてください。</p></div>';
    var head='<tr>'+SHIKAKU_COLS.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
    var body=rows.map(function(x){ var isLoss=(x.kind==='喪失');
      var cells=[x.kind, '', x.name, x.birthYmd, x.date, (x.decH?yen(x.decH):''), (x.decHGrade||''), (x.decP?yen(x.decP):''), (x.decPGrade||''), x.reason, x.note];
      return '<tr'+(isLoss?' style="background:#FCF3F2"':'')+'>'+cells.map(function(c,i){ return '<td class="'+((i>=5&&i<=8)?'num':'')+'">'+esc(String(c))+'</td>'; }).join('')+'</tr>';
    }).join('');
    return note+'<div class="card"><div class="card-h">資格取得届／喪失届</div><div class="dc-wrap"><table class="dc-tab"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>';
  }
  function renderShikaku(sub){ var host=$('#view-cho'); state._shikakuRows=shikakuRows(state.employees); host.innerHTML=sub+shikakuHTML(state._shikakuRows); }
  function renderChoView(){ var host=$('#view-cho'); if(!host)return; var v=state.choView||'shakai'; var sub=choSub(v)
    +'<div class="card" style="padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b style="font-size:13px;color:#2E7D54">退職金の税金</b><span class="hint" style="flex:1;min-width:150px">退職金は毎月の給与と別（退職所得・分離課税）。ここで源泉を計算。</span><button class="btn-ghost" data-taishoku-calc="1" style="white-space:nowrap">退職金を計算</button></div>';
    if(v==='dept') host.innerHTML=sub+deptSummaryHTML();
    else if(v==='daicho'){ host.innerHTML=sub+'<div class="card"><div class="card-h">賃金台帳</div><p class="hint">読込中…</p></div>'; renderChinginDaicho(sub); }
    else if(v==='santei'){ host.innerHTML=sub+'<div class="card"><div class="card-h">算定基礎届</div><p class="hint">読込中…</p></div>'; renderSantei(sub); }
    else if(v==='gekkaku'){ host.innerHTML=sub+'<div class="card"><div class="card-h">月額変更届</div><p class="hint">読込中…</p></div>'; renderGekkaku(sub); }
    else if(v==='roudou'){ host.innerHTML=sub+'<div class="card"><div class="card-h">労働保険</div><p class="hint">読込中…</p></div>'; renderRoudou(sub); }
    else if(v==='shikaku'){ renderShikaku(sub); }
    else if(v==='chosho'){ host.innerHTML=sub+'<div class="card"><div class="card-h">支払調書</div><p class="hint">読込中…</p></div>'; renderChosho(sub); }
    else host.innerHTML=sub+shakaiListHTML(); }
  // K3 支払調書: 業務委託の年間支払(確定済み月次のshikyuTotal)＋源泉(tax)を人ごとに集計→区分別に提出基準判定。
  function choshoPeople(recs){ var _SC=SC(); if(!_SC) return [];
    return (state.employees||[]).filter(function(e){ return e.employmentType==='contractor'; }).map(function(e){
      var mine=recs.filter(function(r){ return r.employee_id===e.id; });
      return { name:e.name, kubun:e.houshuKubun||'none',
        annualPay:mine.reduce(function(a,r){ return a+num(r.data&&r.data.shikyuTotal); },0),
        annualGensen:mine.reduce(function(a,r){ return a+num(r.data&&r.data.tax); },0) }; }); }
  function renderChosho(sub){ var host=$('#view-cho'); if(!host)return; var _SC=SC();
    var year=parseInt(String(state.month||'').slice(0,4),10)||2026;
    if(!_SC){ host.innerHTML=sub+'<div class="card"><div class="card-h">支払調書</div><p class="hint">ライブラリ未ロード</p></div>'; return; }
    Store.getPayslipsByYm(year+'-01', year+'-12').then(function(recs){
      recs=confirmedRecs(recs).filter(function(r){ return r.data.kind!=='bonus'; });
      state._choshoRows=_SC.choshoRows(choshoPeople(recs));
      host.innerHTML=sub+choshoHTML(state._choshoRows, year); }); }
  function choshoHTML(rows, year){
    var targets=rows.filter(function(r){ return r.target; }), others=rows.filter(function(r){ return !r.target; });
    var h='<div class="card"><div class="card-h">支払調書（報酬・料金等） '+year+'年<span class="help-i" data-help="houshu">💡</span></div>'
      +'<p class="hint" style="margin:0 2px 8px">業務委託のうち所得税法204条の掲載報酬で年間の提出基準を超えた人が対象（翌年1/31提出）。<b>運転代行・運送等の非該当はデフォルトで対象外</b>。金額は確定済みの月次明細から集計（税込）。個人番号は各自記入・マイナンバーは扱いません。</p>';
    if(!rows.length){ return h+'<div class="empty">業務委託の従業員がいません（雇用形態＝業務委託で登録）。</div></div>'; }
    h+='<div class="sec-lb">提出対象 '+targets.length+'名</div>';
    if(targets.length){
      h+='<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="border-bottom:1px solid #d4eae0;color:#3D6B53"><th style="text-align:left;padding:6px 4px">氏名</th><th style="text-align:left;padding:6px 4px">区分</th><th style="text-align:right;padding:6px 4px">年間支払(税込)</th><th style="text-align:right;padding:6px 4px">源泉徴収税</th></tr></thead><tbody>';
      h+=targets.map(function(r){ return '<tr style="border-bottom:1px solid #eef6f1"><td style="padding:6px 4px">'+esc(r.name)+'</td><td style="padding:6px 4px;font-size:11px;color:#527A66">'+esc(r.kubunLabel)+'</td><td style="text-align:right;padding:6px 4px">'+yen(r.annualPay)+'</td><td style="text-align:right;padding:6px 4px">'+yen(r.annualGensen)+'</td></tr>'; }).join('');
      h+='</tbody></table><div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" data-choxlsx="chosho" style="padding:10px 18px;border:none;border-radius:10px;background:#2E7D54;color:#fff;font-weight:700;cursor:pointer">支払調書をExcel出力</button></div>';
    } else { h+='<div class="empty">提出基準を超える対象者はいません。</div>'; }
    if(others.length){ h+='<div class="sec-lb" style="margin-top:12px">対象外 '+others.length+'名</div>'
      +'<div class="hint" style="margin:0 2px">'+others.map(function(r){ return '<div style="padding:3px 0">'+esc(r.name)+'（'+esc(r.kubunLabel)+'）… '+esc(r.reason)+'</div>'; }).join('')+'</div>'; }
    return h+'</div>'; }
  function choshoAoa(rows, year){ var co=(state.company||{});
    var aoa=[['支払調書（報酬、料金、契約金及び賞金の支払調書）'],['支払者：'+(co.name||'')],['対象年：'+year+'年（提出期限 翌年1月31日）'],[],
      ['氏名','区分','年間支払額(税込)','源泉徴収税額','摘要']];
    (rows||[]).filter(function(r){ return r.target; }).forEach(function(r){ aoa.push([r.name, r.kubunLabel, r.annualPay, r.annualGensen, '']); });
    aoa.push([]); aoa.push(['※個人番号(マイナンバー)は各自記入。本表はマイナンバーを扱いません。']);
    aoa.push(['※提出基準未満・204条非該当（運転代行・運送等）は本表の対象外です。']); return aoa; }
  function downloadChoXlsx(kind){ if(!window.PayslipXlsx) return; var co=(state.company||{}).name, mlabel=monthLabel().replace(/ /g,'');
    if(kind==='shakai'){ PayslipXlsx.downloadSheets([{name:'社保一覧', aoa:PayslipXlsx.shakaiListAOA(shakaiRows(),{company:co,monthLabel:mlabel})}], {filename:'社保一覧_'+state.month+'.xlsx'}); return; }
    if(kind==='chosho'){ var cyr=parseInt(String(state.month||'').slice(0,4),10)||2026; var crows=(state._choshoRows||[]).filter(function(r){return r.target;});
      if(!crows.length){ uiAlert('支払調書の提出対象者がいません（区分・提出基準を確認）。'); return; }
      PayslipXlsx.downloadSheets([{name:'支払調書'+cyr, aoa:choshoAoa(state._choshoRows,cyr)}], {filename:'支払調書_'+cyr+'.xlsx'}); return; }
    if(kind==='dept'){ var g=CD().deptGroups(deptRows()); PayslipXlsx.downloadSheets([{name:'部署別集計', aoa:PayslipXlsx.deptSummaryAOA(g,{company:co,monthLabel:mlabel})}], {filename:'部署別集計_'+state.month+'.xlsx'}); return; }
    if(kind==='daicho'){ var year=parseInt(String(state.month||'').slice(0,4),10)||2026;
      Store.getPayslipsByYm(year+'-01',year+'-12').then(function(recs){ recs=confirmedRecs(recs).filter(function(r){return r.data.kind!=='bonus';}); var L=CD().buildLedger(recs,year,state.employees); // 賃金台帳(月次)は賞与除外
        var sheets=PayslipXlsx.chinginDaichoSheets(L, year, CD(), {company:co}); if(!sheets.length){ uiAlert('確定済みの月がありません。'); return; } PayslipXlsx.downloadSheets(sheets,{filename:'賃金台帳_'+year+'.xlsx'}); }); return; }
    if(kind==='santei'){ var yr=parseInt(String(state.month||'').slice(0,4),10)||2026; var rows=state._santeiRows||[]; var withData=rows.filter(function(x){return x.hasData;});
      if(!withData.length){ uiAlert('4〜6月の確定済み明細がありません。'); return; } PayslipXlsx.downloadSheets([{name:'算定基礎届', aoa:santeiAoa(withData, yr)}], {filename:'算定基礎届_'+yr+'.xlsx'}); return; }
    if(kind==='gekkaku'){ var grows=(state._gekkakuRows||[]).filter(function(x){return x.z&&x.z.eligible;});
      if(!grows.length){ uiAlert('随時改定に「該当」する人がいません。変動月・従前の標準報酬・固定給変動の入力と、3か月の確定明細をご確認ください。'); return; }
      PayslipXlsx.downloadSheets([{name:'月額変更届', aoa:gekkakuAoa(grows)}], {filename:'月額変更届_'+state.month+'.xlsx'}); return; }
    if(kind==='roudou'){ var rsum=state._roudouSum; if(!rsum||!rsum.rows.some(function(x){return x.rousaiWage>0||x.koyoWage>0;})){ uiAlert('対象年度の確定済み明細がありません。'); return; }
      PayslipXlsx.downloadSheets([{name:'労働保険 賃金集計', aoa:roudouAoa(rsum, rsum.fy)}], {filename:'労働保険_算定基礎賃金集計_'+rsum.fy+'年度.xlsx'}); return; }
    if(kind==='shikaku'){ var srows=state._shikakuRows||[]; if(!srows.length){ uiAlert('入社日・退職日が入力された従業員がいません。'); return; }
      PayslipXlsx.downloadSheets([{name:'資格取得・喪失届', aoa:shikakuAoa(srows)}], {filename:'資格取得喪失届_'+state.month+'.xlsx'}); return; } }

  /* ---------- 年末調整(view-nen) ---------- */
  function Nen_(){ return (typeof Nenmatsu!=='undefined')?Nenmatsu:(window&&window.Nenmatsu); }
  function nenYear(){ return parseInt(String(state.month||'').slice(0,4),10)||2026; }
  function nenStore(eid){ var y=nenYear(); if(!state.nencho)state.nencho={}; if(!state.nencho[y])state.nencho[y]={}; if(!state.nencho[y][eid])state.nencho[y][eid]={}; return state.nencho[y][eid]; }
  function nenSetField(eid, field, val){ nenStore(eid)[field]=val; }
  // 当年1〜12月の保存履歴から 課税給与収入/源泉徴収税額/社保(天引き) を自動合算
  function nenAggregate(recs, eid){
    var rows=(recs||[]).filter(function(r){ return r.employee_id===eid; });
    var shunyu=0, genzen=0, shaho=0, months=0;
    rows.forEach(function(r){ var d=r.data||{};
      // 課税支給=月次源泉と同じ数え方(非課税は限度まで・超過分は課税)。PayslipCalc.taxableTotalで単一ソース化
      var taxable=(d.shikyu&&d.shikyu.length)? PayslipCalc.taxableTotal(d.shikyu) : num(d.shikyuTotal);
      shunyu+=taxable; genzen+=num(d.tax);
      var si=d.si||{}; shaho += (si.health!=null||si.pension!=null)?(num(si.health)+num(si.kaigo)+num(si.pension)+num(si.employ)):num(d.siTotal);
      if(d.kind!=='bonus') months++; // 賞与は「保存済み○/12か月」の月数に数えない(金額は年収入/源泉/社保に合算=年調に含める)
    });
    return { shunyu:shunyu, genzen:genzen, shaho:shaho, months:months };
  }
  // 扶養は平易ウィザードで「累積」入力(総数＋そのうち特定/老人/同居)。控除計算・件数・票の表示は
  //  排他区分(一般/特定/老人非同居/同居老親)に分解する=区分ごと満額を足すので二重計上を防ぐ(H1回帰の是正)。
  function fuyoBuckets(n){
    n=n||{}; var total=num(n.fuyoIppan), tokutei=num(n.fuyoTokutei), roujin=num(n.fuyoRoujin), doukyo=Math.min(num(n.fuyoDoukyo), num(n.fuyoRoujin));
    var roujinAlone=Math.max(0, roujin-doukyo);                 // 老人扶養(非同居)
    var ippanAlone=Math.max(0, total-tokutei-roujin);           // 一般扶養(特定でも老人でもない)
    return { ippan:ippanAlone, tokutei:tokutei, roujin:roujinAlone, doukyo:doukyo, roujinAll:roujinAlone+doukyo, total:ippanAlone+tokutei+roujinAlone+doukyo };
  }
  function nenCompute(agg, n){
    var Nen=Nen_(); if(!Nen) return null;
    var shunyu=(n.shunyuOverride!=null&&n.shunyuOverride!=='')?num(n.shunyuOverride):agg.shunyu;
    var genzen=(n.genzenOverride!=null&&n.genzenOverride!=='')?num(n.genzenOverride):agg.genzen;
    var shahoAuto=(n.shahoOverride!=null&&n.shahoOverride!=='')?num(n.shahoOverride):agg.shaho;
    var shaho=shahoAuto+num(n.shinkokuShaho);
    var honnin=Nen.kyuyoShotokuR8(shunyu);
    var haiKojo=0, haiTok=0;
    if(n.haiEnabled){ var hs=num(n.haiShotoku); if(hs<=620000) haiKojo=Nen.haiguushaKojo(honnin, !!n.haiRojin); else haiTok=Nen.haiguushaTokubetsuKojo(hs, honnin); }
    var fb=fuyoBuckets(n); var fuyo=Nen.fuyoKojo('ippan')*fb.ippan+Nen.fuyoKojo('tokutei')*fb.tokutei+Nen.fuyoKojo('roujin')*fb.roujin+Nen.fuyoKojo('doukyo')*fb.doukyo; // 累積入力→排他区分に分解して満額加算(二重計上防止)
    var tokShin=num(n.tokuteiShinzokuShotoku)>0?Nen.tokuteiShinzokuKojo(num(n.tokuteiShinzokuShotoku)):0;
    var shougai=n.shougai?Nen.shougaiKojo(n.shougai):0;
    var kafuHitori=n.hitorioya?Nen.HITORIOYA:(n.kafu?Nen.KAFU:0);
    var kinrou=n.kinrou?Nen.KINROU:0;
    var res=Nen.computeNencho({ kyuyoShunyu:shunyu, shakaiHoken:shaho,
      seimei:{ generalNew:num(n.seiGeneralNew), generalOld:num(n.seiGeneralOld), kaigo:num(n.seiKaigo), pensionNew:num(n.seiPensionNew), pensionOld:num(n.seiPensionOld) },
      jishin:{ jishin:num(n.jishinP), kyuChoki:num(n.jishinKyu) }, shokibo:num(n.shokibo),
      haiguushaKojo:haiKojo, haiguushaTokubetsuKojo:haiTok, fuyoKojo:fuyo, tokuteiShinzokuKojo:tokShin,
      shougaiKojo:shougai, kafuHitorioyaKojo:kafuHitori, kinrougakuseiKojo:kinrou, jutakuLoan:num(n.jutakuLoan), genzenZumi:genzen });
    return { shunyu:shunyu, genzen:genzen, shaho:shaho, res:res };
  }
  function nenResHTML(c, n){
    if(!c) return '<p class="hint">計算エンジン未対応</p>';
    var r=c.res, k=r.kabusoku; n=n||{};
    var badge = k<0 ? '<b style="color:#2E7D54">還付 '+yen(-k)+'</b>' : (k>0 ? '<b style="color:#C0392B">追加徴収 '+yen(k)+'</b>' : '<b>過不足なし</b>');
    // 二重計上ガード: 同じ19-22歳の子は「特定扶養(所得62万以下)」か「特定親族特別控除(62万超123万以下)」のどちらか一方
    var warn = (num(n.fuyoTokutei)>0 && num(n.tokuteiShinzokuShotoku)>0)
      ? '<div class="cr-warn" style="margin:0 0 6px">⚠ 「特定19-22(人)」と「特定親族の所得」を両方入力しています。同じお子さんは<b>所得62万以下＝特定扶養／62万超123万以下＝特定親族特別控除</b>のどちらか一方です（二重控除になります）。</div>' : '';
    return warn+'<div class="calc-box"><div class="ch">年末調整の結果</div>'
      +'<div class="calc-line"><span>課税給与収入(年)</span><span class="v">'+yen(c.shunyu)+'</span></div>'
      +'<div class="calc-line"><span>給与所得</span><span class="v">'+yen(r.kyuyoShotoku)+'</span></div>'
      +'<div class="calc-line"><span>所得控除の合計</span><span class="v">'+yen(r.kojoGoukei)+'</span></div>'
      +'<div class="calc-line"><span>課税給与所得金額</span><span class="v">'+yen(r.kazeiKyuyoShotoku)+'</span></div>'
      +'<div class="calc-line"><span>算出所得税額</span><span class="v">'+yen(r.sanshutuZei)+'</span></div>'
      +'<div class="calc-line"><span>年調年税額(復興税込)</span><span class="v">'+yen(r.nenchouNenzei)+'</span></div>'
      +'<div class="calc-line"><span>源泉徴収済(年)</span><span class="v">'+yen(c.genzen)+'</span></div>'
      +'<div class="calc-line net tot"><span>過不足</span><span class="v">'+badge+'</span></div></div>';
  }
  function nenRefreshEmp(eid){ var host=$('#nen-res-'+eid); if(!host)return; var agg=nenAggregate(state._nenRecs, eid); var n=nenStore(eid); host.innerHTML=nenResHTML(nenCompute(agg,n), n); nenTotal(); }
  function nenTotal(){ var el=$('#nen-total'); if(!el)return; var t=0, emps=state._nenEmps||[]; emps.forEach(function(e){ var c=nenCompute(nenAggregate(state._nenRecs,e.id), nenStore(e.id)); if(c)t+=c.res.kabusoku; }); el.innerHTML = t<0?'<b style="color:#2E7D54">還付合計 '+yen(-t)+'</b>':(t>0?'<b style="color:#C0392B">追加徴収合計 '+yen(t)+'</b>':'過不足なし'); }
  function nf(eid, field, val, ph, wide){ return '<input class="finput num" data-eid="'+attr(eid)+'" data-nf="'+field+'" inputmode="numeric" value="'+attr(val==null?'':fmtN(val))+'" placeholder="'+(ph||'0')+'" style="'+(wide?'':'max-width:130px;')+'font-size:13px;padding:7px 8px">'; }
  // 共通「はい／いいえ」2択ピル。質問形式の真偽入力はこれで統一(単一チェックの紛らわしさを無くす)。
  //  dataAttr=クリックハンドラが読む属性名(nfbool/shfixed/tsyn等)・key=data値・on=現在真偽・eid=任意の対象ID
  function ynPill(dataAttr, key, on, eid){
    var ea=eid!=null?' data-eid="'+attr(eid)+'"':'';
    return '<span class="nw-yn">'
      +'<b class="ynb'+(on?' on':'')+'" data-'+dataAttr+'="'+attr(key)+'"'+ea+' data-v="1">はい</b>'
      +'<b class="ynb'+(on?'':' on')+'" data-'+dataAttr+'="'+attr(key)+'"'+ea+' data-v="0">いいえ</b></span>';
  }
  function NDcl(){ return (typeof NenchoDecl!=='undefined')?NenchoDecl:(window&&window.NenchoDecl); }
  // 年調の申告入力を「生活語の質問」で。data-nf/data-eid は既存ハンドラがそのまま n.* に書く=配線不要。
  //  ★従業員Web申告(★A)でも同じ NenchoDecl.FIELDS を使う=UI共有(平易・分かりやすさを崩さない方針)。
  function nenchoWizardHTML(eid, n){
    var nd=NDcl(); if(!nd) return ''; n=n||{};
    return nd.GROUPS.map(function(g){
      var rows=nd.FIELDS.filter(function(f){ return f.group===g.id && (!f.when || !!n[f.when]); }).map(function(f){
        var help=f.help?'<div class="nw-help">'+esc(f.help)+'</div>':'', input;
        if(f.type==='bool') input=ynPill('nfbool', f.key, !!n[f.key], eid);
        else if(f.type==='select') input='<select class="finput m-f" data-eid="'+attr(eid)+'" data-nf="'+f.key+'" style="max-width:220px;font-size:13px">'+(f.options||[]).map(function(o){ return '<option value="'+o[0]+'"'+((n[f.key]||'')===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>';
        else { var unit=(f.type==='count')?'人':'円'; input='<input class="finput num" data-eid="'+attr(eid)+'" data-nf="'+f.key+'" inputmode="numeric" value="'+attr(n[f.key]==null||n[f.key]===''?'':fmtN(n[f.key]))+'" placeholder="0" style="max-width:120px;font-size:13px;padding:7px 8px"><span class="nw-unit">'+unit+'</span>'; }
        return '<div class="nw-row"><div class="nw-q">'+esc(f.q)+help+'</div><div class="nw-in">'+input+'</div></div>';
      }).join('');
      return '<div class="nw-group"><div class="nw-gt">'+esc(g.title)+'</div>'+rows+'</div>';
    }).join('');
  }
  function nenDetailInner(eid, n, agg){
    return '<div style="font-size:11px;color:#5C7E6C;margin-bottom:6px">自動集計を上書きする場合のみ入力（空欄=履歴から自動）</div>'
      +'<div class="nrow"><span class="nlbl">給与収入(年)</span>'+nf(eid,'shunyuOverride',n.shunyuOverride,fmtN(agg.shunyu))+'<span class="nlbl">源泉徴収済(年)</span>'+nf(eid,'genzenOverride',n.genzenOverride,fmtN(agg.genzen))+'</div>'
      +'<div class="nrow"><span class="nlbl">社保(天引・上書)</span>'+nf(eid,'shahoOverride',n.shahoOverride,fmtN(agg.shaho))+'<span class="nlbl">社保(申告追加)</span>'+nf(eid,'shinkokuShaho',n.shinkokuShaho)+'</div>'
      +'<div class="nsec" style="margin-top:10px">申告（生活語で・控除証明書の数字を写すだけ）</div>'
      +nenchoWizardHTML(eid, n)
      // 特定親族の所得(62超123万)は稀・専門的なので詳細のまま残す
      +'<div class="nw-group"><div class="nw-gt">その他（詳しい人向け）</div><div class="nw-row"><div class="nw-q">特定親族の所得<span class="nw-help">19〜22歳で所得62万超123万以下のとき</span></div><div class="nw-in">'+nf(eid,'tokuteiShinzokuShotoku',n.tokuteiShinzokuShotoku)+'<span class="nw-unit">円</span></div></div></div>';
  }
  function nenDetailHTML(eid, n, agg){
    return '<div class="nen-detail" id="nen-detail-'+attr(eid)+'" style="display:none;border-top:1px dashed #d4eae0;margin-top:8px;padding-top:8px">'+nenDetailInner(eid, n, agg)+'</div>';
  }
  // 申告フォーム(nen-detail)だけ開いた状態を保ったまま再描画（when依存行の出し入れ用）
  function nenRefreshDetail(eid){ var d=$('#nen-detail-'+eid); if(!d)return; var agg=nenAggregate(state._nenRecs, eid); d.innerHTML=nenDetailInner(eid, nenStore(eid), agg); }
  // 従業員がWeb明細から出した年末調整の申告バナー(会社が「取り込む」→n.*へ反映)
  function nenDeclBannerHTML(eid){
    var d=(state._nenDecls||{})[eid];
    if(!d||!d.decl){ // 未提出: Web明細を配布済み(=本人が申告できる)なら「依頼中」を表示して催促の目印に
      if(state._nenPubIds && state._nenPubIds[eid]) return '<div class="hint" style="margin:6px 0 0;color:#92500A">🕒 本人のWeb申告：<b>未提出</b>（Web明細から申告してもらえます）</div>';
      return '';
    }
    var nd=NDcl(), sum=(nd&&nd.summarize)?nd.summarize(d.decl):[];
    var when=''; try{ var t=d.updatedAt||d.submittedAt; if(t) when=new Date(t).toLocaleDateString('ja-JP'); }catch(_){}
    return '<div class="nen-decl-banner" style="margin:8px 0 0;background:#EAF7F0;border:1.5px solid #C8ECD8;border-radius:10px;padding:10px 12px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">'
      +'<b style="font-size:12.5px;color:#2E7D54">📝 本人がWebで年末調整の申告を提出'+(when?'（'+esc(when)+'）':'')+'</b>'
      +'<button class="btn-ghost" data-nendecl-import="'+attr(eid)+'" style="padding:6px 12px;font-size:12px;white-space:nowrap">申告内容を取り込む</button></div>'
      +(sum.length?'<div class="hint" style="margin-top:6px;color:#3D6B53;line-height:1.7">'+sum.map(esc).join('<br>')+'</div>':'<div class="hint" style="margin-top:4px">申告項目は空欄（該当なし）でした。</div>')
      +'</div>';
  }
  function nenEmpHTML(e, recs){
    var agg=nenAggregate(recs, e.id), n=nenStore(e.id);
    var warn = agg.months===0 ? '<div class="cr-warn" style="margin:6px 0 0">⚠ 当年の保存済み明細がありません。「今月を確定」で月次を保存するか、下の「年調の申告入力」で収入・源泉を手入力してください。</div>' : (agg.months<12?'<div class="hint" style="margin:4px 0 0;color:#92500A">保存済み '+agg.months+'/12か月分から集計中（不足月は手入力で補完可）</div>':'');
    return '<div class="card" style="margin-bottom:10px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>'+esc(e.name||'(無名)')+'</b>'
      +'<button class="btn-ghost" data-ntoggle="'+attr(e.id)+'" style="padding:5px 10px;font-size:12px">年調の申告入力 ▾</button></div>'
      +warn
      +nenDeclBannerHTML(e.id)
      +nenDetailHTML(e.id, n, agg)
      +'<div id="nen-res-'+attr(e.id)+'" style="margin-top:8px">'+nenResHTML(nenCompute(agg,n), n)+'</div>'
      +'</div>';
  }
  function nenViewHTML(recs, year){
    state._nenRecs=recs;
    var emps=state.employees.filter(function(e){ return isActiveInMonth(e, year+'-12') || (recs||[]).some(function(r){return r.employee_id===e.id;}); });
    state._nenEmps=emps;
    var yearGuard = (year<2026||year>2027) ? '<div class="cr-warn" style="margin:0 0 8px">⚠ この年末調整の税額計算は<b>令和8・9年分（2026・2027年）専用</b>です。対象年 '+year+' 年は未対応のため、控除額・税額が正しくない可能性があります（対象月を令和8・9年に設定してください）。</div>' : '';
    // 本人のWeb申告 提出状況(提出済/未提出=公開済だが未申告)
    var decls=state._nenDecls||{}, pubIds=state._nenPubIds||{};
    var subN=emps.filter(function(e){ return decls[e.id]&&decls[e.id].decl; }).length;
    var unsubN=emps.filter(function(e){ return !(decls[e.id]&&decls[e.id].decl) && pubIds[e.id]; }).length;
    var declStatus = (subN||unsubN) ? '<div class="pay-row" style="margin-top:6px"><span>本人のWeb申告</span><span class="v"><b style="color:#2E7D54">提出 '+subN+'</b>'+(unsubN?' / <b style="color:#92500A">未提出 '+unsubN+'名</b>':'名')+'</span></div>'+(subN>1?'<div style="margin-top:6px"><button class="btn-ghost" data-nendecl-import-all="1" style="padding:7px 12px;font-size:12px">提出分をまとめて取り込む（'+subN+'名）</button></div>':'') : '';
    var head='<div class="card"><div class="card-h">年末調整 '+year+'年</div>'
      +yearGuard+statutoryStaleWarn()
      +declStatus
      +'<p class="hint">当年1〜12月の<b>保存済みの給与・賞与明細から自動集計</b>し、保険料・扶養などの<b>申告分を入力</b>すると過不足（還付／追加徴収）を計算します。月次は「今月を確定」、賞与は「賞与を確定」で保存すると収入・源泉・社保が自動で埋まります（賞与も含めて集計）。令和8年度改正（基礎控除・給与所得控除・特定親族特別控除）に対応。<br><b style="color:#92500A">※このアプリで扱っていない他の給与所得（前職分など）がある場合のみ「年調の申告入力 ▾」で 給与収入(年)／源泉徴収済(年)／社保 を上書き入力してください。</b></p>'
      +'<div class="pay-row" style="margin-top:6px"><span>全体の過不足</span><span id="nen-total" class="v">—</span></div>'
      +(function(){ // 過不足を対象月の給与明細に反映(還付=支給/追徴=控除の行を当月明細に追加)
          var refM=state.month, reflectedN=emps.filter(function(e){ return e.nenchoAdj && e.nenchoAdj.ym===refM; }).length;
          var payable=emps.filter(function(e){ var c=nenCompute(nenAggregate(recs,e.id), nenStore(e.id)); return c && c.res.kabusoku!==0; }).length;
          if(!payable && !reflectedN) return '';
          return '<div style="margin-top:8px;background:#F0FAF4;border:1px solid #C8ECD8;border-radius:10px;padding:9px 11px">'
            +'<div style="font-size:12px;color:#2E7D54">過不足を<b>'+esc(refM)+'</b>の給与明細に反映（還付＝支給／追加徴収＝控除の行を追加。税・社保は変わりません）'+(reflectedN?'　<b style="color:#2E7D54">反映済み '+reflectedN+'名</b>':'')+'</div>'
            +'<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">'
            +'<button class="btn-ghost" data-nenreflectall="1" style="padding:7px 12px;font-size:12px">'+esc(refM)+'の給与に反映（'+payable+'名）</button>'
            +(reflectedN?'<button class="btn-ghost" data-nenreflectclear="1" style="padding:7px 12px;font-size:12px">'+esc(refM)+'の反映を解除</button>':'')
            +'</div></div>';
        })()
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
      +'<button class="btn-ghost" data-nxlsx="1" style="padding:8px 12px;font-size:12px">年末調整一覧（源泉徴収簿）をExcel出力</button><span class="help-i" data-help="genzenbo">💡</span>'
      +'<button class="btn-ghost" data-ngensen="1" style="padding:8px 12px;font-size:12px">源泉徴収票を印刷 / PDF保存</button>'
      +'<button class="btn-ghost" data-ngensenweb="1" style="padding:8px 12px;font-size:12px">源泉徴収票を従業員へWeb交付</button>'
      +'<button class="btn-ghost" data-ngyoyo="1" style="padding:8px 12px;font-size:12px">給与支払報告書（市区町村提出）をExcel出力</button></div></div>';
    if(!emps.length) return head+'<div class="card"><p class="hint">対象の従業員がいません。</p></div>';
    return head+emps.map(function(e){ return nenEmpHTML(e, recs); }).join('');
  }
  function renderNenView(){
    var host=$('#view-nen'); if(!host)return; var year=nenYear();
    if(!(window.Store&&Store.getPayslipsByYm&&Nen_())){ host.innerHTML='<div class="empty-cta"><div class="ec-emoji">📅</div><div class="ec-t">年末調整のデータがまだありません</div><div class="ec-s">各月の入力を「今月を確定」で記録すると、1〜12月分がここに自動集計されます。まずは入力タブで当月を確定してください。</div><button class="btn-primary ec-btn" data-scr="scr-input">入力タブへ</button></div>'; return; }
    host.innerHTML='<div class="card"><div class="card-h">年末調整 '+year+'年</div><p class="hint">読込中…</p></div>';
    var declP = (Store.listNenchoDecl) ? Store.listNenchoDecl(year).catch(function(){ return []; }) : Promise.resolve([]);
    var pubP = (Store.listMeisaiPub) ? Store.listMeisaiPub(rosterIds()).catch(function(){ return []; }) : Promise.resolve([]);
    Promise.all([Store.getPayslipsByYm(year+'-01', year+'-12'), declP, pubP]).then(function(res){
      var recs=res[0], decls=res[1]||[], pubs=res[2]||[];
      state._nenDecls={}; decls.forEach(function(d){ if(d&&d.employeeId) state._nenDecls[d.employeeId]=d; }); // 従業員のWeb申告(employeeId→{decl,submittedAt,updatedAt})
      state._nenPubIds={}; pubs.forEach(function(p){ if(p&&p.employeeId) state._nenPubIds[p.employeeId]=true; }); // Web明細を配布済み=本人が申告できる
      host.innerHTML=nenViewHTML(confirmedRecs(recs), year); nenTotal();
    }).catch(function(){ host.innerHTML='<div class="card"><p class="hint">読込に失敗しました。</p></div>'; });
  }
  // 年末調整一覧(源泉徴収簿)のExcel出力。年調ビューが描画済み(state._nenEmps/_nenRecs)前提。
  function nenDownloadXlsx(){
    if(!(window.PayslipXlsx&&Nen_())) return; var year=nenYear();
    var aoa=[ ['令和'+(year-2018)+'年分 年末調整一覧（源泉徴収簿）'], [(state.company||{}).name||''], [],
      ['氏名','支払金額','給与所得控除後','所得控除の合計','源泉徴収税額(年調後)','社会保険料等','生命保険料控除','地震保険料控除','配偶者(特別)控除','扶養親族の数','基礎控除','住宅借入金等特別控除','過不足(還付は△)'] ];
    var emps=state._nenEmps||[], t={ pay:0,zei:0,kabu:0 };
    emps.forEach(function(e){ var c=nenCompute(nenAggregate(state._nenRecs,e.id), nenStore(e.id)); if(!c)return;
      var r=c.res, kl=r.kojoList, n=nenStore(e.id);
      var fuyoN=fuyoBuckets(n).total; // 扶養親族の数=総数(累積入力のfuyoIppanが総数・二重に足さない)
      t.pay+=c.shunyu; t.zei+=r.nenchouNenzei; t.kabu+=r.kabusoku;
      aoa.push([ e.name||'', c.shunyu, r.kyuyoShotoku, r.kojoGoukei, r.nenchouNenzei, kl.shakaiHoken, kl.seimei, kl.jishin, kl.haiguusha+kl.haiTokubetsu, fuyoN, kl.kiso, num(n.jutakuLoan), (r.kabusoku<0?'△'+fmtN(-r.kabusoku):fmtN(r.kabusoku)) ]);
    });
    aoa.push(['合計', t.pay, '', '', t.zei, '', '', '', '', '', '', '', (t.kabu<0?'△'+fmtN(-t.kabu):fmtN(t.kabu))]);
    PayslipXlsx.downloadSheets([{ name:'年末調整一覧', aoa:aoa, cols:[{wch:16},{wch:12},{wch:13},{wch:13},{wch:15},{wch:12},{wch:12},{wch:12},{wch:13},{wch:9},{wch:11},{wch:15},{wch:14}] }], { filename:'年末調整一覧_'+year+'.xlsx' });
  }
  // 給与支払報告書(市区町村提出): 源泉徴収票と同じ年調集計から、総括表(市区町村別 人員・支払金額)＋個人別明細書を生成。
  //  出典=地方税法317条の6(給与支払報告書)。★本人交付用と同様マイナンバー(個人番号)は扱わない=各自記入。市区町村は住所から自動抽出(要確認)。
  function extractCity(addr){
    var s=String(addr||'').trim(); if(!s) return '（住所未登録）';
    var pref='', pm=/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.exec(s);
    if(pm){ pref=pm[0]; s=s.slice(pref.length); } // 都道府県は残して同名別自治体(東京都府中市↔広島県府中市)を区別
    // ★市を貪欲に取る=名称途中に市を含む市(四日市市/廿日市市/野々市市)が切れない。政令市「◯◯市××区」は市に寄る(給与支払報告書の提出先は市)。市→区→町→村の順。
    var m=/^.+市/.exec(s) || /^.+区/.exec(s) || /^.+町/.exec(s) || /^.+村/.exec(s);
    var city=m ? m[0] : (s || '（住所未登録）');
    return pref+city;
  }
  var GYOYO_COLS=['提出先 市区町村','徴収区分','受給者番号','氏名','生年月日','住所','種別','支払金額','給与所得控除後の金額','所得控除の額の合計額','源泉徴収税額','社会保険料等の金額','生命保険料の控除額','地震保険料の控除額','配偶者(特別)控除の額','扶養(特定)','扶養(老人)','扶養(その他)','16歳未満扶養','基礎控除の額','特定親族特別控除の額','住宅借入金等特別控除の額','本人区分','摘要'];
  function honninKubun(e){ var a=[]; if(e.honninShogai)a.push('障害者'); if(e.honninKafuHitorioya==='kafu')a.push('寡婦'); if(e.honninKafuHitorioya==='hitorioya')a.push('ひとり親'); if(e.honninKinrou)a.push('勤労学生'); return a.join('・'); } // 本人の区分(住民税非課税判定に必要・既存フラグ)
  function gyoyoRows(recs, year, emps){
    return (emps||[]).map(function(e){
      var c=nenCompute(nenAggregate(recs, e.id), nenStore(e.id)); if(!c) return null;
      var r=c.res, kl=r.kojoList, n=nenStore(e.id), fb=fuyoBuckets(n);
      return { emp:e, city:extractCity(e.address), collect:(e.juminCollect==='ordinary'?'普通徴収':'特別徴収'), name:e.name||'', birthYmd:e.birthYmd||'', zip:e.zip||'', address:e.address||'',
        shunyu:c.shunyu, kyuyoShotoku:r.kyuyoShotoku, kojoGoukei:r.kojoGoukei, nenzei:r.nenchouNenzei,
        shakaiHoken:kl.shakaiHoken, seimei:kl.seimei, jishin:kl.jishin, haiGaku:kl.haiguusha+kl.haiTokubetsu,
        kiso:kl.kiso, tokuteiShinzoku:kl.tokuteiShinzoku, jutaku:num(n.jutakuLoan), fb:fb, nensho:num(e.nenshoFuyo), honnin:honninKubun(e) };
    }).filter(Boolean).filter(function(x){ return x.shunyu>0; }); // 年内に支払のあった人のみ
  }
  function gyoyoSoukatsuAoa(rows, year){
    var co=state.company||{}, byCity={};
    rows.forEach(function(x){ var g=byCity[x.city]||(byCity[x.city]={n:0,pay:0,toku:0,futsu:0}); g.n++; g.pay+=x.shunyu; if(x.collect==='普通徴収')g.futsu++; else g.toku++; });
    var aoa=[['給与支払報告書（総括表）　令和'+(year-2018)+'年分（'+year+'年中の給与）'], ['提出者（事業所）', co.name||''], ['所在地', co.addr||''], [],
      ['提出先 市区町村','報告人員','うち特別徴収','うち普通徴収','支払金額合計','摘要']];
    var tot={n:0,pay:0,toku:0,futsu:0};
    Object.keys(byCity).sort().forEach(function(city){ var g=byCity[city]; tot.n+=g.n; tot.pay+=g.pay; tot.toku+=g.toku; tot.futsu+=g.futsu; aoa.push([city, g.n, g.toku, g.futsu, g.pay, '']); });
    aoa.push(['合計', tot.n, tot.toku, tot.futsu, tot.pay, '']);
    aoa.push([]); aoa.push(['※ 市区町村は住所から自動抽出（要確認）。徴収区分は従業員マスタの「住民税の納め方」。受給者番号・個人番号は各自記入。マイナンバーは扱いません。']);
    return aoa;
  }
  function gyoyoMeisaiAoa(rows, year){
    var aoa=[['給与支払報告書（個人別明細書）　令和'+(year-2018)+'年分'], [ (state.company||{}).name||'' ], [], GYOYO_COLS.slice()];
    rows.slice().sort(function(a,b){ return a.city<b.city?-1:a.city>b.city?1:0; }).forEach(function(x){
      aoa.push([ x.city, x.collect, '', x.name, x.birthYmd, (x.zip?'〒'+x.zip+' ':'')+x.address, '給与・賞与', x.shunyu, x.kyuyoShotoku, x.kojoGoukei, x.nenzei, x.shakaiHoken, x.seimei, x.jishin, x.haiGaku, x.fb.tokutei, x.fb.roujinAll, x.fb.ippan, x.nensho||'', x.kiso, x.tokuteiShinzoku, x.jutaku, x.honnin, '' ]);
    });
    return aoa;
  }
  function downloadGyoyoHoukoku(){
    if(!(window.PayslipXlsx&&Nen_())) return; var year=nenYear();
    var rows=gyoyoRows(state._nenRecs, year, state._nenEmps||[]);
    if(!rows.length){ uiAlert('対象の給与データがありません。年末調整の対象月・確定明細をご確認ください。'); return; }
    PayslipXlsx.downloadSheets([ { name:'総括表', aoa:gyoyoSoukatsuAoa(rows, year) }, { name:'個人別明細書', aoa:gyoyoMeisaiAoa(rows, year) } ], { filename:'給与支払報告書_'+year+'.xlsx' });
  }
  // 源泉徴収票(従業員配布用の個票)。公式項目を揃えた印刷フォーム→印刷/PDF保存。
  function nenGensenHTML(e, year){
    var c=nenCompute(nenAggregate(state._nenRecs,e.id), nenStore(e.id)); if(!c) return '';
    var r=c.res, kl=r.kojoList, n=nenStore(e.id);
    var haiUmu = n.haiEnabled ? '有' : '無';
    var haiGaku = num(kl.haiguusha)+num(kl.haiTokubetsu);
    var fbG = fuyoBuckets(n); // 扶養は累積入力→排他区分に分解して票に表示
    var cell=function(lbl,val){ return '<td class="gl">'+esc(lbl)+'</td><td class="gv">'+yen(val)+'</td>'; };
    return '<div class="gensen">'
      +'<div class="gt">令和'+(year-2018)+'年分　給与所得の源泉徴収票</div>'
      +'<table class="gtbl">'
      +'<tr><td class="gl">支払を受ける者</td><td colspan="3">住所　'+(e.address?'<b>'+((e.zip?'〒'+esc(e.zip)+' ':'')+esc(e.address))+'</b>':'　　　　　　　　　　　　')+'　氏名　<b>'+esc(e.name||'')+'</b></td></tr>'
      +'<tr><td class="gl">種別</td><td>給与・賞与</td>'+cell('支払金額', c.shunyu)+'</tr>'
      +'<tr>'+cell('給与所得控除後の金額', r.kyuyoShotoku)+cell('所得控除の額の合計額', r.kojoGoukei)+'</tr>'
      +'<tr>'+cell('源泉徴収税額', r.nenchouNenzei)+'<td class="gl">(源泉)控除対象配偶者の有無</td><td class="gv">'+haiUmu+'</td></tr>'
      +'<tr>'+cell('配偶者(特別)控除の額', haiGaku)+'<td class="gl">控除対象扶養親族の数</td><td class="gv" style="text-align:left">特定'+fbG.tokutei+'人／老人'+fbG.roujinAll+'人／その他'+fbG.ippan+'人</td></tr>'
      +'<tr>'+cell('社会保険料等の金額', kl.shakaiHoken)+cell('生命保険料の控除額', kl.seimei)+'</tr>'
      +'<tr>'+cell('地震保険料の控除額', kl.jishin)+cell('住宅借入金等特別控除の額', num(n.jutakuLoan))+'</tr>'
      +'<tr>'+cell('基礎控除の額', kl.kiso)+cell('特定親族特別控除の額', kl.tokuteiShinzoku)+'</tr>'
      +'<tr><td class="gl">摘要</td><td colspan="3" style="height:34px"></td></tr>'
      +'<tr><td class="gl">支払者</td><td colspan="3">'+esc((state.company||{}).name||'')+'　'+esc((state.company||{}).addr||'')+'</td></tr>'
      +'</table></div>';
  }
  // 源泉徴収票の共通CSS(印刷・Web交付で共用)
  function gensenCss(){
    return 'body{font-family:"Noto Sans JP",sans-serif;color:#1a1a1a;margin:0;padding:12px;}'
      +'.gensen{border:2px solid #333;border-radius:4px;padding:12px 14px;margin:0 0 16px;page-break-after:always;}'
      +'.gt{font-size:16px;font-weight:700;text-align:center;margin-bottom:10px;letter-spacing:.08em;}'
      +'.gtbl{width:100%;border-collapse:collapse;font-size:12px;}'
      +'.gtbl td{border:1px solid #999;padding:6px 8px;vertical-align:middle;}'
      +'.gtbl .gl{background:#f2f2f2;font-size:10.5px;color:#333;white-space:nowrap;width:150px;}'
      +'.gtbl .gv{font-family:"DM Mono",monospace;text-align:right;font-weight:700;}'
      +'@media print{.gensen{margin:0;border-color:#000;}}';
  }
  // 1名分の源泉徴収票を単独HTML化(Web明細ビューアのiframeにそのまま表示できる自己完結HTML)
  function nenGensenDoc(e, year){
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      +'<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">'
      +'<style>'+gensenCss()+'</style></head><body>'+nenGensenHTML(e, year)+'</body></html>';
  }
  function nenPrintGensen(){
    var year=nenYear(); var emps=state._nenEmps||[];
    if(!emps.length){ uiAlert('対象の従業員がいません。'); return; }
    var body=emps.map(function(e){ return nenGensenHTML(e, year); }).join('');
    var html='<!doctype html><html><head><meta charset="utf-8"><title>源泉徴収票 '+year+'</title>'
      +'<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">'
      +'<style>'+gensenCss()+'</style></head><body>'+body
      +'<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print();},400);}</scr'+'ipt></body></html>';
    var w=window.open('', '_blank'); if(!w){ uiAlert('ポップアップがブロックされました。ブラウザの設定で許可してください。'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
  // 源泉徴収票を従業員へWeb交付(明細と同じpay_meisai_docsにkind=gensenで公開・電子交付同意ゲートは明細と共通)
  function nenPublishGensen(){
    var year=nenYear(); var emps=state._nenEmps||[];
    if(!emps.length){ uiAlert('対象の従業員がいません。'); return; }
    if(!(window.Store&&Store.publishMeisai)) return;
    uiConfirm(emps.length+'名の源泉徴収票を、従業員のWeb明細で交付します（電磁的方法・所得税法226条等）。\n・従業員はログイン＋電子交付の同意後に閲覧・PDF保存/印刷できます\n・本人交付用のためマイナンバーは記載されません\n・書面（紙）を希望する従業員には、別途書面で交付してください\nよろしいですか？').then(function(ok){ if(!ok) return;
      var items=emps.map(function(e){ return { employeeId:e.id, name:e.name, ym:year+'-12', kind:'gensen', data:{ gensenHtml:nenGensenDoc(e, year), person:{ name:e.name }, year:year } }; });
      Store.publishMeisai(items).then(function(){ toast(emps.length+'名の源泉徴収票をWeb交付しました'); });
    });
  }

  /* ---------- 印刷 / PDF ---------- */
  // 明細の支給日表示。非月給の支給サイクルは支給日欄にサイクルを表示(月給は従来どおり日付=回帰ゼロ)
  function payDateForSlip(){ var c=(state.company&&state.company.payCycle)||'monthly';
    if(c==='daily') return '日払い'; if(c==='weekly') return '週払い'; if(c==='semimonthly') return payDateStr()+'（月2回）'; return payDateStr(); }
  function buildPeople(emps){ return emps.map(function(e){ var r=compute(e); var k=(e.kintai||[]).filter(function(x){ if(/代休取得|振替休日/.test(x.label||'')) return num(x.value)>0; return true; }); var oi=k.findIndex(function(x){return /出勤/.test(x.label||'');}); var wt={label:'労働時間',value:workedLabel(e)}; if(oi>=0)k.splice(oi+1,0,wt); else k.unshift(wt); return { name:e.name, company:state.company.name, payDate:payDateForSlip(), kintai:k, shikyu:r.shikyu, kojo:r.kojo, net:r.net, shikyuTotal:r.shikyuTotal, kojoTotal:r.kojoTotal, warnings:empWarnings(e) }; }); }

  /* ── 日払い/週払い スリップ明細(日別内訳) ── */
  function HEI(){ return (typeof ShotokuzeiHei!=='undefined')?ShotokuzeiHei:(window&&window.ShotokuzeiHei); }
  function NICHI(){ return (typeof ShotokuzeiNichi!=='undefined')?ShotokuzeiNichi:(window&&window.ShotokuzeiNichi); }
  function DP(){ return (typeof DailyPay!=='undefined')?DailyPay:(window&&window.DailyPay); }
  var WD=['日','月','火','水','木','金','土'];
  function dateLabel(ymd){ if(!ymd) return ''; var p=String(ymd).split('-'); var m=+p[1]||0, d=+p[2]||0; var wd=''; try{ var dt=new Date(+p[0],(m||1)-1,d||1); wd='（'+WD[dt.getDay()]+'）'; }catch(_){} return m+'/'+d+wd; }
  function periodLabelOf(days){ if(!days.length) return ''; var ys=days.map(function(x){return x.ymd;}).filter(Boolean).sort(); if(!ys.length) return ''; var a=ys[0],b=ys[ys.length-1]; function jp(y){ var p=y.split('-'); return '令和'+(+p[0]-2018)+'年'+(+p[1])+'月'+(+p[2])+'日'; } return a===b?jp(a):(jp(a)+' 〜 '+(+b.split('-')[1])+'月'+(+b.split('-')[2])+'日'); }
  // 従業員の日別入力→スリップ用データ。丙欄は日別税、甲乙は日額表未収録で税null(注記)。
  function hmToMin(s){ s=String(s==null?'':s).trim(); if(!s)return 0; if(/:/.test(s)){ var p=s.split(':'); return num(p[0])*60+num(p[1]); } return Math.round(num(s)*60); }
  // period(K2締め期間)を渡すと、その期間の日別だけを抜き出した「期間の報酬明細」を作る。
  //  ★期間モードでは日税を計算しない=控除ゼロ(社保/所得税は月額基準=月次明細で正式に計算)。業務委託/従業員でnoteを分岐。
  function buildDailyData(e, period){
    var dp=DP(); if(!dp) return null;
    var periodMode=!!(period && period.from); // ★期間オブジェクト(from/to有)の時だけ期間モード。.map(fn)がindexを渡す誤発火を防ぐ。
    var allEntries=(e.dailyEntries||[]).map(function(d){ return { ymd:d.ymd, min:hmToMin(d.hm), amount:num(d.amount), count:num(d.count), hikazei:!!d.hikazei }; });
    var entries=(periodMode&&window.Periods)?Periods.entriesInPeriod(allEntries, period):allEntries;
    var contractor=(e.employmentType==='contractor');
    var year=parseInt(String(state.month||'').slice(0,4),10)||2026;
    var cls=e.taxClass||'ko';
    // その日の課税額→所得税(日ごと)。丙=日雇い日額表丙欄 / 甲・乙=日額表 甲乙欄(継続雇用の日払週払)。★期間モードは計算しない。
    var hei=HEI(), nichi=NICHI(), fuyou=num(e.fuyou), dayTaxFn=null, taxLabel='';
    if(!periodMode){
      if(cls==='hei'){ if(hei){ dayTaxFn=function(t){ return hei.heiTax(t,{year:year}); }; taxLabel='丙欄'; } }
      else if(cls==='otsu'){ if(nichi){ dayTaxFn=function(t){ return nichi.nichiTax(t,{taxClass:'otsu',year:year}); }; taxLabel='乙欄'; } }
      else { var depsK=fuyou+jintekiOf(e,'ko'); if(nichi){ dayTaxFn=function(t){ return nichi.nichiTax(t,{taxClass:'ko',deps:depsK,year:year}); }; taxLabel='甲欄'; } } // 甲=本人の人的加算を扶養数に反映(月次と整合)
    }
    var dd=dp.computeDaily(entries, { taxClass:cls, year:year, dayTaxFn:dayTaxFn });
    var cyc=(state.company&&state.company.payCycle)||'monthly';
    var days=dd.days.map(function(d){ return { dateLabel:dateLabel(d.ymd), ymd:d.ymd, hhmm:dp.hhmm(d.min), amount:d.amount }; });
    var tax=periodMode?0:dd.tax; // 期間モード=控除0(支給=手取り)。日払/週払=日ごと合算(甲/乙/丙)。
    var net=dd.totalAmount-(tax||0);
    var title, heroLabel, cycleLabel, periodLabel, payDate;
    if(periodMode){
      // ★誤用防止: 従業員の期間明細は「概算」を明記=正式な給与明細(月次)と見分けられるように。業務委託は正式な報酬明細。
      title=contractor?'報 酬 明 細':'報 酬 明 細（概算）'; heroLabel='支 給 額'; cycleLabel=period.label;
      periodLabel=periodLabelOf(days)||('令和'+(year-2018)+'年 '+period.label); payDate=period.label;
    } else {
      title=cyc==='weekly'?'週 払 給 与 明 細':'日 払 給 与 明 細'; heroLabel=cyc==='weekly'?'今 週 支 給 額':'本 日 支 給 額';
      cycleLabel=cyc==='weekly'?'週払い':'日払い'; periodLabel=periodLabelOf(days); payDate=(state.company.paydayDay?('毎回 '+state.company.paydayDay+'日ごろ'):periodLabelOf(days));
    }
    return { company:(state.company.name||''), name:(e.name||''), cycle:cyc, days:days, taxLabel:taxLabel, taxClass:cls,
      cycleLabel:cycleLabel, title:title, heroLabel:heroLabel, payDate:payDate,
      periodLabel:periodLabel, count:dd.count, totalMin:dd.totalMin, totalMinLabel:dp.hhmm(dd.totalMin), totalCount:dd.totalCount,
      totalAmount:dd.totalAmount, tax:tax, isHei:dd.isHei, net:net, single:(!periodMode&&(cyc==='daily'||dd.count<=1)),
      periodMode:periodMode, contractor:contractor, periodKey:(period&&period.key)||'' };
  }
  var DAILY_CSS=':root{--ink:#23261f;--ink2:#6a6d62;--ink3:#7d7f72;--hair-lt:#ece7dc;--hair2:#cfc9b8;--accent:#6f5a3e;--accent-soft:#b6a06d;}*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS Mincho",serif;color:var(--ink);background:#fff;}'
    +'.sheet{width:794px;min-height:1123px;margin:0 auto;padding:40px 60px;}'
    +'.tophd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;}.mh-title{font-size:15px;letter-spacing:.32em;font-weight:500;}.mh-sub{font-size:11px;letter-spacing:.14em;margin-top:6px;color:var(--ink2);}'
    +'.tag{display:inline-block;font-family:"Yu Gothic",sans-serif;font-size:9.5px;color:#7a6a3e;border:.7px solid var(--accent-soft);border-radius:3px;padding:1px 7px;letter-spacing:.1em;vertical-align:2px;margin-left:9px;}'
    +'.iss{font-size:10px;color:var(--ink2);text-align:right;line-height:1.7;}.mh-rule{height:.6px;background:var(--hair2);margin:11px 0 16px;}'
    +'.hero1{text-align:center;}.hero2{display:grid;grid-template-columns:1fr auto;align-items:start;gap:14px;}'
    +'.h-co{font-size:12px;color:var(--ink2);letter-spacing:.12em;}.h-nm{font-size:16px;letter-spacing:.1em;margin-top:4px;}.h-nm .dono{font-size:12px;color:var(--ink2);margin-left:.3em;}'
    +'.h-lab{font-size:12px;letter-spacing:.40em;color:var(--accent);margin-top:13px;}.hero2 .h-lab{text-align:center;}.h-val{font-size:40px;margin-top:4px;font-variant-numeric:tabular-nums;}.hero2 .h-val{text-align:center;}.h-val .yen{font-size:19px;color:var(--accent);margin-right:2px;}'
    +'.kin{display:flex;justify-content:center;border-top:1px solid var(--accent-soft);border-bottom:1px solid var(--accent-soft);margin:16px 0 12px;padding:10px 0;}.k{text-align:center;padding:0 26px;}.kl{font-size:10.5px;color:var(--ink2);}.kv{font-size:15px;margin-top:4px;font-variant-numeric:tabular-nums;}'
    +'.st{font-size:13px;letter-spacing:.40em;color:var(--accent);padding-bottom:7px;border-bottom:.7px solid var(--hair2);margin:12px 0 2px;}'
    +'.cols{display:flex;gap:44px;}.col{flex:1;}'
    +'.dhead{display:grid;grid-template-columns:1fr auto auto;column-gap:26px;padding:5px 2px 6px;font-family:"Yu Gothic",sans-serif;font-size:9px;color:var(--ink3);border-bottom:.7px solid var(--hair-lt);}.dhead .c{text-align:right;}'
    +'.rd{display:grid;grid-template-columns:1fr auto auto;column-gap:26px;align-items:baseline;padding:6px 2px;border-bottom:.7px solid var(--hair-lt);}.rd .l{font-size:12px;color:var(--ink2);}.rd .h{font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums;text-align:right;min-width:52px;}.rd .v{font-size:12.5px;font-variant-numeric:tabular-nums;text-align:right;min-width:64px;}'
    +'.r{display:flex;justify-content:space-between;align-items:baseline;padding:6px 2px;border-bottom:.7px solid var(--hair-lt);}.r .l{font-size:12px;color:var(--ink2);}.r .v{font-size:12.5px;font-variant-numeric:tabular-nums;}'
    +'.rd.sum,.r.sum{border-bottom:none;border-top:1px solid var(--accent-soft);padding-top:9px;}.rd.sum .l,.r.sum .l{color:var(--ink);letter-spacing:.16em;font-size:13px;}.rd.sum .h{color:var(--ink);font-size:12px;}.rd.sum .v,.r.sum .v{font-size:15px;}'
    +'.note{margin-top:16px;font-size:9.5px;color:var(--ink3);font-family:"Yu Gothic","Hiragino Sans",sans-serif;line-height:1.6;border-top:.7px dashed var(--hair2);padding-top:9px;}'
    +'@page{size:A4 portrait;margin:0;}';
  function yenR(n){ return '<span class="yen">¥</span>'+fmtN(n); }
  // 1人分のスリップ(内側 .sheet)。複数人はこれを並べる(M2: 全員印刷が1人だけだったバグ修正)
  function dailySlipSheet(d, layout){
    var taxRow = d.periodMode
      ? (d.contractor
        ? '<div class="r"><span class="l">控除</span><span class="v" style="font-size:11px;color:#3B7A5A">なし（業務委託）</span></div><div class="r sum"><span class="l">控除計</span><span class="v">0</span></div>'
        : '<div class="r"><span class="l">社保・所得税</span><span class="v" style="font-size:10px;color:#8a7a4e">月次でまとめて</span></div><div class="r sum"><span class="l">控除計（この期間）</span><span class="v">0</span></div>')
      : (d.tax!=null)
      ? '<div class="r"><span class="l">所得税（'+(d.taxLabel||'日額表')+'）</span><span class="v">'+fmtN(d.tax)+'</span></div><div class="r sum"><span class="l">控除計</span><span class="v">'+fmtN(d.tax)+'</span></div>'
      : '<div class="r"><span class="l">所得税</span><span class="v" style="font-size:10px;color:#8a7a4e">別途</span></div><div class="r sum"><span class="l">控除計</span><span class="v">0</span></div>';
    var dhead='<div class="dhead"><span>日付</span><span class="c">労働時数</span><span class="c">支給額</span></div>';
    var dRows=d.days.map(function(x){ return '<div class="rd"><span class="l">'+esc(x.dateLabel)+'</span><span class="h">'+esc(x.hhmm)+'</span><span class="v">'+fmtN(x.amount)+'</span></div>'; }).join('')
      +'<div class="rd sum"><span class="l">支給計</span><span class="h">'+esc(d.totalMinLabel)+'</span><span class="v">'+fmtN(d.totalAmount)+'</span></div>';
    var kin='<div class="kin">'+(d.single
      ?'<div class="k"><div class="kl">労働時数</div><div class="kv">'+esc(d.totalMinLabel)+'</div></div>'+(d.totalCount>0?'<div class="k"><div class="kl">件数</div><div class="kv">'+d.totalCount+' 件</div></div>':'')
      :'<div class="k"><div class="kl">出勤</div><div class="kv">'+d.count+' 日</div></div><div class="k"><div class="kl">労働時数</div><div class="kv">'+esc(d.totalMinLabel)+'</div></div>'+(d.totalCount>0?'<div class="k"><div class="kl">件数</div><div class="kv">'+d.totalCount+' 件</div></div>':''))+'</div>';
    var top='<div class="tophd"><div><div class="mh-title">'+d.title+'</div><div class="mh-sub">'+esc(d.periodLabel)+'<span class="tag">'+d.cycleLabel+'</span></div></div><div class="iss">'+esc(d.company)+'</div></div><div class="mh-rule"></div>';
    var body;
    if(layout==='2col' && !d.single){
      var hero='<div class="hero2"><div><div class="h-co">'+esc(d.company)+'</div><div class="h-nm">'+esc(d.name)+'<span class="dono">殿</span></div></div><div><div class="h-lab">'+d.heroLabel+'</div><div class="h-val">'+yenR(d.net)+'</div></div></div>';
      body=hero+kin+'<div class="cols"><div class="col"><div class="st">日 別 支 給</div>'+dhead+dRows+'</div><div class="col"><div class="st">控 除</div>'+taxRow+'</div></div>';
    } else {
      var hero1='<div class="hero1"><div class="h-co">'+esc(d.company)+'</div><div class="h-nm">'+esc(d.name)+'<span class="dono">殿</span></div><div class="h-lab">'+d.heroLabel+'</div><div class="h-val">'+yenR(d.net)+'</div></div>';
      body=hero1+kin+(d.single?'':'<div class="st">日 別 支 給</div>'+dhead+dRows)+'<div class="st">控 除</div>'+taxRow;
    }
    var taxHow=(d.taxClass==='hei')?'「丙欄」（日雇い）':(d.taxClass==='otsu')?'「乙欄」（申告書なし）':'「甲欄」（扶養人数を反映）';
    var note=d.periodMode
      ? (d.contractor
        ? ('業務委託の報酬明細（'+esc(d.cycleLabel)+'）。控除なし＝源泉・社会保険なしで、支給がそのまま支払額です。色・書体は月給明細と統一。')
        : ('この期間（'+esc(d.cycleLabel)+'）の支給の概算です。⚠ 社会保険・所得税は月額でまとめて計算するため、正式な控除は月次の給与明細で行います。月次の正式明細は月次の「支給項目」入力から別途作成され、日別入力は月次に自動集計されません。'))
      : (d.tax!=null)
      ? (d.cycleLabel+'＝所得税は日額表'+taxHow+'を日ごとに計算し合算。社会保険は月まとめ。色・書体は月給明細と統一。')
      : (d.cycleLabel+'＝所得税の税額表が読み込めませんでした。所得税はこの明細に含めず別途精算してください。社会保険は月まとめ。');
    return '<div class="sheet">'+top+body+'<div class="note">'+note+'</div></div>';
  }
  // 日払い/週払いスリップ文書。list=1人 または 複数人(全員印刷)。複数はページ分割。
  function dailySlipDoc(list, layout){
    var arr=Array.isArray(list)?list.filter(Boolean):(list?[list]:[]);
    if(!arr.length) return '<html><body style="font-family:sans-serif;padding:40px;color:#7a6a3e">日別の入力がありません。入力タブで「日別」に日付・時数・金額を入れてください。</body></html>';
    var sheets=arr.map(function(d){ return dailySlipSheet(d, layout); }).join('');
    var pageBreakCss=arr.length>1?'.sheet:not(:last-child){page-break-after:always;}':'';
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>'+DAILY_CSS+pageBreakCss+'</style></head><body>'+sheets+'</body></html>';
  }
  // 日別入力(入力タブ・支給サイクルが日/週のとき)。各日=日付/労働時数(時:分)/支給額
  function dailyInputHTML(e,i){
    var cyc=(state.company&&state.company.payCycle)||'monthly';
    var isDaily=(cyc==='daily'||cyc==='weekly'), isPeriod=shimeSplit();
    if(!isDaily && !isPeriod) return ''; // 月まとめ且つ日払/週払でない=日別UIは出さない(回帰ゼロ)
    var entries=e.dailyEntries||[];
    var rows=entries.map(function(d,idx){ return '<div class="dl-row">'
      +'<input class="finput dl-f" data-dl="'+i+':'+idx+':ymd" type="date" value="'+attr(d.ymd||'')+'">'
      +'<input class="finput dl-f dl-hm" data-dl="'+i+':'+idx+':hm" value="'+attr(d.hm||'')+'" placeholder="時:分">'
      +'<input class="finput num dl-f dl-amt" data-dl="'+i+':'+idx+':amount" inputmode="numeric" value="'+attr(fmtN(d.amount))+'" placeholder="金額">'
      +'<button class="btn-ghost dl-del" data-dldel="'+i+':'+idx+'" aria-label="この日を削除">×</button></div>'; }).join('');
    var totHtml, header, note, help;
    if(isPeriod){ // K2 締め方=期間ごとに集計して見せる
      var periods=shimePeriods(), contractor=(e.employmentType==='contractor');
      var mLabel={half:'半月',ten:'10日締め',ndays:shimeNOf()+'日締め'}[shimeMethodOf()]||'';
      var perRows=periods.map(function(p){ var d=buildDailyData(e,p); var amt=d?d.totalAmount:0, n=d?d.count:0;
        return '<div class="dl-tot" style="display:flex;justify-content:space-between"><span>'+esc(p.label)+'（'+n+'日）</span><span>'+yen(amt)+'</span></div>'; }).join('');
      var warn=contractor?'':'<div class="cr-warn" style="margin:6px 2px 2px">⚠ 従業員の期間明細は<b>支給の概算</b>です。社会保険・所得税は月額でまとめて計算します（正式な控除は月次の給与明細で）。<br><b>月次の正式明細は月次の「支給項目」入力から別途</b>作成されます。日別入力は概算専用で、月次に自動集計されません。</div>';
      totHtml='<div class="dl-tot" style="font-weight:700">締め方＝'+esc(mLabel)+'（'+periods.length+'期間・期間ごとに報酬明細）</div>'+perRows+warn;
      header='日別（締め方＝期間ごとに集計）'; help='shime';
      note='その日の 日付・（労働時数）・支給額 を入れると、締め方に合わせて<b>期間ごとの報酬明細</b>に自動で振り分きます。'+(contractor?'業務委託＝控除なし。':'');
    } else {
      var dv=buildDailyData(e);
      totHtml=dv?('<div class="dl-tot">合計 '+(dv.count)+'日 ・ '+esc(dv.totalMinLabel)+' ・ '+yen(dv.totalAmount)+(dv.tax!=null?'（所得税 '+esc(dv.taxLabel||'日額表')+' '+yen(dv.tax)+'）':'')+'</div>'):'';
      header='日別（'+(cyc==='weekly'?'週払い':'日払い')+'）'; help='daily';
      note='その日の 日付・労働時数（時:分）・支給額 を入れると、日払い/週払いの明細に日別で出ます。所得税は税区分（甲=扶養反映／乙／丙=日雇い）ごとに<b>日額表</b>で日ごとに計算します。';
    }
    return '<div class="grp"><div class="grp-h">'+header+'<span class="help-i" data-help="'+help+'">💡</span></div>'
      +'<div class="wi-note2">'+note+'</div>'
      +'<div class="dl-head"><span>日付</span><span>労働時数</span><span>支給額</span><span></span></div>'
      +rows+totHtml
      +'<div class="addcustom"><button class="btn-ghost" data-dladd="'+i+'" style="padding:8px 12px">＋日を追加</button></div></div>';
  }
  // 賞与明細用: 月次明細と同じテンプレ/テーマ(ユーザー選択)で 勤怠なし・支給=賞与/控除=賞与社保+源泉
  function bonusMonthLabel(){ var ym=bonusYmOf(); var y=Number(ym.slice(0,4)), m=Number(ym.slice(5,7)); var k=['','一','二','三','四','五','六','七','八','九','十','十一','十二']; return '令 和 '+(y-2018)+' 年 '+(k[m]||m)+' 月 賞 与'; }
  function buildBonusPeople(emps){ return emps.map(function(e){ var c=computeBonus(e);
    var shikyu=[{label:'賞与',value:c.bonus}]; (c.addShikyu||[]).forEach(function(it){ shikyu.push({label:it.label||'追加支給',value:it.value}); }); // 賞与+追加支給
    var kojo=[{label:'健康保険',value:c.si.health}]; if(c.si.kaigo>0) kojo.push({label:'介護保険',value:c.si.kaigo}); kojo.push({label:'厚生年金',value:c.si.pension}); kojo.push({label:'雇用保険',value:c.si.employ}); kojo.push({label:'源泉所得税',value:c.taxAmt});
    (c.addKojo||[]).forEach(function(it){ kojo.push({label:it.label||'控除',value:it.value}); }); // 任意控除
    return { name:e.name, company:state.company.name, payDate:(state.bonus&&state.bonus.payDay)||payDateStr(), kintai:[], shikyu:shikyu, kojo:kojo, net:c.net, shikyuTotal:c.totalGross, kojoTotal:c.si.total+c.taxAmt+c.addKojoTotal }; }); }
  // 明細デザイン(レイアウト+色)＝設定タブに表示。自動は廃止(全員ページ分割で対応)
  // テンプレの種類(縦並び/2カラム/横ストリップ)。複数人は自動でページ分割
  var TPL_OPTS=[
    ['col2_1','2カラム（1人）','tpl_cols','支給と控除を横に・大きく（A4たて）',0],
    ['col2_2','2カラム（2人）','tpl_cols2','支給と控除を横に・1枚に2人（A4たて）',0],
    ['col2_3','2カラム（3人）','tpl_cols3','横向きに3人・支給と控除を横に（A4よこ）',1],
    ['col1_1','1カラム（1人）','tpl_vstack','支給の下に控除・大きく（A4たて）',0],
    ['col1_2','1カラム（2人）','tpl_vstack2','支給の下に控除・1枚に2人（A4たて）',0],
    ['col1_3','1カラム（3人）','tpl_strips','横向きに3人・支給の下に控除（A4よこ）',1]
  ];
  function renderDesign(){
    // 色(上)
    var cp=$('#color-pickers'); if(cp){
      var bar=COLOR_TARGETS.map(function(t){ var cur=state.theme[t[0]]||''; var op=state._oc===t[0]; return '<button class="cp-toggle'+(op?' open':'')+'" data-cpk="'+t[0]+'"><span class="cp-cur" style="background:'+cur+'"></span>'+t[1]+'<span class="cp-cv">▾</span></button>'; }).join('');
      var pal=''; if(state._oc){ var cur2=state.theme[state._oc]||''; pal='<div class="cp-sw">'+PALETTE.map(function(col){ var on=cur2.toLowerCase()===col.toLowerCase(); return '<span class="cw'+(on?' on':'')+'" data-ck="'+state._oc+'" data-col="'+col+'" title="'+col+'" style="background:'+col+'"></span>'; }).join('')+'</div>'; }
      // 配色プリセット行(一括切替・現在themeと3色一致でON)
      var th=state.theme||{};
      var preset='<div class="cp-preset">'+THEME_PRESETS.map(function(p,i){ var on=(String(th.accent).toLowerCase()===p.accent.toLowerCase()&&String(th.line).toLowerCase()===p.line.toLowerCase()&&String(th.ink).toLowerCase()===p.ink.toLowerCase());
        return '<button type="button" class="cp-ps'+(on?' on':'')+'" data-preset="'+i+'"><span class="cp-ps-sw"><span style="background:'+p.accent+'"></span><span style="background:'+p.line+'"></span><span style="background:'+p.ink+'"></span></span>'+p.name+'</button>'; }).join('')+'</div>';
      cp.innerHTML='<div class="cp-lb">配色プリセット</div>'+preset+'<div class="cp-lb" style="margin-top:10px">色を個別に微調整</div><div class="cp-bar">'+bar+'<button class="cp-toggle cp-reset" data-reset="1">↺ 初期に戻す</button></div>'+pal;
    }
    // テンプレの種類ギャラリー(横ストリップは横長カード=full幅)
    var tr=$('#tpl-row'); if(tr){ tr.innerHTML=TPL_OPTS.map(function(t){ var on=(state.prefer||'col2_1')===t[0];
      return '<button type="button" class="tpl-card'+(on?' on':'')+(t[4]?' land':'')+'" data-tpl="'+t[0]+'"><span class="tpl-badge">✓</span><img class="tpl-thumb" src="img/'+t[2]+'.png" alt="'+t[1]+'"><div class="tpl-meta"><div class="tpl-name">'+t[1]+'</div><div class="tpl-desc">'+t[3]+'</div></div></button>'; }).join(''); }
  }
  // 印刷: 賞与モードは「月で選ぶ」を隠し、賞与月(入力▸賞与で設定)を表示=二重管理しない(P1-19)
  function updatePrintMonthUI(){
    var isBonus=state.printMode==='bonus';
    var w=$('#p-month-wrap'), bn=$('#p-bonus-note'), bl=$('#p-bonus-label');
    if(w) w.style.display=isBonus?'none':'';
    if(bn) bn.style.display=isBonus?'':'none';
    if(bl&&isBonus){ var ym=bonusYmOf(); bl.textContent=(ym?bonusMonthLabel().replace(/ /g,''):'未設定')+'（入力 ▸ 賞与 で設定）'; }
  }
  // 日払い/週払いスリップの 1カラム/2カラム 切替UI(週払いのみ=2カラムが意味を持つ)
  function updateDailyLayoutUI(){
    var row=$('#daily-layout-row'); if(!row) return;
    var cyc=(state.company&&state.company.payCycle)||'monthly';
    var show=(state.printMode||'monthly')!=='bonus' && cyc==='weekly';
    row.style.display=show?'':'none';
    if(show) $$('.dls').forEach(function(x){ x.classList.toggle('on', x.dataset.dls===(state.dailySlipLayout||'1col')); });
  }
  function renderPrint(){
    $('#p-month').value=state.month;
    $$('.pmode').forEach(function(x){ x.classList.toggle('on', x.dataset.pmode===(state.printMode||'monthly')); });
    updatePrintMonthUI();
    updateDailyLayoutUI();
    var sel=$('#p-emp'); sel.innerHTML='<option value="__all">全員</option>'+state.employees.map(function(e,i){return isActiveInMonth(e,state.month)?'<option value="'+i+'">'+esc(e.name)+'</option>':'';}).join('');
    renderWebMeisai();
    renderFuri();
    doPreview();
  }
  // ── 総合振込データ(全銀ファイル + 振込一覧Excel) ──
  function buildTransfers(){
    return state.employees.filter(function(e){ return isActiveInMonth(e,state.month) && !e.retired; }).map(function(e){
      var net=0; try{ net=compute(e).net; }catch(_){}
      var ready=!!(String(e.furiBankNo||'').trim() && String(e.furiBranchNo||'').trim() && String(e.furiAccount||'').trim() && net>0);
      return { emp:e, name:(e.furiKana||e.name), bankNo:e.furiBankNo, bankName:e.furiBankName, branchNo:e.furiBranchNo, branchName:e.furiBranchName, yokin:e.furiYokin, account:e.furiAccount, amount:net, ready:ready };
    });
  }
  function renderFuri(){
    var box=$('#furi-box'); if(!box) return;
    if((state.printMode||'monthly')==='bonus'){ box.innerHTML='<p class="hint" style="margin:0">総合振込データは「月次給与」で作成します。</p>'; return; }
    var c=state.company, tr=buildTransfers();
    var ready=tr.filter(function(t){return t.ready;}), notReady=tr.filter(function(t){return !t.ready && t.amount>0;});
    function fi(k,ph,extra){ return '<input class="finput" data-fc="'+k+'" value="'+attr(c[k])+'" placeholder="'+ph+'" '+(extra||'')+'>'; }
    var committer='<div class="sec-lb" style="margin-top:0">委託者情報（自社・銀行から通知される値）</div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">委託者コード<span class="hint2">10桁</span></div>'+fi('furiCode','0000000000','inputmode="numeric" maxlength="10"')+'</div>'
        +'<div class="frow"><div class="flabel">委託者名（半角ｶﾅ）</div>'+fi('furiName','ｶ)ｾﾞﾛｱｸﾄ','maxlength="40"')+'</div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">自社 銀行名</div>'+fi('furiBankName','ﾐｽﾞﾎ')+'</div>'
        +'<div class="frow"><div class="flabel">銀行コード<span class="hint2">4桁</span></div>'+fi('furiBankNo','0001','inputmode="numeric" maxlength="4"')+'</div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">支店名</div>'+fi('furiBranchName','ﾎﾝﾃﾝ')+'</div>'
        +'<div class="frow"><div class="flabel">支店コード<span class="hint2">3桁</span></div>'+fi('furiBranchNo','001','inputmode="numeric" maxlength="3"')+'</div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">科目</div><select class="finput" data-fc="furiYokin"><option'+((c.furiYokin==='普通'||!c.furiYokin)?' selected':'')+'>普通</option><option'+(c.furiYokin==='当座'?' selected':'')+'>当座</option></select></div>'
        +'<div class="frow"><div class="flabel">口座番号<span class="hint2">7桁</span></div>'+fi('furiAccount','1234567','inputmode="numeric" maxlength="7"')+'</div></div>'
      +'<div class="frow"><div class="flabel">振込指定日</div><input class="finput" type="date" data-fc="furiDate" value="'+attr(c.furiDate)+'"></div>';
    var listHTML='<div class="sec-lb">振込対象（'+esc(state.month)+'・差引支給額）</div>';
    if(!tr.length){ listHTML+='<p class="hint" style="margin:0">対象月に在籍する従業員がいません。</p>'; }
    else {
      listHTML+='<div style="font-size:12.5px">'+ready.map(function(t){ return '<div class="dl"><span>'+esc(t.emp.name)+'（'+esc(t.bankName||'')+' '+esc(t.branchName||'')+' '+esc(t.account||'')+'）</span><span class="v">'+yen(t.amount)+'</span></div>'; }).join('')+'</div>';
      if(notReady.length) listHTML+='<div class="cr-warn" style="margin:8px 0 0">⚠ '+notReady.map(function(t){return esc(t.emp.name);}).join('・')+' は振込先(銀行/支店/口座)が未入力のため全銀ファイルから除外。設定 ▸ 従業員マスタ ▸ 総合振込データ用 で入力してください（振込一覧Excelには載ります）。</div>';
    }
    var total=ready.reduce(function(a,t){return a+t.amount;},0);
    var btns='<div class="btn-row" style="margin-top:10px"><button class="btn-primary" id="b-zengin"'+(ready.length?'':' disabled')+'>全銀ファイル（'+ready.length+'件 '+yen(total)+'）</button><button class="btn-ghost" id="b-furixlsx">振込一覧Excel</button></div>'
      +'<p class="hint" style="margin:6px 0 0">全銀ファイル=銀行の「総合振込」に取り込む固定長データ（Shift-JIS）。銀行/支店コードは通帳や銀行サイトで確認してください。</p>';
    box.innerHTML=committer+listHTML+btns;
  }
  function dlBytes(bytes, filename, type){ try{ var blob=new Blob([bytes],{type:type||'application/octet-stream'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(url); if(a.parentNode)a.parentNode.removeChild(a); },200); }catch(e){ uiAlert('ダウンロードに失敗しました'); } }
  function downloadZengin(){
    if(typeof Zengin==='undefined'){ uiAlert('全銀モジュールが読み込まれていません'); return; }
    var c=state.company; var d=(c.furiDate&&/^\d{4}-\d{2}-\d{2}$/.test(c.furiDate))?c.furiDate.slice(5,7)+c.furiDate.slice(8,10):'';
    var committer={ code:c.furiCode, name:c.furiName, torikumiMMDD:d, bankNo:c.furiBankNo, bankName:c.furiBankName, branchNo:c.furiBranchNo, branchName:c.furiBranchName, yokin:c.furiYokin, account:c.furiAccount };
    var tr=buildTransfers().filter(function(t){return t.ready;});
    if(!tr.length){ uiAlert('振込対象がありません。従業員マスタの「総合振込データ用」に銀行/支店/口座を入力してください。'); return; }
    var r=Zengin.build(committer, tr);
    dlBytes(r.bytes, 'furikomi_'+state.month+'.txt', 'text/plain');
    toast('全銀ファイルを作成しました（'+r.count+'件・'+yen(r.total)+'）');
  }
  function downloadFuriExcel(){
    if(typeof PayslipXlsx==='undefined'||!PayslipXlsx.downloadSheets){ uiAlert('Excelモジュールが読み込まれていません'); return; }
    var tr=buildTransfers().filter(function(t){return t.amount>0;});
    if(!tr.length){ uiAlert('対象がありません。'); return; }
    var aoa=[['氏名','受取人名(ｶﾅ)','銀行名','銀行コード','支店名','支店コード','科目','口座番号','差引支給額']];
    tr.forEach(function(t){ aoa.push([t.emp.name, t.name, t.bankName||'', t.bankNo||'', t.branchName||'', t.branchNo||'', t.yokin||'', t.account||'', t.amount]); });
    aoa.push(['合計','','','','','','','', tr.reduce(function(a,t){return a+t.amount;},0)]);
    PayslipXlsx.downloadSheets([{ name:'振込一覧', aoa:aoa, cols:[{wch:14},{wch:16},{wch:12},{wch:10},{wch:12},{wch:10},{wch:6},{wch:12},{wch:12}] }], { filename:'振込一覧_'+state.month+'.xlsx' });
  }
  // プレビューiframeの高さを「ページ数×1ページ高」にする=複数人/複数期間が全員見える(1ページ固定で2人目以降が隠れる問題の修正)。
  //  ★PDF本体(b-print)は各.sheetを個別に焼くので不変=ここはプレビュー表示専用。dataset.pwは向き判定用に維持。
  function fitFrameToPages(fr, pageW, pageH){
    fr.style.width=pageW+'px'; fr.style.transformOrigin='top left'; fr.dataset.pw=pageW; fr.dataset.ph=pageH;
    function apply(){ var n=1;
      try{ var idoc=fr.contentDocument; var pages=idoc?idoc.querySelectorAll('.sheet,.page'):null; n=(pages&&pages.length)||1; }catch(e){}
      var total=n*pageH; fr.style.height=total+'px'; fr.dataset.ph=total; fitPreview(); }
    fr.onload=apply; setTimeout(apply, 80); // srcdoc読込後に測る(onload未発火の保険にsetTimeoutも)
  }
  function doPreview(){
    var v=$('#p-emp').value; var emps=v==='__all'?state.employees.filter(function(e){return isActiveInMonth(e,state.month);}):[state.employees[+v]];
    var isBonus=state.printMode==='bonus';
    var cyc=(state.company&&state.company.payCycle)||'monthly';
    if(!isBonus && (cyc==='daily'||cyc==='weekly')){ // 日払い/週払い=スリップ明細(日別)。全員選択なら全員分を並べる(M2修正)
      var ddList=emps.map(function(e){ return buildDailyData(e); }).filter(function(d){ return d && d.days && d.days.length; }); var fr=$('#frame');
      fr.srcdoc=dailySlipDoc(ddList, state.dailySlipLayout||'1col');
      fitFrameToPages(fr, 794, 1123); return; // 全員分のページを表示
    }
    if(!isBonus && shimeSplit()){ // K2 締め方=期間分割。期間×従業員 の報酬明細を並べる(期間の若い順→従業員順)
      var periods=shimePeriods(), pList=[];
      periods.forEach(function(p){ emps.forEach(function(e){ var d=buildDailyData(e, p); if(d && d.days && d.days.length) pList.push(d); }); });
      var frp=$('#frame');
      frp.srcdoc=dailySlipDoc(pList, state.dailySlipLayout||'1col');
      fitFrameToPages(frp, 794, 1123); return; // 全期間×全員のページを表示
    }
    var people=isBonus?buildBonusPeople(emps):buildPeople(emps);
    var doc=isBonus?{month:bonusMonthLabel(),kind:'bonus'}:{month:monthLabel()};
    // ★1人だけの時は必ず1人用・縦向き(全幅)で。会社の複数人テンプレ(例:col1_3=3人横)のままだと1人が横幅の1/3しか
    //   埋めず両側が白(縮んで見える)ため。複数人の時は会社が選んだテンプレ(state.prefer)を使う。
    var prefer=(people.length===1)?'col2_1':state.prefer;
    var out=Render.build(people, doc, prefer, state.theme);
    var f=$('#frame'); f.srcdoc=out.html;
    var pw=out.orientation==='landscape'?1123:794, ph=out.orientation==='landscape'?794:1123;
    fitFrameToPages(f, pw, ph); // 複数人=複数ページを全員表示(1ページ固定で2人目以降が隠れる問題の修正)
  }
  // A4プレビューを親幅にフィット(モバイル回転/リサイズで再計算)
  function fitPreview(){
    var f=$('#frame'), wrap=$('.preview-wrap'); if(!f||!wrap||!f.dataset.pw) return;
    var pw=+f.dataset.pw, ph=+f.dataset.ph, s=Math.min(1,(wrap.clientWidth-32)/pw);
    f.style.transform='scale('+s+')';
    f.style.marginRight=(-(pw*(1-s)))+'px'; f.style.marginBottom=(-(ph*(1-s)))+'px';
  }

  /* ---------- events ---------- */
  function bind(){
    $$('.bn').forEach(function(b){ b.addEventListener('click',function(){ showScreen(b.dataset.scr); }); });
    // 💡 ヘルプ（全画面共通）
    document.addEventListener('click',function(e){ var hi=e.target.closest('.help-i'); if(hi){ openHelp(hi.dataset.help); return; } if(e.target.closest('[data-taishoku-calc]')){ openTaishokuCalc(null); return; } if(e.target.closest('[data-onboard-close]')){ state.onboardDone=true; renderOnboard(); if(window.persistSaveDebounced)persistSaveDebounced(); return; }
      var gob=e.target.closest('[data-onboard-goto]'); if(gob){ var g=gob.dataset.onboardGoto; // はじめかたガイド: 未完ステップ→その画面へジャンプ
        if(g==='company'||g==='emp'){ showScreen('scr-settings'); var b=$('#set-seg .seg-b[data-set="'+g+'"]'); if(b)b.click(); }
        else if(g==='input'){ showScreen('scr-input'); } else if(g==='print'){ showScreen('scr-print'); }
        return; }
      if(e.target.closest('[data-goto-empmaster]')){ showScreen('scr-settings'); var eb=$('#set-seg .seg-b[data-set="emp"]'); if(eb)eb.click(); return; } // 空状態CTA→従業員マスタ
      var fe=e.target.closest('[data-fix-emp]'); if(fe){ var fi=+fe.dataset.fixEmp; var femp=state.employees[fi]; if(femp){ state.open[femp.id]=true; showScreen('scr-settings'); var eb2=$('#set-seg .seg-b[data-set="emp"]'); if(eb2)eb2.click(); renderEmpMaster(); setTimeout(function(){ var c=$('#emp-list .mco[data-i="'+fi+'"]'); if(c)c.scrollIntoView({block:'center'}); },30); } return; } // 警告→該当従業員のマスタを開く(UX#10)
      var gs=e.target.closest('[data-scr]'); if(gs && !gs.classList.contains('bn')){ showScreen(gs.dataset.scr); return; } }); // CTA等 ナビ外の画面遷移
    $('#help-x').addEventListener('click',function(){ $('#help-ov').classList.remove('on'); });
    $('#help-ov').addEventListener('click',function(e){ if(e.target===this) this.classList.remove('on'); });
    document.addEventListener('change',function(ev){ if(!ev.target.classList.contains('scr-month'))return; state.month=ev.target.value||state.month; state._prevYm=null; state._bonusPrevYm=null; state._bonusYtdYm=null; /* 月替わりで前月比/賞与前月キャッシュを更新 */ $$('.scr-month').forEach(function(m){ m.value=state.month; }); updatePaydayPreview();
      if($('#scr-input').classList.contains('active')){$('#in-month').textContent=monthLabel();renderInputArea();}
      if($('#scr-list').classList.contains('active')) renderListActive();
      if($('#scr-print').classList.contains('active')) doPreview(); }); // 印刷の月も対象月に統合(P1-18)

    // 入力タブ: 月次給与/賞与 モード切替
    var inScr=$('#scr-input');
    function bonusEmpOf(el){ var id=el.dataset.ba||el.dataset.bp||el.dataset.by; return (state.employees||[]).find(function(x){return x.id===id;}); }
    function bonusById(id){ return (state.employees||[]).find(function(x){return x.id===id;}); }
    // "eid:idx"を解析→対象の追加支給/控除エントリを返す。arr='addShikyu'|'addKojo'
    function bxParse(v, arr){ if(!v)return null; var p=String(v).split(':'); var e=bonusById(p[0]); if(!e)return null; return { en:bonusEntry(e), idx:+p[1], arr:bonusEntry(e)[arr] }; }
    if(inScr){
      inScr.addEventListener('click',function(ev){
        if(ev.target.closest('[data-confirm-bonus]')){ try{ saveBonusPayslips(); }catch(_){} persistSave();
          publishMeisaiNow(true,{silent:true}).then(function(n){ toast('賞与を確定しました（年調・台帳に反映'+(n?'・従業員のWeb明細に公開）':'）')); }, function(){ toast('賞与を確定しました（年調・台帳に反映）'); }); return; }
        if(ev.target.closest('[data-bonus-harau]')){ try{ downloadBonusHarau(); }catch(_){} return; } // 賞与支払届 Excel出力
        var addS=ev.target.closest('[data-bsadd]'); if(addS){ var es=bonusById(addS.dataset.bsadd); if(es){ var i1=inScr.querySelector('[data-bsaddl="'+addS.dataset.bsadd+'"]'); var l1=(i1&&i1.value||'').trim()||'特別賞与'; bonusEntry(es).addShikyu.push({label:l1,value:'',hikazei:false}); renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); } return; }
        var addK=ev.target.closest('[data-bkadd]'); if(addK){ var ek=bonusById(addK.dataset.bkadd); if(ek){ var i2=inScr.querySelector('[data-bkaddl="'+addK.dataset.bkadd+'"]'); var l2=(i2&&i2.value||'').trim()||'控除'; bonusEntry(ek).addKojo.push({label:l2,value:''}); renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); } return; }
        var dS=ev.target.closest('[data-bsx]'); if(dS){ var rS=bxParse(dS.dataset.bsx,'addShikyu'); if(rS){ rS.arr.splice(rS.idx,1); renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); } return; }
        var dK=ev.target.closest('[data-bkx]'); if(dK){ var rK=bxParse(dK.dataset.bkx,'addKojo'); if(rK){ rK.arr.splice(rK.idx,1); renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); } return; }
        var m=ev.target.closest('.imode'); if(!m)return; state.inputMode=m.dataset.imode==='bonus'?'bonus':'monthly'; renderInputArea(); if(window.persistSaveDebounced)persistSaveDebounced(); });
      // 入力中は値を保存のみ(再描画しない=フォーカス維持)。結果はblur(change)で更新。
      inScr.addEventListener('input',function(ev){
        var bsl=ev.target.closest('[data-bsl]'), bsv=ev.target.closest('[data-bsv]'), bkl=ev.target.closest('[data-bkl]'), bkv=ev.target.closest('[data-bkv]');
        if(bsl||bsv||bkl||bkv){ var t=bsl||bsv||bkl||bkv, isS=!!(bsl||bsv), isLbl=!!(bsl||bkl); var r=bxParse(t.dataset[bsl?'bsl':bsv?'bsv':bkl?'bkl':'bkv'], isS?'addShikyu':'addKojo'); if(r&&r.arr[r.idx]){ if(isLbl) r.arr[r.idx].label=t.value; else r.arr[r.idx].value=t.value.replace(/[^0-9]/g,''); } if(window.persistSaveDebounced)persistSaveDebounced(); return; }
        var ba=ev.target.closest('[data-ba]'), bp=ev.target.closest('[data-bp]'), by=ev.target.closest('[data-by]'); if(!ba&&!bp&&!by)return;
        var e=bonusEmpOf(ba||bp||by); if(!e)return; var en=bonusEntry(e);
        if(ba) en.amount=ba.value.replace(/[^0-9]/g,''); else if(bp) en.prevAfter=bp.value.replace(/[^0-9]/g,''); else en.ytd=by.value.replace(/[^0-9]/g,'');
        if(window.persistSaveDebounced)persistSaveDebounced(); });
      inScr.addEventListener('change',function(ev){
        var bsh=ev.target.closest('[data-bsh]'); if(bsh){ var rh=bxParse(bsh.dataset.bsh,'addShikyu'); if(rh&&rh.arr[rh.idx]) rh.arr[rh.idx].hikazei=bsh.checked; renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); return; }
        if(ev.target.closest('[data-bsl],[data-bsv],[data-bkl],[data-bkv]')){ renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); return; } // 追加項目のblur=再描画(整形)
        var bn=ev.target.closest('[data-bn]');
        if(bn){ if(!state.bonus)state.bonus={byEmp:{}}; if(bn.dataset.bn==='payYm'){ state.bonus.payYm=bn.value; state._bonusPrevYm=null; state._bonusYtdYm=null; } else { state.bonus.payDay=bn.value; } renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); return; }
        var ba=ev.target.closest('[data-ba]'), bp=ev.target.closest('[data-bp]'), by=ev.target.closest('[data-by]');
        if(ba||bp||by){ var e=bonusEmpOf(ba||bp||by); if(e){ var en=bonusEntry(e); if(ba) en.amount=ba.value.replace(/[^0-9]/g,''); else if(bp) en.prevAfter=bp.value.replace(/[^0-9]/g,''); else en.ytd=by.value.replace(/[^0-9]/g,''); } renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); }
      });
    }

    // 設定 seg
    $('#set-seg').addEventListener('click',function(ev){ var b=ev.target.closest('.seg-b'); if(!b)return; $$('.seg-b',this).forEach(function(x){x.classList.toggle('on',x===b);}); var s=b.dataset.set;
      $('#set-company').style.display=s==='company'?'':'none'; $('#set-emp').style.display=s==='emp'?'':'none'; $('#set-design').style.display=s==='design'?'':'none';
      if(s==='emp'){ renderEmpMaster(); loadEmpProfiles(); } if(s==='design')renderDesign(); });
    // 従業員マスタ：絞り込み(在籍中/休暇中/退職者/全員)
    $('#emp-list').addEventListener('click',function(ev){ var f=ev.target.closest('[data-empfilter]'); if(!f)return; state.empFilter=f.dataset.empfilter; renderEmpMaster(); });
    ['name','addr','close'].forEach(function(k){ var el=$('#c-'+k); if(el) el.addEventListener('input',function(){ state.company[k]=this.value; }); });
    var pr=$('#c-payrel'); if(pr) pr.addEventListener('change',function(){ state.company.paydayRel=this.value; updatePaydayPreview(); });
    var pd=$('#c-payday-day'); if(pd) pd.addEventListener('input',function(){ state.company.paydayDay=this.value.replace(/[^0-9末]/g,''); updatePaydayPreview(); });
    var pcy=$('#c-paycycle'); if(pcy) pcy.addEventListener('change',function(){ state.company.payCycle=this.value; payCycleNote(); if(window.persistSaveDebounced)persistSaveDebounced(); });
    var shm=$('#c-shime'); if(shm) shm.addEventListener('change',function(){ state.company.shimeMethod=this.value; shimeNote(); if(state.employees)renderInput(); if(window.persistSaveDebounced)persistSaveDebounced(); });
    var shn=$('#c-shimen'); if(shn) shn.addEventListener('input',function(){ state.company.shimeN=this.value; shimeNote(); if(state.employees)renderInput(); if(window.persistSaveDebounced)persistSaveDebounced(); });
    // 会社の決まり：項目チップ
    $('#rule-chips').addEventListener('click',function(ev){
      var ch=ev.target.closest('[data-rule]'); if(ch){ var k=ch.dataset.rule; if(!state.company.ruleOn)state.company.ruleOn={}; state.company.ruleOn[k]=!state.company.ruleOn[k]; renderRuleChips(); renderCompanyRules(); return; }
    });
    // 会社の決まり：曜日・外す・数値
    var rh=$('#rule-host');
    rh.addEventListener('click',function(ev){
      var rt=ev.target.closest('[data-rule-toggle]'); if(rt && !ev.target.closest('.help-i')){ if(!state._ruleOpen)state._ruleOpen={}; var rk=rt.dataset.ruleToggle; state._ruleOpen[rk]=!state._ruleOpen[rk]; renderCompanyRules(); return; } // 折りたたみ開閉(💡は除く)
      var wd=ev.target.closest('.wday'); if(wd){ var i=+wd.dataset.wd; var hs=state.company.holidays||[]; var p=hs.indexOf(i); if(p>=0)hs.splice(p,1); else hs.push(i); state.company.holidays=hs; renderCompanyRules(); return; }
      if(ev.target.closest('[data-coh-add]')){ state.company.companyHolidays=(state.company.companyHolidays||[]); state.company.companyHolidays.push(''); renderCompanyRules(); return; }
      var cd=ev.target.closest('[data-coh-del]'); if(cd){ (state.company.companyHolidays||[]).splice(+cd.dataset.cohDel,1); renderCompanyRules(); return; }
      var x=ev.target.closest('[data-rule-x]'); if(x){ state.company.ruleOn[x.dataset.ruleX]=false; renderRuleChips(); renderCompanyRules(); return; }
    });
    rh.addEventListener('input',function(ev){ if(ev.target.tagName==='SELECT'||ev.target.type==='checkbox')return; var f=ev.target.dataset.cf; if(f) state.company[f]=ev.target.value.replace(/[^0-9]/g,''); });
    rh.addEventListener('change',function(ev){ if(ev.target.dataset.coh!=null){ state.company.companyHolidays=(state.company.companyHolidays||[]); state.company.companyHolidays[+ev.target.dataset.coh]=ev.target.value; return; } var f=ev.target.dataset.cf; if(f==='gyoshu'){ state.company.gyoshu=ev.target.value; return; } if(f==='shahoTiming'){ state.company.shahoTiming=ev.target.value; return; } if(f==='paymentDaysMethod'){ state.company.paymentDaysMethod=ev.target.value; return; } if(f==='kekkinMethod'){ state.company.kekkinMethod=ev.target.value; return; } if(f==='kanzenGekkyu'){ state.company.kanzenGekkyu=ev.target.checked; renderCompanyRules(); return; } if(f==='daikyuDeduct'){ state.company.daikyuDeduct=ev.target.checked; return; } if(f==='shakaTokutei'){ state.company.shakaTokutei=ev.target.checked; return; } if(f==='annualHolidays'||f==='dailyWorkH'||f==='dailyWorkM'||f==='rateOt'||f==='rateHoliday'||f==='rateNight'||f==='rateOver60') renderCompanyRules(); }); // 年間労働時間(32条)/割増率(37条)の黄警告をライブ更新
    $('#b-add-emp').addEventListener('click',function(){ var e=defEmp('従業員 '+(state.employees.length+1)); state.employees.push(e); state.open[e.id]=true; if($('#emp-search'))$('#emp-search').value=''; renderEmpMaster(); });
    (function(){ var es=$('#emp-search'); if(es) es.addEventListener('input', filterEmpSearch); })(); // 氏名検索(UX#9)

    // 従業員マスタ操作
    var el=$('#emp-list');
    el.addEventListener('click',function(ev){
      if(ev.target.dataset.showret){ state.showRetired=!state.showRetired; renderEmpMaster(); return; }
      var dtg=ev.target.closest('[data-dtoggle]'); if(dtg){ var de=state.employees[+dtg.dataset.dtoggle]; state.open['D'+de.id]=!state.open['D'+de.id]; renderEmpMaster(); return; } // 詳細設定の開閉
      var dsb=ev.target.closest('[data-dsub]'); if(dsb){ var pp=String(dsb.dataset.dsub).split(':'); var dse=state.employees[+pp[0]]; if(dse){ var kk='DS'+dse.id+pp[1]; state.open[kk]=!state.open[kk]; renderEmpMaster(); } return; } // 詳細のサブ折畳
      var mu=ev.target.closest('[data-moveup]'); if(mu){ moveEmp(+mu.dataset.moveup,-1); return; }
      var md=ev.target.closest('[data-movedn]'); if(md){ moveEmp(+md.dataset.movedn,1); return; }
      if(ev.target.dataset.goleave!=null){ var gl=+ev.target.dataset.goleave; var ge=state.employees[gl]; state.open[ge.id]=true; state.open['D'+ge.id]=true; renderEmpMaster(); return; } // カードの詳細(就業状況)を開く=1経路に集約
      if(ev.target.dataset.goretire!=null){ var gr=+ev.target.dataset.goretire; if(activeEmps().length<=1){ uiAlert('稼働中は最低1名必要です'); return; } uiConfirm((state.employees[gr].name||'この従業員')+' を退職にします。給与計算・印刷の対象から外れます（データは残ります）。').then(function(ok){ if(!ok)return; state.employees[gr].retired=true; state.employees[gr].retiredYmd=state.month; renderEmpMaster(); }); return; }
      var pdl=ev.target.closest('[data-patdel]'); if(pdl){ var pdid=pdl.dataset.patdel; uiConfirm('この給与パターンを削除しますか？（適用済みの従業員の設定は変わりません）').then(function(ok){ if(!ok)return; state.payPatterns=(state.payPatterns||[]).filter(function(x){return x.id!==pdid;}); renderEmpMaster(); if(window.persistSaveDebounced)persistSaveDebounced(); }); return; } // パターン削除
      if(ev.target.closest('.pat-bulk')){ openBulkPatternApply(); return; } // 給与パターンを複数人へ一括適用
      var pim=ev.target.closest('[data-profimport]'); if(pim){ if(importEmpProfile(pim.dataset.profimport)){ renderEmpMaster(); if(window.persistSaveDebounced)persistSaveDebounced(); toast('振込先を取り込みました'); } return; } // 本人の振込先を取り込む
      if(ev.target.closest('[data-profimportall]')){ var did=false; pendingProfileEmps().slice().forEach(function(e){ if(importEmpProfile(e.id)) did=true; }); if(did){ renderEmpMaster(); if(window.persistSaveDebounced)persistSaveDebounced(); toast('全員の振込先を取り込みました'); } return; } // 全員の振込先を取り込む
      var card=ev.target.closest('.mco');
      var tg=ev.target.closest('[data-toggle]');
      if(tg){ var ti=+tg.dataset.toggle; var e=state.employees[ti]; state.open[e.id]=!state.open[e.id]; renderEmpMaster(); return; }
      if(!card) return; var i=+card.dataset.i; var emp=state.employees[i];
      var shd=ev.target.closest('[data-shd]'); if(shd){ if(!state.open)state.open={}; var kk='SHD'+emp.id; state.open[kk]=!state.open[kk]; renderEmpMaster(); return; } // 社保「詳しく」開閉
      var sm=ev.target.closest('.sh-mode'); if(sm){ if(!emp.shaho)emp.shaho={months:[]}; emp.shaho.mode=sm.dataset.mode; if(sm.dataset.mode==='auto'&&state.open){ delete state.open['SHD'+emp.id]; } /* 自動選択で「詳しく」を畳む */ if(sm.dataset.mode==='teiji'){ autoFillTeijiMonths(emp, renderEmpMaster); } else { renderEmpMaster(); } return; }
      if(ev.target.dataset.refetch){ autoFillTeijiMonths(emp, renderEmpMaster); return; }
      if(ev.target.dataset.apply){ var ak=ev.target.dataset.apply; if(!emp.apply)emp.apply={}; emp.apply[ak]=(emp.apply[ak]===false)?true:false; renderEmpMaster(); return; }
      if(ev.target.dataset.sttype!=null){ emp.shortTimeType=ev.target.dataset.sttype; delete emp.shortTime; renderEmpMaster(); return; } // 勤務区分(通常/パート/短時間労働者)
      var shfx=ev.target.closest('[data-shfixed]'); if(shfx){ if(!emp.shaho)emp.shaho={months:[]}; emp.shaho.fixedChanged=(shfx.dataset.v==='1'); renderEmpMaster(); return; } // 固定給変動 はい/いいえ
      if(ev.target.dataset.rtik){ emp.residentTaxIkkatsu=!emp.residentTaxIkkatsu; renderEmpMaster(); return; }
      if(ev.target.dataset.taxc){ emp.taxClass=ev.target.dataset.taxc; renderEmpMaster(); return; }
      if(ev.target.dataset.emptype){ emp.employmentType=ev.target.dataset.emptype; renderEmpMaster(); return; } // 雇用形態(従業員/業務委託)。控除はcalc.jsが単一ソースで判定=applyは不変(戻すと回帰)
      if(ev.target.dataset.jumincol){ emp.juminCollect=ev.target.dataset.jumincol; renderEmpMaster(); return; } // 住民税の徴収区分(給与支払報告書 総括表の内訳用)
      if(ev.target.dataset.honnin){ var hk=ev.target.dataset.honnin; // 本人の人的加算(甲欄+1)。寡婦↔ひとり親は排他
        if(hk==='shogai') emp.honninShogai=!emp.honninShogai;
        else if(hk==='kinrou') emp.honninKinrou=!emp.honninKinrou;
        else { emp.honninKafuHitorioya=(emp.honninKafuHitorioya===hk)?'':hk; }
        renderEmpMaster(); return; }
      if(ev.target.classList.contains('wb-chip')){ var wlab=ev.target.dataset.wb; emp.wbInclude=emp.wbInclude||[]; emp.wbExclude=emp.wbExclude||[];
        if(isInBasis(emp,wlab)){ emp.wbInclude=emp.wbInclude.filter(function(x){return x!==wlab;}); if(emp.wbExclude.indexOf(wlab)<0)emp.wbExclude.push(wlab); }
        else { emp.wbExclude=emp.wbExclude.filter(function(x){return x!==wlab;}); if(emp.wbInclude.indexOf(wlab)<0)emp.wbInclude.push(wlab); }
        renderEmpMaster(); return; }
      if(ev.target.classList.contains('chip')){ var key=ev.target.dataset.chip, lab=ev.target.dataset.lab; var arr=emp[key]; var idx=arr.findIndex(function(x){return x.label===lab;}); if(idx>=0)arr.splice(idx,1); else arr.push({label:lab,value:'0'}); renderEmpMaster(); return; }
      if(ev.target.classList.contains('ac-btn')){ var g=ev.target.dataset.g; var inp=ev.target.previousElementSibling; var val=(inp.value||'').trim(); if(val){ emp[g].push({label:val,value:'0'}); renderEmpMaster(); } return; }
      if(ev.target.classList.contains('parse-go')){ var pp=PPARSE(); var pin=ev.target.previousElementSibling; var ptxt=(pin&&pin.value||'').trim(); if(!ptxt)return; // 雑入力→解釈→数字例つき確認
        var r=pp?pp.parse(ptxt):{ok:false};
        if(!r.ok){ uiAlert('「'+ptxt+'」から給料の決め方を読み取れませんでした。\n例：時給1200 ／ 月給25万 ／ 売上の3.5割か時給1200の高い方 ／ 1件1500円'); return; }
        var body='読み取り：'+r.summary+'\n\n'+parseExampleText(r)+(r.unrecognized?'\n\n※「'+r.unrecognized+'」は読み取れませんでした（あとで手で足せます）':'');
        uiModal({ title:'この内容でいいですか？', msg:body, buttons:[{label:'キャンセル',val:false},{label:'この内容で設定',val:true,primary:true}] }).then(function(ok){ if(!ok)return; applyParse(emp,r); renderEmpMaster(); if(window.persistSaveDebounced)persistSaveDebounced(); toast('給与形態を設定しました'); });
        return; }
      if(ev.target.classList.contains('pat-save')){ uiPrompt('パターン名を入力','','例：ドライバー・事務・バイト').then(function(nm){ nm=(nm||'').trim(); if(!nm)return; if(!state.payPatterns)state.payPatterns=[]; state.payPatterns.push(makePayPattern(emp,nm)); renderEmpMaster(); if(window.persistSaveDebounced)persistSaveDebounced(); toast('パターン「'+nm+'」を保存しました'); }); return; } // 給与パターン保存
      if(ev.target.closest('[data-pradd]')){ ensurePayRule(emp).variable.parts.push({type:'hourly',amount:''}); renderEmpMaster(); return; } // カスタム給: 部品追加
      var prd=ev.target.closest('[data-prdel]'); if(prd){ ensurePayRule(emp).variable.parts.splice(+String(prd.dataset.prdel).split(':')[1],1); renderEmpMaster(); return; } // 部品削除
      var prta=ev.target.closest('[data-prtieradd]'); if(prta){ var _tp=ensurePayRule(emp).variable.parts[+String(prta.dataset.prtieradd).split(':')[1]]; if(_tp){ if(!_tp.tiers||!_tp.tiers.length)_tp.tiers=[{from:0,rate:''}]; _tp.tiers.push({from:'',rate:''}); } renderEmpMaster(); return; } // 段追加
      var prtd=ev.target.closest('[data-prtierdel]'); if(prtd){ var _pp=String(prtd.dataset.prtierdel).split(':'); var _tp2=ensurePayRule(emp).variable.parts[+_pp[1]]; if(_tp2&&_tp2.tiers)_tp2.tiers.splice(+_pp[2],1); renderEmpMaster(); return; } // 段削除
      if(ev.target.classList.contains('m-retire')){ if(!emp.retired){ uiConfirm((emp.name||'この従業員')+' を退職にします。給与計算・印刷の対象から外れます（データは残ります）。').then(function(ok){ if(!ok)return; emp.retired=true; emp.retiredYmd=state.month; state.open[emp.id]=false; renderEmpMaster(); }); } else { emp.retired=false; renderEmpMaster(); } return; }
      if(ev.target.classList.contains('m-del-emp')){ if(activeEmps().length<=1&&!emp.retired){uiAlert('稼働中は最低1名必要です');return;}
        if(window.Store&&Store.unpublishMeisai){ try{ Store.unpublishMeisai(emp.id); }catch(_){} } // 削除=Web明細リンクを失効(docsは物理削除しない・オフラインはno-op)
        state.employees.splice(i,1); renderEmpMaster(); return; }
    });
    el.addEventListener('change',function(ev){
      var card=ev.target.closest('.mco'); if(!card)return; var i=+card.dataset.i; var emp=state.employees[i];
      if(ev.target.classList.contains('sh-days')){ renderEmpMaster(); return; }
      if(ev.target.classList.contains('pat-apply')){ var pid=ev.target.value; if(!pid){ renderEmpMaster(); return; } var pat=(state.payPatterns||[]).find(function(x){return x.id===pid;}); if(pat){ uiConfirm('「'+pat.name+'」を '+(emp.name||'この従業員')+' に適用します。給与形態・決め方・支給/控除項目が置き換わります（氏名・扶養・通勤などは変わりません）。よろしいですか？').then(function(ok){ if(!ok){ renderEmpMaster(); return; } applyPayPattern(emp,pat); renderEmpMaster(); if(window.persistSaveDebounced)persistSaveDebounced(); toast('「'+pat.name+'」を適用しました'); }); } return; } // 給与パターン適用
      // カスタム給の決め方(mode/部品type/固定給/部品金額)。data-f無しなので先に処理
      if(ev.target.dataset.prmode!=null){ ensurePayRule(emp).variable.mode=ev.target.value; renderEmpMaster(); return; }
      var prt=ev.target.closest('[data-prtype]'); if(prt){ var _pt=ensurePayRule(emp).variable.parts[+String(prt.dataset.prtype).split(':')[1]]; if(_pt){ _pt.type=prt.value; if(prt.value==='tiered'&&(!_pt.tiers||!_pt.tiers.length))_pt.tiers=[{from:0,rate:''},{from:'',rate:''}]; } renderEmpMaster(); return; }
      var prtc=ev.target.closest('[data-prtier]'); if(prtc){ prTierSet(emp,prtc.dataset.prtier,prtc.value); refreshShaho(i); return; } // 段の下限/率(change)
      if(ev.target.dataset.prfixed!=null){ ensurePayRule(emp).fixed=String(num(ev.target.value)); renderEmpMaster(); return; }
      var pra=ev.target.closest('[data-pramt]'); if(pra){ var _pa=ensurePayRule(emp).variable.parts[+String(pra.dataset.pramt).split(':')[1]]; if(_pa)_pa.amount=String(num(pra.value)); renderEmpMaster(); return; }
      var f=ev.target.dataset.f; if(!f)return;
      if((f==='dept'||f==='role')&&ev.target.value==='__new'){ var label=f==='dept'?'部署':'役職'; var fld=f; uiPrompt('新しい'+label+'名を入力').then(function(nv){ nv=(nv||'').trim(); if(nv){ var list=fld==='dept'?state.depts:state.roles; if(list.indexOf(nv)<0)list.push(nv); emp[fld]=nv; } renderEmpMaster(); }); return; }
      emp[f]=ev.target.value; if(ev.target.classList.contains('num')){ emp[f]=String(num(ev.target.value)); ev.target.value=fmtN(emp[f]); }
      if(f==='workStatus'){ if(!emp.apply)emp.apply={}; var off=(emp.workStatus==='sankyu'||emp.workStatus==='ikukyu'); ['health','pension','kaigo'].forEach(function(k){ if(off) emp.apply[k]=false; else delete emp.apply[k]; }); }
      if(f==='payType'||f==='dept'||f==='role'||f==='commuteType'||f==='workStatus'||f==='residentTaxMode'||f==='residentTaxAnnual'||f==='taishokuYmd'||f==='minWageReduce'||f==='houshuKubun') renderEmpMaster(); // minWageReduce=最賃警告再判定 / houshuKubun=源泉区分の注記・源泉プレビュー更新
    });
    el.addEventListener('input',function(ev){ var card=ev.target.closest('.mco'); if(!card)return; var i=+card.dataset.i; var emp=state.employees[i]; var t=ev.target;
      if(!emp.shaho)emp.shaho={mode:'teiji',months:[]};
      // カスタム給の固定給/部品金額を入力中に反映(再描画せずフォーカス維持)+社保ヒーロー更新
      if(t.dataset.prfixed!=null){ ensurePayRule(emp).fixed=t.value.replace(/[^0-9]/g,''); refreshShaho(i); return; }
      var _prai=t.closest('[data-pramt]'); if(_prai){ var _pav=ensurePayRule(emp).variable.parts[+String(_prai.dataset.pramt).split(':')[1]]; if(_pav)_pav.amount=t.value.replace(/[^0-9]/g,''); refreshShaho(i); return; }
      var _prti=t.closest('[data-prtier]'); if(_prti){ prTierSet(emp,_prti.dataset.prtier,t.value); refreshShaho(i); return; } // 段の下限/率(入力中・フォーカス維持)
      if(t.classList.contains('sh-pay')||t.classList.contains('sh-days')){ var k=+t.dataset.k; emp.shaho.months[k]=emp.shaho.months[k]||{}; emp.shaho.months[k][t.classList.contains('sh-pay')?'pay':'days']=t.value; refreshShaho(i); return; }
      if(t.classList.contains('sh-mikomi')){ emp.shaho.mikomi=t.value; refreshShaho(i); return; }
      if(t.classList.contains('sh-manual')){ emp.shaho.manual=t.value; refreshShaho(i); return; }
      if(t.classList.contains('sh-prevhyojun')){ emp.shaho.prevHyojun=t.value; refreshZuiji(i); return; }
      if(t.classList.contains('sh-henko')){ emp.shaho.henkoYm=t.value; refreshZuiji(i); return; }
      var f=t.dataset.f; if(f&&!t.matches('select')) emp[f]=t.value; var nm=card.querySelector('.mco-nm'); if(f==='name'&&nm)nm.textContent=t.value||'（無名）';
      // 基本給/時給/歩合/通勤等の変更で「社会保険(自動)」ヒーローを即再計算(タブ切替まで古い額が出るのを防ぐ)
      if(f==='base'||f==='hourly'||f==='commissionAmt'||f==='hourlyGuarantee'||f==='commute'||f==='commuteKm') refreshShaho(i); });
    // 従業員カードを左スワイプで削除
    var swX=0,swY=0,swCard=null;
    el.addEventListener('touchstart',function(ev){ swCard=ev.target.closest('.mco'); if(swCard){ swX=ev.touches[0].clientX; swY=ev.touches[0].clientY; } },{passive:true});
    el.addEventListener('touchend',function(ev){ if(!swCard)return; var c=swCard; swCard=null; var dx=ev.changedTouches[0].clientX-swX, dy=ev.changedTouches[0].clientY-swY;
      if(dx<-60 && Math.abs(dy)<40){ var i=+c.dataset.i, e=state.employees[i]; if(state.employees.length<=1){ uiAlert('最低1名は必要です'); return; } uiConfirm((e&&e.name||'この従業員')+' を削除しますか？').then(function(ok){ if(ok){ state.employees.splice(i,1); renderEmpMaster(); } }); } });

    // 入力 accordion
    var il=$('#input-list');
    il.addEventListener('click',function(e){
      if(e.target.classList.contains('econf')){ var eci=+e.target.dataset.econf; var emc=state.employees[eci]; if(!emc) return;
        if(!e.target.checked){ // 「未確定に戻す」=凍結解除(freee型)。再計算で保存値が変わりうるので確認
          uiConfirm('「確認済」を外すと、この月の保存内容（賃金台帳・年末調整の集計）が現在の入力で再計算・更新される場合があります。よろしいですか？').then(function(ok){ if(!ok){ renderInput(); return; } setConfirm(emc.id,false); renderInput(); persistSaveDebounced(); });
          return;
        }
        // ★確定前に現在値のスナップショットを保存してから凍結★(一括「今月を確定」と同じ順)。
        //  先に確定するとsaveMonthlyPayslipsが確定済みをスキップし当月slipが未保存になる不具合を防ぐ。
        try{ saveMonthlyPayslips(); }catch(_){} setConfirm(emc.id, true); renderInput(); persistSave(); return; }
      if(e.target.dataset.reviewonly!=null){ state._reviewOnly=e.target.checked; renderInput(); return; }
      var ivw=e.target.closest('[data-ivw]'); if(ivw){ state.inputView=ivw.dataset.ivw==='table'?'table':'card'; renderInput(); if(window.persistSaveDebounced)persistSaveDebounced(); return; }
      var cmb=e.target.closest('[data-confirm-month]');
      if(cmb){ state.employees.forEach(function(emp){ if(isActiveInMonth(emp,state.month)) setConfirm(emp.id,true); }); try{ saveMonthlyPayslips(true); }catch(_){} persistSave(); renderInput();
        // ★確定した月は自動で従業員のWeb明細に公開(会社が「Web明細で公開」を押さなくても、従業員はいつでもどの月でも閲覧可)
        publishMeisaiNow(false,{silent:true}).then(function(n){ toast('今月を確定しました'+(n?'（従業員のWeb明細に公開）':'')); }, function(){ toast('今月を確定しました'); }); return; }
      var fs=e.target.closest('[data-fillsche]');
      if(fs){ var sd=fs.dataset.fillsche;
        var hasManual=state.employees.some(function(emp){ if(!isActiveInMonth(emp,state.month))return false; var mi=kinIdx(emp,/出勤/); return mi>=0 && emp.kintai[mi].value!=='' && emp.kintai[mi].value!=null && String(emp.kintai[mi].value)!==String(sd); });
        var doFill=function(){ state.employees.forEach(function(emp){ if(!isActiveInMonth(emp,state.month))return; ensureKintai(emp); var oi=kinIdx(emp,/出勤/); if(oi>=0) emp.kintai[oi].value=sd; }); renderInput(); if(window.persistSaveDebounced)persistSaveDebounced(); };
        if(hasManual){ uiConfirm('手入力した出勤日数がある人も含めて、全員の出勤を所定（'+sd+'日）で上書きします。よろしいですか？').then(function(ok){ if(ok)doFill(); }); } else { doFill(); }
        return; }
      if(e.target.closest('[data-csvimport]')){ var kf=$('#kintai-file'); if(kf){ kf.value=''; kf.click(); } return; }
      if(e.target.closest('[data-ledger-import]')){ var lb=e.target.closest('[data-ledger-import]'); lb.disabled=true; var ol=lb.textContent; lb.textContent='読み込み中…'; importLedgerForMonth().then(function(){ /* renderInputで再描画済み。失敗時はボタンを戻す */ if(lb&&lb.parentNode){ lb.disabled=false; lb.textContent=ol; } }); return; }
      if(e.target.closest('[data-migrate]')){ var mf0=$('#migrate-file'); if(mf0){ mf0.value=''; mf0.click(); } return; }
      var tg=e.target.closest('[data-toggle]');
      if(tg){ var i=+tg.dataset.toggle; var emp=state.employees[i]; state.open['I'+emp.id]=!state.open['I'+emp.id]; il.querySelector('.acc[data-i="'+i+'"]').classList.toggle('open'); return; }
      var wm=e.target.closest('.wi-mode'); if(wm){ var c1=e.target.closest('.acc'); var ci1=+c1.dataset.i; var em1=state.employees[ci1]; if(!em1.warimashi)em1.warimashi={}; em1.warimashi.mode=wm.dataset.wm; renderInput(); return; }
      if(e.target.closest('[data-dladd]')){ var dai=+e.target.closest('[data-dladd]').dataset.dladd; var dae=state.employees[dai]; if(dae){ if(!dae.dailyEntries)dae.dailyEntries=[]; dae.dailyEntries.push({ymd:'',hm:'',amount:''}); renderInput(); if(window.persistSaveDebounced)persistSaveDebounced(); } return; } // 日別: 日を追加
      var dld=e.target.closest('[data-dldel]'); if(dld){ var dp2=String(dld.dataset.dldel).split(':'); var dde=state.employees[+dp2[0]]; if(dde&&dde.dailyEntries){ dde.dailyEntries.splice(+dp2[1],1); renderInput(); if(window.persistSaveDebounced)persistSaveDebounced(); } return; } // 日別: 日を削除
      if(e.target.dataset.add){ var ai=+e.target.dataset.i, g=e.target.dataset.add; state.employees[ai][g].push({label:'',value:''}); renderInput(); return; }
      if(e.target.classList.contains('m-del')&&e.target.closest('#input-list')){ var card=e.target.closest('.acc'); var ci=+card.dataset.i; var g=e.target.dataset.g, ri=+e.target.dataset.ri; state.employees[ci][g].splice(ri,1); renderInput(); return; }
    });
    il.addEventListener('input',function(e){ var card=e.target.closest('.acc,.trow'); if(!card)return; var ci=+card.dataset.i; var emp=state.employees[ci];
      var dl=e.target.closest('[data-dl]'); if(dl){ var dpp=String(dl.dataset.dl).split(':'); if(emp.dailyEntries&&emp.dailyEntries[+dpp[1]]){ var f2=dpp[2]; emp.dailyEntries[+dpp[1]][f2]=(f2==='amount')?e.target.value.replace(/[^0-9]/g,''):e.target.value; } if(window.persistSaveDebounced)persistSaveDebounced(); return; } // 日別入力(再描画せずフォーカス維持)
      if(e.target.classList.contains('wk-f')){ emp[e.target.dataset.wkf]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      if(e.target.classList.contains('cm-f')){ emp[e.target.dataset.cmf]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      if(e.target.classList.contains('wi-f')){ if(!emp.warimashi)emp.warimashi={}; emp.warimashi[e.target.dataset.wk]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      if(e.target.classList.contains('wi-df')){ if(!emp.warimashi)emp.warimashi={}; if(!emp.warimashi.detail)emp.warimashi.detail={}; var wd=e.target.dataset.wd; emp.warimashi.detail[wd]=emp.warimashi.detail[wd]||{h:'',m:''}; emp.warimashi.detail[wd][e.target.dataset.dp]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      var g=e.target.dataset.g, ri=+e.target.dataset.ri, f=e.target.dataset.f; if(e.target.classList.contains('ck')){emp[g][ri].hikazei=e.target.checked;refreshCard(ci);return;} if(g&&!isNaN(ri)&&f){emp[g][ri][f]=e.target.value;refreshCard(ci);} });

    // 一覧/集計
    $$('.seg-b[data-view]').forEach(function(b){ b.addEventListener('click',function(){ $$('.seg-b[data-view]').forEach(function(x){x.classList.toggle('on',x===b);}); var v=b.dataset.view; state.listView=v; $('#view-list').style.display=v==='list'?'':'none'; $('#view-sum').style.display=v==='sum'?'':'none'; var vc=$('#view-cho'); if(vc)vc.style.display=v==='cho'?'':'none'; var vn=$('#view-nen'); if(vn)vn.style.display=v==='nen'?'':'none'; renderListActive(); }); });
    // 年末調整ビュー: 入力(申告)ハンドラ
    var vnen=$('#view-nen'); if(vnen) vnen.addEventListener('input',function(e){ var f=e.target.closest('[data-nf]'); if(!f)return; if(f.tagName==='SELECT'||f.type==='checkbox')return; /* checkbox/selectはchangeに任せ二重発火を防ぐ */ nenSetField(f.dataset.eid, f.dataset.nf, f.value); nenRefreshEmp(f.dataset.eid); if(window.persistSaveDebounced)persistSaveDebounced(); });
    if(vnen) vnen.addEventListener('change',function(e){ var f=e.target.closest('[data-nf]'); if(!f)return; if(f.tagName==='SELECT'||f.type==='checkbox'){ nenSetField(f.dataset.eid, f.dataset.nf, f.type==='checkbox'?f.checked:f.value); nenRefreshEmp(f.dataset.eid); if(window.persistSaveDebounced)persistSaveDebounced(); } });
    if(vnen) vnen.addEventListener('click',function(e){ var t=e.target.closest('[data-ntoggle]'); if(t){ var b=$('#nen-detail-'+t.dataset.ntoggle); if(b){ var op=b.style.display==='none'; b.style.display=op?'':'none'; t.textContent=op?'閉じる ▲':'年調の申告入力 ▾'; } return; }
      if(e.target.closest('[data-nenreflectall]')){ // 過不足を対象月の給与明細に反映(各人の過不足を凍結してe.nenchoAdjに保存)
        var rM=state.month, did=0; (state._nenEmps||[]).forEach(function(em){ var c=nenCompute(nenAggregate(state._nenRecs,em.id), nenStore(em.id)); if(c && c.res.kabusoku!==0){ em.nenchoAdj={ ym:rM, amount:c.res.kabusoku }; did++; } });
        if(did){ renderNenView(); if(window.persistSaveDebounced)persistSaveDebounced(); toast(did+'名の過不足を'+rM+'の給与明細に反映しました'); } return; }
      if(e.target.closest('[data-nenreflectclear]')){ var cM=state.month, cn=0; (state._nenEmps||[]).forEach(function(em){ if(em.nenchoAdj && em.nenchoAdj.ym===cM){ em.nenchoAdj=null; cn++; } });
        if(cn){ renderNenView(); if(window.persistSaveDebounced)persistSaveDebounced(); toast(cM+'の反映を解除しました'); } return; }
      if(e.target.closest('[data-nendecl-import-all]')){ var ndAll=NDcl(); if(!ndAll) return;
        uiConfirm('提出された本人のWeb申告を、対象の従業員にまとめて取り込みます。\n各人の申告入力欄は本人の申告内容で置き換わります（手入力していた分は上書きされます）。よろしいですか？').then(function(ok){ if(!ok) return;
          var did=0; (state._nenEmps||[]).forEach(function(em){ var dc=(state._nenDecls||{})[em.id]; if(dc&&dc.decl){ ndAll.applyToNencho(nenStore(em.id), dc.decl); did++; } });
          if(did){ renderNenView(); if(window.persistSaveDebounced)persistSaveDebounced(); toast(did+'名の申告を取り込みました'); } });
        return; } // 提出分を全員まとめて取り込む(一括=上書きになるため確認)
      var imp=e.target.closest('[data-nendecl-import]'); if(imp){ var ieid=imp.dataset.nendeclImport, dd=(state._nenDecls||{})[ieid], nd2=NDcl();
        if(dd&&dd.decl&&nd2){ nd2.applyToNencho(nenStore(ieid), dd.decl); // 従業員の申告をn.*へ反映(従業員の申告を正とする)
          var det=$('#nen-detail-'+ieid); if(det&&det.style.display==='none'){ det.style.display=''; var tg=vnen.querySelector('[data-ntoggle="'+ieid+'"]'); if(tg)tg.textContent='閉じる ▲'; } // 反映を見せるため開く
          nenRefreshDetail(ieid); nenRefreshEmp(ieid); if(window.persistSaveDebounced)persistSaveDebounced();
          imp.textContent='取り込み済み ✓'; imp.style.background='#EAF7F0'; imp.style.color='#2E7D54'; } // 反映済みを明示(再クリックで再取り込み可)
        return; }
      var yn=e.target.closest('[data-nfbool]'); if(yn){ var ynk=yn.dataset.nfbool, yne=yn.dataset.eid, ynv=yn.dataset.v==='1'; nenSetField(yne, ynk, ynv);
        var nd=NDcl(); var isParent=!!(nd&&nd.FIELDS.some(function(f){ return f.when===ynk; })); // この項目に依存する行があるか
        if(isParent){ nenRefreshDetail(yne); } // 依存行(配偶者の所得等)を出し入れするため申告フォームを再描画
        else { Array.prototype.forEach.call(vnen.querySelectorAll('[data-nfbool="'+ynk+'"][data-eid="'+yne+'"]'), function(p){ p.classList.toggle('on', (p.dataset.v==='1')===ynv); }); } // pillのon即更新
        nenRefreshEmp(yne); if(window.persistSaveDebounced)persistSaveDebounced(); return; } // はい/いいえトグル
      var x=e.target.closest('[data-nxlsx]'); if(x){ nenDownloadXlsx(); return; }
      var g=e.target.closest('[data-ngensen]'); if(g){ nenPrintGensen(); return; }
      var gw=e.target.closest('[data-ngensenweb]'); if(gw){ nenPublishGensen(); return; }
      var gy=e.target.closest('[data-ngyoyo]'); if(gy){ downloadGyoyoHoukoku(); return; } });
    // 帳票のサブ切替(賃金台帳/社保一覧/部署別)＋Excel
    var vcho=$('#view-cho'); if(vcho) vcho.addEventListener('click',function(e){
      var st=e.target.closest('[data-cho]'); if(st){ state.choView=st.dataset.cho; renderChoView(); return; }
      var dl=e.target.closest('[data-choxlsx]'); if(dl){ downloadChoXlsx(dl.dataset.choxlsx); return; } });
    if(vcho) vcho.addEventListener('input',function(e){ var rr=e.target.closest('[data-rousai-rate]'); if(!rr)return; // 労災率(‰)入力→労災保険料だけ即時再計算(集計は再取得しない=入力フォーカス維持)
      if(!state.company)state.company={}; state.company.rousaiRate=rr.value.replace(/[^0-9.]/g,''); if(window.persistSaveDebounced)persistSaveDebounced();
      var s=state._roudouSum; if(s){ var p=num(state.company.rousaiRate); s.rousaiPermil=p; s.rousaiRyo=(p>0)?roudouRyo(s.rousaiWageTotal, p/1000):null; var b=$('#roudou-rousai-ryo'); if(b) b.textContent=(s.rousaiRyo!=null?yen(s.rousaiRyo):'—'); } });
    $('#view-list').addEventListener('click',function(e){ var tg=e.target.closest('[data-ltoggle]'); if(!tg)return; var id=tg.dataset.ltoggle; state.open['L'+id]=!state.open['L'+id]; $('#view-list .acc[data-lid="'+id+'"]').classList.toggle('open'); });

    // 印刷
    $('#p-emp').addEventListener('change',doPreview);
    // #p-monthは.scr-monthに統合(P1-18)→共通ハンドラ(対象月change)が state.month同期＋doPreviewを行う
    $('#print-mode-seg').addEventListener('click',function(e){ var b=e.target.closest('.pmode'); if(!b)return; state.printMode=b.dataset.pmode==='bonus'?'bonus':'monthly'; $$('.pmode').forEach(function(x){ x.classList.toggle('on', x.dataset.pmode===state.printMode); }); updatePrintMonthUI(); updateDailyLayoutUI(); doPreview(); });
    $('#daily-layout-seg').addEventListener('click',function(e){ var b=e.target.closest('.dls'); if(!b)return; state.dailySlipLayout=b.dataset.dls==='2col'?'2col':'1col'; $$('.dls').forEach(function(x){ x.classList.toggle('on', x.dataset.dls===state.dailySlipLayout); }); if(window.persistSaveDebounced)persistSaveDebounced(); doPreview(); });
    function afterDesign(){ renderDesign(); if($('#scr-print')&&$('#scr-print').classList.contains('active')) doPreview(); }
    $('#tpl-row').addEventListener('click',function(e){ var b=e.target.closest('[data-tpl]'); if(!b)return; state.prefer=b.dataset.tpl; afterDesign(); });
    $('#color-pickers').addEventListener('click',function(e){
      var ps=e.target.closest('[data-preset]'); if(ps){ var p=THEME_PRESETS[+ps.dataset.preset]; if(p){ state.theme={accent:p.accent,line:p.line,ink:p.ink}; state._oc=null; afterDesign(); } return; } // プリセット一括適用
      if(e.target.closest('[data-reset]')){ state.theme={accent:'#6f5a3e',line:'#cfc9b8',ink:'#23261f'}; state._oc=null; afterDesign(); return; } // 色のみ初期化(レイアウトは維持)
      var tg=e.target.closest('.cp-toggle:not(.cp-reset)'); if(tg){ state._oc=(state._oc===tg.dataset.cpk)?null:tg.dataset.cpk; renderDesign(); return; }
      var w=e.target.closest('.cw'); if(w){ state.theme[w.dataset.ck]=w.dataset.col; state._oc=null; afterDesign(); } });
    function markOutput(){ if(!state.onboardOutput){ state.onboardOutput=true; if(window.persistSaveDebounced)persistSaveDebounced(); } } // はじめかたガイド④の達成
    // 印刷/PDF保存 = ★jsPDFで自前生成(A4ぴったり・iOSのURL/日付フッター無し・新窓を開かないので戻れる)。
    //   iOSのwebページ印刷(window.print/window.open)はフッターが必ず付き余白で2ページ化+戻れないため不採用。
    //   プレビューiframe内の各ページ(.sheet/.page)をhtml2canvasでA4寸法固定(潰れ防止)で焼き、複数人=複数ページに対応。
    $('#b-print').addEventListener('click',function(){ markOutput();
      var f=$('#frame'), idoc=f&&(f.contentDocument||f.contentWindow.document);
      var pages=idoc?idoc.querySelectorAll('.sheet,.page'):null;
      if(!pages||!pages.length||!(window.html2canvas)||!(window.jspdf&&window.jspdf.jsPDF)){
        try{f.contentWindow.focus();f.contentWindow.print();}catch(err){window.print();} return; // 保険=ライブラリ未読込ならブラウザ印刷
      }
      var isLand=(+(f.dataset.pw||794))>900; // pw=1123→A4横
      var CW=isLand?1123:794, CH=isLand?794:1123, pw=isLand?842:595, ph=isLand?595:842; // ★A4ページ
      var doc=new window.jspdf.jsPDF({ orientation:isLand?'landscape':'portrait', unit:'pt', format:[pw,ph] });
      try{ toast('PDFを作成中…'); }catch(e){}
      var i=0;
      (function next(){
        if(i>=pages.length){
          // ★blobを新しいタブで開く(代行請求書と同じ・iOSのWebKitBlobResourceエラー回避)。ポップアップ不可時のみsave。
          try{ var url=URL.createObjectURL(doc.output('blob')); var w=window.open(url,'_blank'); if(!w){ doc.save('給与明細.pdf'); } setTimeout(function(){ try{URL.revokeObjectURL(url);}catch(_){} },60000); }catch(e){ try{ doc.save('給与明細.pdf'); }catch(_){} }
          return;
        }
        window.html2canvas(pages[i], { scale:3, backgroundColor:'#ffffff', useCORS:true, width:CW, height:CH, windowWidth:CW, windowHeight:CH }).then(function(canvas){
          if(i>0){ doc.addPage([pw,ph], isLand?'landscape':'portrait'); }
          // ★A4ページのまま横幅いっぱい(比率維持=潰さない・左右余白ゼロ)。縦長でも幅いっぱいで載せ下端の空白はA4で自然に収まる
          var iw=canvas.width, ih=canvas.height;
          doc.addImage(canvas.toDataURL('image/jpeg',0.92), 'JPEG', 0, 0, pw, pw*ih/iw);
          i++; next();
        }).catch(function(){ i++; next(); });
      })();
    });
    // 総合振込データ(委託者入力の保存 + 全銀/Excel ダウンロード)。#furi-boxは静的なので委譲で1回だけ配線。
    (function(){ var fb=$('#furi-box'); if(!fb) return;
      function setFc(ev){ var el=ev.target.closest&&ev.target.closest('[data-fc]'); if(el){ state.company[el.getAttribute('data-fc')]=el.value; persistSaveDebounced(); } }
      fb.addEventListener('input', setFc); fb.addEventListener('change', setFc);
      fb.addEventListener('click', function(ev){ if(ev.target.closest('#b-zengin')){ downloadZengin(); } else if(ev.target.closest('#b-furixlsx')){ downloadFuriExcel(); } });
    })();
    // 勤怠CSV: ファイル選択→UTF-8で読み、文字化け/日本語なしならShift-JISで再デコード→取込
    (function(){ var kf=$('#kintai-file'); if(!kf) return;
      kf.addEventListener('change', function(ev){ var f=ev.target.files&&ev.target.files[0]; if(!f) return;
        var rd=new FileReader(); rd.onload=function(){ var buf=rd.result, text='';
          try{ text=new TextDecoder('utf-8',{fatal:false}).decode(buf); if(/�/.test(text) || !/[ぁ-んァ-ヴ一-龠]/.test(text)){ text=new TextDecoder('shift-jis').decode(buf); } }
          catch(e){ try{ text=new TextDecoder('shift-jis').decode(buf); }catch(_){ text=''; } }
          importKintaiCsv(text);
        }; rd.readAsArrayBuffer(f);
      });
    })();
    // 他ソフトから移行: CSV(Shift-JIS/UTF-8自動判別) または Excel(.xlsx=XLSXで読取) を1ファイルで全員取込
    (function(){ var mf=$('#migrate-file'); if(!mf) return;
      mf.addEventListener('change', function(ev){ var f=ev.target.files&&ev.target.files[0]; if(!f) return;
        if(!window.MigrateMap){ uiAlert('移行モジュールが読み込まれていません'); return; }
        var isXlsx=/\.xlsx$/i.test(f.name)||/spreadsheet/.test(f.type||'');
        var rd=new FileReader();
        if(isXlsx){
          rd.onload=function(){ if(typeof XLSX==='undefined'){ uiAlert('Excelの読み込み部品が読み込めませんでした（オフライン等）。CSVでお試しください。'); return; }
            try{ var wb=XLSX.read(rd.result,{type:'array'}); var ws=wb.Sheets[wb.SheetNames[0]]; var aoa=XLSX.utils.sheet_to_json(ws,{header:1}); importMigration(MigrateMap.parseAoa(aoa)); }
            catch(err){ uiAlert('Excelの読み込みに失敗しました: '+err.message); }
          }; rd.readAsArrayBuffer(f);
        } else {
          rd.onload=function(){ var buf=rd.result, text='';
            try{ text=new TextDecoder('utf-8',{fatal:false}).decode(buf); if(/�/.test(text)||!/[ぁ-んァ-ヴ一-龠]/.test(text)){ text=new TextDecoder('shift-jis').decode(buf); } }
            catch(e){ try{ text=new TextDecoder('shift-jis').decode(buf); }catch(_){ text=''; } }
            importMigration(MigrateMap.parseCsv(text));
          }; rd.readAsArrayBuffer(f);
        }
      });
    })();
    // モバイルの回転/リサイズでプレビューを再フィット(再描画せず軽く)
    var _fitT; window.addEventListener('resize',function(){ if(!$('#scr-print')||!$('#scr-print').classList.contains('active'))return; clearTimeout(_fitT); _fitT=setTimeout(fitPreview,120); });
    $('#b-xlsx').addEventListener('click',function(){ if(!window.PayslipXlsx)return; markOutput(); var v=$('#p-emp').value; var emps=(v==='__all')?state.employees.filter(function(e){return isActiveInMonth(e,state.month);}):[state.employees[+v]];
      var isBonus=state.printMode==='bonus'; // 印刷の月次/賞与トグルに合わせる(賞与で月次が出る不具合を修正)
      var people=isBonus?buildBonusPeople(emps):buildPeople(emps);
      var lbl=(isBonus?bonusMonthLabel():monthLabel()).replace(/ /g,'');
      var fn=isBonus?('賞与明細_'+bonusYmOf()+'.xlsx'):('給与明細_'+state.month+'.xlsx');
      PayslipXlsx.download(people, {company:state.company.name, monthLabel:lbl, filename:fn}); });
    // Web明細で公開(従業員向け配布・アクセスコード方式)
    $('#b-webpub').addEventListener('click',function(){ markOutput(); publishMeisaiNow(state.printMode==='bonus'); });
    $('#webmeisai-card').addEventListener('click',function(e){
      var cp=e.target.closest('.wm-copy'); if(cp){ try{ navigator.clipboard.writeText(cp.dataset.link); toast('コピーしました'); }catch(err){} return; }
      var qb=e.target.closest('.wm-qr'); if(qb){ showMeisaiQR(qb.dataset.qrName, qb.dataset.qrUrl); return; } // 個人のQR表示/印刷
      if(e.target.closest('.wm-qrall')){ // 全員のQRを印刷(リンク+初回コード同梱)
        Store.listMeisaiPub(rosterIds()).then(function(list){ var origin=(location.origin&&location.origin.indexOf('http')===0)?location.origin+location.pathname.replace(/[^\/]*$/,''):'';
          printQRCards((list||[]).map(function(p){ var code=(!p.hasPassword?p.initCode:''); return { name:p.name, url:origin+p.link+(code?('&c='+encodeURIComponent(code)):''), initCode:code }; })); }); // QRに初回コードを埋め込む=スキャンで自動入力
        return; }
      var ri=e.target.closest('.wm-reissue'); if(ri){ var tok=ri.dataset.token; uiConfirm('初回コードを再発行しますか？\n現在のパスワードと端末の記憶は無効になり、従業員は新しい初回コードで再設定します。').then(function(ok){ if(!ok)return;
        Store.reissueMeisaiInit(tok).then(function(){ renderWebMeisai(); toast('初回コードを再発行しました'); }); }); return; }
    });
    window.addEventListener('resize',function(){ if($('#scr-print').classList.contains('active'))doPreview(); });
  }
  // Web明細リンクのQRコード(従業員がカメラで読むだけで自分の明細/申告/振込先登録へ)。lib/qr.js(MIT・vendored)でSVG生成=印刷でも鮮明。
  function qrSvg(text, px){
    var Q=(typeof qrcode!=='undefined')?qrcode:(window&&window.qrcode); if(!Q||!text) return '';
    var qr; try{ qr=Q(0,'M'); qr.addData(String(text)); qr.make(); }catch(e){ return ''; }
    var n=qr.getModuleCount(), quiet=4, total=n+quiet*2, cell=Math.max(1, Math.floor((px||200)/total)), size=cell*total, rects='';
    for(var r=0;r<n;r++)for(var c=0;c<n;c++){ if(qr.isDark(r,c)) rects+='<rect x="'+((quiet+c)*cell)+'" y="'+((quiet+r)*cell)+'" width="'+cell+'" height="'+cell+'"/>'; }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" shape-rendering="crispEdges" role="img" aria-label="Web明細QR"><rect width="'+size+'" height="'+size+'" fill="#fff"/><g fill="#000">'+rects+'</g></svg>';
  }
  function showMeisaiQR(name, url){
    var svg=qrSvg(url, 220); if(!svg){ uiAlert('QRコードを生成できませんでした。'); return; }
    uiModal({ title:(name?name+' さんの ':'')+'Web明細 QRコード',
      html:'<div style="text-align:center">'+svg+'<div style="font-size:11px;color:#5C7E6C;margin-top:8px;word-break:break-all">'+esc(url)+'</div><div class="hint" style="margin-top:8px">スマホのカメラで読み取ると明細ページが開きます。初回だけ「初回コード」でパスワードを設定してください。</div></div>',
      buttons:[{label:'閉じる',val:false},{label:'このQRを印刷',val:true,primary:true}]
    }).then(function(v){ if(v) printQRCards([{ name:name, url:url }]); });
  }
  // QRカードを新窓で印刷(氏名+QR+リンク+初回コード+手順)。従業員に配る用。
  function printQRCards(items){
    items=(items||[]).filter(function(it){ return it&&it.url; }); if(!items.length){ uiAlert('公開中のWeb明細がありません。'); return; }
    var cards=items.map(function(it){ var svg=qrSvg(it.url,190);
      return '<div class="qc">'+svg+'<div class="qn">'+esc(it.name||'')+'</div>'
        +'<div class="qh">スマホのカメラでこのQRを読み取り→初回だけ自分のパスワードを決めてください（次回からはパスワードだけ）。</div>'
        +'<div class="qu">'+esc(it.url)+'</div></div>'; }).join('');
    // ★新窓(window.open)は使わない=スマホ/ホーム画面アプリで開けず「戻れない」ため。アプリ内オーバーレイで表示＋任意で印刷。
    var css='.qc{border:1px dashed #9ac3ad;border-radius:10px;padding:12px;width:230px;max-width:100%;text-align:center;page-break-inside:avoid;box-sizing:border-box}.qc svg{width:180px;height:180px}.qn{font-weight:700;font-size:14px;margin:6px 0 2px}.qi{font-size:12px;margin:2px 0}.qh{font-size:10px;color:#5C7E6C;margin:6px 0 4px;line-height:1.5}.qu{font-size:8.5px;color:#8aa89a;word-break:break-all}';
    uiModal({ title:'Web給与明細 アクセス用QRコード（従業員に配布）',
      html:'<style>'+css+'</style><div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-height:62vh;overflow:auto;padding:2px">'+cards+'</div>',
      buttons:[{label:'閉じる',val:false},{label:'印刷する',val:true,primary:true}]
    }).then(function(v){ if(!v) return;
      var st=document.createElement('style'); st.id='qrprint-style';
      st.textContent='@media print{body>*{visibility:hidden!important}#qrprint-print,#qrprint-print *{visibility:visible!important}#qrprint-print{position:absolute;left:0;top:0;width:100%;padding:14px;box-sizing:border-box}'+css+'}';
      var pc=document.createElement('div'); pc.id='qrprint-print';
      pc.innerHTML='<h1 style="font-size:15px;margin:0 0 10px;color:#1a4a2e">Web給与明細 アクセス用QRコード</h1><div style="display:flex;flex-wrap:wrap;gap:12px">'+cards+'</div>';
      document.head.appendChild(st); document.body.appendChild(pc);
      setTimeout(function(){ try{ window.print(); }catch(e){} setTimeout(function(){ pc.remove(); st.remove(); }, 800); }, 120);
    });
  }
  // 明細をWeb明細(従業員配布)に公開。★確定時に自動で呼ぶ→会社が「Web明細で公開」を押さなくても、
  //   確定した月は従業員のリンクに自動で並ぶ(従業員はいつでもどの月でも閲覧可)。手動ボタンからも呼ぶ。
  //   token/初回コード/パスワード/同意は保持(publishMeisaiが冪等upsert)。返り=公開した人数(0=対象なし/未対応)。
  function publishMeisaiNow(isBonus, opts){
    opts=opts||{};
    if(!(window.Store&&Store.publishMeisai)) return Promise.resolve(0);
    var ym=isBonus?bonusYmOf():state.month; if(!ym) return Promise.resolve(0);
    var emps=state.employees.filter(function(e){return isActiveInMonth(e,ym);});
    if(!emps.length) return Promise.resolve(0);
    var kind=isBonus?'bonus':'monthly';
    var items=emps.map(function(e){ var person=(isBonus?buildBonusPeople([e]):buildPeople([e]))[0];
      return { employeeId:e.id, name:e.name, ym:ym, kind:kind,
        data:{ person:person, doc:isBonus?{month:bonusMonthLabel(),kind:'bonus'}:{month:monthLabel()}, prefer:state.prefer, theme:state.theme } }; });
    return Store.publishMeisai(items).then(function(){ renderWebMeisai(); if(!opts.silent) toast(emps.length+'名の'+(isBonus?'賞与':'給与')+'明細をWeb公開しました'); return emps.length; }).catch(function(){ return 0; });
  }
  // Web明細: 公開状況(従業員リンク＋同意＋未読/開封)を印刷タブに表示
  // 現在の名簿(在籍+退職者)のemployee_id。Web明細一覧をこれで絞る=削除済み(名簿に無い)は出さない。退職者は名簿に残るので出る。
  function rosterIds(){ return (state.employees||[]).map(function(e){ return e.id; }); }
  function renderWebMeisai(){
    var card=$('#webmeisai-card'), host=$('#webmeisai-body'); if(!card||!host||!(window.Store&&Store.listMeisaiPub))return;
    Store.listMeisaiPub(rosterIds()).then(function(list){
      card.style.display=list.length?'':'none'; if(!list.length){ host.innerHTML=''; return; }
      var unread=0; list.forEach(function(p){ (p.docs||[]).forEach(function(d){ if(!d.openedAt)unread++; }); });
      var origin=(location.origin&&location.origin.indexOf('http')===0)?location.origin+location.pathname.replace(/[^\/]*$/,''):'';
      host.innerHTML='<p class="hint" style="margin:-4px 0 10px">従業員に<b>リンク（QR）</b>を最初に一度だけ渡してください（LINE/メール/手渡し）。<b>リンクが鍵</b>なので本人にだけ。従業員は開いて<b>自分のパスワードを決めるだけ</b>→以後はパスワードだけ。<b>「今月を確定」すると、その月は自動でここに公開</b>され、従業員はいつでもどの月でも見られます（毎回「Web明細で公開」を押す必要はありません）。'+(unread?'<b style="color:#92500A"> 未読 '+unread+'件</b>':' <b style="color:#2E7D54">全員が閲覧済み</b>')+'</p>'
        +'<div style="margin:0 0 10px"><button class="btn-ghost wm-qrall" style="padding:8px 12px;font-size:12px">全員のQRコードを印刷</button></div>'
        +list.map(function(p){
          var ds=(p.docs||[]).slice().sort(function(a,b){return (b.ym||'').localeCompare(a.ym||'');});
          var openedTxt=ds.map(function(d){ return esc(d.ym)+(d.kind==='bonus'?'賞':'')+(d.openedAt?'✓':'<span style="color:#C0392B">未</span>'); }).join(' ');
          var pwState=p.hasPassword?'<span style="font-size:10.5px;color:#2E7D54">パスワード設定済</span>':'<span style="font-size:10.5px;color:#92500A">パスワード未設定</span>';
          var consentState=p.consentAt?'<span style="font-size:10.5px;color:#2E7D54">・同意済</span>':'<span style="font-size:10.5px;color:#92500A">・未同意</span>';
          // 初回コードはリンク(?c=)に内包=従業員は入力不要。会社は「リンク(QR)を本人に渡す」だけ。漏れたら「リンク再発行」で旧リンクを無効化。
          var codeRow = '<div style="font-size:10.5px;color:#5C7E6C;margin-top:5px">'
            +(p.hasPassword ? 'パスワード設定済み。' : 'このリンク（QR）を開くと本人がパスワードを設定します。')
            +'<b>リンクは本人にだけ渡してください</b>（リンクが鍵）。<button class="btn-ghost wm-reissue" data-token="'+attr(p.token)+'" style="padding:4px 8px;font-size:10.5px;margin-left:6px">リンク再発行（前のを無効化）</button></div>';
          // 配布用URL: パスワード未設定の間は初回コードを ?c= で埋め込む→従業員はスキャン/リンクを開くだけでコード自動入力→パスワードを決めるだけ(手間最小)。設定後はコード不要なので付けない。
          var handoutUrl = origin+p.link + ((!p.hasPassword && p.initCode) ? ('&c='+encodeURIComponent(p.initCode)) : '');
          return '<div style="border:1px solid #d4eae0;border-radius:10px;padding:9px 11px;margin-bottom:7px">'
            +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:13px">'+esc(p.name||'(氏名未取得)')+'</b><span>'+pwState+consentState+'</span></div>'
            +'<div style="display:flex;gap:6px;align-items:center;margin-top:5px"><span style="font-size:11px;color:#3D6B53;min-width:52px">リンク</span><input class="finput" readonly value="'+attr(handoutUrl)+'" style="flex:1;font-size:11px;padding:7px 9px" onclick="this.select()"><button class="btn-ghost wm-copy" data-link="'+attr(handoutUrl)+'" style="padding:7px 10px;font-size:11px">コピー</button><button class="btn-ghost wm-qr" data-qr-url="'+attr(handoutUrl)+'" data-qr-name="'+attr(p.name||'')+'" style="padding:7px 10px;font-size:11px">QR</button></div>'
            +codeRow
            +'<div style="font-size:10.5px;color:#5C7E6C;margin-top:5px">公開: '+openedTxt+'</div></div>';
        }).join('');
    });
  }

  /* ---------- 月次明細を自動保存(定時決定4-6月の自動入力の素) ---------- */
  // 当月(state.month)の各従業員の総支給/支払基礎日数等を pay_payslips に保存(同月同人は上書き)。
  // 月次明細をStoreに保存。★freee型「確定＝凍結」★: 自動保存(force無し)は確定済みempを書かない=過去月の履歴が現マスタで黙って上書きされるのを防ぐ(D1)。
  //  確定ボタン(force=true)のときだけ確定済みも含めて現在値で保存=そのスナップショットが台帳/年調の根拠。
  function saveMonthlyPayslips(force){
    if(!(window.Store&&Store.savePayslip)) return; var ym=state.month; if(!ym) return;
    var method=(state.company||{}).paymentDaysMethod||'';
    var conf=(state.confirmed&&state.confirmed[ym])||null;
    state.employees.filter(function(e){return isActiveInMonth(e,ym);}).forEach(function(e){ try{ // 母集合を入力/印刷/集計/賃金台帳と統一(退職後/入社前の月を保存しない)
      if(!force && conf && conf[e.id]) return; // 確定済み=凍結(自動保存では上書きしない)。修正は「未確定に戻す」で明示的に
      var r=compute(e);
      var days=(window.PayrollCalc&&PayrollCalc.calcPaymentDays)?PayrollCalc.calcPaymentDays(e,ym,method):0;
      // 賃金台帳＋36協定履歴用の内訳(後方互換=読む側は無くても壊れない)。★かんたん/詳細 両モードを warimashiMins で統一算出
      //  =当月liveと同一ソース。旧は easyフィールドのみで詳細モードの過去月が0埋め→36協定の複数月/年が発火しない不具合を解消(F1)。
      var wm=warimashiMins(e.warimashi);
      var work={ days:kintaiVal(e,/出勤/), workMin:workedMin(e), otMin:wm.otMin, nightMin:wm.nightMin, holidayMin:wm.holidayMin };
      var si=r.si||{};
      Store.savePayslip(ym, e.id, { name:e.name, shikyuTotal:r.shikyuTotal, paymentDays:days, kojoTotal:r.kojoTotal, net:r.net, kazei:r.kazei, siTotal:si.total||0,
        confirmed:!!(conf&&conf[e.id]), // ★確定フラグ=賃金台帳/年調は確定済みだけ集計(未確定の下書き月を混入させない)。旧データ(無し)は後方互換で集計対象
        shikyu:r.shikyu, kojo:r.kojo, hyojun:r.hyojun, dept:(e.dept||''), tax:num(r.incomeTax), jumin:num(r.residentTax),
        si:{ health:num(si.health), kaigo:num(si.kaigo), pension:num(si.pension), employ:num(si.employ) }, work:work });
    }catch(_e){} });
  }
  // 定時決定: 当年の4・5・6月の履歴から 総支給+支払基礎日数 を自動セット(無い月は空欄=手入力)
  function autoFillTeijiMonths(emp, cb){
    if(!(window.Store&&Store.getPayslipsByYm&&window.PayrollCalc)){ if(cb)cb(); return; }
    var yms=PayrollCalc.getTeijiYms(state.month);
    Store.getPayslipsByYm(yms[0],yms[2]).then(function(rows){
      var mine=(rows||[]).filter(function(r){ return r.employee_id===emp.id && (!r.data||r.data.kind!=='bonus'); }); // 定時決定(標準報酬月額)は賞与を除外(法令)
      if(!emp.shaho) emp.shaho={}; emp.shaho.mode='teiji';
      emp.shaho.months=yms.map(function(ym){ var row=mine.find(function(r){return r.ym===ym;}); var d=row&&row.data;
        return { pay:(d&&d.shikyuTotal!=null)?String(d.shikyuTotal):'', days:(d&&d.paymentDays!=null)?String(d.paymentDays):'' }; });
      if(cb)cb();
    }).catch(function(){ if(cb)cb(); });
  }

  /* 統合テスト用API。★本番ブラウザには露出しない（jsdomのときだけ）★=RC1対策の自動統合テスト(tests/integration.mjs)の入口。 */
  try{ if(typeof navigator!=='undefined' && /jsdom/i.test(navigator.userAgent||'')){
    window.__PAYSLIP_TEST={ compute:compute, defEmp:defEmp, mergeEmp:mergeEmp, state:state, buildDailyData:buildDailyData, dailySlipDoc:dailySlipDoc, shimePeriods:shimePeriods, shimeSplit:shimeSplit,
      saveMonthlyPayslips:saveMonthlyPayslips, ensurePayRule:ensurePayRule, minWageInfo:minWageInfo, isInMinWage:isInMinWage, minWageTeate:minWageTeate, setConfirm:setConfirm, renderInput:renderInput, renderInputTableHTML:renderInputTableHTML, effShukkin:effShukkin, onboardSteps:onboardSteps, renderEmpMaster:renderEmpMaster, filterEmpSearch:filterEmpSearch, labelInputsA11y:labelInputsA11y, computeBonus:computeBonus, bonusEntry:bonusEntry, nenAggregate:nenAggregate, confirmedRecs:confirmedRecs, loadBonusYtd:loadBonusYtd, nenchoWizardHTML:nenchoWizardHTML, nenStore:nenStore, nenDeclBannerHTML:nenDeclBannerHTML, makePayPattern:makePayPattern, applyPayPattern:applyPayPattern, openBulkPatternApply:openBulkPatternApply, applyEmpProfile:applyEmpProfile, empProfileStripHTML:empProfileStripHTML, importEmpProfile:importEmpProfile, qrSvg:qrSvg, itemSuggestOptions:itemSuggestOptions, itemSuggestHTML:itemSuggestHTML, bonusItemSuggestOptions:bonusItemSuggestOptions, bonusItemSuggestHTML:bonusItemSuggestHTML, santeiKisoRow:santeiKisoRow, santeiRows:santeiRows, santeiAoa:santeiAoa, stType:stType, stLabel:stLabel, santeiRule:santeiRule, gekkakuTh:gekkakuTh, shahoBasisOf:shahoBasisOf, bonusHarauRows:bonusHarauRows, bonusHarauAoa:bonusHarauAoa, gekkakuRows:gekkakuRows, gekkakuAoa:gekkakuAoa, ymAddLocal:ymAddLocal, extractCity:extractCity, gyoyoRows:gyoyoRows, gyoyoMeisaiAoa:gyoyoMeisaiAoa, gyoyoSoukatsuAoa:gyoyoSoukatsuAoa, roudouRows:roudouRows, roudouSummary:roudouSummary, roudouAoa:roudouAoa, roudouFYof:roudouFYof, ymdPlus1:ymdPlus1, shikakuRows:shikakuRows, shikakuAoa:shikakuAoa, fuyoBuckets:fuyoBuckets, nenCompute:nenCompute, nenGensenHTML:nenGensenHTML, nenGensenDoc:nenGensenDoc, applyMigrationRows:applyMigrationRows, buildEmpFromRow:buildEmpFromRow, prevYmOf:prevYmOf, applyLedgerToEmployees:applyLedgerToEmployees, importLedgerForMonth:importLedgerForMonth, payRuleCtx:payRuleCtx, monthYmdRange:monthYmdRange, shahoKanyuWarn:shahoKanyuWarn, fullTimeWeeklyH:fullTimeWeeklyH, shoteiMonthlyWage:shoteiMonthlyWage, empWarnings:empWarnings, laborLimitItems:laborLimitItems, prorateNote:prorateNote, buildPeople:buildPeople, ctxOf:ctxOf }; }
  }catch(e){}
  /* ---------- 永続化(localStorage既定・window.SUPA設定でSupabaseにも保存) ---------- */
  var PKEY='payslip_state_v1';
  // 保存時はcomputeが書く一時フィールド(_prorate/_wari/_shahoExemptThisMonth等)を除外→DB/LS汚染防止(in-memoryは描画用に保持)
  function stripTransient(e){ var o={}; for(var k in e){ if(Object.prototype.hasOwnProperty.call(e,k)&&k.charAt(0)!=='_') o[k]=e[k]; } return o; }
  function snapshot(){ return { v:1, company:state.company, employees:(state.employees||[]).map(stripTransient), month:state.month, theme:state.theme, prefer:state.prefer, depts:state.depts, roles:state.roles, showRetired:state.showRetired, bonus:state.bonus, confirmed:state.confirmed, nencho:state.nencho, onboardDone:state.onboardDone, onboardOutput:state.onboardOutput, payPatterns:state.payPatterns }; }
  var _saveT=null;
  function persistSave(){
    var snap=snapshot(), lsOk=true;
    try{ localStorage.setItem(PKEY, JSON.stringify(snap)); }catch(e){ lsOk=false; }
    var d=new Date(), hhmm=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
    var setS=function(t){ var e=document.getElementById('save-status'); if(e) e.textContent=t; };
    if(!lsOk) setS('⚠ 保存できません（このブラウザの空き容量）'); // 容量超過を握り潰さず表示
    if(window.Store&&Store.cloudSaveState){
      // ★クラウド保存の成否を待ってから表示(失敗を「保存済」と嘘表示しない)
      Promise.resolve().then(function(){ return Store.cloudSaveState(snap); }).then(function(r){
        // no-user=未ログイン=クラウド対象外(ローカル保存が正)→警告しない。ログイン中の実失敗のみ警告。
        if(r&&r.ok===false&&r.reason==='conflict'){ // ★楽観ロック: 上書きせず警告(データ消失防止)。neverSynced=別端末更新でなく"クラウド未読込"→文言を分ける
          setS(r.neverSynced ? '⚠ クラウドに保存済みのデータがあります（未読込）' : '⚠ 別の端末で更新されました（クラウド未保存）');
          if(!state._conflictPrompted){ state._conflictPrompted=true;
            var _cfMsg = r.neverSynced
              ? 'クラウドにこの会社の保存済みデータがあります（まだ読み込めていません）。\n\n最新を読み込みますか？\n・はい＝クラウドの最新を読込（この端末の未保存の編集は失われます）\n・いいえ＝このまま（ローカルには残ります・クラウド保存は保留）'
              : 'この会社の設定・従業員データが、別の端末で更新されています。\n\n最新を読み込みますか？\n・はい＝最新を読込（この端末の未保存の編集は失われます）\n・いいえ＝このまま（ローカルには残ります・クラウド保存は保留）';
            uiConfirm(_cfMsg).then(function(ok){ if(ok) location.reload(); });
          }
        }
        else if(r&&r.ok===false&&r.reason!=='no-user'){ setS('⚠ クラウド未保存（'+(r.reason||'通信エラー')+'）'); }
        else if(lsOk){ state._savedAt=hhmm; setS('自動保存済 '+hhmm); }
      }).catch(function(){ if(lsOk) setS('⚠ ローカルのみ保存（クラウド通信エラー）'); });
    } else if(lsOk){ state._savedAt=hhmm; setS('自動保存済 '+hhmm); }
    try{ saveMonthlyPayslips(); }catch(e){}
  }
  function persistSaveDebounced(){ if(_saveT)clearTimeout(_saveT); _saveT=setTimeout(persistSave, 500); }
  // 旧テンプレ名→新テンプレ名(実体準拠)への移行。保存済みstate.preferを吸収
  var PREFER_MIGRATE={cols:'col2_1',cols2:'col2_2',cols3:'col2_3',vstack:'col1_1',vstack2:'col1_2',strips:'col1_3'};
  function migPrefer(p){ return PREFER_MIGRATE[p]||p||'col2_1'; }
  function persistLoad(){
    var s=null; try{ s=JSON.parse(localStorage.getItem(PKEY)||'null'); }catch(e){}
    if(s&&s.employees&&s.employees.length){
      if(s.company) state.company=Object.assign(defCompany(), s.company); state.employees=s.employees.map(mergeEmp);
      if(s.month) state.month=s.month; if(s.theme) state.theme=s.theme; if(s.prefer) state.prefer=migPrefer(s.prefer);
      if(s.depts) state.depts=s.depts; if(s.roles) state.roles=s.roles; if(s.showRetired!=null) state.showRetired=s.showRetired;
      if(s.bonus) state.bonus=s.bonus;
      if(s.confirmed) state.confirmed=s.confirmed;
      if(s.nencho) state.nencho=s.nencho;
      if(s.payPatterns) state.payPatterns=s.payPatterns;
      if(s.onboardDone) state.onboardDone=true; if(s.onboardOutput) state.onboardOutput=true;
    }
    // クラウド(Supabase)が有効なら後から読み込んで上書き＋再描画
    reloadCloud();
  }
  function applyCloudState(cs){ if(!(cs&&cs.employees&&cs.employees.length)) return false;
    state.company=cs.company?Object.assign(defCompany(),cs.company):state.company; state.employees=cs.employees.map(mergeEmp);
    if(cs.month)state.month=cs.month; if(cs.theme)state.theme=cs.theme; if(cs.prefer)state.prefer=migPrefer(cs.prefer);
    if(cs.depts)state.depts=cs.depts; if(cs.roles)state.roles=cs.roles; if(cs.showRetired!=null)state.showRetired=cs.showRetired;
    if(cs.bonus)state.bonus=cs.bonus;
    if(cs.confirmed)state.confirmed=cs.confirmed;
    if(cs.nencho)state.nencho=cs.nencho; // 年末調整の申告入力もクラウド復元(漏れ修正)
    if(cs.payPatterns)state.payPatterns=cs.payPatterns;
    if(cs.onboardDone)state.onboardDone=true;
    state._prevYm=null; state._bonusPrevYm=null; state._bonusYtdYm=null; // クラウド復元で前月比キャッシュを無効化(stale防止)
    $$('.scr-month').forEach(function(m){ m.value=state.month; }); fillCompany(); var act=$('.screen.active'); if(act)showScreen(act.id); return true; }
  function reloadCloud(){ if(window.Store&&Store.cloudLoadState){ return Store.cloudLoadState().then(applyCloudState).catch(function(){return false;}); } return Promise.resolve(false); }
  window.PayslipReloadCloud=reloadCloud; window.PayslipPersistSave=persistSave;

  // 中央(Supabase statutory)の法定データをlibに注入=全国ユーザーへ一括反映。取れなければlibのハードコードのまま(フォールバック=オフラインでも動く)。
  function hydrateStatutory(){
    if(!(window.Store&&Store.getStatutory)) return Promise.resolve(false);
    return Store.getStatutory().then(function(rows){
      if(!rows||!rows.length) return false; // 空=フォールバック
      var sh=SHH(), sa=SAI(), kh=KH(), applied=0;
      // 数値表libのbare参照(index.htmlで先にロード済み・calc.js等は同一オブジェクト参照なので変異が伝播)
      var dn=(typeof ShotokuzeiDensan!=='undefined'?ShotokuzeiDensan:window.ShotokuzeiDensan);
      var hi=(typeof ShotokuzeiHei!=='undefined'?ShotokuzeiHei:window.ShotokuzeiHei);
      var hn=NICHI();
      var sz=(typeof SZ==='function'?SZ():(window.ShoyoZei));
      var nn=(typeof Nen_==='function'?Nen_():(window.Nenmatsu));
      var wm=(typeof Warimashi!=='undefined'?Warimashi:window.Warimashi);
      rows.forEach(function(r){ try{
        if(r.kind==='saitei_chingin' && sa&&sa.hydrate){ sa.hydrate(r.data); applied++; }
        else if(r.kind==='shakaihoken' && sh&&sh.hydrate){ sh.hydrate(r.year, r.data); applied++; }
        else if(r.kind==='koyo' && kh&&kh.hydrate){ kh.hydrate(r.year, r.data); applied++; }
        else if(r.kind==='shotokuzei_densan' && dn&&dn.hydrate){ dn.hydrate(r.year, r.data); applied++; }
        else if(r.kind==='shotokuzei_hei' && hi&&hi.hydrate){ hi.hydrate(r.year, r.data); applied++; }
        else if(r.kind==='shotokuzei_nichi' && hn&&hn.hydrate){ hn.hydrate(r.year, r.data); applied++; }
        else if(r.kind==='shoyo' && sz&&sz.hydrate){ sz.hydrate(r.year, r.data); applied++; }
        else if(r.kind==='nenmatsu' && nn&&nn.hydrate){ nn.hydrate(r.year, r.data); applied++; }
        else if(r.kind==='warimashi' && wm&&wm.hydrate){ wm.hydrate(r.data); applied++; }
        // shouhizei(消費税)は給与明細では未使用(請求/見積=Exally側)
      }catch(e){} });
      if(applied){ var act=$('.screen.active'); if(act&&act.id) showScreen(act.id); } // 値が変わった可能性→表示中を再描画
      return applied>0;
    }).catch(function(){ return false; });
  }
  window.PayslipHydrateStatutory=hydrateStatutory;

  /* init */
  persistLoad();
  hydrateStatutory(); // 中央の法定データを非同期で注入(失敗時はlibのハードコードで動く)
  $$('.scr-month').forEach(function(m){ m.value=state.month; });
  fillCompany(); bind(); showScreen('scr-settings');
  // A11y: 描画のたび見た目ラベルを入力のaria-labelへ伝播(全画面/再描画/将来の入力を自動カバー)
  try{ var _a11yObs=new MutationObserver(function(){ if(_a11yObs._t) return; _a11yObs._t=setTimeout(function(){ _a11yObs._t=null; labelInputsA11y(document); },0); }); _a11yObs.observe(document.body,{childList:true,subtree:true}); }catch(e){}
  labelInputsA11y(document);
  // A11y: フォーカスした div/b/span トグルを Enter/Space で発火(委譲clickを叩く)。ネイティブ操作要素は素通り。
  document.addEventListener('keydown', function(e){
    if(e.key!=='Enter' && e.key!==' ' && e.key!=='Spacebar') return;
    var t=e.target; if(!t||!t.matches) return;
    if(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA'||t.tagName==='BUTTON'||t.tagName==='A') return;
    if(t.matches(A11Y_TOGGLE_SEL)){ e.preventDefault(); t.click(); }
  });
  // 変更を自動保存(入力/選択/クリック後・離脱時)
  ['input','change','click'].forEach(function(ev){ document.addEventListener(ev, persistSaveDebounced, true); });
  window.addEventListener('beforeunload', persistSave);
  if(location.hash.indexOf('emp')>=0){ var b=$('#set-seg .seg-b[data-set="emp"]'); if(b)b.click(); if(state.employees[0]){state.open[state.employees[0].id]=true;} renderEmpMaster(); }
  if(location.hash==='#emphelp'){ openHelp('fuyou'); }
  if(location.hash==='#carcommute'){ var ec=state.employees[0]; if(ec){ec.commuteType='car';ec.commuteKm='12';ec.commute='15000';state.open[ec.id]=true;} var b2=$('#set-seg .seg-b[data-set="emp"]'); if(b2)b2.click(); renderEmpMaster(); }
  if(location.hash==='#input'){ if(state.employees[0]){var e0=state.employees[0]; e0.warimashi.mode='easy'; e0.warimashi.otH='45';e0.warimashi.otM='0';e0.warimashi.nightH='2';e0.warimashi.nightM='0'; state.open['I'+e0.id]=true;} showScreen('scr-input'); }
  if(location.hash==='#inputd'){ if(state.employees[0]){var ed=state.employees[0]; ed.warimashi.mode='detail'; ed.warimashi.detail={ot:{h:'43',m:''},otNight:{h:'2',m:''},over60:{h:'',m:''},over60Night:{h:'',m:''},night:{h:'',m:''},holiday:{h:'',m:''},holidayNight:{h:'1',m:''}}; state.open['I'+ed.id]=true;} showScreen('scr-input'); }
  var sm=$('#store-mode'); if(sm) sm.textContent='保存先: '+(((window.Store?Store.mode:'local')==='supabase')?'Supabase（クラウド）':'このブラウザ（localStorage）');
})();
