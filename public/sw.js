/* LocalGhost Service Worker
 * Cache-first for playlist assets, default network for everything else.
 * Bump CACHE name to force-purge old entries (e.g. re-uploaded MP3s).
 */
'use strict';

var CACHE = 'localghost-playlist-v1';

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                if (k !== CACHE) return caches.delete(k);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;

    var url = new URL(req.url);
    var isPlaylistAsset =
        url.pathname.indexOf('/assets/playlist/') === 0 ||
        url.pathname === '/playlist' ||
        url.pathname === '/js/playlist.js' ||
        url.pathname.indexOf('/css/') === 0 ||
        url.pathname === '/images/og-playlist.png';

    if (!isPlaylistAsset) return;

    event.respondWith(
        caches.match(req).then(function (cached) {
            if (cached) return cached;
            return fetch(req).then(function (resp) {
                if (resp && resp.status === 200 && resp.type === 'basic') {
                    var clone = resp.clone();
                    caches.open(CACHE).then(function (c) { c.put(req, clone); });
                }
                return resp;
            });
        })
    );
});
