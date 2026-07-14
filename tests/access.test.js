/* access.test.js — プラン状態ゲートの純関数テスト(現段階=使える/停止のON/OFFのみ) */
'use strict';
var Access = require('../lib/access.js');
var A = Access.accessState;

T('access: 行が無い(初回)は open(reason=new)', function () {
  var r = A(null); eq(r.ok, true); eq(r.reason, 'new');
});
T('access: trial は open', function () { eq(A({ plan: 'trial' }).ok, true); });
T('access: paid は open', function () { eq(A({ plan: 'paid' }).ok, true); });
T('access: free は open', function () { eq(A({ plan: 'free' }).ok, true); });
T('access: disabled は locked', function () {
  var r = A({ plan: 'disabled' }); eq(r.ok, false); eq(r.reason, 'disabled');
});
T('access: 未知planは安全側で locked', function () {
  eq(A({ plan: 'weird' }).ok, false);
});
T('access: planが空なら trial 扱いで open', function () {
  eq(A({}).ok, true);
});
T('access: expires_at があっても現段階は無視して open(期限は将来実装)', function () {
  eq(A({ plan: 'trial', expires_at: '2000-01-01T00:00:00Z' }).ok, true);
});
T('access: lockMessage は停止文言を返す(「管理者に連絡」は使わない)', function () {
  var m = Access.lockMessage();
  ok(/ご利用いただけません/.test(m.title));
  ok(!/管理者/.test(m.title + m.body));
});
