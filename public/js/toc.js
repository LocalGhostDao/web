/* LocalGhost contents marker
 * Lights the contents link for the section being read on the two guideline
 * pages. On a wide screen the contents ride in the left margin (see
 * /css/brand-guidelines.css), and this is what tells you where you are.
 * Without it the links still work.
 */
(function () {
    'use strict';

    var links = document.querySelectorAll('.toc-list a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;

    var linkFor = {};
    for (var i = 0; i < links.length; i++) {
        linkFor[links[i].getAttribute('href').slice(1)] = links[i];
    }

    var current = null;

    function mark(link) {
        if (link === current) return;
        if (current) {
            current.classList.remove('active');
            current.removeAttribute('aria-current');
        }
        current = link;
        current.classList.add('active');
        current.setAttribute('aria-current', 'location');
    }

    /* A band across the upper part of the window. The section crossing it is
       the one being read. */
    var observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) mark(linkFor[entries[i].target.id]);
        }
    }, { rootMargin: '-20% 0px -70% 0px' });

    Object.keys(linkFor).forEach(function (id) {
        var section = document.getElementById(id);
        if (section) observer.observe(section);
    });
})();
