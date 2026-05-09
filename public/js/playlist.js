/* LOCALGHOST — Playlist controller
 * Sequential playback, shuffle, track selection.
 * Uses the same .podcast-player markup from blog.css.
 * Media Session API for lock-screen controls.
 *
 * Expects: #pl-audio, #pl-player, #pl-tracklist, etc.
 */
(function () {
    'use strict';

    var tracks = [
        { num: '01', title: "A Cypherpunk's Manifesto",       src: "/assets/playlist/01. A Cypherpunk's Manifesto.mp3",    post: '/cypherpunk' },
        { num: '02', title: 'This Dystopia Is Boring',         src: '/assets/playlist/02. This Dystopia Is Boring.mp3',     post: '/manifesto' },
        { num: '03', title: 'The Window',                      src: '/assets/playlist/03. The Window.mp3',                  post: '/hard-truths/inflection' },
        { num: '04', title: 'The First Honest Thing',          src: '/assets/playlist/04. The First Honest Thing.mp3',      post: '/hard-truths/reckoning' },
        { num: '05', title: 'Saint Bow Lane',                  src: '/assets/playlist/05. Saint Bow Lane.mp3',              post: '/hard-truths/skillcraft' },
        { num: '06', title: 'One Bad Quarter',                 src: '/assets/playlist/06. One Bad Quarter.mp3',             post: '/hard-truths/one-bad-quarter' },
        { num: '07', title: 'Ghost and Shadow',                src: '/assets/playlist/07. Ghost and Shadow.mp3',            post: '/hard-truths/dictator-brain' },
        { num: '08', title: 'No Export Button',                src: '/assets/playlist/08. No Export Button.mp3',            post: '/hard-truths/model-trap' },
        { num: '09', title: 'A Room With A False Wall',        src: '/assets/playlist/09. A Room With A False Wall.mp3',    post: '/hard-truths/honeypot' },
        { num: '10', title: 'The Same Technique',              src: '/assets/playlist/10. The Same Technique.mp3',          post: '/hard-truths/critic-worth-listening-to' },
        { num: '11', title: 'Napoli 1820',                     src: '/assets/playlist/11. Napoli 1820.mp3',                 post: '/hard-truths/how-memory-gets-made' },
        { num: '12', title: 'The Labyrinth Defends Itself',    src: '/assets/playlist/12. The Labyrinth Defends Itself.mp3',post: '/hard-truths/the-bureaucracy-trap' },
        { num: '13', title: 'Radio Checklist',              src: '/assets/playlist/13. Radio Checklist.mp3',         post: '/hard-truths/before-you-ask' },
        { num: '14', title: 'Assisi Espresso Chair',         src: '/assets/playlist/14. Assisi Espresso Chair.mp3',    post: '/hard-truths/day-one' },
        { num: '15', title: 'What The Ghost Owes',             src: '/assets/playlist/15. What The Ghost Owes.mp3',      post: '/hard-truths/overhears' },
        { num: '16', title: 'Integration Tax',                 src: '/assets/playlist/16. Integration Tax.mp3',          post: '/hard-truths/integration-tax' },
        { num: '17', title: 'Bucket',                          src: '/assets/playlist/17. Bucket.mp3',                   post: '/hard-truths/index-not-a-person' }
    ];

    var audio       = document.getElementById('pl-audio');
    var playBtn     = document.querySelector('#pl-player .pp-play');
    var progress    = document.querySelector('#pl-player .pp-progress');
    var bar         = document.querySelector('#pl-player .pp-progress-bar');
    var timeLabel   = document.querySelector('#pl-player .pp-time');
    var downloadBtn = document.getElementById('pl-download');
    var titleEl     = document.getElementById('pl-current-title');
    var numEl       = document.getElementById('pl-current-num');
    var postLink    = document.getElementById('pl-current-post');
    var tracklist   = document.getElementById('pl-tracklist');
    var prevBtn     = document.getElementById('pl-prev');
    var nextBtn     = document.getElementById('pl-next');
    var shuffleBtn  = document.getElementById('pl-shuffle');
    var repeatBtn      = document.getElementById('pl-repeat');
    var downloadAllBtn = document.getElementById('pl-download-all');

    var current  = 0;
    var shuffle  = false;
    var repeat   = false;
    var played   = [];       // tracks played this cycle (for shuffle)
    var durations = {};      // cache: index -> formatted duration

    /* ---- helpers ---- */

    function fmt(s) {
        if (!isFinite(s) || s < 0) s = 0;
        var m = Math.floor(s / 60);
        var sec = Math.floor(s % 60);
        return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function pickNext() {
        if (!shuffle) return (current + 1) % tracks.length;
        if (played.length >= tracks.length) played = [current];
        var pool = [];
        for (var i = 0; i < tracks.length; i++) {
            if (played.indexOf(i) === -1) pool.push(i);
        }
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function pickPrev() {
        if (!shuffle) return (current - 1 + tracks.length) % tracks.length;
        return (current - 1 + tracks.length) % tracks.length;
    }

    /* ---- track loading ---- */

    function loadTrack(index, autoplay) {
        current = index;
        var t = tracks[index];
        titleEl.textContent = t.title;
        numEl.textContent = 'TRACK ' + t.num;
        downloadBtn.href = t.src;
        postLink.href = t.post;
        bar.style.width = '0%';
        timeLabel.textContent = '00:00 / --:--';

        /* highlight active row */
        var items = tracklist.querySelectorAll('.track-item');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('is-active', i === index);
        }

        /* scroll active row into view if needed */
        if (items[index]) {
            items[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (shuffle && played.indexOf(index) === -1) played.push(index);

        /* load from cache or network */
        setCachedSrc(t.src, autoplay);
    }

    /* ---- UI updates ---- */

    function updateUI() {
        var dur = audio.duration || 0;
        var cur = audio.currentTime || 0;
        var pct = dur ? (cur / dur) * 100 : 0;
        bar.style.width = pct + '%';
        timeLabel.textContent = fmt(cur) + ' / ' + (dur ? fmt(dur) : '--:--');
        progress.setAttribute('aria-valuenow', Math.round(pct));
    }

    function setMediaSession() {
        if (!('mediaSession' in navigator)) return;
        var t = tracks[current];
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: t.title,
                artist: 'Vlad Cealicu',
                album: 'LocalGhost — The Build Soundtrack',
                artwork: [{ src: '/images/og-playlist.png', sizes: '1200x630', type: 'image/png' }]
            });
            navigator.mediaSession.setActionHandler('play', function ()  { audio.play(); });
            navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
            navigator.mediaSession.setActionHandler('previoustrack', function () { loadTrack(pickPrev(), true); });
            navigator.mediaSession.setActionHandler('nexttrack',     function () { loadTrack(pickNext(), true); });
            navigator.mediaSession.setActionHandler('seekbackward', function (d) {
                audio.currentTime = Math.max(0, audio.currentTime - ((d && d.seekOffset) || 10));
            });
            navigator.mediaSession.setActionHandler('seekforward', function (d) {
                audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + ((d && d.seekOffset) || 10));
            });
        } catch (e) { /* older browsers */ }
    }

    /* ---- preload durations for tracklist display ---- */

    function probeDurations() {
        tracks.forEach(function (t, i) {
            var probe = new Audio();
            probe.preload = 'metadata';
            probe.src = t.src;
            probe.addEventListener('loadedmetadata', function () {
                durations[i] = fmt(probe.duration);
                var cell = tracklist.querySelector('.track-duration[data-for="' + i + '"]');
                if (cell) cell.textContent = durations[i];
                probe.src = '';
                probe = null;
            });
        });
    }

    /* ---- event bindings ---- */

    playBtn.addEventListener('click', function () {
        if (audio.paused) {
            if (!audio.src || audio.src === window.location.href) loadTrack(0, true);
            else audio.play();
        } else {
            audio.pause();
        }
    });

    audio.addEventListener('play', function () {
        playBtn.classList.add('is-playing');
        playBtn.setAttribute('aria-label', 'Pause');
        setMediaSession();
    });

    audio.addEventListener('pause', function () {
        playBtn.classList.remove('is-playing');
        playBtn.setAttribute('aria-label', 'Play');
    });

    audio.addEventListener('timeupdate', updateUI);
    audio.addEventListener('loadedmetadata', function () {
        updateUI();
        durations[current] = fmt(audio.duration);
        var cell = tracklist.querySelector('.track-duration[data-for="' + current + '"]');
        if (cell) cell.textContent = durations[current];
    });

    audio.addEventListener('ended', function () {
        if (repeat) {
            audio.currentTime = 0;
            audio.play();
        } else {
            loadTrack(pickNext(), true);
        }
    });

    /* seek on progress bar click */
    progress.addEventListener('click', function (e) {
        var rect = progress.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        if (audio.duration) audio.currentTime = pct * audio.duration;
    });

    /* keyboard seek */
    progress.addEventListener('keydown', function (e) {
        if (!audio.duration) return;
        if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); e.preventDefault(); }
        if (e.key === 'ArrowLeft')  { audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
    });

    /* tracklist click */
    tracklist.addEventListener('click', function (e) {
        var item = e.target.closest('.track-item');
        if (!item) return;
        var idx = parseInt(item.getAttribute('data-index'), 10);
        if (isNaN(idx)) return;
        loadTrack(idx, true);
    });

    /* prev / next / shuffle buttons */
    prevBtn.addEventListener('click', function () { loadTrack(pickPrev(), true); prevBtn.blur(); });
    nextBtn.addEventListener('click', function () { loadTrack(pickNext(), true); nextBtn.blur(); });
    shuffleBtn.addEventListener('click', function () {
        shuffle = !shuffle;
        shuffleBtn.classList.toggle('is-active', shuffle);
        shuffleBtn.blur();
        if (shuffle) played = [current];
    });

    repeatBtn.addEventListener('click', function () {
        repeat = !repeat;
        repeatBtn.classList.toggle('is-active', repeat);
        repeatBtn.blur();
    });

    /* =========================================================
       OFFLINE CACHE — Cache API for local playback.
       Stores mp3s in browser cache. Plays from cache when
       available, falls back to network.
       ========================================================= */

    var CACHE_NAME = 'localghost-playlist-v1';
    var META_KEY   = '/_playlist_meta.json';

    function cacheSupported() { return 'caches' in window; }

    /* ---- metadata store (Content-Length + Last-Modified per track) ---- */

    function getMeta() {
        if (!cacheSupported()) return Promise.resolve({});
        return caches.open(CACHE_NAME).then(function (cache) {
            return cache.match(META_KEY);
        }).then(function (r) {
            return r ? r.json() : {};
        }).catch(function () { return {}; });
    }

    function saveMeta(meta) {
        if (!cacheSupported()) return Promise.resolve();
        return caches.open(CACHE_NAME).then(function (cache) {
            var blob = new Blob([JSON.stringify(meta)], { type: 'application/json' });
            return cache.put(META_KEY, new Response(blob));
        });
    }

    /* ---- request persistent storage so browser won't evict ---- */

    function requestPersist() {
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(function () {});
        }
    }

    /* ---- check freshness of a single track via HEAD ---- */

    function checkFreshness(src, meta) {
        var entry = meta[src];
        if (!entry) return Promise.resolve('missing');
        return fetch(src, { method: 'HEAD' }).then(function (r) {
            if (!r.ok) return 'unknown';
            var size = r.headers.get('Content-Length');
            var mod  = r.headers.get('Last-Modified');
            if (size && entry.size && size !== entry.size) return 'stale';
            if (mod && entry.modified && mod !== entry.modified) return 'stale';
            return 'fresh';
        }).catch(function () { return 'unknown'; });
    }

    /* ---- UI indicators ---- */

    function refreshCacheIndicators() {
        if (!cacheSupported()) return;
        var items = tracklist.querySelectorAll('.track-item');

        getMeta().then(function (meta) {
            var cachedCount = 0;
            var staleCount = 0;
            var checks = tracks.map(function (t, i) {
                return caches.open(CACHE_NAME).then(function (cache) {
                    return cache.match(t.src);
                }).then(function (r) {
                    if (!r) {
                        items[i] && items[i].classList.remove('is-cached', 'is-stale');
                        return;
                    }
                    cachedCount++;
                    items[i] && items[i].classList.add('is-cached');
                    /* check freshness in background */
                    return checkFreshness(t.src, meta).then(function (state) {
                        if (state === 'stale') {
                            staleCount++;
                            items[i] && items[i].classList.add('is-stale');
                        } else {
                            items[i] && items[i].classList.remove('is-stale');
                        }
                    });
                }).catch(function () {});
            });

            Promise.all(checks).then(function () {
                if (staleCount > 0) {
                    downloadAllBtn.innerHTML = '\u2193 ' + staleCount + ' UPDATE' + (staleCount > 1 ? 'S' : '');
                } else if (cachedCount >= tracks.length) {
                    downloadAllBtn.innerHTML = '\u2713 SYNCED';
                } else if (cachedCount > 0) {
                    downloadAllBtn.innerHTML = '\u2193 SYNC (' + cachedCount + '/' + tracks.length + ')';
                } else {
                    downloadAllBtn.innerHTML = '\u2193 SAVE OFFLINE';
                }
            });
        });
    }

    /* ---- cache-first audio loading ---- */

    function setCachedSrc(src, autoplay) {
        if (!cacheSupported()) {
            audio.src = src;
            audio.load();
            if (autoplay) audio.play().catch(function () {});
            return;
        }
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.match(src);
        }).then(function (response) {
            if (response) {
                return response.blob().then(function (blob) {
                    audio.src = URL.createObjectURL(blob);
                    audio.load();
                    if (autoplay) audio.play().catch(function () {});
                });
            }
            audio.src = src;
            audio.load();
            if (autoplay) audio.play().catch(function () {});
        }).catch(function () {
            audio.src = src;
            audio.load();
            if (autoplay) audio.play().catch(function () {});
        });
    }

    /* ---- sync: cache new + update stale, with per-track progress ---- */

    downloadAllBtn.addEventListener('click', function () {
        downloadAllBtn.blur();
        if (!cacheSupported()) return;

        requestPersist();

        var i = 0;
        var synced = 0;
        var updated = 0;
        var meta;

        getMeta().then(function (m) {
            meta = m;
            next();
        });

        function next() {
            if (i >= tracks.length) {
                saveMeta(meta).then(function () { refreshCacheIndicators(); });
                return;
            }

            var t = tracks[i];
            var idx = i;
            downloadAllBtn.innerHTML = '\u2193 SYNCING ' + (i + 1) + '/' + tracks.length;

            caches.open(CACHE_NAME).then(function (cache) {
                return cache.match(t.src).then(function (existing) {
                    if (existing && meta[t.src]) {
                        /* cached, check if stale */
                        return checkFreshness(t.src, meta).then(function (state) {
                            if (state === 'stale') {
                                /* re-fetch */
                                return fetch(t.src).then(function (response) {
                                    if (!response.ok) return;
                                    var size = response.headers.get('Content-Length');
                                    var mod  = response.headers.get('Last-Modified');
                                    meta[t.src] = { size: size, modified: mod };
                                    updated++;
                                    return cache.put(t.src, response);
                                });
                            }
                            synced++;
                        });
                    }
                    /* not cached, fetch fresh */
                    return fetch(t.src).then(function (response) {
                        if (!response.ok) return;
                        var size = response.headers.get('Content-Length');
                        var mod  = response.headers.get('Last-Modified');
                        meta[t.src] = { size: size, modified: mod };
                        synced++;
                        return cache.put(t.src, response);
                    });
                });
            }).then(function () {
                var items = tracklist.querySelectorAll('.track-item');
                if (items[idx]) {
                    items[idx].classList.add('is-cached');
                    items[idx].classList.remove('is-stale');
                }
                i++;
                next();
            }).catch(function () {
                i++;
                next();
            });
        }
    });

    /* keyboard: space to play/pause when focus is on body */
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        if (e.code === 'Space') {
            e.preventDefault();
            if (audio.paused) {
                if (!audio.src || audio.src === window.location.href) loadTrack(0, true);
                else audio.play();
            } else {
                audio.pause();
            }
        }
    });

    /* ---- render tracklist from tracks[] ---- */

    function renderTracklist() {
        tracklist.innerHTML = '';
        for (var i = 0; i < tracks.length; i++) {
            var t = tracks[i];
            var div = document.createElement('div');
            div.className = 'track-item' + (i === 0 ? ' is-active' : '');
            div.setAttribute('data-index', i);
            div.innerHTML =
                '<span class="track-num">' + t.num + '</span>' +
                '<span class="track-title">' + t.title + '</span>' +
                '<span class="track-playing-indicator">PLAYING</span>' +
                '<a class="track-post-link" target="_blank" rel="noopener" href="' + t.post + '" onclick="event.stopPropagation()">POST</a>' +
                '<span class="track-duration" data-for="' + i + '">--:--</span>' +
                '<span class="track-play-hint">&#9654;</span>';
            tracklist.appendChild(div);
        }
    }

    /* ---- init ---- */

    renderTracklist();
    loadTrack(0, false);
    probeDurations();
    refreshCacheIndicators();

    /* =========================================================
       OSCILLOSCOPE — Web Audio API waveform visualisation.
       Idle: ambient noise line. Playing: real waveform + glow.
       ========================================================= */

    var canvas  = document.getElementById('scope-canvas');
    var ctx     = canvas ? canvas.getContext('2d') : null;
    var ampEl   = document.getElementById('scope-amp');
    var analyser, dataArray, audioCtx, sourceNode;
    var scopeConnected = false;
    var scopeRaf;

    /* terminal green from brand guidelines */
    var GREEN      = '#33FF00';
    var GREEN_DIM  = 'rgba(51, 255, 0, 0.15)';
    var GREEN_GLOW = 'rgba(51, 255, 0, 0.5)';

    function connectScope() {
        if (scopeConnected || !canvas) return;
        try {
            audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
            analyser   = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            sourceNode = audioCtx.createMediaElementSource(audio);
            sourceNode.connect(analyser);
            analyser.connect(audioCtx.destination);
            dataArray  = new Uint8Array(analyser.frequencyBinCount);
            scopeConnected = true;
        } catch (e) {
            /* Web Audio not available — idle animation still runs */
        }
    }

    /* centre line y */
    function cy() { return canvas.height / 2; }

    function resizeCanvas() {
        if (!canvas) return;
        var rect = canvas.getBoundingClientRect();
        var dpr  = window.devicePixelRatio || 1;
        canvas.width  = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* idle: gentle ambient noise that drifts slowly */
    var idlePhase = 0;
    function drawIdle() {
        var w = canvas.width / (window.devicePixelRatio || 1);
        var h = canvas.height / (window.devicePixelRatio || 1);
        var mid = h / 2;

        ctx.clearRect(0, 0, w, h);

        /* centre reference line — very faint */
        ctx.strokeStyle = 'rgba(51, 255, 0, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
        ctx.stroke();

        /* noise waveform */
        ctx.strokeStyle = GREEN_DIM;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = GREEN_GLOW;
        ctx.shadowBlur = 4;
        ctx.beginPath();

        idlePhase += 0.008;
        for (var x = 0; x < w; x++) {
            var t = x / w;
            /* two slow sine waves + gentle noise */
            var y = mid
                + Math.sin(t * 6.28 * 2 + idlePhase) * 3
                + Math.sin(t * 6.28 * 5 + idlePhase * 1.7) * 1.5
                + (Math.random() - 0.5) * 2;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (ampEl) ampEl.textContent = 'AMPLITUDE: --dB';
    }

    /* live: real frequency waveform */
    function drawLive() {
        if (!analyser || !dataArray) { drawIdle(); return; }

        analyser.getByteTimeDomainData(dataArray);

        var w   = canvas.width / (window.devicePixelRatio || 1);
        var h   = canvas.height / (window.devicePixelRatio || 1);
        var mid = h / 2;
        var len = dataArray.length;
        var sliceWidth = w / len;

        ctx.clearRect(0, 0, w, h);

        /* centre reference line */
        ctx.strokeStyle = 'rgba(51, 255, 0, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
        ctx.stroke();

        /* glow layer (thicker, blurred) */
        ctx.strokeStyle = GREEN_GLOW;
        ctx.lineWidth = 4;
        ctx.shadowColor = GREEN;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        var x = 0;
        for (var i = 0; i < len; i++) {
            var v = dataArray[i] / 128.0;
            var y = v * mid;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        /* sharp layer on top */
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        x = 0;
        for (var j = 0; j < len; j++) {
            var v2 = dataArray[j] / 128.0;
            var y2 = v2 * mid;
            if (j === 0) ctx.moveTo(x, y2);
            else ctx.lineTo(x, y2);
            x += sliceWidth;
        }
        ctx.stroke();

        /* RMS amplitude in dB */
        if (ampEl) {
            var sum = 0;
            for (var k = 0; k < len; k++) {
                var s = (dataArray[k] - 128) / 128;
                sum += s * s;
            }
            var rms = Math.sqrt(sum / len);
            var db  = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
            if (isFinite(db)) {
                ampEl.textContent = 'AMPLITUDE: ' + db.toFixed(1) + 'dB';
            } else {
                ampEl.textContent = 'AMPLITUDE: -\u221EdB';
            }
        }
    }

    function scopeLoop() {
        if (!canvas) return;
        if (!audio.paused && scopeConnected) {
            drawLive();
        } else {
            drawIdle();
        }
        scopeRaf = requestAnimationFrame(scopeLoop);
    }

    /* connect the analyser on first play */
    audio.addEventListener('play', function () {
        connectScope();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    });

    /* kick off */
    if (canvas) {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        scopeLoop();
    }

})();