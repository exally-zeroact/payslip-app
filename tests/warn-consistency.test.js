/* 警告色の一貫性(依存なし) — 最賃警告は製品方針「黄色・非ブロック」で統一する。
 * 表ビューの最賃⚠(.tmw)がカード(.cr-warn=琥珀)と違う赤だと「赤黄バラつき」(競合レビュー優先2)。
 * .tmw は赤(#C0392B=エラー/ブロック色)でなく琥珀系(#92500A)であることを要求。
 * 削除ボタン等の赤は破壊的操作=妥当なので対象外(このlintは.tmwのみ)。*/
'use strict';
var fs = require('fs');
var path = require('path');
var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');

function ruleBody(sel) {
  var re = new RegExp('\\' + sel.replace('.', '.') + '\\s*\\{([^}]*)\\}');
  var m = css.match(new RegExp(sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

T('警告一貫性: 表ビューの最賃⚠(.tmw)は赤でなく琥珀(黄系・非ブロック)', function () {
  var body = ruleBody('.tmw');
  ok(body != null, '.tmw ルールが存在する');
  ok(!/#C0392B/i.test(body), '.tmw は赤(#C0392B)を使わない: ' + body.trim());
  ok(/#92500A/i.test(body), '.tmw は最賃警告色(#92500A 琥珀)を使う: ' + body.trim());
});
T('警告一貫性: 表ビューの労働時間⚠(.tlw)も赤でなく琥珀(36協定/年少者・非ブロック)', function () {
  var body = ruleBody('.tlw');
  ok(body != null, '.tlw ルールが存在する');
  ok(!/#C0392B/i.test(body), '.tlw は赤を使わない: ' + body.trim());
  ok(/#92500A/i.test(body), '.tlw は警告色(#92500A 琥珀)を使う: ' + body.trim());
});
