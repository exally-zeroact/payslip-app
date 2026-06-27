/* app.js — 給与明細アプリ（ミント4タブ / STEP2 従業員マスタ拡張） */
(function(){
  'use strict';
  var $=function(s,r){return (r||document).querySelector(s);};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
  var num=function(v){var n=Number(String(v==null?0:v).replace(/[, ]/g,''));return isNaN(n)?0:n;};
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
  var PAYTYPES=['月給','時給','日給','役員'];
  // 就業状況。産休/育休=社保免除(自動off・上書き可)、介護休/病休=社保継続、休業=会社都合(休業手当)
  var WORK_STATUS=[['normal','通常'],['sankyu','産休'],['ikukyu','育休'],['kaigokyu','介護休'],['byoukyu','病気休職'],['kyugyo','休業(会社都合)']];
  var WS_LABEL=function(k){ var f=WORK_STATUS.find(function(x){return x[0]===k;}); return f?f[1]:'通常'; };
  var HELP={
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
    taxclass:{ t:'💡 所得税の区分（甲・乙）', b:'所得税の源泉徴収の区分です。\n\n● <b>甲欄</b>…「扶養控除等申告書」を提出している人（＝メインの勤務先）。扶養を加味して計算。通常はこちら。\n● <b>乙欄</b>…申告書を未提出の人（副業・掛け持ちの2か所目など）。税率が高め・扶養は加味しません。\n\n※日雇い（丙欄）は近日対応。年度（令和7/令和8）は給与の対象月から自動で正しい税額表を選びます。' },
    commute:{ t:'💡 通勤手当（非課税）', b:'通勤手当は一定額まで所得税が<b>非課税</b>です。\n\n● <b>公共交通（電車・バス）</b>…月15万円まで非課税。\n● <b>マイカー等</b>…片道距離で月額が決まる（2km未満は全額課税〜95km以上66,400円・国税庁No.2585 令和8年4月〜）。\n\n限度を超えた分は課税されます。※所得税の非課税であって、社会保険・雇用保険では全額が算定基礎に入ります。' },
    legalkojo:{ t:'💡 法定控除（健保・厚年・雇用・所得税・住民税）', b:'給料から天引きする法律上の控除です。原則はかかりますが、<b>使わないものは外せます</b>（タップでオフ）。\n\n● 役員（労働者でない）→ <b>雇用保険は対象外</b>＝外す\n● 社会保険に未加入のパート → 健保・厚年を外す\n● 乙欄/別途納付など → 所得税を外す\n\n外すとその控除は計算しません（課税のもとからも引きません）。最終判断は会社で。' },
    warimashiBasis:{ t:'💡 割増の「基礎」に入れる手当', b:'残業代の単価を計算する“もとの賃金”です。手当の<b>名前でなく実態</b>で決めます（労基法37条5項・規則21条）。\n\n<b>外せる手当（限定列挙の7種）</b>…家族・通勤・別居・子女教育・住宅・臨時・1か月超ごとの手当。ただし<b>実態が伴う場合だけ</b>。\n● 例：住宅手当が「全員に一律定額」→ 住宅費用に応じていない＝<b>基礎に入れる</b>。\n● 例：通勤手当・扶養人数で変わる家族手当→ <b>外せる</b>。\n\n上記以外の手当は原則すべて基礎に入ります。タップで含む/外すを切替えできます。' }
  };
  function openHelp(k){ var h=HELP[k]; if(!h)return; var t=document.getElementById('help-t'),b=document.getElementById('help-b'); t.textContent=h.t; b.innerHTML=h.b; document.getElementById('help-ov').classList.add('on'); }
  // 支給/控除(法定外) のチップ候補
  // 残業/深夜/休日手当は「割増」機能で自動計算するためチップから除外(二重計上・単価膨張防止)
  var SUP_POOL=['基本給','役職手当','住宅手当','家族手当','通勤手当','皆勤手当','資格手当','精勤手当','調整手当'];
  var KOJO_POOL=['社宅費','組合費','財形貯蓄','生命保険','親睦会費','旅行積立'];
  var LEGAL_KOJO=[['health','健康保険'],['kaigo','介護保険'],['pension','厚生年金'],['employ','雇用保険'],['incomeTax','所得税'],['resident','住民税']];
  // 雇用保険 従業員負担(令和7年度・業種別)
  // 雇用保険 労働者負担(厚労省)。区分は全国共通の3種で網羅。料率は年度で自動選択(所得税と同様)
  var EMPLOY_GYOSHU=[['ippan','一般の事業'],['kensetsu','建設の事業'],['norin','農林水産・清酒製造']];
  var EMPLOY_RATES={ 2025:{ippan:0.0055,kensetsu:0.0065,norin:0.0065}, 2026:{ippan:0.005,kensetsu:0.006,norin:0.006} }; // 令和7→令和8(引下げ)
  function employYear(){ var y=parseInt(String(state.month||'').slice(0,4),10)||2026; return y>=2026?2026:2025; }
  function employRateOf(code,year){ var t=EMPLOY_RATES[year||employYear()]||EMPLOY_RATES[2026]; return t[code]!=null?t[code]:t.ippan; }

  // ライブラリは const SHAKAIHOKEN_HYO 定義で window に付かない→bare参照で取得
  function SHH(){ try{ if(typeof SHAKAIHOKEN_HYO!=='undefined'&&SHAKAIHOKEN_HYO) return SHAKAIHOKEN_HYO; }catch(e){} return (typeof window!=='undefined'&&window.SHAKAIHOKEN_HYO)||null; }
  function prefOptions(sel){
    var S=SHH(); var K=(S&&S.KENKO_RITSU)||{tokyo:{name:'東京都'}};
    return Object.keys(K).map(function(code){return '<option value="'+code+'"'+(code===sel?' selected':'')+'>'+esc(K[code].name)+'</option>';}).join('');
  }
  function prefRate(code){ var S=SHH(); var K=(S&&S.KENKO_RITSU)||{}; return (K[code]&&K[code].jugyoin)||0.04955; }

  function defEmp(name){
    return { id:uid(), name:name||'山田 太郎', no:'', birthYmd:'1980-05-15', dept:'', role:'',
      payType:'月給', base:'250000', hourly:'1200', fuyou:'1', pref:'tokyo', commute:'8400', commuteType:'public', commuteKm:'', residentTax:'12500', bank:'',
      annualHolidays:'', dailyWorkH:'', dailyWorkM:'', workedH:'160', workedM:'0',
      kintai:[{label:'出勤日数',value:'21'},{label:'欠勤日数',value:'0'},{label:'有給取得',value:'1'}],
      shikyu:[{label:'基本給',value:'250000'},{label:'住宅手当',value:'10000'}],
      apply:{}, taxClass:'ko', retired:false, workStatus:'normal', leavePay:'',
      warimashi:{ mode:'easy', otH:'', otM:'', nightH:'', nightM:'', holidayH:'', holidayM:'',
        detail:{ ot:{h:'',m:''}, otNight:{h:'',m:''}, over60:{h:'',m:''}, over60Night:{h:'',m:''}, night:{h:'',m:''}, holiday:{h:'',m:''}, holidayNight:{h:'',m:''} } },
      wbInclude:[], wbExclude:[],
      extraKojo:[],
      shaho:{ mode:'auto', months:[{pay:'',days:'30'},{pay:'',days:'30'},{pay:'',days:'30'}], mikomi:'', manual:'' } };
  }
  var WDAYS=['日','月','火','水','木','金','土'];
  var RULE_ITEMS=[['teikyu','休みの日'],['shotei','1日の働く時間'],['annual','年間の休み'],['warimashiRate','割増の率'],['koyoGyoshu','雇用保険の業種'],['kyukei','休憩時間'],['minashi','固定残業（みなし）'],['shoyo','賞与の有無']];
  var state={ company:{name:'株式会社 ゼロアクト',addr:'',close:'末日',paydayRel:'next',paydayDay:'25',
      holidays:[0], dailyWorkH:'8', dailyWorkM:'0', annualHolidays:'120',
      ruleOn:{teikyu:true,shotei:true,annual:true,warimashiRate:true,koyoGyoshu:true},
      rateOt:'', rateHoliday:'', rateNight:'', rateOver60:'', gyoshu:'ippan' },
    month:'2026-06', prefer:'cols', theme:{accent:'#6f5a3e',line:'#cfc9b8',ink:'#23261f'}, depts:['営業部'], roles:['課長','主任','一般'],
    employees:[defEmp('山田 太郎')], open:{} };

  // マイカー通勤 1か月非課税限度(片道km・国税庁No.2585 令和8年4月〜)
  function carCommuteNonTax(km){ km=num(km);
    if(km<2)return 0; if(km<10)return 4200; if(km<15)return 7300; if(km<25)return 13500; if(km<35)return 19700; if(km<45)return 25900;
    if(km<55)return 32300; if(km<65)return 38700; if(km<75)return 45700; if(km<85)return 52700; if(km<95)return 59600; return 66400; }
  function commuteLimit(e){ return e.commuteType==='car' ? carCommuteNonTax(e.commuteKm) : 150000; }
  // 通勤手当を shikyu に同期（commute>0なら通勤手当(非課税)行を用意・非課税限度を方法/距離で設定）
  function syncCommute(e){
    var idx=e.shikyu.findIndex(function(x){return /通勤/.test(x.label);});
    var v=num(e.commute), lim=commuteLimit(e);
    if(v>0){ if(idx<0) e.shikyu.push({label:'通勤手当',value:String(v),hikazei:true,nonTaxLimit:lim}); else { e.shikyu[idx].value=String(v); e.shikyu[idx].hikazei=true; e.shikyu[idx].nonTaxLimit=lim; } }
    else if(idx>=0) e.shikyu.splice(idx,1);
  }
  function shahoBasisOf(e){ var s=e.shaho||{}; return PayslipCalc.shahoBase({ mode:s.mode||'teiji', months:s.months||[], mikomi:s.mikomi, value:s.manual, threshold:e.shortTime?15:17 }); }
  // 割増基礎に入れるか（割増賃金は常に除外／明示include優先／明示exclude／既定は通勤・家族を除外＝実態の暫定）
  function isInBasis(e,label){
    label=label||''; if(/割増|残業|時間外|深夜|休日(出勤)?手当/.test(label)) return false; // 自動計算する割増系は単価基礎に入れない(二重防止)
    if((e.wbInclude||[]).indexOf(label)>=0) return true;
    if((e.wbExclude||[]).indexOf(label)>=0) return false;
    return !/通勤|家族/.test(label);
  }
  function warimashiBasis(e){ return (e.shikyu||[]).filter(function(x){ return isInBasis(e,x.label); }).reduce(function(a,x){return a+num(x.value);},0); }
  function dmin(o){ return num(o&&o.h)*60+num(o&&o.m); }
  function warimashiOf(e){
    if(!window.Warimashi) return {total:0,lines:[],unit:0};
    if(e.payType==='役員') return {total:0,lines:[],unit:0}; // 役員は割増(残業)の概念なし
    var co=state.company||{};
    var ah=(e.annualHolidays!=null&&e.annualHolidays!=='')?e.annualHolidays:co.annualHolidays; // 会社規定・従業員で任意上書き
    var dwh=(e.dailyWorkH!=null&&e.dailyWorkH!=='')?e.dailyWorkH:co.dailyWorkH;
    var dwm=(e.dailyWorkM!=null&&e.dailyWorkM!=='')?e.dailyWorkM:co.dailyWorkM;
    var pctRate=function(v){ return (v!=null&&v!=='')?num(v)/100:undefined; };
    var rates={ ot:pctRate(co.rateOt), holiday:pctRate(co.rateHoliday), night:pctRate(co.rateNight), over60Add:pctRate(co.rateOver60) };
    var w=e.warimashi||{}, common={ base:warimashiBasis(e), annualHolidays:ah, dailyHours:num(dwh)+num(dwm)/60, rates:rates };
    if(w.mode==='detail'){
      var d=w.detail||{}; var seg={}; ['ot','otNight','over60','over60Night','night','holiday','holidayNight'].forEach(function(k){ seg[k]=dmin(d[k]); });
      return Warimashi.detail({ base:common.base, annualHolidays:common.annualHolidays, dailyHours:common.dailyHours, rates:common.rates, seg:seg });
    }
    return Warimashi.easy({ base:common.base, annualHolidays:common.annualHolidays, dailyHours:common.dailyHours, rates:common.rates,
      otH:w.otH, otM:w.otM, nightH:w.nightH, nightM:w.nightM, holidayH:w.holidayH, holidayM:w.holidayM });
  }
  function kintaiVal(e,re){ var r=(e.kintai||[]).find(function(x){return re.test(x.label||'');}); return r?num(r.value):0; }
  function workedMin(e){ return num(e.workedH)*60+num(e.workedM); }
  function workedLabel(e){ var m=workedMin(e); return Math.floor(m/60)+':'+('0'+(m%60)).slice(-2); }
  // 時給=時給単価×労働時間 / 日給=日給額×出勤日数 で基本給を自動算出(月給は手入力のまま)
  // 基本給を状態から導出(単一ソース)。休暇中=休暇中の金額・時給=時給×労働時間・日給=日給×出勤・月給/役員=基本給。復職/再就職で自動的に元へ戻る
  function syncBasePay(e){
    if(!e.shikyu) e.shikyu=[];
    var amt;
    if(e.workStatus && e.workStatus!=='normal') amt=num(e.leavePay);
    else if(e.payType==='時給') amt=Math.round(num(e.hourly)*workedMin(e)/60);
    else if(e.payType==='日給') amt=Math.round(num(e.base)*kintaiVal(e,/出勤/));
    else amt=num(e.base);
    var idx=e.shikyu.findIndex(function(x){return /基本給/.test(x.label||'');});
    if(idx<0) e.shikyu.unshift({label:'基本給',value:String(amt)}); else e.shikyu[idx].value=String(amt);
  }
  function compute(e){
    syncCommute(e); syncBasePay(e);
    var sb=shahoBasisOf(e);
    // 標準報酬未確定時の暫定基礎は「割増を除く固定支給(通勤含む)」。割増(残業)で社保が膨らまないように。
    var fb=(e.shikyu||[]).reduce(function(a,x){return a+num(x.value);},0);
    e.hyojunBase = sb.hoshu>0 ? sb.hoshu : fb;
    var w=warimashiOf(e); e._wari=w;
    var shikyu=(e.shikyu||[]).slice();
    if(w.total>0) shikyu=shikyu.concat([{label:'割増賃金',value:w.total}]); // 課税・総支給・雇用保険ベースに算入
    return PayslipCalc.computePayslip({ shikyu:shikyu, birthYmd:e.birthYmd, payYm:state.month, fuyou:num(e.fuyou), residentTax:num(e.residentTax), healthRate:prefRate(e.pref), employRate:employRateOf((state.company||{}).gyoshu), hyojunBase:e.hyojunBase, apply:e.apply, extraKojo:e.extraKojo });
  }
  function payDateObj(){
    var ym=state.month||'2026-06', y=Number(ym.slice(0,4)), m=Number(ym.slice(5,7)), c=state.company||{};
    var py=y, pm=m; if((c.paydayRel||'next')==='next'){ pm=m+1; if(pm>12){pm=1;py++;} }
    var dd=String(c.paydayDay==null?'':c.paydayDay); var last=new Date(py, pm, 0).getDate();
    var day=/末/.test(dd)?last:Math.min(parseInt(dd,10)||25, last); if(day<1)day=1;
    return {y:py,m:pm,d:day};
  }
  function payDateStr(){ var o=payDateObj(); return '令和'+(o.y-2018)+'年'+o.m+'月'+o.d+'日'; }
  function updatePaydayPreview(){ var el=$('#payday-preview'); if(el) el.textContent='→ 支給日：'+payDateStr(); }
  function monthLabel(){ var y=Number((state.month||'2026-06').slice(0,4)), m=Number((state.month||'2026-06').slice(5,7)); var k=['','一','二','三','四','五','六','七','八','九','十','十一','十二']; return '令 和 '+(y-2018)+' 年 '+k[m]+' 月 分'; }

  /* ---------- ナビ ---------- */
  function showScreen(id){
    $$('.screen').forEach(function(s){ s.classList.toggle('active', s.id===id); });
    $$('.bn').forEach(function(b){ b.classList.toggle('on', b.dataset.scr===id); });
    var TABN={'scr-settings':'設定','scr-input':'入力','scr-list':'一覧 / 集計','scr-print':'印刷'}; var at=$('#appbar-tab'); if(at) at.textContent=TABN[id]||''; // ヘッダー右はタブ名
    $$('.scr-month').forEach(function(m){ m.value=state.month; }); // 対象月はタイトル行(入力/一覧)に表示
    if(id==='scr-settings') renderEmpMaster();
    if(id==='scr-input'){ $('#in-month').textContent=monthLabel(); renderInput(); }
    if(id==='scr-list') renderListView();
    if(id==='scr-print') renderPrint();
  }

  /* ---------- 設定: 会社情報 ---------- */
  function fillCompany(){ $('#c-name').value=state.company.name; $('#c-addr').value=state.company.addr; $('#c-close').value=state.company.close; $('#c-payrel').value=state.company.paydayRel||'next'; $('#c-payday-day').value=state.company.paydayDay||''; updatePaydayPreview(); renderRuleChips(); renderCompanyRules(); renderDesign(); }
  function renderRuleChips(){
    var host=$('#rule-chips'); if(!host)return; var on=state.company.ruleOn||{};
    host.innerHTML=RULE_ITEMS.map(function(it){var o=!!on[it[0]];return '<span class="chip'+(o?' on':'')+'" data-rule="'+it[0]+'">'+(o?'✓ ':'')+it[1]+'</span>';}).join('')+'<span class="chip chip-add" data-rule-add="1">＋自由に追加</span>';
  }
  function ruleItemHTML(key,title,sub,helpKey,inner){
    return '<div class="rule-item"><span class="ri-x" data-rule-x="'+key+'">× 外す</span><div class="flabel">'+title+(sub?'<span class="hint2">（'+sub+'）</span>':'')+(helpKey?'<span class="help-i" data-help="'+helpKey+'">💡</span>':'')+'</div>'+inner+'</div>';
  }
  function renderCompanyRules(){
    var host=$('#rule-host'); if(!host)return; var c=state.company, on=c.ruleOn||{}, h='';
    if(on.teikyu){ h+=ruleItemHTML('teikyu','休みの日は？','法定休日','teikyu',
      '<div class="wdays">'+WDAYS.map(function(d,i){return '<span class="wday'+((c.holidays||[]).indexOf(i)>=0?' on':'')+'" data-wd="'+i+'">'+d+'</span>';}).join('')+'</div><div class="ri-note">複数えらべます。法律上の休み(法定休日)は自動で特定。例：日曜だけ＝週休1日(現場系OK)。</div>'); }
    if(on.shotei){ h+=ruleItemHTML('shotei','1日の働く時間','所定労働','shotei',
      '<span class="dur"><input class="cr-f cr-dur" data-cf="dailyWorkH" inputmode="numeric" value="'+attr(c.dailyWorkH)+'"><i>時間</i><input class="cr-f cr-dur" data-cf="dailyWorkM" inputmode="numeric" value="'+attr(c.dailyWorkM)+'"><i>分</i></span>'); }
    if(on.annual){
      h+=ruleItemHTML('annual','年間の休み','日','annual','<input class="cr-f cr-wide" data-cf="annualHolidays" inputmode="numeric" value="'+attr(c.annualHolidays)+'">'); }
    if(on.warimashiRate){
      var rr='<div class="rate-grid">'
        +'<div><div class="mini-l">残業</div><span class="dur"><input class="cr-f cr-rate" data-cf="rateOt" inputmode="numeric" value="'+attr(c.rateOt)+'" placeholder="125"><i>%</i></span></div>'
        +'<div><div class="mini-l">法定休日</div><span class="dur"><input class="cr-f cr-rate" data-cf="rateHoliday" inputmode="numeric" value="'+attr(c.rateHoliday)+'" placeholder="135"><i>%</i></span></div>'
        +'<div><div class="mini-l">深夜（上乗せ）</div><span class="dur"><input class="cr-f cr-rate" data-cf="rateNight" inputmode="numeric" value="'+attr(c.rateNight)+'" placeholder="25"><i>+%</i></span></div>'
        +'<div><div class="mini-l">月60時間超（上乗せ）</div><span class="dur"><input class="cr-f cr-rate" data-cf="rateOver60" inputmode="numeric" value="'+attr(c.rateOver60)+'" placeholder="25"><i>+%</i></span></div>'
        +'</div><div class="ri-note"><b>空欄＝法定どおり自動</b>（残業125%・法定休日135%・深夜+25%・月60h超+25%）。<b>会社はこれ以上に上げられます</b>。逆に<b>100%と入れれば割増なし</b>（＝設定どおり計算。法令の責任は会社側）。深夜帯は法律で<b>22:00〜5:00</b>固定。</div>';
      h+=ruleItemHTML('warimashiRate','割増の率','残業・休日・深夜','warimashi',rr); }
    if(on.koyoGyoshu){
      var gopts=EMPLOY_GYOSHU.map(function(g){return '<option value="'+g[0]+'"'+(c.gyoshu===g[0]?' selected':'')+'>'+esc(g[1])+'（労'+(employRateOf(g[0])*100).toFixed(2)+'%）</option>';}).join('');
      h+=ruleItemHTML('koyoGyoshu','雇用保険の業種','一般/建設/農林','koyoGyoshu','<select class="cr-sel" data-cf="gyoshu">'+gopts+'</select><div class="ri-note">建設・農林水産・清酒製造は料率が高め。雇用保険は通勤手当も含む賃金総額に掛けます。<b>料率は対象月の年度で自動</b>（令和8は引下げ：一般0.50%・建設/農林0.60%）。</div>'); }
    if(on.kyukei){ h+=ruleItemHTML('kyukei','休憩時間','分','','<input class="cr-f cr-wide" data-cf="kyukei" inputmode="numeric" value="'+attr(c.kyukei)+'" placeholder="60">'); }
    if(on.minashi){ h+=ruleItemHTML('minashi','固定残業（みなし）','時間','','<input class="cr-f cr-wide" data-cf="minashiH" inputmode="numeric" value="'+attr(c.minashiH)+'" placeholder="0">'); }
    if(on.shoyo){ h+=ruleItemHTML('shoyo','賞与の有無','','','<div class="ri-note">賞与タブで個別に登録します。</div>'); }
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
    return '<div class="ri-note" style="margin-top:6px">'+msg+'<br>※自動の社保オフは下の「法定控除」で個別に戻せます。</div>';
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
  function empCardBody(e,i){
    return '<div class="mco-body">'
      +'<div class="frow"><div class="flabel">氏名</div><input class="finput m-f" data-f="name" value="'+attr(e.name)+'"></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">従業員番号<span class="hint2">任意</span></div><input class="finput m-f" data-f="no" value="'+attr(e.no)+'"></div>'
        +'<div class="frow"><div class="flabel">生年月日</div><input class="finput m-f" data-f="birthYmd" type="date" value="'+attr(e.birthYmd)+'"></div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">部署</div>'+deptSelect(e)+'</div>'
        +'<div class="frow"><div class="flabel">役職</div>'+roleSelect(e)+'</div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">給与形態</div><select class="finput m-f" data-f="payType">'+PAYTYPES.map(function(p){return '<option'+(p===e.payType?' selected':'')+'>'+p+'</option>';}).join('')+'</select></div>'
        +'<div class="frow"><div class="flabel">'+(e.payType==='時給'?'時給単価':e.payType==='日給'?'日給額':e.payType==='役員'?'役員報酬':'基本給')+'<span class="hint2">円</span></div><input class="finput num m-f" data-f="'+(e.payType==='時給'?'hourly':'base')+'" inputmode="numeric" value="'+attr(fmtN(e.payType==='時給'?e.hourly:e.base))+'"></div></div>'
      +'<div class="frow"><div class="flabel">就業状況<span class="hint2">産休/育休/休職等</span><span class="help-i" data-help="workstatus">💡</span></div><select class="finput m-f" data-f="workStatus">'+WORK_STATUS.map(function(w){return '<option value="'+w[0]+'"'+((e.workStatus||'normal')===w[0]?' selected':'')+'>'+w[1]+'</option>';}).join('')+'</select>'+wsNoteHTML(e)+'</div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">年間所定休日<span class="hint2">日/年</span><span class="help-i" data-help="shoteibase">💡</span></div><input class="finput num m-f" data-f="annualHolidays" value="'+attr(e.annualHolidays)+'"></div>'
        +'<div class="frow"><div class="flabel">1日の所定労働</div><span class="dur"><input class="finput m-f dur-in" data-f="dailyWorkH" inputmode="numeric" value="'+attr(e.dailyWorkH)+'"><i>時</i><input class="finput m-f dur-in" data-f="dailyWorkM" inputmode="numeric" value="'+attr(e.dailyWorkM)+'"><i>分</i></span></div></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">扶養人数<span class="hint2">配偶者含</span><span class="help-i" data-help="fuyou">💡</span></div><input class="finput num m-f" data-f="fuyou" value="'+attr(e.fuyou)+'"></div>'
        +'<div class="frow"><div class="flabel">都道府県<span class="hint2">健保率</span></div><select class="finput m-f" data-f="pref">'+prefOptions(e.pref)+'</select></div></div>'
      +'<div class="chip-row" style="margin:-2px 0 10px"><span class="chip'+(e.taxClass==='otsu'?' on':'')+'" data-tax="1">'+(e.taxClass==='otsu'?'✓ ':'')+'副業・掛け持ち（所得税は乙欄）<span class="help-i" data-help="taxclass">💡</span></span></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">通勤手当<span class="hint2">円/月</span><span class="help-i" data-help="commute">💡</span></div><input class="finput num m-f" data-f="commute" inputmode="numeric" value="'+attr(fmtN(e.commute))+'"></div>'
        +'<div class="frow"><div class="flabel">通勤方法</div><select class="finput m-f" data-f="commuteType"><option value="public"'+(e.commuteType!=='car'?' selected':'')+'>公共交通</option><option value="car"'+(e.commuteType==='car'?' selected':'')+'>マイカー等</option></select></div></div>'
      +(e.commuteType==='car'?'<div class="frow2"><div class="frow"><div class="flabel">片道距離<span class="hint2">km</span></div><input class="finput num m-f" data-f="commuteKm" value="'+attr(e.commuteKm)+'"></div><div class="frow"><div class="flabel">非課税限度<span class="hint2">自動</span></div><input class="finput num" value="'+yen(commuteLimit(e))+'" readonly style="background:#F6FAF7;color:#3D6B53"></div></div>':'<div class="hint" style="margin:-4px 0 10px">公共交通＝月15万まで非課税。マイカーは距離別（自動）。</div>')
      +'<div class="frow"><div class="flabel">住民税<span class="hint2">円/月</span></div><input class="finput num m-f" data-f="residentTax" inputmode="numeric" value="'+attr(fmtN(e.residentTax))+'"></div>'
      +'<div class="frow"><div class="flabel">振込先<span class="hint2">任意</span></div><input class="finput m-f" data-f="bank" value="'+attr(e.bank)+'" placeholder="○○銀行 普通 1234567"></div>'
      +shahoSection(e)
      +'<div class="sec-lb" style="border-top:1px dashed #D4EDE1">法定控除（使わないものは外せる）<span class="help-i" data-help="legalkojo">💡</span></div>'
      +'<div class="chip-row">'+LEGAL_KOJO.map(function(lk){
          if(lk[0]==='kaigo'){ var kt=(window.PayrollCalc&&PayrollCalc.isKaigoTarget(e.birthYmd,state.month)); if(!kt) return '<span class="chip chip-dim" title="40〜64歳が対象。生年月日から自動">介護保険（対象外）</span>'; var ko=(e.apply&&e.apply.kaigo===false); return '<span class="chip'+(ko?'':' on')+'" data-apply="kaigo" title="40〜64歳=自動で対象">'+(ko?'':'✓ ')+'介護保険（自動）</span>'; }
          var off=(e.apply&&e.apply[lk[0]]===false); return '<span class="chip'+(off?'':' on')+'" data-apply="'+lk[0]+'">'+(off?'':'✓ ')+esc(lk[1])+'</span>';
        }).join('')+'</div>'
      +'<div class="sec-lb">支給項目（タップでON/OFF・通勤は上の欄）</div><div class="chip-row">'+chips(e,SUP_POOL,'shikyu')+'</div>'
      +'<div class="addcustom"><input class="finput ac-inp" data-g="shikyu" placeholder="自由な項目名（例：特別手当）"><button class="btn-ghost ac-btn" data-g="shikyu" style="padding:10px 12px">＋追加</button></div>'
      +'<div class="sec-lb">控除項目（法定は自動・任意分のみ）</div><div class="chip-row">'+chips(e,KOJO_POOL,'extraKojo')+'</div>'
      +'<div class="addcustom"><input class="finput ac-inp" data-g="extraKojo" placeholder="自由な項目名（例：寮費）"><button class="btn-ghost ac-btn" data-g="extraKojo" style="padding:10px 12px">＋追加</button></div>'
      +'<div style="display:flex;justify-content:space-between;margin-top:10px">'
        +'<button class="m-retire btn-ghost" style="color:#7A6A2E;border-color:#e6dcb0;padding:8px 14px">'+(e.retired?'復帰させる':'退職にする')+'</button>'
        +'<button class="m-del-emp btn-ghost" style="color:#C0392B;border-color:#f3c9c4;padding:8px 14px">この従業員を削除</button></div>'
      +'</div>';
  }
  var SH_MODES=[['auto','基本給から自動','見込み不要'],['teiji','毎年の見直し','4〜6月'],['shutoku','入社したばかり','資格取得'],['zuiji','給料が変わった','随時改定'],['manual','金額が分かる','直接入力']];
  function shahoSection(e){
    var s=e.shaho||{mode:'auto',months:[]}; var mode=s.mode||'auto';
    var r=compute(e), sb=shahoBasisOf(e);
    var th=e.shortTime?15:17;
    var seg='<div class="sh-seg">'+SH_MODES.map(function(m){return '<b class="sh-mode'+(mode===m[0]?' on':'')+'" data-mode="'+m[0]+'">'+m[1]+'<span class="j">'+m[2]+'</span></b>';}).join('')+'</div>';
    seg+='<div class="chip-row" style="margin:-2px 0 8px"><span class="chip'+(e.shortTime?' on':'')+'" data-short="1">'+(e.shortTime?'✓ ':'')+'短時間労働者（定時決定は'+th+'日）</span></div>';
    var body='';
    if(mode==='auto'){
      body+='<div class="sh-tip">入力した<b>基本給＋手当（通勤含む）</b>から標準報酬を自動で当て、社会保険を計算します。<b>見込みや4〜6月の入力は不要</b>。正式な決定額があれば右の他タブで上書きできます。</div>';
    } else if(mode==='teiji'||mode==='zuiji'){
      var ms=s.months||[]; var labels=mode==='teiji'?['4月','5月','6月']:['1か月目','2か月目','3か月目'];
      body+='<div class="sh-tip">'+(mode==='teiji'?'4・5・6月の<b>総支給額</b>(手当含む・賞与除く)と<b>支払基礎日数</b>。月給は原則その月の暦日数。':'昇給/降給後の<b>連続3か月</b>を入力。')+'<b>'+th+'日未満の月は自動で除外</b>。</div>';
      body+='<div class="f3">'+labels.map(function(lab,k){var mm=ms[k]||{};var ex=(num(mm.days)>0&&num(mm.days)<th);return '<div class="mcol'+(ex?' ex':'')+'"><div class="mlb">'+lab+'</div><input class="finput num sh-pay" data-k="'+k+'" value="'+attr(mm.pay)+'" placeholder="総支給"><div class="drow"><span>支払基礎日数</span><input class="dinp sh-days" data-k="'+k+'" value="'+attr(mm.days)+'"></div></div>';}).join('')+'</div>';
      if(sb.excluded&&sb.excluded.length) body+='<div class="exinfo">✓ '+sb.excluded.map(function(x){return labels[x];}).join('・')+'は支払基礎日数が'+th+'日未満のため<b>ルール上この月を計算から外しました</b>（あなたのミスではありません）。残りの月の平均で算定します。</div>';
    } else if(mode==='shutoku'){
      body+='<div class="sh-tip">入社時は実績が無いので<b>入社月の見込み月額</b>（基本給＋手当の見込み・通勤含む）で決定します。</div><div class="frow"><div class="flabel">見込み月額<span class="hint2">円</span></div><input class="finput num sh-mikomi" value="'+attr(s.mikomi)+'" placeholder="280000"></div>';
    } else {
      body+='<div class="sh-tip">決定通知書・保険料額表の<b>標準報酬月額</b>をそのまま入力します。</div><div class="frow"><div class="flabel">標準報酬月額<span class="hint2">円</span></div><input class="finput num sh-manual" value="'+attr(s.manual)+'" placeholder="340000"></div>';
    }
    var period=mode==='auto'?'基本給ベース（自動・あとで上書き可）':mode==='teiji'?'その年9月〜翌8月（毎年見直し）':mode==='shutoku'?'入社月〜（次の見直しまで）':mode==='zuiji'?'変動の4か月目〜（次の見直しまで）':'通知書のとおり';
    var exempt=(e.workStatus==='sankyu'||e.workStatus==='ikukyu');
    return '<div class="sec-lb" style="border-top:1px dashed #D4EDE1">社会保険（毎月の天引き）<span class="help-i" data-help="shaho">💡</span></div>'+seg+body+shahoHeroHTML(r,period,sb.undetermined,mode==='auto',exempt);
  }
  function shahoHeroHTML(r,period,undet,isAuto,exempt){
    if(exempt){
      return '<div class="sh-hero"><div class="lb">毎月この人から天引きする社会保険（本人負担）</div><div class="big">'+yen(0)+'<span style="font-size:12px;color:#3D9E72;font-family:\'Noto Sans JP\'"> 免除中</span></div>'
        +'<div class="bd">産休・育休中は健保・厚年・介護が<b>免除</b>（本人・会社とも0）</div></div>'
        +'<div class="sh-sub">※復帰したら就業状況を「通常」に戻すと自動で再開します。</div>';
    }
    var soho=r.si.health+r.si.pension+(r.si.kaigo||0);
    var tag=isAuto?' 自動':undet?' 暫定':'';
    return '<div class="sh-hero"><div class="lb">毎月この人から天引きする社会保険（本人負担）</div><div class="big">'+yen(soho)+(tag?'<span style="font-size:12px;color:#7A9A87;font-family:\'Noto Sans JP\'">'+tag+'</span>':'')+'</div>'
      +'<div class="bd">健康保険 <b>'+yen(r.si.health)+'</b>　＋　厚生年金 <b>'+yen(r.si.pension)+'</b>'+(r.si.kaigo?'　＋　介護保険 <b>'+yen(r.si.kaigo)+'</b>':'')+'</div></div>'
      +'<div class="sh-sub">もとになる「標準報酬月額」＝<b>'+yen(r.hyojun)+'</b>'+(isAuto?'（基本給＋手当から自動）':undet?'（暫定：当月支給ベース）':'（保険料計算の“ものさし”・自動で決まる）')+'／適用：'+period+'</div>';
  }
  function refreshShaho(i){
    var e=state.employees[i]; var card=$('#emp-list .mco[data-i="'+i+'"]'); if(!card)return;
    var r=compute(e); var mode=(e.shaho&&e.shaho.mode)||'auto';
    var period=mode==='auto'?'基本給ベース（自動・あとで上書き可）':mode==='teiji'?'その年9月〜翌8月（毎年見直し）':mode==='shutoku'?'入社月〜（次の見直しまで）':mode==='zuiji'?'変動の4か月目〜（次の見直しまで）':'通知書のとおり';
    var hero=card.querySelector('.sh-hero'); var sub=card.querySelector('.sh-sub');
    if(hero&&sub){ var tmp=document.createElement('div'); tmp.innerHTML=shahoHeroHTML(r,period,shahoBasisOf(e).undetermined,mode==='auto',(e.workStatus==='sankyu'||e.workStatus==='ikukyu')); hero.replaceWith(tmp.firstChild); card.querySelector('.sh-sub').replaceWith(tmp.lastChild); }
  }
  function renderLeaveMaster(){
    var host=$('#leave-list'); if(!host) return;
    var act=state.employees.filter(function(e){return !e.retired;});
    if(!act.length){ host.innerHTML='<p class="hint">従業員がいません。</p>'; return; }
    host.innerHTML=act.map(function(e){ var i=state.employees.indexOf(e); var s=e.workStatus||'normal';
      var opts=WORK_STATUS.map(function(w){return '<option value="'+w[0]+'"'+(s===w[0]?' selected':'')+'>'+w[1]+'</option>';}).join('');
      var row='<div class="lv-row"><span class="lv-nm">'+esc(e.name||'（無名）')+wsBadge(e)+'</span><select class="finput lv-sel" data-ls="'+i+'">'+opts+'</select></div>';
      if(s!=='normal'){ row+='<div class="lv-detail">'+wsNoteHTML(e)
        +'<div class="frow"><div class="flabel">休暇中の支給額<span class="hint2">円/月</span></div><input class="finput num lv-pay" data-lp="'+i+'" inputmode="numeric" value="'+attr(fmtN(e.leavePay))+'" placeholder="0（無給）"></div>'
        +'<div style="text-align:right;margin-top:8px"><button class="btn-ghost lv-back" data-lback="'+i+'" style="color:#2E7D54;border-color:#BEE3CC;padding:8px 16px">復職させる（通常に戻す）</button></div></div>'; }
      return row;
    }).join('');
  }
  function renderRetireMaster(){
    var host=$('#retire-list'); if(!host) return;
    var rows=state.employees.map(function(e){ var i=state.employees.indexOf(e);
      return '<div class="lv-row'+(e.retired?' mco-retired':'')+'"><span class="lv-nm">'+esc(e.name||'（無名）')+(e.retired?' <span class="ret-badge">退職'+(e.retiredYmd?'・'+esc(e.retiredYmd):'')+'</span>':'')+'</span>'
        +'<button class="btn-ghost" data-rt="'+i+'" style="padding:7px 14px;'+(e.retired?'color:#2E7D54;border-color:#BEE3CC':'color:#7A6A2E;border-color:#e6dcb0')+'">'+(e.retired?'再就職させる':'退職にする')+'</button></div>';
    }).join('');
    var retN=state.employees.filter(function(e){return e.retired;}).length;
    host.innerHTML=rows+'<p class="hint" style="margin-top:8px">退職者 '+retN+'名 / 在籍 '+(state.employees.length-retN)+'名</p>';
  }
  function renderEmpMaster(){
    fillCompany();
    var host=$('#emp-list'); if(!host) return;
    // 部署でグループ化（誰も部署無しなら見出し非表示）
    var anyDept=state.employees.some(function(e){return e.dept;});
    var showR=!!state.showRetired; var retN=state.employees.filter(function(e){return e.retired;}).length;
    var groups={}; var order=[];
    state.employees.forEach(function(e,i){ if(e.retired&&!showR) return; var g=e.dept||'未分類'; if(!groups[g]){groups[g]=[];order.push(g);} groups[g].push(i); });
    var html='<div class="hint" style="margin:0 2px 8px">カードを左にスワイプ＝削除（または開いて下の「削除」）</div>';
    if(retN>0) html+='<div class="chip-row" style="margin:0 0 8px"><span class="chip'+(showR?' on':'')+'" data-showret="1">'+(showR?'✓ ':'')+'退職者も表示（'+retN+'名）</span></div>';
    order.forEach(function(g){
      if(anyDept) html+='<div class="grp-hd">'+esc(g)+'（'+groups[g].length+'名）</div>';
      groups[g].forEach(function(i){
        var e=state.employees[i], op=state.open[e.id];
        html+='<div class="mco'+(op?' open':'')+(e.retired?' mco-retired':'')+'" data-i="'+i+'">'
          +'<div class="mco-hd" data-toggle="'+i+'"><span class="mco-nm">'+esc(e.name||'（無名）')+'</span>'
            +'<span class="hd-chip'+(e.workStatus&&e.workStatus!=='normal'?' on':'')+'" data-goleave="'+i+'">'+(e.workStatus&&e.workStatus!=='normal'?esc(WS_LABEL(e.workStatus)):'休暇')+'</span>'
            +'<span class="hd-chip" data-goretire="'+i+'">退職</span>'
            +'<span class="mco-sub">'+esc(e.payType)+(e.role?' / '+esc(e.role):'')+'</span><span class="mco-cv">▾</span></div>'
          +(op?empCardBody(e,i):'')+'</div>';
      });
    });
    host.innerHTML=html;
  }

  /* ---------- 入力（自動計算） ---------- */
  function rowsHTML(g,arr){
    return arr.map(function(it,ri){
      var isNT=(it.hikazei||/通勤|出張|旅費|宿泊|日当/.test(it.label||''));
      var hz=(g==='shikyu'&&isNT)?'<span class="row-hz" title="項目名から自動で非課税扱い" style="font-size:10px;color:#3D9E72;white-space:nowrap;font-weight:700">非課税</span>':'';
      return '<div class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:5px"><input class="finput" data-g="'+g+'" data-ri="'+ri+'" data-f="label" value="'+attr(it.label)+'" style="flex:1.3" placeholder="項目"><input class="finput num" data-g="'+g+'" data-ri="'+ri+'" data-f="value" value="'+attr(it.value)+'" style="flex:1" placeholder="'+(g==='kintai'?'値':'金額')+'">'+hz+'<button class="b-del m-del" data-g="'+g+'" data-ri="'+ri+'">×</button></div>';
    }).join('');
  }
  function fmtH(min){ var h=min/60; return (Math.round(h*100)/100)+'h'; }
  function wiResHTML(e){
    var w=e._wari||{total:0,unit:0,lines:[]};
    if(!(w.total>0)) return '<div class="wi-res wi-zero">時間を入れると割増賃金を自動計算します（率は法令から自動）</div>';
    var u=Math.round(w.unit).toLocaleString('ja-JP');
    var bk=(w.lines||[]).map(function(l){ return '<div class="wi-bk">'+esc(l.label)+'：¥'+u+' × '+l.rate+' × '+fmtH(l.minutes)+' ＝ <b>'+yen(l.amount)+'</b></div>'; }).join('');
    return '<div class="wi-res">割増賃金 <b>'+yen(w.total)+'</b><span class="wi-sub">1時間単価 ¥'+u+'・率は法令から自動・基発150号で端数処理</span><div class="wi-bkw">'+bk+'</div></div>';
  }
  function warimashiInputHTML(e){
    compute(e); var w=e.warimashi||{}, mode=w.mode||'easy';
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
    var labels=(e.shikyu||[]).map(function(x){return x.label;}).filter(function(l){return !/割増/.test(l);});
    var wiz=labels.map(function(l){ var on=isInBasis(e,l); return '<span class="wb-chip'+(on?' on':'')+'" data-wb="'+attr(l)+'">'+(on?'✓ ':'')+esc(l)+'</span>'; }).join('');
    var basisBox='<div class="wb-box"><div class="wb-h">割増の基礎に入れる手当<span class="help-i" data-help="warimashiBasis">💡</span></div><div class="wb-chips">'+wiz+'</div><div class="wb-note">通勤・家族手当は既定で外す。住宅手当などは「全員一律」なら入れる（手当の名前でなく実態・労基法37条5項）。</div></div>';
    return '<div class="grp"><div class="grp-h">割増（残業・深夜・休日）<span class="help-i" data-help="warimashi">💡</span></div>'
      +seg+body+'<div class="wi-resw">'+wiResHTML(e)+'</div>'+basisBox+'</div>';
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
  function basePayInputHTML(e,i){
    if(e.payType==='時給'){ var hrs=workedMin(e)/60;
      return '<div class="hint" style="margin:-4px 2px 8px;color:#3D6B53">基本給（自動）＝ 時給 '+fmtN(e.hourly)+'円 × 労働時間 '+(Math.round(hrs*100)/100)+'h ＝ <b>'+yen(Math.round(num(e.hourly)*hrs))+'</b></div>'; }
    if(e.payType==='日給'){ var d=kintaiVal(e,/出勤/);
      return '<div class="hint" style="margin:-4px 2px 8px;color:#3D6B53">基本給（自動）＝ 日給 '+fmtN(e.base)+'円 × 出勤日数 '+d+'日 ＝ <b>'+yen(Math.round(num(e.base)*d))+'</b>（出勤日数は上の勤怠で）</div>'; }
    return '';
  }
  function renderInput(){
    var host=$('#input-list'); if(!host) return;
    host.innerHTML=state.employees.map(function(e,i){
      if(e.retired) return '';
      var r=compute(e), open=state.open['I'+e.id];
      return '<div class="acc'+(open?' open':'')+'" data-i="'+i+'">'
        +'<div class="acc-h" data-toggle="'+i+'"><span class="acc-nm">'+esc(e.name)+wsBadge(e)+'</span><span class="acc-net">'+yen(r.net)+'</span><span class="acc-cv">▾</span></div>'
        +'<div class="acc-body">'
          +'<div class="grp"><div class="grp-h">勤怠<button class="mini add" data-add="kintai" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('kintai',e.kintai)+'</div>'+workedRowHTML(e,i)+'</div>'
          +basePayInputHTML(e,i)
          +(e.payType==='役員'?'':warimashiInputHTML(e))
          +'<div class="grp"><div class="grp-h">支給<button class="mini add" data-add="shikyu" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('shikyu',e.shikyu)+'</div></div>'
          +'<div class="grp"><div class="grp-h">法定外控除<button class="mini add" data-add="extraKojo" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('extraKojo',e.extraKojo)+'</div></div>'
          +'<div class="calc-wrap">'+calcBoxHTML(e)+'</div></div></div>';
    }).join('');
  }
  function refreshCard(i){ var e=state.employees[i]; var card=$('#input-list .acc[data-i="'+i+'"]'); if(!card) return; var r=compute(e); card.querySelector('.acc-net').textContent=yen(r.net); var cw=card.querySelector('.calc-wrap'); if(cw) cw.innerHTML=calcBoxHTML(e); var wr=card.querySelector('.wi-resw'); if(wr) wr.innerHTML=wiResHTML(e); }

  /* ---------- 一覧 / 集計 ---------- */
  function renderListView(){
    var host=$('#view-list'); if(!host) return;
    host.innerHTML=activeEmps().map(function(e){
      var r=compute(e), open=state.open['L'+e.id];
      var pay=r.shikyu.map(function(s){return '<div class="dl"><span>'+esc(s.label)+'</span><span class="v">'+yen(s.value)+'</span></div>';}).join('');
      var ded=r.kojo.map(function(k){return '<div class="dl"><span>'+esc(k.label)+'</span><span class="v">'+yen(k.value)+'</span></div>';}).join('');
      return '<div class="acc'+(open?' open':'')+'" data-lid="'+e.id+'"><div class="acc-h" data-ltoggle="'+e.id+'"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(r.net)+'</span><span class="acc-cv">▾</span></div>'
        +'<div class="acc-body"><div class="det det-2"><div><div style="font-size:11px;font-weight:700;color:#2E7D54;margin:4px 0">支給</div>'+pay+'</div><div><div style="font-size:11px;font-weight:700;color:#2E7D54;margin:4px 0">控除</div>'+ded+'</div></div>'
        +'<div class="dl" style="margin-top:8px;font-weight:700;border-bottom:none"><span>差引支給額</span><span class="v" style="color:#2E7D54">'+yen(r.net)+'</span></div></div></div>';
    }).join('');
  }
  function renderSumView(){
    var rows=activeEmps().map(function(e){var r=compute(e);return {name:e.name,dept:e.dept||'未分類',s:r.shikyuTotal,k:r.kojoTotal,n:r.net};});
    var tot=rows.reduce(function(a,x){return {s:a.s+x.s,k:a.k+x.k,n:a.n+x.n};},{s:0,k:0,n:0});
    var body=rows.map(function(x){return '<tr><td>'+esc(x.name)+'</td><td class="num">'+yen(x.s)+'</td><td class="num">'+yen(x.k)+'</td><td class="num">'+yen(x.n)+'</td></tr>';}).join('');
    $('#view-sum').innerHTML='<div class="card"><div class="card-h">月次集計（'+monthLabel().replace(/ /g,'')+'）</div>'
      +'<table class="sumtab"><thead><tr><th>従業員</th><th>支給合計</th><th>控除合計</th><th>差引支給</th></tr></thead>'
      +'<tbody>'+body+'<tr class="total"><td>全員合計（'+rows.length+'名）</td><td class="num">'+yen(tot.s)+'</td><td class="num">'+yen(tot.k)+'</td><td class="num">'+yen(tot.n)+'</td></tr></tbody></table>'
      +'<p class="hint">年次・部署別/役職別・賃金台帳・社保一覧はDB保存後に自動生成（STEP6）。</p></div>';
  }

  /* ---------- 印刷 / PDF ---------- */
  function buildPeople(emps){ return emps.map(function(e){ var r=compute(e); var k=(e.kintai||[]).slice(); var oi=k.findIndex(function(x){return /出勤/.test(x.label||'');}); var wt={label:'労働時間',value:workedLabel(e)}; if(oi>=0)k.splice(oi+1,0,wt); else k.unshift(wt); return { name:e.name, company:state.company.name, payDate:payDateStr(), kintai:k, shikyu:r.shikyu, kojo:r.kojo, net:r.net, shikyuTotal:r.shikyuTotal, kojoTotal:r.kojoTotal }; }); }
  // 明細デザイン(レイアウト+色)＝設定タブに表示。自動は廃止(全員ページ分割で対応)
  // テンプレの種類(縦並び/2カラム/横ストリップ)。複数人は自動でページ分割
  var TPL_OPTS=[
    ['cols','2カラム（1人）','tpl_cols','支給と控除を横に・大きく（A4たて）',0],
    ['cols2','2カラム（2人）','tpl_cols2','支給と控除を横に・1枚に2人（A4たて）',0],
    ['vstack','1カラム（1人）','tpl_vstack','支給の下に控除・大きく（A4たて）',0],
    ['vstack2','1カラム（2人）','tpl_vstack2','支給の下に控除・1枚に2人（A4たて）',0],
    ['strips','横ストリップ','tpl_strips','横向きに数人まとめて（A4よこ）',1]
  ];
  function renderDesign(){
    // 色(上)
    var cp=$('#color-pickers'); if(cp){
      var bar=COLOR_TARGETS.map(function(t){ var cur=state.theme[t[0]]||''; var op=state._oc===t[0]; return '<button class="cp-toggle'+(op?' open':'')+'" data-cpk="'+t[0]+'"><span class="cp-cur" style="background:'+cur+'"></span>'+t[1]+'<span class="cp-cv">▾</span></button>'; }).join('');
      var pal=''; if(state._oc){ var cur2=state.theme[state._oc]||''; pal='<div class="cp-sw">'+PALETTE.map(function(col){ var on=cur2.toLowerCase()===col.toLowerCase(); return '<span class="cw'+(on?' on':'')+'" data-ck="'+state._oc+'" data-col="'+col+'" title="'+col+'" style="background:'+col+'"></span>'; }).join('')+'</div>'; }
      cp.innerHTML='<div class="cp-bar">'+bar+'<button class="cp-toggle cp-reset" data-reset="1">↺ 色を初期に戻す</button></div>'+pal;
    }
    // テンプレの種類ギャラリー(横ストリップは横長カード=full幅)
    var tr=$('#tpl-row'); if(tr){ tr.innerHTML=TPL_OPTS.map(function(t){ var on=(state.prefer||'cols')===t[0];
      return '<button type="button" class="tpl-card'+(on?' on':'')+(t[4]?' land':'')+'" data-tpl="'+t[0]+'"><span class="tpl-badge">✓</span><img class="tpl-thumb" src="img/'+t[2]+'.png" alt="'+t[1]+'"><div class="tpl-meta"><div class="tpl-name">'+t[1]+'</div><div class="tpl-desc">'+t[3]+'</div></div></button>'; }).join(''); }
  }
  function renderPrint(){
    $('#p-month').value=state.month;
    var sel=$('#p-emp'); sel.innerHTML='<option value="__all">全員</option>'+state.employees.map(function(e,i){return e.retired?'':'<option value="'+i+'">'+esc(e.name)+'</option>';}).join('');
    doPreview();
  }
  function doPreview(){
    var v=$('#p-emp').value; var emps=v==='__all'?activeEmps():[state.employees[+v]];
    var out=Render.build(buildPeople(emps), {month:monthLabel()}, state.prefer, state.theme);
    var f=$('#frame'); f.srcdoc=out.html;
    var pw=out.orientation==='landscape'?1123:794, ph=out.orientation==='landscape'?794:1123;
    var wrap=$('.preview-wrap'); var s=Math.min(1,(wrap.clientWidth-32)/pw);
    f.style.width=pw+'px'; f.style.height=ph+'px'; f.style.transform='scale('+s+')'; f.style.transformOrigin='top left';
    f.style.marginRight=(-(pw*(1-s)))+'px'; f.style.marginBottom=(-(ph*(1-s)))+'px';
  }

  /* ---------- events ---------- */
  function bind(){
    $$('.bn').forEach(function(b){ b.addEventListener('click',function(){ showScreen(b.dataset.scr); }); });
    // 💡 ヘルプ（全画面共通）
    document.addEventListener('click',function(e){ var hi=e.target.closest('.help-i'); if(hi){ openHelp(hi.dataset.help); } });
    $('#help-x').addEventListener('click',function(){ $('#help-ov').classList.remove('on'); });
    $('#help-ov').addEventListener('click',function(e){ if(e.target===this) this.classList.remove('on'); });
    document.addEventListener('change',function(ev){ if(!ev.target.classList.contains('scr-month'))return; state.month=ev.target.value||state.month; $$('.scr-month').forEach(function(m){ m.value=state.month; }); updatePaydayPreview();
      if($('#scr-input').classList.contains('active')){$('#in-month').textContent=monthLabel();renderInput();}
      if($('#scr-list').classList.contains('active')) renderListView(); });

    // 設定 seg
    $('#set-seg').addEventListener('click',function(ev){ var b=ev.target.closest('.seg-b'); if(!b)return; $$('.seg-b',this).forEach(function(x){x.classList.toggle('on',x===b);}); var s=b.dataset.set;
      $('#set-company').style.display=s==='company'?'':'none'; $('#set-emp').style.display=s==='emp'?'':'none'; $('#set-leave').style.display=s==='leave'?'':'none'; $('#set-retire').style.display=s==='retire'?'':'none'; $('#set-design').style.display=s==='design'?'':'none';
      if(s==='emp')renderEmpMaster(); if(s==='leave')renderLeaveMaster(); if(s==='retire')renderRetireMaster(); if(s==='design')renderDesign(); });
    // 休暇マスタ：就業状況の変更
    $('#leave-list').addEventListener('change',function(ev){ var sel=ev.target.closest('select[data-ls]'); if(!sel)return; var emp=state.employees[+sel.dataset.ls]; emp.workStatus=sel.value; if(!emp.apply)emp.apply={}; var off=(emp.workStatus==='sankyu'||emp.workStatus==='ikukyu'); ['health','pension','kaigo'].forEach(function(k){ if(off) emp.apply[k]=false; else delete emp.apply[k]; }); renderLeaveMaster(); });
    $('#leave-list').addEventListener('input',function(ev){ var p=ev.target.closest('input[data-lp]'); if(!p)return; state.employees[+p.dataset.lp].leavePay=p.value.replace(/[^0-9]/g,''); });
    $('#leave-list').addEventListener('click',function(ev){ var b=ev.target.closest('[data-lback]'); if(!b)return; var emp=state.employees[+b.dataset.lback]; emp.workStatus='normal'; if(emp.apply){ delete emp.apply.health; delete emp.apply.pension; delete emp.apply.kaigo; } renderLeaveMaster(); });
    // 退職マスタ：退職/復職
    $('#retire-list').addEventListener('click',function(ev){ var b=ev.target.closest('[data-rt]'); if(!b)return; var emp=state.employees[+b.dataset.rt];
      if(emp.retired){ emp.retired=false; } else { if(activeEmps().length<=1){ alert('稼働中は最低1名必要です'); return; } if(!confirm((emp.name||'この従業員')+' を退職にしますか？')) return; emp.retired=true; emp.retiredYmd=state.month; }
      renderRetireMaster(); });
    ['name','addr','close'].forEach(function(k){ var el=$('#c-'+k); if(el) el.addEventListener('input',function(){ state.company[k]=this.value; }); });
    var pr=$('#c-payrel'); if(pr) pr.addEventListener('change',function(){ state.company.paydayRel=this.value; updatePaydayPreview(); });
    var pd=$('#c-payday-day'); if(pd) pd.addEventListener('input',function(){ state.company.paydayDay=this.value.replace(/[^0-9末]/g,''); updatePaydayPreview(); });
    // 会社の決まり：項目チップ
    $('#rule-chips').addEventListener('click',function(ev){
      var ch=ev.target.closest('[data-rule]'); if(ch){ var k=ch.dataset.rule; if(!state.company.ruleOn)state.company.ruleOn={}; state.company.ruleOn[k]=!state.company.ruleOn[k]; renderRuleChips(); renderCompanyRules(); return; }
      if(ev.target.closest('[data-rule-add]')){ var nm=(prompt('追加する項目名','')||'').trim(); if(nm)alert('「'+nm+'」は自由項目として追加予定（次の増分で対応）'); }
    });
    // 会社の決まり：曜日・外す・数値
    var rh=$('#rule-host');
    rh.addEventListener('click',function(ev){
      var wd=ev.target.closest('.wday'); if(wd){ var i=+wd.dataset.wd; var hs=state.company.holidays||[]; var p=hs.indexOf(i); if(p>=0)hs.splice(p,1); else hs.push(i); state.company.holidays=hs; renderCompanyRules(); return; }
      var x=ev.target.closest('[data-rule-x]'); if(x){ state.company.ruleOn[x.dataset.ruleX]=false; renderRuleChips(); renderCompanyRules(); return; }
    });
    rh.addEventListener('input',function(ev){ if(ev.target.tagName==='SELECT')return; var f=ev.target.dataset.cf; if(f) state.company[f]=ev.target.value.replace(/[^0-9]/g,''); });
    rh.addEventListener('change',function(ev){ var f=ev.target.dataset.cf; if(f==='gyoshu'){ state.company.gyoshu=ev.target.value; return; } if(f==='annualHolidays'||f==='dailyWorkH'||f==='dailyWorkM') renderCompanyRules(); });
    $('#b-add-emp').addEventListener('click',function(){ var e=defEmp('従業員 '+(state.employees.length+1)); state.employees.push(e); state.open[e.id]=true; renderEmpMaster(); });

    // 従業員マスタ操作
    var el=$('#emp-list');
    el.addEventListener('click',function(ev){
      if(ev.target.dataset.showret){ state.showRetired=!state.showRetired; renderEmpMaster(); return; }
      if(ev.target.dataset.goleave!=null){ var gl=+ev.target.dataset.goleave; var ge=state.employees[gl]; if((ge.workStatus||'normal')==='normal'){ ge.workStatus='sankyu'; if(!ge.apply)ge.apply={}; ge.apply.health=false;ge.apply.pension=false;ge.apply.kaigo=false; } var lvb=$('#set-seg .seg-b[data-set="leave"]'); if(lvb)lvb.click(); return; }
      if(ev.target.dataset.goretire!=null){ var gr=+ev.target.dataset.goretire; if(activeEmps().length<=1){ alert('稼働中は最低1名必要です'); return; } if(!confirm((state.employees[gr].name||'この従業員')+' を退職にしますか？')) return; state.employees[gr].retired=true; state.employees[gr].retiredYmd=state.month; var rtb=$('#set-seg .seg-b[data-set="retire"]'); if(rtb)rtb.click(); return; }
      var card=ev.target.closest('.mco');
      var tg=ev.target.closest('[data-toggle]');
      if(tg){ var ti=+tg.dataset.toggle; var e=state.employees[ti]; state.open[e.id]=!state.open[e.id]; renderEmpMaster(); return; }
      if(!card) return; var i=+card.dataset.i; var emp=state.employees[i];
      var sm=ev.target.closest('.sh-mode'); if(sm){ if(!emp.shaho)emp.shaho={months:[]}; emp.shaho.mode=sm.dataset.mode; renderEmpMaster(); return; }
      if(ev.target.dataset.apply){ var ak=ev.target.dataset.apply; if(!emp.apply)emp.apply={}; emp.apply[ak]=(emp.apply[ak]===false)?true:false; renderEmpMaster(); return; }
      if(ev.target.dataset.short){ emp.shortTime=!emp.shortTime; renderEmpMaster(); return; }
      if(ev.target.dataset.tax){ emp.taxClass=(emp.taxClass==='otsu')?'ko':'otsu'; renderEmpMaster(); return; }
      if(ev.target.classList.contains('chip')){ var key=ev.target.dataset.chip, lab=ev.target.dataset.lab; var arr=emp[key]; var idx=arr.findIndex(function(x){return x.label===lab;}); if(idx>=0)arr.splice(idx,1); else arr.push({label:lab,value:'0'}); renderEmpMaster(); return; }
      if(ev.target.classList.contains('ac-btn')){ var g=ev.target.dataset.g; var inp=ev.target.previousElementSibling; var val=(inp.value||'').trim(); if(val){ emp[g].push({label:val,value:'0'}); renderEmpMaster(); } return; }
      if(ev.target.classList.contains('m-retire')){ if(!emp.retired){ if(confirm((emp.name||'この従業員')+' を退職にします。給与計算・印刷の対象から外れます（データは残ります）。')){ emp.retired=true; emp.retiredYmd=state.month; state.open[emp.id]=false; renderEmpMaster(); } } else { emp.retired=false; renderEmpMaster(); } return; }
      if(ev.target.classList.contains('m-del-emp')){ if(activeEmps().length<=1&&!emp.retired){alert('稼働中は最低1名必要です');return;} state.employees.splice(i,1); renderEmpMaster(); return; }
    });
    el.addEventListener('change',function(ev){
      var card=ev.target.closest('.mco'); if(!card)return; var i=+card.dataset.i; var emp=state.employees[i];
      if(ev.target.classList.contains('sh-days')){ renderEmpMaster(); return; }
      var f=ev.target.dataset.f; if(!f)return;
      if((f==='dept'||f==='role')&&ev.target.value==='__new'){ var label=f==='dept'?'部署':'役職'; var nv=(prompt('新しい'+label+'名',''))||''; nv=nv.trim(); if(nv){ var list=f==='dept'?state.depts:state.roles; if(list.indexOf(nv)<0)list.push(nv); emp[f]=nv; } renderEmpMaster(); return; }
      emp[f]=ev.target.value; if(ev.target.classList.contains('num')){ emp[f]=String(num(ev.target.value)); ev.target.value=fmtN(emp[f]); }
      if(f==='workStatus'){ if(!emp.apply)emp.apply={}; var off=(emp.workStatus==='sankyu'||emp.workStatus==='ikukyu'); ['health','pension','kaigo'].forEach(function(k){ if(off) emp.apply[k]=false; else delete emp.apply[k]; }); }
      if(f==='payType'||f==='dept'||f==='role'||f==='commuteType'||f==='workStatus') renderEmpMaster();
    });
    el.addEventListener('input',function(ev){ var card=ev.target.closest('.mco'); if(!card)return; var i=+card.dataset.i; var emp=state.employees[i]; var t=ev.target;
      if(!emp.shaho)emp.shaho={mode:'teiji',months:[]};
      if(t.classList.contains('sh-pay')||t.classList.contains('sh-days')){ var k=+t.dataset.k; emp.shaho.months[k]=emp.shaho.months[k]||{}; emp.shaho.months[k][t.classList.contains('sh-pay')?'pay':'days']=t.value; refreshShaho(i); return; }
      if(t.classList.contains('sh-mikomi')){ emp.shaho.mikomi=t.value; refreshShaho(i); return; }
      if(t.classList.contains('sh-manual')){ emp.shaho.manual=t.value; refreshShaho(i); return; }
      var f=t.dataset.f; if(f&&!t.matches('select')) emp[f]=t.value; var nm=card.querySelector('.mco-nm'); if(f==='name'&&nm)nm.textContent=t.value||'（無名）'; });
    // 従業員カードを左スワイプで削除
    var swX=0,swY=0,swCard=null;
    el.addEventListener('touchstart',function(ev){ swCard=ev.target.closest('.mco'); if(swCard){ swX=ev.touches[0].clientX; swY=ev.touches[0].clientY; } },{passive:true});
    el.addEventListener('touchend',function(ev){ if(!swCard)return; var c=swCard; swCard=null; var dx=ev.changedTouches[0].clientX-swX, dy=ev.changedTouches[0].clientY-swY;
      if(dx<-60 && Math.abs(dy)<40){ var i=+c.dataset.i, e=state.employees[i]; if(state.employees.length<=1){ alert('最低1名は必要です'); return; } if(confirm((e&&e.name||'この従業員')+' を削除しますか？')){ state.employees.splice(i,1); renderEmpMaster(); } } });

    // 入力 accordion
    var il=$('#input-list');
    il.addEventListener('click',function(e){
      var tg=e.target.closest('[data-toggle]');
      if(tg){ var i=+tg.dataset.toggle; var emp=state.employees[i]; state.open['I'+emp.id]=!state.open['I'+emp.id]; il.querySelector('.acc[data-i="'+i+'"]').classList.toggle('open'); return; }
      var wm=e.target.closest('.wi-mode'); if(wm){ var c1=e.target.closest('.acc'); var ci1=+c1.dataset.i; var em1=state.employees[ci1]; if(!em1.warimashi)em1.warimashi={}; em1.warimashi.mode=wm.dataset.wm; renderInput(); return; }
      if(e.target.classList.contains('wb-chip')){ var c2=e.target.closest('.acc'); var ci2=+c2.dataset.i; var em2=state.employees[ci2]; var lab=e.target.dataset.wb; em2.wbInclude=em2.wbInclude||[]; em2.wbExclude=em2.wbExclude||[];
        if(isInBasis(em2,lab)){ em2.wbInclude=em2.wbInclude.filter(function(x){return x!==lab;}); if(em2.wbExclude.indexOf(lab)<0)em2.wbExclude.push(lab); }
        else { em2.wbExclude=em2.wbExclude.filter(function(x){return x!==lab;}); if(em2.wbInclude.indexOf(lab)<0)em2.wbInclude.push(lab); }
        renderInput(); return; }
      if(e.target.dataset.add){ var ai=+e.target.dataset.i, g=e.target.dataset.add; state.employees[ai][g].push({label:'',value:''}); renderInput(); return; }
      if(e.target.classList.contains('m-del')&&e.target.closest('#input-list')){ var card=e.target.closest('.acc'); var ci=+card.dataset.i; var g=e.target.dataset.g, ri=+e.target.dataset.ri; state.employees[ci][g].splice(ri,1); renderInput(); return; }
    });
    il.addEventListener('input',function(e){ var card=e.target.closest('.acc'); if(!card)return; var ci=+card.dataset.i; var emp=state.employees[ci];
      if(e.target.classList.contains('wk-f')){ emp[e.target.dataset.wkf]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      if(e.target.classList.contains('wi-f')){ if(!emp.warimashi)emp.warimashi={}; emp.warimashi[e.target.dataset.wk]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      if(e.target.classList.contains('wi-df')){ if(!emp.warimashi)emp.warimashi={}; if(!emp.warimashi.detail)emp.warimashi.detail={}; var wd=e.target.dataset.wd; emp.warimashi.detail[wd]=emp.warimashi.detail[wd]||{h:'',m:''}; emp.warimashi.detail[wd][e.target.dataset.dp]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      var g=e.target.dataset.g, ri=+e.target.dataset.ri, f=e.target.dataset.f; if(e.target.classList.contains('ck')){emp[g][ri].hikazei=e.target.checked;refreshCard(ci);return;} if(g&&!isNaN(ri)&&f){emp[g][ri][f]=e.target.value;refreshCard(ci);} });

    // 一覧/集計
    $$('.seg-b[data-view]').forEach(function(b){ b.addEventListener('click',function(){ $$('.seg-b[data-view]').forEach(function(x){x.classList.toggle('on',x===b);}); var v=b.dataset.view; $('#view-list').style.display=v==='list'?'':'none'; $('#view-sum').style.display=v==='sum'?'':'none'; if(v==='sum')renderSumView(); else renderListView(); }); });
    $('#view-list').addEventListener('click',function(e){ var tg=e.target.closest('[data-ltoggle]'); if(!tg)return; var id=tg.dataset.ltoggle; state.open['L'+id]=!state.open['L'+id]; $('#view-list .acc[data-lid="'+id+'"]').classList.toggle('open'); });

    // 印刷
    $('#p-emp').addEventListener('change',doPreview);
    $('#p-month').addEventListener('change',function(){ state.month=this.value||state.month; doPreview(); });
    function afterDesign(){ renderDesign(); if($('#scr-print')&&$('#scr-print').classList.contains('active')) doPreview(); }
    $('#tpl-row').addEventListener('click',function(e){ var b=e.target.closest('[data-tpl]'); if(!b)return; state.prefer=b.dataset.tpl; afterDesign(); });
    $('#color-pickers').addEventListener('click',function(e){
      if(e.target.closest('[data-reset]')){ state.theme={accent:'#6f5a3e',line:'#cfc9b8',ink:'#23261f'}; state._oc=null; afterDesign(); return; } // 色のみ初期化(レイアウトは維持)
      var tg=e.target.closest('.cp-toggle:not(.cp-reset)'); if(tg){ state._oc=(state._oc===tg.dataset.cpk)?null:tg.dataset.cpk; renderDesign(); return; }
      var w=e.target.closest('.cw'); if(w){ state.theme[w.dataset.ck]=w.dataset.col; state._oc=null; afterDesign(); } });
    $('#b-print').addEventListener('click',function(){ var f=$('#frame'); try{f.contentWindow.focus();f.contentWindow.print();}catch(err){window.print();} });
    $('#b-pdf').addEventListener('click',function(){ alert('PDF保存/送付はSTEP5でpdf-lib配線します（今は印刷からPDF保存可）'); });
    $('#b-xlsx').addEventListener('click',function(){ if(!window.PayslipXlsx)return; var v=$('#p-emp').value; var emps=(v==='__all')?activeEmps():[state.employees[+v]]; PayslipXlsx.download(buildPeople(emps), {company:state.company.name, monthLabel:monthLabel().replace(/ /g,''), filename:'給与明細_'+state.month+'.xlsx'}); });
    window.addEventListener('resize',function(){ if($('#scr-print').classList.contains('active'))doPreview(); });
  }

  /* ---------- 永続化(localStorage既定・window.SUPA設定でSupabaseにも保存) ---------- */
  var PKEY='payslip_state_v1';
  function snapshot(){ return { v:1, company:state.company, employees:state.employees, month:state.month, theme:state.theme, prefer:state.prefer, depts:state.depts, roles:state.roles, showRetired:state.showRetired }; }
  var _saveT=null;
  function persistSave(){ try{ localStorage.setItem(PKEY, JSON.stringify(snapshot())); }catch(e){} if(window.Store&&Store.cloudSaveState){ try{ Store.cloudSaveState(snapshot()); }catch(e){} } }
  function persistSaveDebounced(){ if(_saveT)clearTimeout(_saveT); _saveT=setTimeout(persistSave, 500); }
  function persistLoad(){
    var s=null; try{ s=JSON.parse(localStorage.getItem(PKEY)||'null'); }catch(e){}
    if(s&&s.employees&&s.employees.length){
      if(s.company) state.company=s.company; state.employees=s.employees;
      if(s.month) state.month=s.month; if(s.theme) state.theme=s.theme; if(s.prefer) state.prefer=s.prefer;
      if(s.depts) state.depts=s.depts; if(s.roles) state.roles=s.roles; if(s.showRetired!=null) state.showRetired=s.showRetired;
    }
    // クラウド(Supabase)が有効なら後から読み込んで上書き＋再描画
    reloadCloud();
  }
  function applyCloudState(cs){ if(!(cs&&cs.employees&&cs.employees.length)) return false;
    state.company=cs.company||state.company; state.employees=cs.employees;
    if(cs.month)state.month=cs.month; if(cs.theme)state.theme=cs.theme; if(cs.prefer)state.prefer=cs.prefer;
    if(cs.depts)state.depts=cs.depts; if(cs.roles)state.roles=cs.roles; if(cs.showRetired!=null)state.showRetired=cs.showRetired;
    $$('.scr-month').forEach(function(m){ m.value=state.month; }); fillCompany(); var act=$('.screen.active'); if(act)showScreen(act.id); return true; }
  function reloadCloud(){ if(window.Store&&Store.cloudLoadState){ return Store.cloudLoadState().then(applyCloudState).catch(function(){return false;}); } return Promise.resolve(false); }
  window.PayslipReloadCloud=reloadCloud; window.PayslipPersistSave=persistSave;

  /* init */
  persistLoad();
  $$('.scr-month').forEach(function(m){ m.value=state.month; });
  fillCompany(); bind(); showScreen('scr-settings');
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
