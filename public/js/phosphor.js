/* LocalGhost phosphor easter eggs.
 *
 * Now and then the tube misbehaves for a moment: a band of interference rolls
 * down the screen, the picture flashes, the vertical hold slips, or a line it
 * has shown too often burns in faintly somewhere. The first one comes between
 * half a minute and a minute and a half after the page opens, then one every
 * one to three minutes, never while the tab is hidden, and never for anyone
 * whose system asks for reduced motion.
 *
 * Typing "ghost" anywhere outside a text field puts up PLEASE STAND BY for
 * two and a half seconds. That's the whole feature.
 *
 * Nothing here reads or stores anything about the visitor.
 */
(function () {
    'use strict';

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    var BURN = [
        'THE ONLY CLOUD IS YOU',
        'NO TELEMETRY FOUND',
        'UPLINK NOT REQUIRED',
        'STILL HERE',
        'NOTHING LEFT THE BOX',
        'WRITE THE CODE'
    ];

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function fx(cls, ms, html) {
        var el = document.createElement('div');
        el.className = 'lg-fx ' + cls;
        el.setAttribute('aria-hidden', 'true');
        if (html) el.innerHTML = html;
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, ms);
        return el;
    }

    function band() { fx('lg-fx-band', 1200); }

    function flash() { fx('lg-fx-flash', 300); }

    function hold() {
        var root = document.documentElement;
        root.classList.add('lg-hold');
        setTimeout(function () { root.classList.remove('lg-hold'); }, 90);
        setTimeout(function () {
            root.classList.add('lg-hold');
            setTimeout(function () { root.classList.remove('lg-hold'); }, 60);
        }, 180);
    }

    function burn() {
        var el = fx('lg-fx-burn', 3300);
        el.textContent = BURN[Math.floor(Math.random() * BURN.length)];
        el.style.left = rand(4, 45) + 'vw';
        el.style.top = rand(15, 80) + 'vh';
    }

    var EVENTS = [band, band, flash, hold, burn];

    function next(first) {
        var wait = first ? rand(30000, 90000) : rand(60000, 180000);
        setTimeout(function () {
            if (!document.hidden) {
                EVENTS[Math.floor(Math.random() * EVENTS.length)]();
            }
            next(false);
        }, wait);
    }

    var STANDBY =
        '<pre>' +
        '   .-""-.\n' +
        '  / .  . \\\n' +
        '  |  __  |\n' +
        '  |      |\n' +
        '  \'^^^^^^\'' +
        '</pre>' +
        '<div>PLEASE STAND BY</div>' +
        '<span>THE GHOST IS ADJUSTING ITS TUBES</span>';

    function standby() { fx('lg-fx-standby', 2700, STANDBY); }

    window.LocalGhostPhosphor = { standby: standby };

    var typed = '';
    document.addEventListener('keydown', function (e) {
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (!e.key || e.key.length !== 1) return;
        typed = (typed + e.key.toLowerCase()).slice(-5);
        if (typed === 'ghost') {
            typed = '';
            standby();
        }
    });

    next(true);
})();
