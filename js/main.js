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

  // Persist demo sign-in across reloads and browser restarts.
  // A session is considered valid only if its phone still belongs to a saved demo user.
  var links = document.getElementById('auth-links');
  var session = null, users = {};
  try {
    session = JSON.parse(localStorage.getItem('ctfa_session') || 'null');
    users = JSON.parse(localStorage.getItem('ctfa_users') || '{}') || {};
    if (!session || !session.phone || !users[session.phone]) session = null;
  } catch (e) { session = null; users = {}; }

  if (links && session) {
    var first = session.first || (users[session.phone] && users[session.phone].first) || '';
    links.textContent = '';
    var hi = document.createElement('span'); hi.className = 'hello'; hi.textContent = first ? 'Hi, ' + first : 'Signed in';
    var mapLink = document.createElement('a');
    mapLink.className = 'btn btn-outline btn-sm';
    mapLink.textContent = 'Nearby stores';
    mapLink.href = location.pathname.indexOf('/pages/') !== -1 ? 'map.html' : 'pages/map.html';
    var out = document.createElement('button'); out.type = 'button'; out.className = 'link-btn'; out.textContent = 'Sign out';
    out.addEventListener('click', function () {
      try { localStorage.removeItem('ctfa_session'); } catch (e) {}
      window.location.href = location.pathname.indexOf('/pages/') !== -1 ? '../index.html' : 'index.html';
    });
    links.appendChild(hi); links.appendChild(mapLink); links.appendChild(out);

    // On the landing page, signed-in users should resume at the map instead of being asked to sign in again.
    if (location.pathname.endsWith('/') || location.pathname.endsWith('/index.html') || location.pathname === 'index.html') {
      // Use one clear primary continuation action in the hero.
      var start = document.querySelector('.hero-actions a[href="#start"]');
      if (start) {
        start.href = 'pages/map.html';
        start.textContent = 'Continue to nearby stores';
      }

      // The hero's old Sign in button is redundant once a session exists, so hide it
      // instead of creating a second identical "Continue" button beside the first.
      var heroSignIn = document.querySelector('.hero-actions a[href="pages/login.html"]');
      if (heroSignIn) heroSignIn.style.display = 'none';

      // In the account/search card, replace Sign up with the appropriate signed-in action.
      Array.prototype.forEach.call(document.querySelectorAll('.choice a[href="pages/signup.html"]'), function (a) {
        a.href = 'pages/map.html';
        a.textContent = 'Continue to nearby stores';
      });
    }
  }
})();
