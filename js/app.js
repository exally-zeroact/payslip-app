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
  var PAYTYPES=['月給','時給','日給','歩合','役員'];
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
    warimashiBasis:{ t:'💡 割増の「基礎」に入れる手当', b:'残業代の単価を計算する“もとの賃金”です。手当の<b>名前でなく実態</b>で決めます（労基法37条5項・規則21条）。\n\n<b>外せる手当（限定列挙の7種）</b>…家族・通勤・別居・子女教育・住宅・臨時・1か月超ごとの手当。ただし<b>実態が伴う場合だけ</b>。\n● 例：住宅手当が「全員に一律定額」→ 住宅費用に応じていない＝<b>基礎に入れる</b>。\n● 例：通勤手当・扶養人数で変わる家族手当→ <b>外せる</b>。\n\n上記以外の手当は原則すべて基礎に入ります。タップで含む/外すを切替えできます。' },
    koyoGyoshu:{ t:'💡 雇用保険の業種', b:'業種で雇用保険の料率が変わります。\n\n● 一般の事業／建設・農林水産・清酒製造（高め）。\n● 雇用保険は<b>通勤手当も含む賃金総額</b>に料率を掛けます。\n● <b>料率は対象月の年度で自動</b>（令和8は引下げ：一般0.50%・建設/農林0.60%）。' },
    paymentDays:{ t:'💡 支払基礎日数の数え方', b:'社会保険の<b>定時決定（毎年4〜6月）</b>で「支払基礎日数17日以上の月」を平均して標準報酬を決めます。その日数の数え方です。\n\n● 年金機構の一般扱い＝<b>月給は暦日数／日給・時給は出勤日数</b>。\n● 会社の運用に合わせて変更できます（暦日数／所定労働日数／出勤日数）。' },
    kekkin:{ t:'💡 欠勤控除の計算', b:'月給は<b>日給月給制（欠勤分を控除）が標準</b>です（民法624条 ノーワーク・ノーペイ）。\n\n● 10日欠勤すれば10日分減ります。1日あたり＝<b>月給÷分母×欠勤日数</b>。\n● 分母＝月平均所定労働日数（既定）／当月の暦日数／当月の所定労働日数 から選べます。\n● 役員等で減額しない場合のみ「<b>完全月給制</b>」に。\n● 時給・日給は元々 日数・時間で按分されます。' },
    daikyu:{ t:'💡 代休・振替休日の使い分け', b:'<b>振替休日</b>＝事前に休日と労働日を入れ替え。その出勤は<b>通常労働（割増なし）</b>。割増の「法定休日」に入れず、ふつうの労働時間に入れてください（週40時間を超えた分だけ時間外1.25倍）。\n\n<b>代休</b>＝先に休日労働→後で別の日に休む。休日労働は<b>割増あり</b>（法定休日1.35倍／所定休日は時間外1.25倍）。休む日は入力の「代休取得」へ。\n\n代休で休む日を無給にするか（日給制向け）有給にするか（月給は相殺）は会社規程によります。「代休で休んだ日を出勤から差し引く」をオンにすると出勤から控除します。' }
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
  // 雇用保険料率は労働保険年度(4/1〜翌3/31)で切替。1〜3月は前年度扱い(例 2026-03=令和7年度)。
  function employYear(){ var ym=String(state.month||''); var y=parseInt(ym.slice(0,4),10)||2026, m=parseInt(ym.slice(5,7),10)||1; var fy=(m>=4)?y:y-1; return fy>=2026?2026:2025; }
  function employRateOf(code,year){ var t=EMPLOY_RATES[year||employYear()]||EMPLOY_RATES[2026]; return t[code]!=null?t[code]:t.ippan; }

  // ライブラリは const SHAKAIHOKEN_HYO 定義で window に付かない→bare参照で取得
  function SHH(){ try{ if(typeof SHAKAIHOKEN_HYO!=='undefined'&&SHAKAIHOKEN_HYO) return SHAKAIHOKEN_HYO; }catch(e){} return (typeof window!=='undefined'&&window.SHAKAIHOKEN_HYO)||null; }
  function SAI(){ try{ if(typeof SAITEI_CHINGIN!=='undefined'&&SAITEI_CHINGIN) return SAITEI_CHINGIN; }catch(e){} return (typeof window!=='undefined'&&window.SAITEI_CHINGIN)||null; }
  // 最低賃金チェック(事業所所在地=従業員prefの地域別最賃と時間額を比較)。役員/休業中は対象外。返り{hourly,minWage,prefName,ok}
  function minWageInfo(e){
    if(!e||e.payType==='役員'||(e.workStatus&&e.workStatus!=='normal')) return null;
    var S=SAI(); if(!S||!S.getChingin) return null;
    var mw=S.getChingin(e.pref); if(!mw) return null;
    var co=state.company||{};
    var ah=(e.annualHolidays!=null&&e.annualHolidays!=='')?e.annualHolidays:co.annualHolidays;
    var dwh=num((e.dailyWorkH!=null&&e.dailyWorkH!=='')?e.dailyWorkH:co.dailyWorkH)+num((e.dailyWorkM!=null&&e.dailyWorkM!=='')?e.dailyWorkM:co.dailyWorkM)/60;
    var hourly=0;
    if(e.payType==='時給') hourly=num(e.hourly);
    else if(e.payType==='日給') hourly= dwh>0? num(e.base)/dwh : 0;
    else if(e.payType==='歩合'){ var wmw=workedMin(e); var gpw=window.Warimashi?Warimashi.guaranteePay(e.hourlyGuarantee,wmw):Math.round(num(e.hourlyGuarantee)*wmw/60); var bpw=Math.max(num(e.commissionAmt),gpw); hourly= wmw>0? bpw/(wmw/60) : 0; } // 歩合=賃金合計(高い方)÷総労働時間で最賃判定
    else { var ly=parseInt(String(state.month||'').slice(0,4),10)||0; var leap=(ly%4===0&&ly%100!==0)||(ly%400===0); var stdH=window.Warimashi?Warimashi.monthlyStdHours(ah,dwh,leap):0; hourly= stdH>0? num(e.base)/stdH : 0; }
    hourly=Math.floor(hourly);
    return { hourly:hourly, minWage:mw, prefName:((S.todofuken||{})[e.pref]||{}).name||'', ok:(hourly===0||hourly>=mw) };
  }
  function prefOptions(sel){
    var S=SHH(); var K=(S&&S.KENKO_RITSU)||{tokyo:{name:'東京都'}};
    return Object.keys(K).map(function(code){return '<option value="'+code+'"'+(code===sel?' selected':'')+'>'+esc(K[code].name)+'</option>';}).join('');
  }
  // 健保従業員負担率(対象月payYmの社保年度で自動選択)＋子育て支援金(令和8/4〜)。両方healthRateに含めて社保計算へ渡す。
  function prefRate(code, payYm){ var S=SHH(); if(S&&S.getKenko){ var k=S.getKenko(code,payYm); var sh=S.getShienkin?S.getShienkin(payYm):0; return k.jugyoin+sh; } var K=(S&&S.KENKO_RITSU)||{}; return (K[code]&&K[code].jugyoin)||0.04955; }

  function defEmp(name){
    return { id:uid(), name:name||'山田 太郎', no:'', birthYmd:'1980-05-15', dept:'', role:'',
      payType:'月給', base:'250000', hourly:'1200', commissionAmt:'', hourlyGuarantee:'', fuyou:'1', pref:'tokyo', commute:'8400', commuteType:'public', commuteKm:'', residentTax:'12500', bank:'',
      annualHolidays:'', dailyWorkH:'', dailyWorkM:'', workedH:'160', workedM:'0',
      kintai:[{label:'出勤日数',value:'21'},{label:'欠勤日数',value:'0'},{label:'有給取得',value:'1'}],
      shikyu:[{label:'基本給',value:'250000'},{label:'住宅手当',value:'10000'}],
      apply:{}, taxClass:'ko', retired:false, workStatus:'normal', leavePay:'', leaveStartYmd:'', leaveEndYmd:'', leaveDaysInMonth:'',
      warimashi:{ mode:'easy', otH:'', otM:'', nightH:'', nightM:'', holidayH:'', holidayM:'',
        detail:{ ot:{h:'',m:''}, otNight:{h:'',m:''}, over60:{h:'',m:''}, over60Night:{h:'',m:''}, night:{h:'',m:''}, holiday:{h:'',m:''}, holidayNight:{h:'',m:''} } },
      wbInclude:[], wbExclude:[],
      extraKojo:[],
      shaho:{ mode:'auto', months:[{pay:'',days:'30'},{pay:'',days:'30'},{pay:'',days:'30'}], mikomi:'', manual:'' } };
  }
  var WDAYS=['日','月','火','水','木','金','土'];
  var RULE_ITEMS=[['teikyu','休みの日'],['companyHol','会社独自の休日'],['shotei','1日の働く時間'],['annual','年間の休み'],['warimashiRate','割増の率'],['koyoGyoshu','雇用保険の業種'],['paymentDays','支払基礎日数の数え方'],['kekkin','欠勤控除の計算'],['minashi','固定残業（みなし）'],['daikyu','代休・振替休日'],['shoyo','賞与の有無']];
  var state={ company:{name:'株式会社 ゼロアクト',addr:'',close:'末日',paydayRel:'next',paydayDay:'25',
      holidays:[0], dailyWorkH:'8', dailyWorkM:'0', annualHolidays:'120',
      ruleOn:{teikyu:true,shotei:true,annual:true,warimashiRate:true,koyoGyoshu:true},
      rateOt:'', rateHoliday:'', rateNight:'', rateOver60:'', gyoshu:'ippan' },
    month:'2026-06', prefer:'col2_1', theme:{accent:'#6f5a3e',line:'#cfc9b8',ink:'#23261f'}, depts:['営業部'], roles:['課長','主任','一般'],
    employees:[defEmp('山田 太郎')], open:{},
    inputMode:'monthly', printMode:'monthly', empFilter:'active', bonus:{ payYm:'', payDay:'', byEmp:{} }, confirmed:{} };

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
  // 割増の基礎に入れる手当チップ(従業員マスタの詳細に表示。毎月でなく一度決める設定)
  function basisBoxHTML(e){
    var labels=(e.shikyu||[]).map(function(x){return x.label;}).filter(function(l){return l && !/割増/.test(l);});
    if(!labels.length) return '';
    var wiz=labels.map(function(l){ var on=isInBasis(e,l); return '<span class="wb-chip'+(on?' on':'')+'" data-wb="'+attr(l)+'">'+(on?'✓ ':'')+esc(l)+'</span>'; }).join('');
    return '<div class="wb-box"><div class="wb-h">割増の基礎に入れる手当<span class="help-i" data-help="warimashiBasis">💡</span></div><div class="wb-chips">'+wiz+'</div><div class="wb-note">通勤・家族手当は既定で外す。住宅手当などは全員一律なら入れる（実態で・詳しくは💡）。</div></div>';
  }
  function dmin(o){ return num(o&&o.h)*60+num(o&&o.m); }
  function warimashiOf(e){
    if(!window.Warimashi) return {total:0,lines:[],unit:0};
    if(e.payType==='役員') return {total:0,lines:[],unit:0}; // 役員は割増(残業)の概念なし
    if(e.payType==='歩合'){ // 出来高払=単価(歩合給÷総労働時間)に時間外+0.25/深夜+0.25/法定休日+0.35の上乗せのみ(1.0は歩合給に内包)
      var wc=e.warimashi||{}; var segc={ ot:dmin({h:wc.otH,m:wc.otM}), night:dmin({h:wc.nightH,m:wc.nightM}), holiday:dmin({h:wc.holidayH,m:wc.holidayM}) };
      return Warimashi.commission({ commissionTotal:num(e.commissionAmt), totalWorkMin:workedMin(e), seg:segc }); }
    var co=state.company||{};
    var ah=(e.annualHolidays!=null&&e.annualHolidays!=='')?e.annualHolidays:co.annualHolidays; // 会社規定・従業員で任意上書き
    var dwh=(e.dailyWorkH!=null&&e.dailyWorkH!=='')?e.dailyWorkH:co.dailyWorkH;
    var dwm=(e.dailyWorkM!=null&&e.dailyWorkM!=='')?e.dailyWorkM:co.dailyWorkM;
    var pctRate=function(v){ return (v!=null&&v!=='')?num(v)/100:undefined; };
    var rates={ ot:pctRate(co.rateOt), holiday:pctRate(co.rateHoliday), night:pctRate(co.rateNight), over60Add:pctRate(co.rateOver60) };
    var ly=parseInt(String(state.month||'').slice(0,4),10)||0; var leap=(ly%4===0&&ly%100!==0)||(ly%400===0); // 対象月の年が閏年なら年間日数366(月平均所定の分母)
    var mh=(e.minashiH!=null&&e.minashiH!=='')?e.minashiH:co.minashiH; var minashiMin=num(mh)*60; // 固定残業(みなし)時間=会社規定・従業員で上書き可。時間外の基本割増から控除
    var w=e.warimashi||{}, common={ base:warimashiBasis(e), annualHolidays:ah, dailyHours:num(dwh)+num(dwm)/60, rates:rates, leap:leap };
    if(w.mode==='detail'){
      var d=w.detail||{}; var seg={}; ['ot','otNight','over60','over60Night','night','holiday','holidayNight'].forEach(function(k){ seg[k]=dmin(d[k]); });
      return Warimashi.detail({ base:common.base, annualHolidays:common.annualHolidays, dailyHours:common.dailyHours, rates:common.rates, leap:common.leap, seg:seg, minashiMin:minashiMin });
    }
    return Warimashi.easy({ base:common.base, annualHolidays:common.annualHolidays, dailyHours:common.dailyHours, rates:common.rates, leap:common.leap,
      otH:w.otH, otM:w.otM, nightH:w.nightH, nightM:w.nightM, holidayH:w.holidayH, holidayM:w.holidayM, minashiMin:minashiMin });
  }
  function kintaiVal(e,re){ var r=(e.kintai||[]).find(function(x){return re.test(x.label||'');}); return r?num(r.value):0; }
  function workedMin(e){ return num(e.workedH)*60+num(e.workedM); }
  function workedLabel(e){ var m=workedMin(e); return Math.floor(m/60)+':'+('0'+(m%60)).slice(-2); }
  // 実出勤日数(日給の基本給用)。無給代休(daikyuDeduct)なら代休取得を出勤から控除
  function effShukkin(e){ var s=kintaiVal(e,/出勤/); if((state.company.ruleOn||{}).daikyu && state.company.daikyuDeduct) s=Math.max(0, s-kintaiVal(e,/代休取得/)); return s; }
  // 時給=時給単価×労働時間 / 日給=日給額×出勤日数 で基本給を自動算出(月給は手入力のまま)
  // 基本給を状態から導出(単一ソース)。休暇中=休暇中の金額・時給=時給×労働時間・日給=日給×出勤・月給/役員=基本給。復職/再就職で自動的に元へ戻る
  function syncBasePay(e){
    if(!e.shikyu) e.shikyu=[];
    var amt;
    if(e.workStatus && e.workStatus!=='normal') amt=num(e.leavePay);
    else if(e.payType==='時給') amt=Math.round(num(e.hourly)*workedMin(e)/60);
    else if(e.payType==='日給') amt=Math.round(num(e.base)*effShukkin(e));
    else if(e.payType==='歩合') amt= window.Warimashi?Warimashi.commissionBasePay(e.commissionAmt, e.hourlyGuarantee, workedMin(e)):Math.max(num(e.commissionAmt),Math.round(num(e.hourlyGuarantee)*workedMin(e)/60)); // 歩合実績と保障給(時給×総労働時間)の高い方=労基27条
    else amt=num(e.base);
    var idx=e.shikyu.findIndex(function(x){return /基本給/.test(x.label||'');});
    if(idx<0) e.shikyu.unshift({label:'基本給',value:String(amt)}); else e.shikyu[idx].value=String(amt);
  }
  // 在籍判定・入社/退職月の日割は lib/zaiseki.js(純関数・テスト可能)に集約。bare参照で解決。
  function ZK(){ return (typeof Zaiseki!=='undefined')?Zaiseki:(window&&window.Zaiseki); }
  function isActiveInMonth(e, ym){ var z=ZK(); return z?z.isActiveInMonth(e,ym):!(e.retired&&!e.taishokuYmd); }
  function prorateInfo(e, ym){ var z=ZK(); return z?z.prorateInfo(e,ym):{prorate:false,factor:1,shahoMonth:true,isJoin:false,isLeave:false,zd:0,dim:0,mid:false}; }
  // 勤怠カレンダー: その月の所定労働日数(暦日−休みの曜日−祝日−会社独自休)。祝日エンジン未読込ならnull
  function HD(){ return (typeof Holidays!=='undefined')?Holidays:(window&&window.Holidays); }
  function scheduledDaysOf(ym){ var H=HD(); if(!H)return null; return H.scheduledWorkdays(ym, (state.company&&state.company.holidays)||[], (state.company&&state.company.companyHolidays)||[]); }
  function compute(e){
    syncCommute(e); syncBasePay(e);
    var pr=prorateInfo(e, state.month); e._prorate=pr;
    var sb=shahoBasisOf(e);
    // 標準報酬未確定時の暫定基礎は「割増を除く固定支給(通勤含む)」。割増(残業)で社保が膨らまないように。
    var fb=(e.shikyu||[]).reduce(function(a,x){return a+num(x.value);},0);
    e.hyojunBase = sb.hoshu>0 ? sb.hoshu : fb;
    var w=warimashiOf(e); e._wari=w; // 割増は満額base(=e.shikyu)で算定済→日割の影響を受けない
    var shikyu=(e.shikyu||[]).slice();
    // 入社月/退職月の日割: 基本給＋課税手当を在籍日数で日割(通勤/非課税/割増は除外)。標準報酬(hyojunBase)・割増は満額のまま。
    if(pr.prorate && pr.factor<1){ shikyu=shikyu.map(function(x){ if(x.hikazei||/通勤|割増/.test(x.label||'')) return x; return {label:x.label, value:Math.round(num(x.value)*pr.factor), hikazei:x.hikazei, nonTaxLimit:x.nonTaxLimit}; }); }
    if(w.total>0) shikyu=shikyu.concat([{label:'割増賃金',value:w.total}]); // 課税・総支給・雇用保険ベースに算入(日割しない)
    // 欠勤控除(月給・日給月給制): 月給で欠勤があれば不就労分を控除(完全月給制はしない)。割増基礎/標準報酬は満額のまま(=このローカルshikyuにだけ負の行を足す)
    // ★日割する月(入社月/退職月)は欠勤控除を併用しない(二重控除防止)
    var coK=state.company||{};
    if(!pr.prorate && e.payType==='月給' && !(e.workStatus&&e.workStatus!=='normal') && !coK.kanzenGekkyu){
      var kday=kintaiVal(e,/欠勤/);
      if(kday>0){
        var ahK=(e.annualHolidays!=null&&e.annualHolidays!=='')?e.annualHolidays:coK.annualHolidays;
        var dhK=num((e.dailyWorkH!=null&&e.dailyWorkH!=='')?e.dailyWorkH:coK.dailyWorkH)+num((e.dailyWorkM!=null&&e.dailyWorkM!=='')?e.dailyWorkM:coK.dailyWorkM)/60;
        var kgaku=PayrollCalc.calcKekkin({ base:num(e.base), ym:state.month, kekkinDays:kday, annualHolidays:ahK, dailyHours:dhK, method:coK.kekkinMethod });
        kgaku=Math.min(kgaku, num(e.base)); // 基本給を超えて引かない
        if(kgaku>0) shikyu=shikyu.concat([{label:'欠勤控除',value:-kgaku}]);
      }
    }
    // 産休/育休の社保免除を月末在籍基準で当月判定。日付未設定=null→従来(e.applyの全月免除)のまま=回帰ゼロ。
    var apply=e.apply;
    if(e.workStatus==='sankyu'||e.workStatus==='ikukyu'){
      var zk=ZK();
      var ex=(zk&&zk.shahoExemptMonthly)?zk.shahoExemptMonthly({leaveType:e.workStatus,startYmd:e.leaveStartYmd,endYmd:e.leaveEndYmd,ym:state.month,leaveDaysInMonth:num(e.leaveDaysInMonth)}):null;
      e._shahoExemptThisMonth=ex; // 注記用
      if(ex!=null){ apply=Object.assign({},e.apply||{},{health:ex?false:true,pension:ex?false:true,kaigo:ex?false:true}); }
    }
    return PayslipCalc.computePayslip({ shikyu:shikyu, birthYmd:e.birthYmd, payYm:state.month, fuyou:num(e.fuyou), taxClass:e.taxClass, residentTax:num(e.residentTax), healthRate:prefRate(e.pref,state.month), employRate:employRateOf((state.company||{}).gyoshu), hyojunBase:e.hyojunBase, apply:apply, extraKojo:e.extraKojo, shahoMonth:pr.shahoMonth });
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
    if(id==='scr-input'){ $('#in-month').textContent=monthLabel(); renderInputArea(); }
    if(id==='scr-list') renderListView();
    if(id==='scr-print') renderPrint();
  }

  /* ---------- 設定: 会社情報 ---------- */
  function fillCompany(){ $('#c-name').value=state.company.name; $('#c-addr').value=state.company.addr; $('#c-close').value=state.company.close; $('#c-payrel').value=state.company.paydayRel||'next'; $('#c-payday-day').value=state.company.paydayDay||''; updatePaydayPreview(); renderRuleChips(); renderCompanyRules(); renderDesign(); }
  function renderRuleChips(){
    var host=$('#rule-chips'); if(!host)return; var on=state.company.ruleOn||{};
    host.innerHTML=RULE_ITEMS.map(function(it){var o=!!on[it[0]];return '<span class="chip'+(o?' on':'')+'" data-rule="'+it[0]+'">'+(o?'✓ ':'')+it[1]+'</span>';}).join('');
  }
  function ruleItemHTML(key,title,sub,helpKey,inner){
    return '<div class="rule-item"><span class="ri-x" data-rule-x="'+key+'">× 外す</span><div class="flabel">'+title+(sub?'<span class="hint2">（'+sub+'）</span>':'')+(helpKey?'<span class="help-i" data-help="'+helpKey+'">💡</span>':'')+'</div>'+inner+'</div>';
  }
  function renderCompanyRules(){
    var host=$('#rule-host'); if(!host)return; var c=state.company, on=c.ruleOn||{}, h='';
    if(on.teikyu){ h+=ruleItemHTML('teikyu','休みの日は？','法定休日','teikyu',
      '<div class="wdays">'+WDAYS.map(function(d,i){return '<span class="wday'+((c.holidays||[]).indexOf(i)>=0?' on':'')+'" data-wd="'+i+'">'+d+'</span>';}).join('')+'</div><div class="ri-note">複数えらべます。法律上の休み(法定休日)は自動で特定。例：日曜だけ＝週休1日(現場系OK)。</div>'); }
    if(on.companyHol){
      var coh=(c.companyHolidays||[]);
      var cohRows=coh.map(function(d,di){ return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px"><input type="date" class="finput" data-coh="'+di+'" value="'+attr(d)+'" style="flex:1"><button class="b-del" data-coh-del="'+di+'" style="width:30px">×</button></div>'; }).join('');
      h+=ruleItemHTML('companyHol','会社独自の休日','年末年始・夏季休暇など','','<div>'+cohRows+'</div><button class="mini add" data-coh-add="1" style="margin-top:4px">＋ 休日を追加</button><div class="ri-note">国民の祝日は<b>自動</b>です。ここは会社が独自に決めた休み（創立記念日・年末年始・夏季休暇など）だけ。当月の所定労働日数に反映します。</div>'); }
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
        +'</div><div class="ri-note">空欄＝法定どおり自動（残業125%・休日135%・深夜+25%）。会社は上げられます（詳しくは💡）。</div>';
      h+=ruleItemHTML('warimashiRate','割増の率','残業・休日・深夜','warimashi',rr); }
    if(on.koyoGyoshu){
      var gopts=EMPLOY_GYOSHU.map(function(g){return '<option value="'+g[0]+'"'+(c.gyoshu===g[0]?' selected':'')+'>'+esc(g[1])+'（労'+(employRateOf(g[0])*100).toFixed(2)+'%）</option>';}).join('');
      h+=ruleItemHTML('koyoGyoshu','雇用保険の業種','一般/建設/農林','koyoGyoshu','<select class="cr-sel" data-cf="gyoshu">'+gopts+'</select><div class="ri-note">建設・農林水産・清酒製造は料率が高め。雇用保険は通勤手当も含む賃金総額に掛けます。<b>料率は対象月の年度で自動</b>（令和8は引下げ：一般0.50%・建設/農林0.60%）。</div>'); }
    if(on.paymentDays){
      var pm=c.paymentDaysMethod||'';
      var pmo=[['','自動（月給=暦日数 / 日給・時給=出勤日数）'],['calendar','暦日数（毎月その月の日数）'],['scheduled','所定労働日数（欠勤は差引）'],['worked','出勤日数']]
        .map(function(o){return '<option value="'+o[0]+'"'+(pm===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');
      h+=ruleItemHTML('paymentDays','支払基礎日数の数え方','定時決定の'+'17日判定','paymentDays','<select class="cr-sel" data-cf="paymentDaysMethod">'+pmo+'</select><div class="ri-note">定時決定(4〜6月)の17日判定の数え方。既定＝月給は暦日数/日給時給は出勤日数（詳しくは💡）。</div>'); }
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
    var warn=(s==='kyugyo'&&num(e.leavePay)<=0)?'<div class="cr-warn">⚠ 休業手当が未入力(0)です。会社都合の休業は<b>平均賃金の60%以上</b>の支払いが必要(労基法26条)。「休暇中の金額」に入れてください。</div>':'';
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
  function empCardBody(e,i){
    var dOpen=!!state.open['D'+e.id];
    var payField=(e.payType==='時給'?'hourly':e.payType==='歩合'?'hourlyGuarantee':'base');
    var amtLabel=(e.payType==='時給'?'時給単価':e.payType==='日給'?'日給額':e.payType==='役員'?'役員報酬':e.payType==='歩合'?'保障給の時給':'基本給');
    // ── 基本（常時表示）: これだけで登録と概算が成立 ──
    var basic=''
      +'<div class="frow"><div class="flabel">氏名</div><input class="finput m-f" data-f="name" value="'+attr(e.name)+'"></div>'
      +'<div class="frow2"><div class="frow"><div class="flabel">給与形態</div><select class="finput m-f" data-f="payType">'+PAYTYPES.map(function(p){return '<option'+(p===e.payType?' selected':'')+'>'+p+'</option>';}).join('')+'</select></div>'
        +'<div class="frow"><div class="flabel">'+amtLabel+'<span class="hint2">円'+(e.payType==='歩合'?'/時':'')+'</span></div><input class="finput num m-f" data-f="'+payField+'" inputmode="numeric" value="'+attr(fmtN(e[payField]))+'"></div></div>'
      +(e.payType==='歩合'?'<div class="ri-note" style="margin:-4px 2px 8px">歩合給額は毎月「入力」タブで。基本給＝歩合実績と保障給（保障時給×総労働時間）の高い方（労基27条）。割増は歩合給÷総労働時間に上乗せ。</div>':'')
      +(function(){ var mw=minWageInfo(e); if(!mw||mw.ok) return ''; return '<div style="font-size:10.5px;color:#C0392B;margin:-4px 2px 8px">⚠ 最低賃金（'+esc(mw.prefName)+' 時給'+fmtN(mw.minWage)+'円）未満（約'+fmtN(mw.hourly)+'円）</div>'; })()
      +'<div class="frow2"><div class="frow"><div class="flabel">都道府県<span class="hint2">健保率</span></div><select class="finput m-f" data-f="pref">'+prefOptions(e.pref)+'</select></div>'
        +'<div class="frow"><div class="flabel">通勤手当<span class="hint2">円/月</span><span class="help-i" data-help="commute">💡</span></div><input class="finput num m-f" data-f="commute" inputmode="numeric" value="'+attr(fmtN(e.commute))+'"></div></div>';
    // ── 詳細（折りたたみ・既定で閉じる）──
    var detail=''
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
      +'<div class="frow"><div class="flabel">扶養人数<span class="hint2">配偶者含</span><span class="help-i" data-help="fuyou">💡</span></div><input class="finput num m-f" data-f="fuyou" value="'+attr(e.fuyou)+'"></div>'
      +'<div class="chip-row" style="margin:-2px 0 10px"><span class="chip'+(e.taxClass==='otsu'?' on':'')+'" data-tax="1">'+(e.taxClass==='otsu'?'✓ ':'')+'副業・掛け持ち（所得税は乙欄）</span><span class="help-i" data-help="taxclass" style="margin-left:6px">💡</span></div>'
      +'<div class="frow"><div class="flabel">通勤方法</div><select class="finput m-f" data-f="commuteType"><option value="public"'+(e.commuteType!=='car'?' selected':'')+'>公共交通</option><option value="car"'+(e.commuteType==='car'?' selected':'')+'>マイカー等</option></select></div>'
      +(e.commuteType==='car'?'<div class="frow2"><div class="frow"><div class="flabel">片道距離<span class="hint2">km</span></div><input class="finput num m-f" data-f="commuteKm" value="'+attr(e.commuteKm)+'"></div><div class="frow"><div class="flabel">非課税限度<span class="hint2">自動</span></div><input class="finput num" value="'+yen(commuteLimit(e))+'" readonly style="background:#f7fcf9;color:#3D6B53"></div></div>':'<div class="hint" style="margin:-4px 0 10px">公共交通＝月15万まで非課税。マイカーは距離別（自動）。</div>')
      +'<div class="frow"><div class="flabel">住民税<span class="hint2">円/月</span></div><input class="finput num m-f" data-f="residentTax" inputmode="numeric" value="'+attr(fmtN(e.residentTax))+'"></div>'
      +'<div class="frow"><div class="flabel">振込先<span class="hint2">任意</span></div><input class="finput m-f" data-f="bank" value="'+attr(e.bank)+'" placeholder="○○銀行 普通 1234567"></div>'
      +shahoSection(e)
      +'<div class="sec-lb" style="border-top:1px dashed #d4eae0">法定控除（使わないものは外せる）<span class="help-i" data-help="legalkojo">💡</span></div>'
      +'<div class="chip-row">'+LEGAL_KOJO.map(function(lk){
          if(lk[0]==='kaigo'){ var kt=(window.PayrollCalc&&PayrollCalc.isKaigoTarget(e.birthYmd,state.month)); if(!kt) return '<span class="chip chip-dim" title="40〜64歳が対象。生年月日から自動">介護保険（対象外）</span>'; var ko=(e.apply&&e.apply.kaigo===false); return '<span class="chip'+(ko?'':' on')+'" data-apply="kaigo" title="40〜64歳=自動で対象">'+(ko?'':'✓ ')+'介護保険（自動）</span>'; }
          var off=(e.apply&&e.apply[lk[0]]===false); return '<span class="chip'+(off?'':' on')+'" data-apply="'+lk[0]+'">'+(off?'':'✓ ')+esc(lk[1])+'</span>';
        }).join('')+'</div>'
      +'<div class="sec-lb">支給項目（タップでON/OFF・通勤は上の欄）</div><div class="chip-row">'+chips(e,SUP_POOL,'shikyu')+'</div>'
      +'<div class="addcustom"><input class="finput ac-inp" data-g="shikyu" placeholder="自由な項目名（例：特別手当）"><button class="btn-ghost ac-btn" data-g="shikyu" style="padding:10px 12px">＋追加</button></div>'
      +basisBoxHTML(e)
      +'<div class="sec-lb">控除項目（法定は自動・任意分のみ）</div><div class="chip-row">'+chips(e,KOJO_POOL,'extraKojo')+'</div>'
      +'<div class="addcustom"><input class="finput ac-inp" data-g="extraKojo" placeholder="自由な項目名（例：寮費）"><button class="btn-ghost ac-btn" data-g="extraKojo" style="padding:10px 12px">＋追加</button></div>'
      +'<div style="display:flex;justify-content:space-between;margin-top:10px">'
        +'<button class="m-retire btn-ghost" style="color:#7A6A2E;border-color:#e6dcb0;padding:8px 14px">'+(e.retired?'復帰させる':'退職にする')+'</button>'
        +'<button class="m-del-emp btn-ghost" style="color:#C0392B;border-color:#f3c9c4;padding:8px 14px">この従業員を削除</button></div>';
    return '<div class="mco-body">'+basic
      +'<div class="emp-dtgl" data-dtoggle="'+i+'">詳細設定（社保・控除・手当・在籍など）<span class="mco-cv" style="margin-left:auto;transform:'+(dOpen?'rotate(180deg)':'none')+'">▾</span></div>'
      +(dOpen?'<div class="emp-detail">'+detail+'</div>':'')
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
      if(mode==='teiji') body+='<div style="text-align:right;margin-top:2px"><span class="sh-refetch" data-refetch="1" style="font-size:12px;color:#3D9E72;text-decoration:underline;cursor:pointer">過去の4〜6月から自動入力</span></div>';
    } else if(mode==='shutoku'){
      body+='<div class="sh-tip">入社時は実績が無いので<b>入社月の見込み月額</b>（基本給＋手当の見込み・通勤含む）で決定します。</div><div class="frow"><div class="flabel">見込み月額<span class="hint2">円</span></div><input class="finput num sh-mikomi" value="'+attr(s.mikomi)+'" placeholder="280000"></div>';
    } else {
      body+='<div class="sh-tip">決定通知書・保険料額表の<b>標準報酬月額</b>をそのまま入力します。</div><div class="frow"><div class="flabel">標準報酬月額<span class="hint2">円</span></div><input class="finput num sh-manual" value="'+attr(s.manual)+'" placeholder="340000"></div>';
    }
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
    return '<div class="sh-hero"><div class="lb">毎月この人から天引きする社会保険（本人負担）</div><div class="big">'+yen(soho)+(tag?'<span style="font-size:12px;color:#7aa08c;font-family:\'Noto Sans JP\'">'+tag+'</span>':'')+'</div>'
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
  // 表示順(部署グループ+退職表示の順)の従業員index配列
  function empOnLeave(e){ return !!(e&&e.workStatus&&e.workStatus!=='normal'); }
  function empMatchesFilter(e){ var f=state.empFilter||'active'; if(f==='all')return true; if(f==='retired')return !!e.retired; if(f==='leave')return !e.retired&&empOnLeave(e); return !e.retired&&!empOnLeave(e); }
  function visibleEmpIdx(){ var arr=[]; var groups={},order=[]; state.employees.forEach(function(e,idx){ if(!empMatchesFilter(e))return; var g=e.dept||'未分類'; if(!groups[g]){groups[g]=[];order.push(g);} groups[g].push(idx); }); order.forEach(function(g){ groups[g].forEach(function(idx){ arr.push(idx); }); }); return arr; }
  // 従業員を表示順で1つ上(dir=-1)/下(dir=+1)へ。配列の並びを入替=入力/一覧/印刷/Excel 全部に反映・永続(sort:i)
  function moveEmp(i, dir){ var vis=visibleEmpIdx(); var p=vis.indexOf(i); var q=p+dir; if(p<0||q<0||q>=vis.length) return; var a=state.employees, j=vis[q]; var t=a[i]; a[i]=a[j]; a[j]=t; renderEmpMaster(); }
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
    html+='<div class="hint" style="margin:0 2px 8px">カードを左にスワイプ＝削除（または開いて下の「削除」）。休暇・退職もここで（カードを開いて設定）。</div>';
    if(!order.length) html+='<p class="hint" style="margin:8px 2px">この絞り込みに該当する人はいません。</p>';
    order.forEach(function(g){
      if(anyDept) html+='<div class="grp-hd">'+esc(g)+'（'+groups[g].length+'名）</div>';
      groups[g].forEach(function(i){
        var e=state.employees[i], op=state.open[e.id];
        html+='<div class="mco'+(op?' open':'')+(e.retired?' mco-retired':'')+'" data-i="'+i+'">'
          +'<div class="mco-hd" data-toggle="'+i+'"><span class="mco-nm">'+esc(e.name||'（無名）')+'</span>'
            +'<span class="hd-chip'+(e.workStatus&&e.workStatus!=='normal'?' on':'')+'" data-goleave="'+i+'">'+(e.workStatus&&e.workStatus!=='normal'?esc(WS_LABEL(e.workStatus)):'休暇')+'</span>'
            +'<span class="hd-chip" data-goretire="'+i+'">退職</span>'
            +'<span class="mco-sub">'+esc(e.payType)+(e.role?' / '+esc(e.role):'')+'</span>'
            +(visibleEmpIdx().length>1?'<span class="mco-ord"><button class="ord-b" data-moveup="'+i+'" title="上へ">▲</button><button class="ord-b" data-movedn="'+i+'" title="下へ">▼</button></span>':'')
            +'<span class="mco-cv">▾</span></div>'
          +(op?empCardBody(e,i):'')+'</div>';
      });
    });
    host.innerHTML=html;
  }

  /* ---------- 入力（自動計算） ---------- */
  function rowsHTML(g,arr){
    return arr.map(function(it,ri){
      var labelAuto=/通勤|出張|旅費|宿泊|日当/.test(it.label||'');
      // 支給行は非課税を“トグル”に(任意の手当を非課税にできる)。項目名で自動判定される通勤等はON固定(自動)
      var hz='';
      if(g==='shikyu'){
        hz = labelAuto
          ? '<label class="row-hz" title="項目名から自動で非課税" style="font-size:10px;color:#3D9E72;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:2px"><input type="checkbox" checked disabled style="width:13px;height:13px">非課税</label>'
          : '<label title="チェックで所得税の非課税にする(社保は対象)" style="font-size:10px;color:'+(it.hikazei?'#3D9E72':'#A9C4B6')+';font-weight:'+(it.hikazei?'700':'400')+';white-space:nowrap;display:inline-flex;align-items:center;gap:2px"><input type="checkbox" class="ck" data-g="shikyu" data-ri="'+ri+'"'+(it.hikazei?' checked':'')+' style="width:13px;height:13px">非課税</label>';
      }
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
    if(e.payType==='歩合'){ // 歩合は出来高払の上乗せのみ(残業/深夜+25%・法定休日+35%)。固定残業/詳細区分の概念なし=かんたん3枠固定
      var durc=function(key,lab,sub){ return '<div class="wi-row"><span class="wi-l">'+lab+'<small>'+sub+'</small></span><span class="dur">'
        +'<input class="wi-f" data-wk="'+key+'H" inputmode="numeric" placeholder="0" value="'+attr(w[key+'H'])+'"><i>時間</i>'
        +'<input class="wi-f" data-wk="'+key+'M" inputmode="numeric" placeholder="0" value="'+attr(w[key+'M'])+'"><i>分</i></span></div>'; };
      return '<div class="grp"><div class="grp-h">割増（歩合の上乗せ）<span class="help-i" data-help="warimashi">💡</span></div>'
        +'<div class="wi-note2">歩合の1時間単価＝歩合給÷総労働時間。残業・深夜は＋25%、法定休日は＋35%の上乗せのみ（1.0は歩合給に含むため）。</div>'
        +durc('ot','残業した時間','歩合＋25%')+durc('night','深夜の時間','夜22時〜朝5時＋25%')+durc('holiday','休日に出た時間','法定休日＋35%')
        +'<div class="wi-resw">'+wiResHTML(e)+'</div></div>'; }
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
      +seg+body+minashiNote+'<div class="wi-resw">'+wiResHTML(e)+'</div></div>';
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
    if(e.payType==='日給'){ var d=effShukkin(e); var dd=((state.company.ruleOn||{}).daikyu&&state.company.daikyuDeduct&&kintaiVal(e,/代休取得/)>0);
      return '<div class="hint" style="margin:-4px 2px 8px;color:#3D6B53">基本給（自動）＝ 日給 '+fmtN(e.base)+'円 × 出勤日数 '+d+'日'+(dd?'（代休控除後）':'')+' ＝ <b>'+yen(Math.round(num(e.base)*d))+'</b>（出勤日数は上の勤怠で）</div>'; }
    if(e.payType==='歩合'){ var wm=workedMin(e); var gp=window.Warimashi?Warimashi.guaranteePay(e.hourlyGuarantee,wm):Math.round(num(e.hourlyGuarantee)*wm/60); var ca=num(e.commissionAmt); var applied=Math.max(ca,gp); var useG=gp>ca; var gh=Math.round(wm/60*100)/100;
      return '<div class="grp"><div class="grp-h">歩合給（出来高）</div>'
        +'<label class="ic-f ic-f2"><span>歩合給額<small>円</small></span><input class="finput num cm-f ic-in" data-cmf="commissionAmt" inputmode="numeric" placeholder="0" value="'+attr(fmtN(e.commissionAmt))+'"></label>'
        +'<div class="hint" style="margin:4px 2px 8px;color:'+(useG?'#92500A':'#3D6B53')+'">基本給（自動）＝ '+(useG?'保障給 <b>'+yen(gp)+'</b>（時給'+fmtN(e.hourlyGuarantee)+'円×'+gh+'h）を適用':'歩合実績 <b>'+yen(ca)+'</b>を適用')+(useG?'（歩合がこれを下回るため労基27条の保障給）':'（保障給'+yen(gp)+'円より高い）')+'</div>'
        +'<div style="font-size:10px;color:#7aa08c;margin:-4px 2px 8px">保障給の時給は「設定▸従業員マスタ」で。割増は下の「歩合の上乗せ」で。</div></div>'; }
    return '';
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
      return '<div class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:5px"><input class="finput" data-g="kintai" data-ri="'+ri+'" data-f="label" value="'+attr(it.label)+'" style="flex:1.3" placeholder="項目"><input class="finput num" data-g="kintai" data-ri="'+ri+'" data-f="value" value="'+attr(it.value)+'" style="flex:1" placeholder="値"><button class="b-del m-del" data-g="kintai" data-ri="'+ri+'">×</button></div>';
    }).join('');
  }
  // 前月比/差分: 先月の保存値(pay_payslips)と今月の計算(手取り)を比較
  function prevYmOf(ym){ ym=String(ym||'2026-06'); var y=+ym.slice(0,4),m=+ym.slice(5,7)-1; if(m<1){m=12;y--;} return y+'-'+('0'+m).slice(-2); }
  function loadPrev(){ if(!(window.Store&&Store.getPayslipsByYm)) return; var pm=prevYmOf(state.month); if(state._prevYm===pm) return; state._prevYm=pm;
    Store.getPayslipsByYm(pm,pm).then(function(rows){ var m={}; (rows||[]).forEach(function(r){ if(r&&r.data&&r.data.net!=null) m[r.employee_id]=num(r.data.net); }); state._prev=m;
      if($('#scr-input')&&$('#scr-input').classList.contains('active')) renderInput();
      if($('#scr-list')&&$('#scr-list').classList.contains('active')) renderListView(); }).catch(function(){});
  }
  function diffBadge(e,r){ var pv=state._prev||{}; if(!(e.id in pv)) return ''; var d=r.net-pv[e.id]; if(d===0) return ''; var cls=d>0?'up':'dn'; var t=d>0?'▲+'+fmtN(d):'▼'+fmtN(-d); return '<span class="diffb '+cls+'" title="前月比('+state._prevYm+')">'+t+'</span>'; }
  // ── 確認(未入力)ハイブリッド: 自動の前月比＋手動の確認✓・変動なしは自動済扱い ──
  function empConfirmed(e){ var c=state.confirmed&&state.confirmed[state.month]; return !!(c&&c[e.id]); }
  function empAutoOk(e,r){ var pv=state._prev||{}; return (e.id in pv) && (r.net-pv[e.id])===0; } // 前月あり且つ変動なし=自動済扱い
  function empNeedsReview(e,r){ return !empConfirmed(e) && !empAutoOk(e,r); }      // 変化あり/新規 かつ 未確認
  function reviewCounts(){ var done=0,total=0; state.employees.forEach(function(e){ if(!isActiveInMonth(e,state.month))return; total++; var r=compute(e); if(empConfirmed(e)||empAutoOk(e,r))done++; }); return {done:done,total:total,need:total-done}; }
  function setConfirm(id,on){ if(!state.confirmed[state.month])state.confirmed[state.month]={}; if(on)state.confirmed[state.month][id]=true; else delete state.confirmed[state.month][id]; }
  function toast(msg){ try{ var t=document.getElementById('app-toast'); if(!t){ t=document.createElement('div'); t.id='app-toast'; t.style.cssText='position:fixed;left:50%;bottom:88px;transform:translateX(-50%);background:#2E7D54;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.22);z-index:9999;opacity:0;transition:opacity .25s;pointer-events:none'; document.body.appendChild(t); } t.textContent=msg; t.style.opacity='1'; clearTimeout(t._h); t._h=setTimeout(function(){ t.style.opacity='0'; },2200); }catch(e){} }
  // 入社月/退職月の日割・社保の注記(黄・ブロックしない)
  function prorateNote(e){ var pr=e._prorate; if(!pr||(!pr.prorate&&pr.shahoMonth)) return ''; var msg=[];
    if(pr.prorate&&pr.factor<1) msg.push((pr.isJoin&&!pr.isLeave?'入社月':pr.isLeave&&!pr.isJoin?'退職月':'入社/退職月')+'につき在籍'+pr.zd+'日で日割（'+pr.zd+'/'+pr.dim+'日）');
    if(pr.mid) msg.push('月中退職のため当月の社保（健保・厚年・介護）は徴収しません（資格喪失=退職日翌日・前月分まで／雇用保険は実支払分）');
    return msg.length?'<div class="cr-warn" style="margin:0 12px 10px">⚠ '+msg.join('。')+'。</div>':''; }
  function renderInput(){
    var host=$('#input-list'); if(!host) return; loadPrev();
    var sche=scheduledDaysOf(state.month), H=HD();
    var hols=H?H.holidaysInMonth(state.month):[];
    var holStr=hols.length?hols.map(function(x){return x.day+'日 '+x.name;}).join('・'):'なし';
    var calHTML = sche==null ? '' :
      '<div class="cal-box" style="background:#F0FAF4;border:1px solid #C8ECD8;border-radius:12px;padding:10px 12px;margin-bottom:12px">'
      +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">'
        +'<b style="color:#2E7D54;font-size:13px">当月の所定労働日数 '+sche+'日</b>'
        +'<span style="font-size:10.5px;color:#7aa08c">（休みの曜日・祝日・会社休を除く）</span>'
        +'<button class="cal-fill" data-fillsche="'+sche+'" style="margin-left:auto;padding:7px 12px;border:1px solid #3D9E72;background:#fff;color:#2E7D54;border-radius:9px;font-weight:700;font-size:12px;cursor:pointer">全員の出勤を所定('+sche+'日)で埋める</button>'
      +'</div>'
      +'<div style="font-size:10.5px;color:#3D6B53;margin-top:5px">祝日: '+esc(holStr)+'</div>'
      +'<div style="font-size:10px;color:#7aa08c;margin-top:3px">出勤日数は所定を初期表示。各自で手修正できます（赤で止めません）。会社独自の休みは「設定▸会社の決まり」で追加できます。</div>'
      +'</div>';
    var cnt=reviewCounts(), reviewOnly=!!state._reviewOnly;
    var progHTML='<div class="cal-box" style="background:#fff;border:1px solid #d4eae0;border-radius:12px;padding:10px 12px;margin-bottom:12px">'
      +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">'
        +'<b style="color:#2E7D54;font-size:13px">確認 '+cnt.done+'/'+cnt.total+'名</b>'
        +(cnt.need>0?'<span style="background:#fff8e1;border:1px solid #F4D8A8;color:#92500A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">未確認 '+cnt.need+'名</span>':'<span style="font-size:11px;color:#3D9E72;font-weight:700">✓ 全員確認済</span>')
        +'<label style="font-size:11px;color:#3D6B53;display:inline-flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" data-reviewonly'+(reviewOnly?' checked':'')+' style="width:13px;height:13px">要確認だけ表示</label>'
        +'<span id="save-status" style="margin-left:auto;font-size:10.5px;color:#A9C4B6">'+(state._savedAt?'自動保存済 '+esc(state._savedAt):'')+'</span>'
      +'</div>'
      +'<div style="font-size:10px;color:#7aa08c;margin-top:4px">前月と変わった人だけ「確認」を。変わっていない人は自動で確認済み扱いです。</div>'
      +'</div>';
    var cards=state.employees.map(function(e,i){
      if(!isActiveInMonth(e,state.month)) return '';
      ensureKintai(e);
      if(sche!=null){ var soi=kinIdx(e,/出勤/); if(soi>=0 && (e.kintai[soi].value===''||e.kintai[soi].value==null)) e.kintai[soi].value=String(sche); }
      var r=compute(e);
      if(reviewOnly && !empNeedsReview(e,r)) return '';
      var open=state.open['I'+e.id], mw=minWageInfo(e);
      var cf=empConfirmed(e), nr=empNeedsReview(e,r);
      var confHTML = cf
        ? '<label class="emp-conf" style="font-size:10.5px;color:#3D9E72;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:2px;cursor:pointer"><input type="checkbox" class="econf" data-econf="'+i+'" checked style="width:13px;height:13px">確認済</label>'
        : nr ? '<label class="emp-conf" style="font-size:10.5px;color:#92500A;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:2px;cursor:pointer"><input type="checkbox" class="econf" data-econf="'+i+'" style="width:13px;height:13px">確認</label>'
        : '';
      return '<div class="acc icard'+(open?' open':'')+'" data-i="'+i+'">'
        +'<div class="ic-top"><span class="acc-nm">'+esc(e.name)+wsBadge(e)+'</span><span class="acc-net">'+yen(r.net)+'</span><span class="diffb-wrap">'+diffBadge(e,r)+'</span>'+confHTML+'<button class="ic-detail" data-toggle="'+i+'">詳細<span class="acc-cv">▾</span></button></div>'
        +compactKinHTML(e)+prorateNote(e)
        +((mw&&!mw.ok)?'<div class="cr-warn" style="margin:0 12px 10px">⚠ 最低賃金（'+esc(mw.prefName)+'：時給'+fmtN(mw.minWage)+'円）を下回っています（約'+fmtN(mw.hourly)+'円）。設定▸従業員マスタで'+(e.payType==='時給'?'時給':'基本給')+'を上げてください。</div>':'')
        +'<div class="acc-body">'
          +basePayInputHTML(e,i)
          +(e.payType==='役員'?'':warimashiInputHTML(e))
          +daikyuInputHTML(e)
          +'<div class="grp"><div class="grp-h">その他の勤怠<button class="mini add" data-add="kintai" data-i="'+i+'">＋</button></div><div class="rows">'+otherKinRows(e)+'</div></div>'
          +'<div class="grp"><div class="grp-h">支給<button class="mini add" data-add="shikyu" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('shikyu',e.shikyu)+'</div></div>'
          +'<div class="grp"><div class="grp-h">法定外控除<button class="mini add" data-add="extraKojo" data-i="'+i+'">＋</button></div><div class="rows">'+rowsHTML('extraKojo',e.extraKojo)+'</div></div>'
          +'<div class="calc-wrap">'+calcBoxHTML(e)+'</div></div></div>';
    }).join('');
    var emptyMsg=(reviewOnly && !cards) ? '<p class="hint" style="text-align:center;padding:18px 0">要確認の人はいません（全員確認済み）。</p>' : '';
    var confirmBtn='<div style="display:flex;align-items:center;gap:10px;margin:14px 0 4px"><button class="btn-primary" data-confirm-month style="flex:0 0 auto;padding:11px 18px;font-size:14px">今月を確定</button>'
      +(cnt.need>0?'<span style="font-size:11px;color:#92500A;font-weight:700">未確認 '+cnt.need+'名</span>':'<span style="font-size:11px;color:#3D9E72;font-weight:700">✓ 確認済</span>')
      +'<span style="font-size:10px;color:#7aa08c">確定すると全員を確認済みにして今月分を保存します（あとで直せます）。</span></div>';
    host.innerHTML=calHTML+progHTML+cards+emptyMsg+confirmBtn;
  }
  function refreshCard(i){ var e=state.employees[i]; var card=$('#input-list .acc[data-i="'+i+'"]'); if(!card) return; var r=compute(e); card.querySelector('.acc-net').textContent=yen(r.net); var dw=card.querySelector('.diffb-wrap'); if(dw) dw.innerHTML=diffBadge(e,r); var cw=card.querySelector('.calc-wrap'); if(cw) cw.innerHTML=calcBoxHTML(e); var wr=card.querySelector('.wi-resw'); if(wr) wr.innerHTML=wiResHTML(e); }

  // ───────── 賞与(ボーナス)モード ─────────
  function SZ(){ try{ if(typeof ShoyoZei!=='undefined'&&ShoyoZei) return ShoyoZei; }catch(e){} return (typeof window!=='undefined'&&window.ShoyoZei)||null; }
  function bonusYmOf(){ return (state.bonus&&state.bonus.payYm)||state.month; }
  function employYearOfYm(ym){ var y=parseInt(String(ym||'').slice(0,4),10)||2026, m=parseInt(String(ym||'').slice(5,7),10)||1; var fy=(m>=4)?y:y-1; return fy>=2026?2026:2025; }
  // 賞与支給月の前月の「社保控除後給与(kazei)」を履歴(pay_payslips)から取得
  function loadBonusPrev(){ if(!(window.Store&&Store.getPayslipsByYm)) return; var pm=prevYmOf(bonusYmOf()); if(state._bonusPrevYm===pm) return; state._bonusPrevYm=pm;
    Store.getPayslipsByYm(pm,pm).then(function(rows){ var m={}; (rows||[]).forEach(function(r){ if(r&&r.data&&r.data.kazei!=null) m[r.employee_id]=num(r.data.kazei); }); state._bonusPrev=m;
      if($('#scr-input')&&$('#scr-input').classList.contains('active')&&state.inputMode==='bonus') renderBonus(); }).catch(function(){});
  }
  function bonusEntry(e){ var b=state.bonus||(state.bonus={payYm:'',payDay:'',byEmp:{}}); if(!b.byEmp)b.byEmp={}; if(!b.byEmp[e.id])b.byEmp[e.id]={amount:'',prevAfter:'',ytd:''}; return b.byEmp[e.id]; }
  function computeBonus(e){
    var SZl=SZ(), S=SHH(), ym=bonusYmOf(), en=bonusEntry(e);
    var bonus=num(en.amount), prevMap=state._bonusPrev||{};
    var manualPrev=(en.prevAfter!=null&&en.prevAfter!==''), histPrev=(e.id in prevMap);
    var prevAfter=manualPrev?num(en.prevAfter):(histPrev?prevMap[e.id]:null);
    var hasKaigo=(window.PayrollCalc&&PayrollCalc.isKaigoTarget)?PayrollCalc.isKaigoTarget(e.birthYmd,ym):false;
    var si=SZl?SZl.calcBonusSI({ bonus:bonus, healthRate:prefRate(e.pref,ym), kaigoRate:(S&&S.getKaigo)?S.getKaigo(ym).jugyoin:0.00795, hasKaigo:hasKaigo, employRate:employRateOf((state.company||{}).gyoshu, employYearOfYm(ym)), ytdKenpoBonus:num(en.ytd) }):{total:0,health:0,pension:0,kaigo:0,employ:0,hyojun:0,kenpoBase:0,koseiBase:0};
    // 産休/育休の賞与社保免除(産休=賞与月末が産休中/育休=連続1か月超)。日付未設定=従来(workStatusで全免除)。雇用保険は実支払×率で残す。
    var bonusExempt=false;
    if(e.workStatus==='sankyu'||e.workStatus==='ikukyu'){
      var zb=ZK();
      var be=(zb&&zb.shahoExemptBonus)?zb.shahoExemptBonus({leaveType:e.workStatus,startYmd:e.leaveStartYmd,endYmd:e.leaveEndYmd,bonusYm:ym}):null;
      bonusExempt=(be==null)?true:be; // 日付未設定→従来どおり全免除
    }
    if(bonusExempt){ si={ total:si.employ, health:0, pension:0, kaigo:0, employ:si.employ, hyojun:si.hyojun, kenpoBase:si.kenpoBase, koseiBase:si.koseiBase }; }
    e._bonusExempt=bonusExempt;
    var tax={tax:0}, noPrev=false;
    if(prevAfter==null) noPrev=true;
    else if(SZl) tax=SZl.calcBonusTax({ bonus:bonus, bonusSI:si.total, prevSalary:prevAfter, prevSI:0, fuyou:num(e.fuyou), taxClass:e.taxClass, payYm:ym });
    var taxAmt=noPrev?0:(tax.tax||0);
    return { bonus:bonus, prevAfter:prevAfter, fromHistory:(!manualPrev&&histPrev), noPrev:noPrev, si:si, tax:tax, taxAmt:taxAmt, net:bonus-si.total-taxAmt };
  }
  function renderBonus(){
    var host=$('#bonus-view'); if(!host) return; loadBonusPrev();
    var b=state.bonus||{}, ym=bonusYmOf(), pm=prevYmOf(ym);
    var head='<div class="card" style="padding:12px;margin-bottom:10px">'
      +'<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">'
      +'<label style="font-size:12px;color:#2E7D54;font-weight:700">賞与支給月 <input type="month" class="finput finput-sm" data-bn="payYm" value="'+attr(ym)+'"></label>'
      +'<label style="font-size:12px;color:#2E7D54;font-weight:700">支給日 <input class="finput finput-sm" data-bn="payDay" value="'+attr(b.payDay)+'" placeholder="例 12月10日" style="width:110px"></label>'
      +'</div>'
      +'<div class="hint" style="margin:8px 0 0">賞与の所得税は<b>前月（'+esc(pm)+'）の給与（社保控除後）</b>と扶養人数で率が決まります（国税庁 算出率表）。前月を計算・保存していれば自動、無ければ各行で手入力してください。</div>'
      +'<div class="hint" style="margin:4px 0 0;color:#92500A">⚠ 健康保険は<b>年度累計573万円</b>まで（厚年は1回150万円まで）。年内2回目以降の賞与は、各行の<b>「本年度の既往賞与（標準賞与額）累計」</b>を入れると累計573万で自動調整します。</div>'
      +'<div class="hint" style="margin:4px 0 0">産休中の支払賞与は社保免除。育休は<b>賞与支払月末を含む連続1か月超の育休</b>のみ社保免除（厚年81条の2・令和4年改正）。従業員マスタの休業開始/終了日で自動判定（雇用保険は実額のため残ります）。</div></div>';
    var cards=state.employees.filter(function(e){return isActiveInMonth(e,ym);}).map(function(e){
      var c=computeBonus(e), en=bonusEntry(e);
      var prevBox = c.noPrev
        ? '<div class="cr-warn" style="margin:6px 0">⚠ 前月（'+esc(pm)+'）の給与（社保控除後）が未取得です。前月を計算・保存するか、ここに手入力してください（赤で止めません）。<div style="margin-top:5px">前月給与(社保控除後) <input class="finput num" data-bp="'+e.id+'" inputmode="numeric" value="'+attr(en.prevAfter)+'" placeholder="円" style="width:130px"></div></div>'
        : '<div style="font-size:11px;color:#4b6b58;margin:5px 0">前月給与(社保控除後): <b>'+yen(c.prevAfter)+'</b> '+(c.fromHistory?'（前月'+esc(pm)+'から自動）':'（手入力）')+' <input class="finput num" data-bp="'+e.id+'" inputmode="numeric" value="'+attr(en.prevAfter)+'" placeholder="上書き" style="width:100px;margin-left:6px"></div>';
      var hyojun=c.si.hyojun||0, caps='';
      if(hyojun>0&&c.si.kenpoBase<hyojun) caps+='<span class="cap-badge">健保 年573万上限</span>';
      if(hyojun>0&&c.si.koseiBase<hyojun) caps+='<span class="cap-badge">厚年 1回150万上限</span>';
      var taxLine, warn='';
      if(c.noPrev){ taxLine='<div class="calc-line"><span>源泉所得税</span><span class="v">前月給与の入力待ち</span></div>'; }
      else if(c.tax.special){ taxLine='<div class="calc-line"><span>源泉所得税</span><span class="v">月額表で要計算</span></div>'; warn='<div class="cr-warn" style="margin:6px 0">⚠ 前月給与なし／賞与が前月給与(社保後)の10倍超のため、この賞与は月額表で計算する特例です。源泉税は手計算してください。</div>'; }
      else { taxLine='<div class="calc-line"><span>源泉所得税（率 '+c.tax.rate+'%'+(c.tax.otsu?'・乙欄':'')+'）</span><span class="v">'+yen(c.taxAmt)+'</span></div>'; }
      return '<div class="acc icard'+(num(en.amount)>0?' open':'')+'">'
        +'<div class="ic-top"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(c.net)+'</span></div>'
        +'<div style="padding:0 12px 12px">'
        +'<div style="display:flex;gap:8px;align-items:center;margin:6px 0"><span style="font-size:12px;color:#2E7D54;font-weight:700;min-width:54px">賞与額</span><input class="finput num" data-ba="'+e.id+'" inputmode="numeric" value="'+attr(en.amount)+'" placeholder="円" style="flex:1"></div>'
        +prevBox
        +'<div style="font-size:11px;color:#4b6b58;margin:5px 0">本年度の既往賞与（標準賞与額）累計 <input class="finput num" data-by="'+e.id+'" inputmode="numeric" value="'+attr(en.ytd)+'" placeholder="0" style="width:110px"> 円 <span style="color:#8FA89A">（2回目以降のみ・健保 年573万上限用）</span></div>'
        +(caps?'<div style="margin:4px 0">'+caps+'</div>':'')+warn
        +'<div class="calc-box"><div class="ch">賞与の自動計算（標準賞与額 '+yen(hyojun)+'）</div>'
          +'<div class="calc-line"><span>賞与額</span><span class="v">'+yen(c.bonus)+'</span></div>'
          +'<div class="calc-line"><span>健康保険</span><span class="v">'+yen(c.si.health)+'</span></div>'
          +(c.si.kaigo>0?'<div class="calc-line"><span>介護保険</span><span class="v">'+yen(c.si.kaigo)+'</span></div>':'')
          +'<div class="calc-line"><span>厚生年金</span><span class="v">'+yen(c.si.pension)+'</span></div>'
          +'<div class="calc-line"><span>雇用保険</span><span class="v">'+yen(c.si.employ)+'</span></div>'
          +taxLine
          +'<div class="calc-line net tot"><span>差引支給額（手取り）</span><span class="v">'+yen(c.net)+'</span></div></div>'
        +'</div></div>';
    }).join('');
    host.innerHTML=head+(cards||'<p class="hint">対象の従業員がいません。</p>');
  }
  function renderInputArea(){
    var ml=$('#input-list'), bv=$('#bonus-view'), hint=$('#in-hint'), bonus=(state.inputMode==='bonus');
    $$('.imode').forEach(function(x){ x.classList.toggle('on', x.dataset.imode===state.inputMode); });
    if(ml) ml.style.display=bonus?'none':''; if(bv) bv.style.display=bonus?'':'none'; if(hint) hint.style.display=bonus?'none':'';
    if(bonus) renderBonus(); else renderInput();
  }

  /* ---------- 一覧 / 集計 ---------- */
  function renderListView(){
    var host=$('#view-list'); if(!host) return; loadPrev();
    host.innerHTML=state.employees.filter(function(e){return isActiveInMonth(e,state.month);}).map(function(e){
      var r=compute(e), open=state.open['L'+e.id];
      var pay=r.shikyu.map(function(s){return '<div class="dl"><span>'+esc(s.label)+'</span><span class="v">'+yen(s.value)+'</span></div>';}).join('');
      var ded=r.kojo.map(function(k){return '<div class="dl"><span>'+esc(k.label)+'</span><span class="v">'+yen(k.value)+'</span></div>';}).join('');
      return '<div class="acc'+(open?' open':'')+'" data-lid="'+e.id+'"><div class="acc-h" data-ltoggle="'+e.id+'"><span class="acc-nm">'+esc(e.name)+'</span><span class="acc-net">'+yen(r.net)+'</span>'+diffBadge(e,r)+'<span class="acc-cv">▾</span></div>'
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
  function buildPeople(emps){ return emps.map(function(e){ var r=compute(e); var k=(e.kintai||[]).filter(function(x){ if(/代休取得|振替休日/.test(x.label||'')) return num(x.value)>0; return true; }); var oi=k.findIndex(function(x){return /出勤/.test(x.label||'');}); var wt={label:'労働時間',value:workedLabel(e)}; if(oi>=0)k.splice(oi+1,0,wt); else k.unshift(wt); return { name:e.name, company:state.company.name, payDate:payDateStr(), kintai:k, shikyu:r.shikyu, kojo:r.kojo, net:r.net, shikyuTotal:r.shikyuTotal, kojoTotal:r.kojoTotal }; }); }
  // 賞与明細用: 月次明細と同じテンプレ/テーマ(ユーザー選択)で 勤怠なし・支給=賞与/控除=賞与社保+源泉
  function bonusMonthLabel(){ var ym=bonusYmOf(); var y=Number(ym.slice(0,4)), m=Number(ym.slice(5,7)); var k=['','一','二','三','四','五','六','七','八','九','十','十一','十二']; return '令 和 '+(y-2018)+' 年 '+(k[m]||m)+' 月 賞 与'; }
  function buildBonusPeople(emps){ return emps.map(function(e){ var c=computeBonus(e); var kojo=[{label:'健康保険',value:c.si.health}]; if(c.si.kaigo>0) kojo.push({label:'介護保険',value:c.si.kaigo}); kojo.push({label:'厚生年金',value:c.si.pension}); kojo.push({label:'雇用保険',value:c.si.employ}); kojo.push({label:'源泉所得税',value:c.taxAmt}); return { name:e.name, company:state.company.name, payDate:(state.bonus&&state.bonus.payDay)||payDateStr(), kintai:[], shikyu:[{label:'賞与',value:c.bonus}], kojo:kojo, net:c.net, shikyuTotal:c.bonus, kojoTotal:c.si.total+c.taxAmt }; }); }
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
      cp.innerHTML='<div class="cp-bar">'+bar+'<button class="cp-toggle cp-reset" data-reset="1">↺ 色を初期に戻す</button></div>'+pal;
    }
    // テンプレの種類ギャラリー(横ストリップは横長カード=full幅)
    var tr=$('#tpl-row'); if(tr){ tr.innerHTML=TPL_OPTS.map(function(t){ var on=(state.prefer||'col2_1')===t[0];
      return '<button type="button" class="tpl-card'+(on?' on':'')+(t[4]?' land':'')+'" data-tpl="'+t[0]+'"><span class="tpl-badge">✓</span><img class="tpl-thumb" src="img/'+t[2]+'.png" alt="'+t[1]+'"><div class="tpl-meta"><div class="tpl-name">'+t[1]+'</div><div class="tpl-desc">'+t[3]+'</div></div></button>'; }).join(''); }
  }
  function renderPrint(){
    $('#p-month').value=state.month;
    $$('.pmode').forEach(function(x){ x.classList.toggle('on', x.dataset.pmode===(state.printMode||'monthly')); });
    var sel=$('#p-emp'); sel.innerHTML='<option value="__all">全員</option>'+state.employees.map(function(e,i){return isActiveInMonth(e,state.month)?'<option value="'+i+'">'+esc(e.name)+'</option>':'';}).join('');
    doPreview();
  }
  function doPreview(){
    var v=$('#p-emp').value; var emps=v==='__all'?state.employees.filter(function(e){return isActiveInMonth(e,state.month);}):[state.employees[+v]];
    var isBonus=state.printMode==='bonus';
    var people=isBonus?buildBonusPeople(emps):buildPeople(emps);
    var doc=isBonus?{month:bonusMonthLabel(),kind:'bonus'}:{month:monthLabel()};
    var out=Render.build(people, doc, state.prefer, state.theme);
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
    document.addEventListener('change',function(ev){ if(!ev.target.classList.contains('scr-month'))return; state.month=ev.target.value||state.month; state._prevYm=null; state._bonusPrevYm=null; /* 月替わりで前月比/賞与前月キャッシュを更新 */ $$('.scr-month').forEach(function(m){ m.value=state.month; }); updatePaydayPreview();
      if($('#scr-input').classList.contains('active')){$('#in-month').textContent=monthLabel();renderInputArea();}
      if($('#scr-list').classList.contains('active')) renderListView(); });

    // 入力タブ: 月次給与/賞与 モード切替
    var inScr=$('#scr-input');
    function bonusEmpOf(el){ var id=el.dataset.ba||el.dataset.bp||el.dataset.by; return (state.employees||[]).find(function(x){return x.id===id;}); }
    if(inScr){
      inScr.addEventListener('click',function(ev){ var m=ev.target.closest('.imode'); if(!m)return; state.inputMode=m.dataset.imode==='bonus'?'bonus':'monthly'; renderInputArea(); if(window.persistSaveDebounced)persistSaveDebounced(); });
      // 入力中は値を保存のみ(再描画しない=フォーカス維持)。結果はblur(change)で更新。
      inScr.addEventListener('input',function(ev){ var ba=ev.target.closest('[data-ba]'), bp=ev.target.closest('[data-bp]'), by=ev.target.closest('[data-by]'); if(!ba&&!bp&&!by)return;
        var e=bonusEmpOf(ba||bp||by); if(!e)return; var en=bonusEntry(e);
        if(ba) en.amount=ba.value.replace(/[^0-9]/g,''); else if(bp) en.prevAfter=bp.value.replace(/[^0-9]/g,''); else en.ytd=by.value.replace(/[^0-9]/g,'');
        if(window.persistSaveDebounced)persistSaveDebounced(); });
      inScr.addEventListener('change',function(ev){
        var bn=ev.target.closest('[data-bn]');
        if(bn){ if(!state.bonus)state.bonus={byEmp:{}}; if(bn.dataset.bn==='payYm'){ state.bonus.payYm=bn.value; state._bonusPrevYm=null; } else { state.bonus.payDay=bn.value; } renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); return; }
        var ba=ev.target.closest('[data-ba]'), bp=ev.target.closest('[data-bp]'), by=ev.target.closest('[data-by]');
        if(ba||bp||by){ var e=bonusEmpOf(ba||bp||by); if(e){ var en=bonusEntry(e); if(ba) en.amount=ba.value.replace(/[^0-9]/g,''); else if(bp) en.prevAfter=bp.value.replace(/[^0-9]/g,''); else en.ytd=by.value.replace(/[^0-9]/g,''); } renderBonus(); if(window.persistSaveDebounced)persistSaveDebounced(); }
      });
    }

    // 設定 seg
    $('#set-seg').addEventListener('click',function(ev){ var b=ev.target.closest('.seg-b'); if(!b)return; $$('.seg-b',this).forEach(function(x){x.classList.toggle('on',x===b);}); var s=b.dataset.set;
      $('#set-company').style.display=s==='company'?'':'none'; $('#set-emp').style.display=s==='emp'?'':'none'; $('#set-design').style.display=s==='design'?'':'none';
      if(s==='emp')renderEmpMaster(); if(s==='design')renderDesign(); });
    // 従業員マスタ：絞り込み(在籍中/休暇中/退職者/全員)
    $('#emp-list').addEventListener('click',function(ev){ var f=ev.target.closest('[data-empfilter]'); if(!f)return; state.empFilter=f.dataset.empfilter; renderEmpMaster(); });
    ['name','addr','close'].forEach(function(k){ var el=$('#c-'+k); if(el) el.addEventListener('input',function(){ state.company[k]=this.value; }); });
    var pr=$('#c-payrel'); if(pr) pr.addEventListener('change',function(){ state.company.paydayRel=this.value; updatePaydayPreview(); });
    var pd=$('#c-payday-day'); if(pd) pd.addEventListener('input',function(){ state.company.paydayDay=this.value.replace(/[^0-9末]/g,''); updatePaydayPreview(); });
    // 会社の決まり：項目チップ
    $('#rule-chips').addEventListener('click',function(ev){
      var ch=ev.target.closest('[data-rule]'); if(ch){ var k=ch.dataset.rule; if(!state.company.ruleOn)state.company.ruleOn={}; state.company.ruleOn[k]=!state.company.ruleOn[k]; renderRuleChips(); renderCompanyRules(); return; }
    });
    // 会社の決まり：曜日・外す・数値
    var rh=$('#rule-host');
    rh.addEventListener('click',function(ev){
      var wd=ev.target.closest('.wday'); if(wd){ var i=+wd.dataset.wd; var hs=state.company.holidays||[]; var p=hs.indexOf(i); if(p>=0)hs.splice(p,1); else hs.push(i); state.company.holidays=hs; renderCompanyRules(); return; }
      if(ev.target.closest('[data-coh-add]')){ state.company.companyHolidays=(state.company.companyHolidays||[]); state.company.companyHolidays.push(''); renderCompanyRules(); return; }
      var cd=ev.target.closest('[data-coh-del]'); if(cd){ (state.company.companyHolidays||[]).splice(+cd.dataset.cohDel,1); renderCompanyRules(); return; }
      var x=ev.target.closest('[data-rule-x]'); if(x){ state.company.ruleOn[x.dataset.ruleX]=false; renderRuleChips(); renderCompanyRules(); return; }
    });
    rh.addEventListener('input',function(ev){ if(ev.target.tagName==='SELECT')return; var f=ev.target.dataset.cf; if(f) state.company[f]=ev.target.value.replace(/[^0-9]/g,''); });
    rh.addEventListener('change',function(ev){ if(ev.target.dataset.coh!=null){ state.company.companyHolidays=(state.company.companyHolidays||[]); state.company.companyHolidays[+ev.target.dataset.coh]=ev.target.value; return; } var f=ev.target.dataset.cf; if(f==='gyoshu'){ state.company.gyoshu=ev.target.value; return; } if(f==='paymentDaysMethod'){ state.company.paymentDaysMethod=ev.target.value; return; } if(f==='kekkinMethod'){ state.company.kekkinMethod=ev.target.value; return; } if(f==='kanzenGekkyu'){ state.company.kanzenGekkyu=ev.target.checked; renderCompanyRules(); return; } if(f==='daikyuDeduct'){ state.company.daikyuDeduct=ev.target.checked; return; } if(f==='annualHolidays'||f==='dailyWorkH'||f==='dailyWorkM') renderCompanyRules(); });
    $('#b-add-emp').addEventListener('click',function(){ var e=defEmp('従業員 '+(state.employees.length+1)); state.employees.push(e); state.open[e.id]=true; renderEmpMaster(); });

    // 従業員マスタ操作
    var el=$('#emp-list');
    el.addEventListener('click',function(ev){
      if(ev.target.dataset.showret){ state.showRetired=!state.showRetired; renderEmpMaster(); return; }
      var dtg=ev.target.closest('[data-dtoggle]'); if(dtg){ var de=state.employees[+dtg.dataset.dtoggle]; state.open['D'+de.id]=!state.open['D'+de.id]; renderEmpMaster(); return; } // 詳細設定の開閉
      var mu=ev.target.closest('[data-moveup]'); if(mu){ moveEmp(+mu.dataset.moveup,-1); return; }
      var md=ev.target.closest('[data-movedn]'); if(md){ moveEmp(+md.dataset.movedn,1); return; }
      if(ev.target.dataset.goleave!=null){ var gl=+ev.target.dataset.goleave; var ge=state.employees[gl]; state.open[ge.id]=true; state.open['D'+ge.id]=true; renderEmpMaster(); return; } // カードの詳細(就業状況)を開く=1経路に集約
      if(ev.target.dataset.goretire!=null){ var gr=+ev.target.dataset.goretire; if(activeEmps().length<=1){ alert('稼働中は最低1名必要です'); return; } if(!confirm((state.employees[gr].name||'この従業員')+' を退職にしますか？')) return; state.employees[gr].retired=true; state.employees[gr].retiredYmd=state.month; renderEmpMaster(); return; }
      var card=ev.target.closest('.mco');
      var tg=ev.target.closest('[data-toggle]');
      if(tg){ var ti=+tg.dataset.toggle; var e=state.employees[ti]; state.open[e.id]=!state.open[e.id]; renderEmpMaster(); return; }
      if(!card) return; var i=+card.dataset.i; var emp=state.employees[i];
      var sm=ev.target.closest('.sh-mode'); if(sm){ if(!emp.shaho)emp.shaho={months:[]}; emp.shaho.mode=sm.dataset.mode; if(sm.dataset.mode==='teiji'){ autoFillTeijiMonths(emp, renderEmpMaster); } else { renderEmpMaster(); } return; }
      if(ev.target.dataset.refetch){ autoFillTeijiMonths(emp, renderEmpMaster); return; }
      if(ev.target.dataset.apply){ var ak=ev.target.dataset.apply; if(!emp.apply)emp.apply={}; emp.apply[ak]=(emp.apply[ak]===false)?true:false; renderEmpMaster(); return; }
      if(ev.target.dataset.short){ emp.shortTime=!emp.shortTime; renderEmpMaster(); return; }
      if(ev.target.dataset.tax){ emp.taxClass=(emp.taxClass==='otsu')?'ko':'otsu'; renderEmpMaster(); return; }
      if(ev.target.classList.contains('wb-chip')){ var wlab=ev.target.dataset.wb; emp.wbInclude=emp.wbInclude||[]; emp.wbExclude=emp.wbExclude||[];
        if(isInBasis(emp,wlab)){ emp.wbInclude=emp.wbInclude.filter(function(x){return x!==wlab;}); if(emp.wbExclude.indexOf(wlab)<0)emp.wbExclude.push(wlab); }
        else { emp.wbExclude=emp.wbExclude.filter(function(x){return x!==wlab;}); if(emp.wbInclude.indexOf(wlab)<0)emp.wbInclude.push(wlab); }
        renderEmpMaster(); return; }
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
      if(e.target.classList.contains('econf')){ var eci=+e.target.dataset.econf; var emc=state.employees[eci]; if(emc){ setConfirm(emc.id, e.target.checked); renderInput(); persistSaveDebounced(); } return; }
      if(e.target.dataset.reviewonly!=null){ state._reviewOnly=e.target.checked; renderInput(); return; }
      var cmb=e.target.closest('[data-confirm-month]');
      if(cmb){ state.employees.forEach(function(emp){ if(isActiveInMonth(emp,state.month)) setConfirm(emp.id,true); }); try{ saveMonthlyPayslips(); }catch(_){} persistSave(); renderInput(); toast('今月を確定しました'); return; }
      var fs=e.target.closest('[data-fillsche]');
      if(fs){ var sd=fs.dataset.fillsche; state.employees.forEach(function(emp){ if(!isActiveInMonth(emp,state.month))return; ensureKintai(emp); var oi=kinIdx(emp,/出勤/); if(oi>=0) emp.kintai[oi].value=sd; }); renderInput(); if(window.persistSaveDebounced)persistSaveDebounced(); return; }
      var tg=e.target.closest('[data-toggle]');
      if(tg){ var i=+tg.dataset.toggle; var emp=state.employees[i]; state.open['I'+emp.id]=!state.open['I'+emp.id]; il.querySelector('.acc[data-i="'+i+'"]').classList.toggle('open'); return; }
      var wm=e.target.closest('.wi-mode'); if(wm){ var c1=e.target.closest('.acc'); var ci1=+c1.dataset.i; var em1=state.employees[ci1]; if(!em1.warimashi)em1.warimashi={}; em1.warimashi.mode=wm.dataset.wm; renderInput(); return; }
      if(e.target.dataset.add){ var ai=+e.target.dataset.i, g=e.target.dataset.add; state.employees[ai][g].push({label:'',value:''}); renderInput(); return; }
      if(e.target.classList.contains('m-del')&&e.target.closest('#input-list')){ var card=e.target.closest('.acc'); var ci=+card.dataset.i; var g=e.target.dataset.g, ri=+e.target.dataset.ri; state.employees[ci][g].splice(ri,1); renderInput(); return; }
    });
    il.addEventListener('input',function(e){ var card=e.target.closest('.acc'); if(!card)return; var ci=+card.dataset.i; var emp=state.employees[ci];
      if(e.target.classList.contains('wk-f')){ emp[e.target.dataset.wkf]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      if(e.target.classList.contains('cm-f')){ emp[e.target.dataset.cmf]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      if(e.target.classList.contains('wi-f')){ if(!emp.warimashi)emp.warimashi={}; emp.warimashi[e.target.dataset.wk]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      if(e.target.classList.contains('wi-df')){ if(!emp.warimashi)emp.warimashi={}; if(!emp.warimashi.detail)emp.warimashi.detail={}; var wd=e.target.dataset.wd; emp.warimashi.detail[wd]=emp.warimashi.detail[wd]||{h:'',m:''}; emp.warimashi.detail[wd][e.target.dataset.dp]=e.target.value.replace(/[^0-9]/g,''); refreshCard(ci); return; }
      var g=e.target.dataset.g, ri=+e.target.dataset.ri, f=e.target.dataset.f; if(e.target.classList.contains('ck')){emp[g][ri].hikazei=e.target.checked;refreshCard(ci);return;} if(g&&!isNaN(ri)&&f){emp[g][ri][f]=e.target.value;refreshCard(ci);} });

    // 一覧/集計
    $$('.seg-b[data-view]').forEach(function(b){ b.addEventListener('click',function(){ $$('.seg-b[data-view]').forEach(function(x){x.classList.toggle('on',x===b);}); var v=b.dataset.view; $('#view-list').style.display=v==='list'?'':'none'; $('#view-sum').style.display=v==='sum'?'':'none'; if(v==='sum')renderSumView(); else renderListView(); }); });
    $('#view-list').addEventListener('click',function(e){ var tg=e.target.closest('[data-ltoggle]'); if(!tg)return; var id=tg.dataset.ltoggle; state.open['L'+id]=!state.open['L'+id]; $('#view-list .acc[data-lid="'+id+'"]').classList.toggle('open'); });

    // 印刷
    $('#p-emp').addEventListener('change',doPreview);
    $('#p-month').addEventListener('change',function(){ state.month=this.value||state.month; doPreview(); });
    $('#print-mode-seg').addEventListener('click',function(e){ var b=e.target.closest('.pmode'); if(!b)return; state.printMode=b.dataset.pmode==='bonus'?'bonus':'monthly'; $$('.pmode').forEach(function(x){ x.classList.toggle('on', x.dataset.pmode===state.printMode); }); doPreview(); });
    function afterDesign(){ renderDesign(); if($('#scr-print')&&$('#scr-print').classList.contains('active')) doPreview(); }
    $('#tpl-row').addEventListener('click',function(e){ var b=e.target.closest('[data-tpl]'); if(!b)return; state.prefer=b.dataset.tpl; afterDesign(); });
    $('#color-pickers').addEventListener('click',function(e){
      if(e.target.closest('[data-reset]')){ state.theme={accent:'#6f5a3e',line:'#cfc9b8',ink:'#23261f'}; state._oc=null; afterDesign(); return; } // 色のみ初期化(レイアウトは維持)
      var tg=e.target.closest('.cp-toggle:not(.cp-reset)'); if(tg){ state._oc=(state._oc===tg.dataset.cpk)?null:tg.dataset.cpk; renderDesign(); return; }
      var w=e.target.closest('.cw'); if(w){ state.theme[w.dataset.ck]=w.dataset.col; state._oc=null; afterDesign(); } });
    $('#b-print').addEventListener('click',function(){ var f=$('#frame'); try{f.contentWindow.focus();f.contentWindow.print();}catch(err){window.print();} });
    $('#b-xlsx').addEventListener('click',function(){ if(!window.PayslipXlsx)return; var v=$('#p-emp').value; var emps=(v==='__all')?state.employees.filter(function(e){return isActiveInMonth(e,state.month);}):[state.employees[+v]];
      var isBonus=state.printMode==='bonus'; // 印刷の月次/賞与トグルに合わせる(賞与で月次が出る不具合を修正)
      var people=isBonus?buildBonusPeople(emps):buildPeople(emps);
      var lbl=(isBonus?bonusMonthLabel():monthLabel()).replace(/ /g,'');
      var fn=isBonus?('賞与明細_'+bonusYmOf()+'.xlsx'):('給与明細_'+state.month+'.xlsx');
      PayslipXlsx.download(people, {company:state.company.name, monthLabel:lbl, filename:fn}); });
    window.addEventListener('resize',function(){ if($('#scr-print').classList.contains('active'))doPreview(); });
  }

  /* ---------- 月次明細を自動保存(定時決定4-6月の自動入力の素) ---------- */
  // 当月(state.month)の各従業員の総支給/支払基礎日数等を pay_payslips に保存(同月同人は上書き)。
  function saveMonthlyPayslips(){
    if(!(window.Store&&Store.savePayslip)) return; var ym=state.month; if(!ym) return;
    var method=(state.company||{}).paymentDaysMethod||'';
    activeEmps().forEach(function(e){ try{
      var r=compute(e);
      var days=(window.PayrollCalc&&PayrollCalc.calcPaymentDays)?PayrollCalc.calcPaymentDays(e,ym,method):0;
      Store.savePayslip(ym, e.id, { name:e.name, shikyuTotal:r.shikyuTotal, paymentDays:days, kojoTotal:r.kojoTotal, net:r.net, kazei:r.kazei, siTotal:(r.si&&r.si.total)||0 });
    }catch(_e){} });
  }
  // 定時決定: 当年の4・5・6月の履歴から 総支給+支払基礎日数 を自動セット(無い月は空欄=手入力)
  function autoFillTeijiMonths(emp, cb){
    if(!(window.Store&&Store.getPayslipsByYm&&window.PayrollCalc)){ if(cb)cb(); return; }
    var yms=PayrollCalc.getTeijiYms(state.month);
    Store.getPayslipsByYm(yms[0],yms[2]).then(function(rows){
      var mine=(rows||[]).filter(function(r){ return r.employee_id===emp.id; });
      if(!emp.shaho) emp.shaho={}; emp.shaho.mode='teiji';
      emp.shaho.months=yms.map(function(ym){ var row=mine.find(function(r){return r.ym===ym;}); var d=row&&row.data;
        return { pay:(d&&d.shikyuTotal!=null)?String(d.shikyuTotal):'', days:(d&&d.paymentDays!=null)?String(d.paymentDays):'' }; });
      if(cb)cb();
    }).catch(function(){ if(cb)cb(); });
  }

  /* ---------- 永続化(localStorage既定・window.SUPA設定でSupabaseにも保存) ---------- */
  var PKEY='payslip_state_v1';
  function snapshot(){ return { v:1, company:state.company, employees:state.employees, month:state.month, theme:state.theme, prefer:state.prefer, depts:state.depts, roles:state.roles, showRetired:state.showRetired, bonus:state.bonus, confirmed:state.confirmed }; }
  var _saveT=null;
  function persistSave(){ try{ localStorage.setItem(PKEY, JSON.stringify(snapshot())); }catch(e){} if(window.Store&&Store.cloudSaveState){ try{ Store.cloudSaveState(snapshot()); }catch(e){} } try{ saveMonthlyPayslips(); }catch(e){}
    try{ var d=new Date(); state._savedAt=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); var ss=document.getElementById('save-status'); if(ss) ss.textContent='自動保存済 '+state._savedAt; }catch(e){} }
  function persistSaveDebounced(){ if(_saveT)clearTimeout(_saveT); _saveT=setTimeout(persistSave, 500); }
  // 旧テンプレ名→新テンプレ名(実体準拠)への移行。保存済みstate.preferを吸収
  var PREFER_MIGRATE={cols:'col2_1',cols2:'col2_2',cols3:'col2_3',vstack:'col1_1',vstack2:'col1_2',strips:'col1_3'};
  function migPrefer(p){ return PREFER_MIGRATE[p]||p||'col2_1'; }
  function persistLoad(){
    var s=null; try{ s=JSON.parse(localStorage.getItem(PKEY)||'null'); }catch(e){}
    if(s&&s.employees&&s.employees.length){
      if(s.company) state.company=s.company; state.employees=s.employees;
      if(s.month) state.month=s.month; if(s.theme) state.theme=s.theme; if(s.prefer) state.prefer=migPrefer(s.prefer);
      if(s.depts) state.depts=s.depts; if(s.roles) state.roles=s.roles; if(s.showRetired!=null) state.showRetired=s.showRetired;
      if(s.bonus) state.bonus=s.bonus;
      if(s.confirmed) state.confirmed=s.confirmed;
    }
    // クラウド(Supabase)が有効なら後から読み込んで上書き＋再描画
    reloadCloud();
  }
  function applyCloudState(cs){ if(!(cs&&cs.employees&&cs.employees.length)) return false;
    state.company=cs.company||state.company; state.employees=cs.employees;
    if(cs.month)state.month=cs.month; if(cs.theme)state.theme=cs.theme; if(cs.prefer)state.prefer=migPrefer(cs.prefer);
    if(cs.depts)state.depts=cs.depts; if(cs.roles)state.roles=cs.roles; if(cs.showRetired!=null)state.showRetired=cs.showRetired;
    if(cs.bonus)state.bonus=cs.bonus;
    if(cs.confirmed)state.confirmed=cs.confirmed;
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
