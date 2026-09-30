/* Doorstep - shopping cart, store shelves, Checkout button and the order popup.
   Shared by pages/shop.html and pages/assistant.html. The cart lives in localStorage "ctfa_cart"
   (the header cart icon in js/main.js reads the same cart). Exposes window.Doorstep for assistant.js. */
(function () {
  'use strict';

  var CART = 'ctfa_cart';
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function money(v) { return '$' + v.toFixed(2); }
  function key(x) { return [x.item, x.option, x.size].map(function (v) { return String(v || '').toLowerCase().trim(); }).join('|'); }
  function store() { try { var s = JSON.parse(localStorage.getItem('ctfa_store') || 'null'); return s && s.name ? s : null; } catch (e) { return null; } }

  // ---- Cart ----
  function load() {
    try { var c = JSON.parse(localStorage.getItem(CART) || 'null'); if (c && Array.isArray(c.items)) return c; } catch (e) {}
    return { items: [] };
  }
  function save(c) {
    var sum = 0, priced = 0;
    c.items.forEach(function (x) { if (x.price) { sum += x.price * x.qty; priced++; } });
    c.total = priced ? Math.round(sum * 100) / 100 : null;
    c.at = Date.now();
    try { localStorage.setItem(CART, JSON.stringify(c)); } catch (e) {}
    document.dispatchEvent(new Event('ctfa-cart'));
  }
  function count(c) { return (c || load()).items.reduce(function (a, x) { return a + x.qty; }, 0); }

  // Add lines to the cart; the same item, type and size become one line.
  function addLines(lines) {
    var c = load();
    lines.forEach(function (x) {
      var had = c.items.find(function (y) { return key(y) === key(x); });
      if (had) { had.qty = Math.min(99, had.qty + x.qty); had.check = had.check || !!x.check; if (!had.price && x.price) had.price = x.price; }
      else c.items.push({ item: String(x.item), option: x.option || '', size: x.size || '', qty: Math.min(99, x.qty || 1), price: x.price || null, check: !!x.check });
    });
    save(c);
  }
  function setQty(k, qty) {
    var c = load();
    var i = c.items.findIndex(function (y) { return key(y) === k; });
    if (i < 0) return;
    if (qty < 1) c.items.splice(i, 1); else c.items[i].qty = Math.min(99, qty);
    save(c);
  }

  // ---- Store shelves ----
  var SHELVES = [
    ['Produce', [['🍌','Bananas','1 lb',0.69],['🍎','Apples','3 lb bag',4.99],['🥕','Carrots','2 lb bag',2.49],['🥬','Lettuce','1 head',1.99],['🍅','Tomatoes','1 lb',2.49],['🧅','Onions','3 lb bag',3.49]]],
    ['Dairy & eggs', [['🥛','Milk','1 gallon',4.29],['🥚','Eggs','12 count',3.49],['🧀','Cheddar cheese','8 oz',3.29],['🧈','Butter','1 lb (4 sticks)',4.99],['🍶','Yogurt','32 oz',3.99]]],
    ['Meat & fish', [['🍗','Chicken breast','1 lb',4.49],['🥩','Ground beef','1 lb',5.99],['🐟','Canned tuna','5 oz can',1.49],['🥓','Bacon','12 oz',5.99],['🌭','Hot dogs','8-pack',3.99]]],
    ['Bakery', [['🍞','Bread','1 loaf',2.99],['🥯','Bagels','6-pack',3.99],['🫓','Tortillas','10-count',2.99],['🍔','Burger buns','8-pack',2.99]]],
    ['Pantry', [['🍚','Rice','2 lb bag',2.49],['🍝','Spaghetti','1 lb box',1.49],['🥫','Pasta sauce','24 oz jar',2.99],['🫘','Black beans','15 oz can',1.19],['🥣','Cereal','18 oz box',3.99],['🥜','Peanut butter','16 oz jar',3.29]]],
    ['Snacks & drinks', [['🧃','Orange juice','52 oz',3.99],['💧','Bottled water','24-pack',4.99],['🥤','Soda','2 liter',2.29],['🍪','Cookies','13 oz',3.99],['🥔','Chips','8 oz bag',3.99]]],
    ['Frozen', [['🥦','Frozen vegetables','12 oz bag',1.99],['🍕','Frozen pizza','1 pizza',5.99],['🍨','Ice cream','1.5 qt',4.99],['🍟','Frozen fries','32 oz bag',3.49]]]
  ];
  var shelves = document.getElementById('shelves');
  var shelfIndex = 0, grid = null, tabs = null;

  function renderShelf() {
    if (!grid) return;
    var c = load();
    grid.textContent = '';
    SHELVES[shelfIndex][1].forEach(function (s) {
      var icon = s[0], name = s[1], size = s[2], price = s[3], k = key({ item: name, size: size });
      var inCart = c.items.find(function (y) { return key(y) === k; });
      var card = el('div', 'shelf-item');
      card.appendChild(el('span', 'si-icon', icon));
      var info = el('div', 'si-info');
      info.appendChild(el('b', null, name));
      info.appendChild(el('small', null, size + ' · ' + money(price)));
      card.appendChild(info);
      if (inCart) {
        var step = el('div', 'stepper');
        var minus = el('button', null, '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'One less ' + name);
        var out = el('output', null, String(inCart.qty)); out.setAttribute('aria-label', 'Quantity of ' + name);
        var plus = el('button', null, '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'One more ' + name);
        plus.disabled = inCart.qty >= 99;
        minus.onclick = function () { setQty(k, inCart.qty - 1); };
        plus.onclick = function () { setQty(k, inCart.qty + 1); };
        step.appendChild(minus); step.appendChild(out); step.appendChild(plus);
        card.appendChild(step);
      } else {
        var add = el('button', 'si-add', 'Add'); add.type = 'button'; add.setAttribute('aria-label', 'Add ' + name);
        add.onclick = function () { addLines([{ item: name, size: size, qty: 1, price: price }]); };
        card.appendChild(add);
      }
      grid.appendChild(card);
    });
  }

  if (shelves) {
    var head = el('div', 'shelves-head');
    head.appendChild(el('h2', null, 'Shop by category'));
    head.lastChild.id = 'shelves-title';
    head.appendChild(el('p', null, 'Everything here can be bought with SNAP. Prices are typical estimates.'));
    shelves.setAttribute('aria-labelledby', 'shelves-title');
    tabs = el('div', 'shelf-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Categories');
    grid = el('div', 'shelf-grid'); grid.setAttribute('role', 'tabpanel');
    SHELVES.forEach(function (s, i) {
      var t = el('button', 'shelf-tab', s[0]); t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      t.onclick = function () {
        shelfIndex = i;
        Array.prototype.forEach.call(tabs.children, function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
        renderShelf();
      };
      tabs.appendChild(t);
    });
    shelves.appendChild(head); shelves.appendChild(tabs); shelves.appendChild(grid);
    renderShelf();
  }

  // ---- Checkout button, bottom right ----
  var fab = el('button', 'checkout-fab'); fab.type = 'button'; fab.hidden = true;
  if (document.querySelector('.snap:not(.shop-page) .composer')) fab.classList.add('above-composer');
  fab.onclick = function () { openCheckout(); };
  document.body.appendChild(fab);
  function renderFab() {
    var c = load(), n = count(c);
    fab.hidden = !n;
    fab.textContent = 'Checkout · ' + n + (n === 1 ? ' item' : ' items') + (c.total ? ' · ' + money(c.total) : '');
  }
  renderFab();
  document.addEventListener('ctfa-cart', function () { renderFab(); renderShelf(); });
  window.addEventListener('storage', function (e) { if (e.key === CART) { renderFab(); renderShelf(); } });

  // ---- Order popup: items, store, pickup time -> sign in or guest -> confirmed ----
  var dialog = el('dialog', 'order-dialog');
  dialog.setAttribute('aria-labelledby', 'order-title');
  document.body.appendChild(dialog);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  // Every 30 minutes from about an hour from now until 9 PM, then tomorrow from 9 AM.
  function pickupSlots() {
    var slots = [], t = new Date();
    t.setSeconds(0, 0);
    t.setMinutes(t.getMinutes() + 60);
    t.setMinutes(t.getMinutes() < 30 ? 30 : 60);
    var endToday = new Date(); endToday.setHours(21, 0, 0, 0);
    for (; t <= endToday && slots.length < 12; t.setMinutes(t.getMinutes() + 30)) slots.push(new Date(t));
    var tm = new Date(); tm.setDate(tm.getDate() + 1); tm.setHours(9, 0, 0, 0);
    for (var i = 0; i < 6; i++, tm.setMinutes(tm.getMinutes() + 60)) slots.push(new Date(tm));
    return slots;
  }
  function slotLabel(d) {
    var today = new Date().toDateString() === d.toDateString();
    return (today ? 'Today' : 'Tomorrow') + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function frame(titleText, withClose) {
    dialog.textContent = '';
    var panel = el('div', 'od');
    var head = el('div', 'od-head');
    var title = el('h2', null, titleText); title.id = 'order-title';
    head.appendChild(title);
    if (withClose) {
      var x = el('button', 'od-close', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
      x.onclick = function () { dialog.close(); };
      head.appendChild(x);
    }
    panel.appendChild(head);
    dialog.appendChild(panel);
    if (!dialog.open) dialog.showModal();
    return panel;
  }

  function openCheckout() {
    var c = load(), shop = store();
    if (!c.items.length) return;
    var panel = frame('Confirm your order', true);

    panel.appendChild(el('h3', null, 'Items'));
    var ul = el('ul', 'od-items');
    c.items.forEach(function (it) {
      var li = el('li'), name = el('div');
      name.appendChild(el('b', null, it.qty + ' × ' + it.item));
      var detail = [it.option, it.size].filter(Boolean).join(', ');
      if (detail) name.appendChild(el('small', null, detail));
      li.appendChild(name);
      li.appendChild(el('span', null, it.price ? money(it.price * it.qty) : '—'));
      ul.appendChild(li);
    });
    panel.appendChild(ul);
    panel.appendChild(el('p', 'od-total', c.total != null ? 'Estimated total: ' + money(c.total) : 'Estimated total: not available'));

    panel.appendChild(el('h3', null, 'Pickup location'));
    var where = el('div', 'od-store');
    if (shop) {
      where.appendChild(el('b', null, shop.name));
      if (shop.address) where.appendChild(el('small', null, shop.address));
    } else {
      where.appendChild(el('b', null, 'No store chosen yet'));
      var pick = el('a', null, 'Pick a store on the map'); pick.href = 'map.html';
      where.appendChild(pick);
    }
    panel.appendChild(where);

    var tl = el('label', 'od-label', 'Pickup time'); tl.htmlFor = 'od-time';
    panel.appendChild(tl);
    var sel = el('select', 'size od-time'); sel.id = 'od-time';
    var wanted = null; try { wanted = sessionStorage.getItem('ctfa_pickup'); } catch (e) {}
    pickupSlots().forEach(function (d) { var o = el('option', null, slotLabel(d)); o.value = d.toISOString(); sel.appendChild(o); });
    if (wanted && Array.prototype.some.call(sel.options, function (o) { return o.value === wanted; })) sel.value = wanted;
    panel.appendChild(sel);
    panel.appendChild(el('p', 'od-note', 'Pay at pickup with your EBT card.'));

    var actions = el('div', 'od-actions');
    var ok = el('button', 'btn btn-orange', 'Confirm order'); ok.type = 'button';
    var back = el('button', 'btn btn-outline', 'Keep shopping'); back.type = 'button';
    back.onclick = function () { dialog.close(); };
    ok.disabled = !shop;
    ok.onclick = function () {
      try { sessionStorage.setItem('ctfa_pickup', sel.value); } catch (e) {}
      ok.disabled = true;
      signedIn().then(function (yes) { if (yes) placeOrder(new Date(sel.value)); else askAccount(new Date(sel.value)); });
    };
    actions.appendChild(ok); actions.appendChild(back);
    panel.appendChild(actions);
  }

  function signedIn() {
    if (location.protocol === 'file:') return Promise.resolve(false);
    return fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok; }, function () { return false; });
  }

  // Signed out: "Do you want to sign in, or continue as a guest?"
  function askAccount(when) {
    var panel = frame('Sign in or continue as a guest?', true);
    panel.appendChild(el('p', 'od-lede', 'Sign in to save this order to your account, or place it now as a guest.'));
    var actions = el('div', 'od-actions od-stack');
    var signIn = el('a', 'btn btn-navy', 'Sign in');
    // After signing in, come back here and reopen this popup.
    var here = location.pathname.split('/').pop() || 'assistant.html';
    signIn.href = 'login.html?next=' + encodeURIComponent(here + '?checkout=1');
    var guest = el('button', 'btn btn-outline', 'Continue as guest'); guest.type = 'button';
    guest.onclick = function () { try { localStorage.setItem('ctfa_guest', '1'); } catch (e) {} placeOrder(when); };
    var back = el('button', 'link-btn', '← Back to order summary'); back.type = 'button';
    back.onclick = openCheckout;
    actions.appendChild(signIn); actions.appendChild(guest);
    panel.appendChild(actions);
    panel.appendChild(back);
  }

  function placeOrder(when) {
    var c = load(), shop = store();
    var order = { id: 'DS-' + Math.floor(100000 + Math.random() * 900000), placedAt: Date.now(),
                  pickupAt: when.toISOString(), store: shop, items: c.items, total: c.total };
    try {
      var orders = JSON.parse(localStorage.getItem('ctfa_orders') || '[]');
      orders.push(order);
      localStorage.setItem('ctfa_orders', JSON.stringify(orders.slice(-20)));
      sessionStorage.removeItem('ctfa_pickup');
    } catch (e) {}
    save({ items: [] });
    dialog.textContent = '';
    var panel = el('div', 'od od-done');
    panel.appendChild(el('div', 'od-check', '✓'));
    var t = el('h2', null, 'Order confirmed'); t.id = 'order-title';
    panel.appendChild(t);
    panel.appendChild(el('p', null, 'Order number ' + order.id));
    panel.appendChild(el('p', null, 'Pick up at ' + (shop ? shop.name : 'your store') + ', ' + slotLabel(when) + '.'));
    panel.appendChild(el('p', 'od-note', 'Pay at pickup with your EBT card.'));
    var done = el('button', 'btn btn-navy', 'Done'); done.type = 'button';
    done.onclick = function () { dialog.close(); };
    panel.appendChild(done);
    dialog.appendChild(panel);
    if (!dialog.open) dialog.showModal();
    document.dispatchEvent(new CustomEvent('ctfa-order', { detail: order }));
  }

  // Back from signing in: reopen the popup.
  var params = new URLSearchParams(location.search);
  if (params.get('checkout') === '1') {
    history.replaceState(null, '', location.pathname);
    if (load().items.length) openCheckout();
  }

  window.Doorstep = { addLines: addLines, openCheckout: openCheckout, cartCount: function () { return count(); } };
})();
