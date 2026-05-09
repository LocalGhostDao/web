/* LOCALGHOST - Hard Truths podcast player
 * Auto-binds to any .podcast-player on the page.
 *
 * Usage:
 *   <div class="podcast-player"
 *        data-title="..."
 *        data-album="..."
 *        data-artwork="/images/og-..png">
 *     ...standard markup with .pp-play, .pp-progress, .pp-time, .pp-download...
 *     <audio preload="metadata" src="/assets/podcast/....mp3"></audio>
 *   </div>
 *
 * Background playback works because we use a real <audio> element.
 * Lock-screen controls and metadata via Media Session API.
 */
(function () {
    'use strict';

    function fmt(s) {
        if (!isFinite(s) || s < 0) s = 0;
        var m = Math.floor(s / 60);
        var sec = Math.floor(s % 60);
        return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function bindPlayer(player) {
        var audio = player.querySelector('audio');
        var playBtn = player.querySelector('.pp-play');
        var progress = player.querySelector('.pp-progress');
        var bar = player.querySelector('.pp-progress-bar');
        var timeLabel = player.querySelector('.pp-time');

        if (!audio || !playBtn || !progress || !bar || !timeLabel) return;

        var title = player.getAttribute('data-title') || document.title;
        var album = player.getAttribute('data-album') || 'LocalGhost Hard Truths';
        var artwork = player.getAttribute('data-artwork') || '';

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
            var artworkArr = artwork
                ? [{ src: artwork, sizes: '1200x630', type: 'image/png' }]
                : [];
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: title,
                    artist: 'Vlad Cealicu — LocalGhost Hard Truths',
                    album: album,
                    artwork: artworkArr
                });
                navigator.mediaSession.setActionHandler('play', function () { audio.play(); });
                navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
                navigator.mediaSession.setActionHandler('seekbackward', function (d) {
                    var skip = (d && d.seekOffset) || 10;
                    audio.currentTime = Math.max(0, audio.currentTime - skip);
                });
                navigator.mediaSession.setActionHandler('seekforward', function (d) {
                    var skip = (d && d.seekOffset) || 10;
                    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + skip);
                });
            } catch (e) { /* older browsers ignore this */ }
        }

        playBtn.addEventListener('click', function () {
            if (audio.paused) {
                audio.play();
            } else {
                audio.pause();
            }
        });

        audio.addEventListener('play', function () {
            playBtn.classList.add('is-playing');
            playBtn.setAttribute('aria-label', 'Pause podcast');
            setMediaSession();
        });

        audio.addEventListener('pause', function () {
            playBtn.classList.remove('is-playing');
            playBtn.setAttribute('aria-label', 'Play podcast');
        });

        audio.addEventListener('timeupdate', updateUI);
        audio.addEventListener('loadedmetadata', updateUI);

        audio.addEventListener('ended', function () {
            playBtn.classList.remove('is-playing');
            playBtn.setAttribute('aria-label', 'Play podcast');
            audio.currentTime = 0;
            updateUI();
        });

        progress.addEventListener('click', function (e) {
            var rect = progress.getBoundingClientRect();
            var pct = (e.clientX - rect.left) / rect.width;
            if (audio.duration) audio.currentTime = pct * audio.duration;
        });

        progress.addEventListener('keydown', function (e) {
            if (!audio.duration) return;
            if (e.key === 'ArrowRight') {
                audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
                e.preventDefault();
            }
            if (e.key === 'ArrowLeft') {
                audio.currentTime = Math.max(0, audio.currentTime - 5);
                e.preventDefault();
            }
        });
    }

    function init() {
        var players = document.querySelectorAll('.podcast-player');
        for (var i = 0; i < players.length; i++) {
            bindPlayer(players[i]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();