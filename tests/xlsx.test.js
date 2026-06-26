/* payslip-xlsx.js のExcel構造(AOA)テスト */
'use strict';
var X = require('../lib/payslip-xlsx.js');

var people = [
  { name:'山田 太郎', company:'株式会社 ゼロアクト', payDate:'令和8年7月25日',
    kintai:[{label:'出勤日数',value:'21'},{label:'労働時間',value:'160:00'}],
    shikyu:[{label:'基本給',value:250000},{label:'通勤手当',value:8400,hikazei:true}],
    kojo:[{label:'健康保険',value:14000},{label:'所得税',value:5000}],
    net:239400, shikyuTotal:258400, kojoTotal:19000 },
  { name:'鈴木 花子', company:'株式会社 ゼロアクト', payDate:'令和8年7月25日',
    kintai:[{label:'出勤日数',value:'20'}], shikyu:[{label:'基本給',value:200000}],
    kojo:[{label:'所得税',value:3000}], net:197000, shikyuTotal:200000, kojoTotal:3000 }
];

T('集計AOA: 見出し行と各従業員行・合計行', function () {
  var s = X.shukeiAOA(people, { company:'株式会社 ゼロアクト', monthLabel:'令和8年6月分' });
  // ヘッダ(3行目)
  eq(s.aoa[2][0], '氏名'); eq(s.aoa[2][3], '差引支給額');
  // 山田 行
  eq(s.aoa[3][0], '山田 太郎'); eq(s.aoa[3][1], 258400); eq(s.aoa[3][3], 239400);
  // 合計行(最終)
  var last = s.aoa[s.aoa.length-1];
  eq(last[0], '合計'); eq(last[1], 258400+200000); eq(last[2], 19000+3000); eq(last[3], 239400+197000);
});

T('集計AOA: 列幅と表題の結合', function () {
  var s = X.shukeiAOA(people, {});
  eq(s.cols.length, 4); ok(s.merges.length >= 1, '表題は結合');
});

T('明細AOA: 会社/表題/氏名・支給日/勤怠/支給控除2列/合計/差引', function () {
  var m = X.meishiAOA(people[0], { monthLabel:'令和8年6月分' });
  eq(m.aoa[0][0], '株式会社 ゼロアクト');
  ok(/給与支給明細書/.test(m.aoa[1][0]), '表題');
  eq(m.aoa[2][0], '氏名'); eq(m.aoa[2][1], '山田 太郎'); eq(m.aoa[2][2], '支給日'); eq(m.aoa[2][3], '令和8年7月25日');
  // 支給/控除の2列見出しがある
  var hdr = m.aoa.findIndex(function(r){ return r[0]==='【支給】' && r[2]==='【控除】'; });
  ok(hdr>0, '支給控除の2列見出し');
  // 非課税表記
  var nt = m.aoa.some(function(r){ return /通勤手当\(非課税\)/.test(r[0]||''); });
  ok(nt, '非課税が項目名に付く');
  // 差引支給額行
  var net = m.aoa.find(function(r){ return r[0]==='差引支給額'; });
  ok(net && net[1]===239400, '差引支給額');
});

T('sheetName: 31字以内・禁止文字除去・重複回避', function () {
  ok(!/[\\\/\?\*\[\]:]/.test(X.sheetName('山田/太郎*[A]')), '禁止文字が無い');
  var used={}; eq(X.sheetName('同名', used), '同名'); ok(X.sheetName('同名', used) !== '同名', '重複は別名');
  ok(X.sheetName('あ'.repeat(40)).length <= 31, '31字以内');
});
