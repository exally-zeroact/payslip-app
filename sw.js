/* sw.js — 最小 Service Worker。目的=PWAとしてインストール可能にする(+オフライン時のフォールバック)。
 *  ★network-first: オンライン時は必ず最新を取得(頻繁にデプロイするアプリなので古いキャッシュを掴ませない)。
 *   ネットワーク失敗時のみ、直近に取得したものをキャッシュから返す。Supabase等の動的通信はそのまま素通り。 */
var CACHE = 'exally-shell-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // 書き込み系は素通り
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部(Supabase/CDN)は素通り=常にネットワーク
  e.respondWith(
    fetch(req).then(function (res) {
      try { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } catch (_e) {}
      return res;
    }).catch(function () { return caches.match(req); })
  );
});
