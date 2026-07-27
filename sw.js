/* sw.js — ★キルスイッチ。
 *  過去のService Workerが古いファイル(app.js/meisai.js/render.js等)をキャッシュに握って離さず、
 *  デプロイしても端末に反映されない問題(既知・[[feedback_payslip_sw_cache_stale_lib]])を根絶する。
 *  このSWは:(1)全キャッシュを削除 (2)自分自身を登録解除 (3)開いている画面を再読込 する。
 *  fetchハンドラを持たない=一切キャッシュせず全部ネットワーク直行=以後は常に最新(請求書アプリと同じ挙動)。
 *  ★index.htmlからの register('/sw.js') は削除済み=新規に登録し直さない。 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try { var keys = await caches.keys(); await Promise.all(keys.map(function (k) { return caches.delete(k); })); } catch (_e) {}
    try { await self.registration.unregister(); } catch (_e) {}
    try {
      var cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(function (c) { try { c.navigate(c.url); } catch (_e) {} }); // 最新を取り直させる
    } catch (_e) {}
  })());
});
/* fetchハンドラ無し=このSWは何もキャッシュしない(=事実上パススルー、登録解除までの短時間のみ存在) */
