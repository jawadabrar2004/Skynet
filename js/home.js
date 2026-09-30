/* Doorstep - home page: typed headline, and reveal-on-load */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Headline typed one letter at a time. Each part gets its own color.
  var parts = [
    { text: 'More access, ', cls: 'blue' },
    { text: 'less hassle.', cls: 'accent' }
  ];
  var target = document.getElementById('typed');
  var spans = parts.map(function (p) {
    var s = document.createElement('span'); s.className = p.cls; target.appendChild(s); return s;
  });

  function revealRest() {
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) { el.classList.add('in'); });
  }

  if (reduce) {
    parts.forEach(function (p, i) { spans[i].textContent = p.text; });
    revealRest();
  } else {
    var part = 0, pos = 0;
    (function type() {
      if (part >= parts.length) { setTimeout(revealRest, 150); return; }
      spans[part].textContent = parts[part].text.slice(0, ++pos);
      var ch = parts[part].text.charAt(pos - 1);
      if (pos >= parts[part].text.length) { part++; pos = 0; }
      setTimeout(type, ch === ',' ? 320 : 55 + Math.random() * 45);
    })();
  }
})();
