/* LocalGhost Service Worker
 * Makes /playlist work offline.
 *
 * Two caches:
 *   AUDIO  holds the mp3s that "SAVE OFFLINE" downloads (written by
 *          /js/playlist.js). Its name never changes, so a deploy never
 *          throws away music someone has already downloaded.
 *   SHELL  holds the playlist page and what it needs to draw (css, js,
 *          fonts, artwork). It's refreshed from the network on every
 *          visit and only read when the network isn't there. Bump its
 *          name to drop old shell entries; the audio is untouched.
 *
 * Audio is served from AUDIO when it's there. The audio element asks
 * for byte ranges, so a cached file is sliced and answered with a 206,
 * which Safari needs before it will play anything.
 */
'use strict';

var AUDIO = 'localghost-playlist-v1';
var SHELL = 'localghost-shell-v3';
var NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                if (k === AUDIO || k === SHELL) return null;
                // old shell versions and the old single-cache names
                if (k.indexOf('localghost-shell-') === 0 || k === 'localghost-playlist-v2') {
                    return caches.delete(k);
                }
                return null;
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

function isAudio(url) {
    return url.pathname.indexOf('/assets/playlist/') === 0 ||
           url.pathname.indexOf('/assets/podcast/') === 0;
}

function isShell(url) {
    var p = url.pathname;
    return p === '/playlist' || p === '/playlist.html' ||
           p.indexOf('/css/') === 0 ||
           p.indexOf('/js/') === 0 ||
           p.indexOf('/fonts/') === 0 ||
           p === '/images/og-playlist.png' ||
           p === '/favicon.ico' || p === '/favicon.svg' ||
           p === '/site.webmanifest';
}

/* The shell is keyed by path without the ?v= build id, so each deploy
 * replaces the entry instead of adding one. */
function shellKey(url) {
    var p = url.pathname === '/playlist.html' ? '/playlist' : url.pathname;
    return url.origin + p;
}

function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
        promise.then(function (v) { clearTimeout(t); resolve(v); },
                     function (e) { clearTimeout(t); reject(e); });
    });
}

/* Network first, so a deploy shows up straight away; the cache only
 * answers when the network fails or hangs (a plane's wifi). */
function shellResponse(req, url) {
    var key = shellKey(url);
    return withTimeout(fetch(req), NETWORK_TIMEOUT_MS).then(function (resp) {
        if (resp && resp.ok && resp.type === 'basic' && !resp.redirected) {
            var copy = resp.clone();
            caches.open(SHELL).then(function (c) { c.put(key, copy); });
        }
        return resp;
    }).catch(function () {
        return caches.open(SHELL).then(function (c) {
            return c.match(key);
        }).then(function (hit) {
            return hit || fetch(req);
        });
    });
}

function parseRange(header, size) {
    var m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
    if (!m) return null;
    var start, end;
    if (m[1] === '') {                      // bytes=-500, the last 500
        start = Math.max(0, size - parseInt(m[2], 10));
        end = size - 1;
    } else {
        start = parseInt(m[1], 10);
        end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
    }
    if (isNaN(start) || isNaN(end) || start > end || start >= size) return null;
    return { start: start, end: end };
}

function audioResponse(req, url) {
    return caches.open(AUDIO).then(function (c) {
        return c.match(url.href, { ignoreSearch: true });
    }).then(function (hit) {
        if (!hit) return fetch(req);        // not downloaded, stream it
        var range = req.headers.get('Range');
        if (!range) return hit;
        return hit.blob().then(function (blob) {
            var r = parseRange(range, blob.size);
            var type = hit.headers.get('Content-Type') || 'audio/mpeg';
            if (!r) {
                return new Response(null, {
                    status: 416,
                    headers: { 'Content-Range': 'bytes */' + blob.size }
                });
            }
            return new Response(blob.slice(r.start, r.end + 1, type), {
                status: 206,
                statusText: 'Partial Content',
                headers: {
                    'Content-Type': type,
                    'Content-Length': String(r.end - r.start + 1),
                    'Content-Range': 'bytes ' + r.start + '-' + r.end + '/' + blob.size,
                    'Accept-Ranges': 'bytes'
                }
            });
        });
    });
}

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (isAudio(url)) {
        event.respondWith(audioResponse(req, url));
    } else if (isShell(url)) {
        event.respondWith(shellResponse(req, url));
    }
});
