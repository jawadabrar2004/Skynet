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
    initCart();

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

  // Cart (signed-in only): an icon at the top right opens a side panel listing the cart
  // saved by the SNAP assistant (localStorage "ctfa_cart"), where amounts can be changed or items removed.
  function initCart() {
    var row = document.querySelector('.header-row');
    if (!row) return;
    var inPages = location.pathname.indexOf('/pages/') !== -1;
    var CART = 'ctfa_cart';

    function load() {
      try {
        var c = JSON.parse(localStorage.getItem(CART) || 'null');
        if (c && Array.isArray(c.items)) return c;
      } catch (e) {}
      return { items: [] };
    }
    function save(c) {
      var sum = 0, priced = 0;
      c.items.forEach(function (x) { if (x.price) { sum += x.price * x.qty; priced++; } });
      c.total = priced ? Math.round(sum * 100) / 100 : null;
      c.at = Date.now();
      try { localStorage.setItem(CART, JSON.stringify(c)); } catch (e) {}
    }
    function money(v) { return '$' + v.toFixed(2); }
    function make(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }

    // Header button with item count
    var btn = make('button', 'cart-btn');
    btn.type = 'button';
    btn.setAttribute('aria-controls', 'cart-panel');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.5-1.1L21 8H6"/></svg>';
    var badge = make('span', 'cart-count');
    btn.appendChild(badge);
    row.appendChild(btn);

    // Side panel
    var shade = make('div', 'cart-shade');
    shade.hidden = true;
    var panel = make('aside', 'cart-panel');
    panel.id = 'cart-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'cart-title');
    var head = make('div', 'cart-head');
    var title = make('h2', null, 'Your cart');
    title.id = 'cart-title';
    var close = make('button', 'cart-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close cart');
    head.appendChild(title); head.appendChild(close);
    var body = make('div', 'cart-body');
    var foot = make('div', 'cart-foot');
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);
    document.body.appendChild(shade); document.body.appendChild(panel);

    function render() {
      var c = load();
      var count = c.items.reduce(function (a, x) { return a + x.qty; }, 0);
      badge.textContent = count;
      badge.hidden = !count;
      btn.setAttribute('aria-label', 'Cart, ' + count + (count === 1 ? ' item' : ' items'));

      body.textContent = ''; foot.textContent = '';
      var more = make('a', 'btn btn-outline btn-sm', c.items.length ? 'Add more with the assistant' : 'Ask the SNAP assistant');
      more.href = inPages ? 'assistant.html' : 'pages/assistant.html';
      if (!c.items.length) {
        body.appendChild(make('p', 'cart-empty', 'Your cart is empty. Tell the SNAP assistant what you want to eat or buy.'));
        foot.appendChild(more);
        return;
      }

      var ul = make('ul', 'cart-items');
      c.items.forEach(function (x, i) {
        var li = make('li');
        var info = make('div', 'ci-info');
        info.appendChild(make('strong', null, x.item));
        var detail = [x.option, x.size].filter(Boolean).join(', ');
        if (detail) info.appendChild(make('small', null, detail));
        info.appendChild(make('small', null, x.price ? money(x.price) + ' each' : 'No price estimate'));
        if (x.check) info.appendChild(make('small', 'ci-flag', 'Check the label before you buy'));

        var ctrls = make('div', 'ci-ctrls');
        var step = make('div', 'ci-step');
        var minus = make('button', null, '−'); minus.type = 'button';
        var qty = make('output', null, String(x.qty));
        var plus = make('button', null, '+'); plus.type = 'button';
        minus.setAttribute('aria-label', 'One less ' + x.item);
        plus.setAttribute('aria-label', 'One more ' + x.item);
        qty.setAttribute('aria-label', 'Quantity of ' + x.item);
        minus.disabled = x.qty <= 1;
        plus.disabled = x.qty >= 99;
        step.appendChild(minus); step.appendChild(qty); step.appendChild(plus);
        var rm = make('button', 'ci-remove', 'Remove'); rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove ' + x.item);
        ctrls.appendChild(step); ctrls.appendChild(rm);
        info.appendChild(ctrls);

        var price = make('span', 'ci-price', x.price ? money(x.price * x.qty) : '—');
        li.appendChild(info); li.appendChild(price);
        ul.appendChild(li);

        function change(fn, focusSel) {
          var cur = load();
          if (!cur.items[i]) return;
          fn(cur);
          save(cur); render();
          // Keep keyboard focus on the same control after re-rendering
          var again = body.querySelectorAll('.cart-items li')[i];
          var target = again && again.querySelector(focusSel);
          (target && !target.disabled ? target : close).focus();
        }
        minus.onclick = function () { change(function (cur) { cur.items[i].qty = Math.max(1, cur.items[i].qty - 1); }, '.ci-step button:first-child'); };
        plus.onclick = function () { change(function (cur) { cur.items[i].qty = Math.min(99, cur.items[i].qty + 1); }, '.ci-step button:last-child'); };
        rm.onclick = function () { change(function (cur) { cur.items.splice(i, 1); }, '.ci-remove'); };
      });
      body.appendChild(ul);

      var sum = 0, missing = 0;
      c.items.forEach(function (x) { if (x.price) sum += x.price * x.qty; else missing++; });
      var total = make('p', 'cart-sum');
      total.appendChild(make('span', null, 'Estimated total'));
      total.appendChild(make('strong', null, sum ? money(sum) : '—'));
      foot.appendChild(total);
      if (missing && sum) foot.appendChild(make('p', 'cart-note', missing + (missing === 1 ? ' item has' : ' items have') + ' no price estimate.'));
      foot.appendChild(make('p', 'cart-note', 'Estimates only. Actual prices vary by store, brand and sales.'));
      foot.appendChild(more);
    }

    var lastFocus = null;
    function open() {
      render();
      lastFocus = document.activeElement;
      shade.hidden = false; panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('cart-open');
      close.focus();
    }
    function shut() {
      shade.hidden = true; panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('cart-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    btn.addEventListener('click', open);
    close.addEventListener('click', shut);
    shade.addEventListener('click', shut);
    document.addEventListener('keydown', function (e) {
      if (panel.hidden) return;
      if (e.key === 'Escape') { shut(); return; }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the open panel
      var f = panel.querySelectorAll('button:not([disabled]), a[href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    // Another tab (or the assistant) changed the cart
    window.addEventListener('storage', function (e) { if (e.key === CART) render(); });
    render();
  }
})();
