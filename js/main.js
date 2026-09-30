/* CT Food Access Finder - shared behavior: mobile menu, toast, signed-in header */
(function () {
  'use strict';

  var btn = document.getElementById('menu-btn');
  var menu = document.getElementById('header-menu');
  if (btn && menu) {
    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  var toast = document.getElementById('toast'), timer;
  function say(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(timer); timer = setTimeout(function () { toast.classList.remove('show'); }, 3400);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-toast]'), function (el) {
    el.addEventListener('click', function () { say(el.getAttribute('data-toast')); });
  });

  // Signed-in header. The server keeps the session in a secure cookie; /api/auth/me says who is signed in.
  var links = document.getElementById('auth-links');
  var inPages = location.pathname.indexOf('/pages/') !== -1;
  if (!links || location.protocol === 'file:') return;

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.user) showSignedIn(d.user); })
    .catch(function () {});

  function showSignedIn(user) {
    links.textContent = '';
    var hi = document.createElement('span'); hi.className = 'hello'; hi.textContent = 'Hi, ' + user.first;
    var mapLink = document.createElement('a');
    mapLink.className = 'btn btn-outline btn-sm';
    mapLink.textContent = 'Nearby stores';
    mapLink.href = inPages ? 'map.html' : 'pages/map.html';
    var out = document.createElement('button'); out.type = 'button'; out.className = 'link-btn'; out.textContent = 'Sign out';
    out.addEventListener('click', function () {
      fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' })
        .finally(function () { window.location.href = inPages ? '../index.html' : 'index.html'; });
    });
    links.appendChild(hi); links.appendChild(mapLink); links.appendChild(out);
  }
})();
