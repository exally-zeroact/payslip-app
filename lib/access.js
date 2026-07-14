/* access.js — アカウントの利用可否(プラン状態)を判定する純関数。
 *  司さんが各アカウントの plan を切り替えることで、使える/停止 を制御する。
 *   plan: 'trial'(既定=使える) | 'paid'(有料) | 'free'(無料開放) | 'disabled'(停止)
 *  ★現段階(知人のお試し)は「使える or 停止」のシンプルなON/OFFのみ。
 *    無料期間(期限)や有料/無料の細分は、リリース後にプランを決める時に実装する(expires_at列はDBに予約済・未使用)。★
 *  返り値: { ok:boolean, reason:'new'|'trial'|'paid'|'free'|'disabled' }
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Access = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PLANS = ['trial', 'paid', 'free', 'disabled'];
  var OPEN = { trial: 1, paid: 1, free: 1 }; // 使える plan

  function accessState(account) {
    if (account == null) return { ok: true, reason: 'new' }; // 行が無い=初回=作成前提でopen
    var plan = account.plan || 'trial';
    if (!OPEN[plan]) return { ok: false, reason: 'disabled' }; // disabled/未知plan=停止
    return { ok: true, reason: plan };
  }

  // 停止アカウントのゲート画面の文言(現段階は1種類・"管理者に連絡"のような冷たい文言は使わない)。
  function lockMessage() {
    return { title: 'このアカウントは現在ご利用いただけません', body: '' };
  }

  return { accessState: accessState, lockMessage: lockMessage, PLANS: PLANS };
});
