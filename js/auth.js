/* Doorstep - sign up and sign in with a phone number and a password.
   The server (server-auth.js) checks the password, saves the account, and signs you in with a
   secure cookie. EBT numbers and photos are checked here only and are never sent or stored. */
(function () {
  'use strict';

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function normPhone(s) { var d = digits(s); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1); return d; }
  function fmtPhone(s) {
    var d = normPhone(s).slice(0, 10);
    if (d.length > 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    if (d.length > 3) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return d ? '(' + d : '';
  }
  function fmtEbt(s) { return digits(s).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); }

  function api(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; });
    }, function () { return { status: 0, error: 'offline' }; });
  }

  var MESSAGES = {
    offline: 'Could not reach the Doorstep server. Start it with start-mac.command or start-windows.bat, then open http://localhost:3000.',
    rate_limited: 'Too many tries. Wait a minute and try again.',
    too_many_tries: 'Too many wrong passwords for this number. Wait 15 minutes and try again.',
    server_error: 'Something went wrong on our side. Try again.'
  };
  function message(d) { return MESSAGES[d.error] || MESSAGES.server_error; }

  function setErr(id, msg) {
    var e = $('#' + id + '-error'); if (e) e.textContent = msg || '';
    var c = $('#' + id); if (c) c.setAttribute('aria-invalid', msg ? 'true' : 'false');
    var box = $('#' + id + '-box'); if (box) box.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function busy(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', on ? 'true' : 'false'); }
  // Show / Hide button next to a password box.
  function initPasswordToggle() {
    $all('.pw-toggle').forEach(function (btn) {
      var input = $('#' + btn.getAttribute('aria-controls'));
      btn.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Hide' : 'Show';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        input.focus();
      });
    });
  }

  // Show field errors the server sent back; focus the first one.
  function showErrors(errors) {
    var firstBad = null;
    Object.keys(errors).forEach(function (k) { setErr(k, errors[k]); firstBad = firstBad || $('#' + k) || $('[name="' + k + '"]'); });
    if (firstBad) firstBad.focus();
  }

  function initUpload(id) {
    var input = $('#' + id), box = $('#' + id + '-box'), empty = $('.upload-empty', box),
        done = $('.upload-done', box), img = $('img', box), name = $('.u-name', box), rm = $('#' + id + '-remove');
    function clear() { input.value = ''; empty.hidden = false; done.hidden = true; rm.hidden = true; if (img.src) { URL.revokeObjectURL(img.src); img.removeAttribute('src'); } }
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) { clear(); return; }
      if (!/^image\//.test(f.type)) { clear(); setErr(id, 'Choose a photo file (JPG or PNG).'); return; }
      if (f.size > 5 * 1024 * 1024) { clear(); setErr(id, 'That photo is over 5 MB. Choose a smaller one.'); return; }
      setErr(id, '');
      img.src = URL.createObjectURL(f); name.textContent = f.name;
      empty.hidden = true; done.hidden = false; rm.hidden = false;
    });
    rm.addEventListener('click', function () { clear(); input.focus(); });
    return { has: function () { return !!(input.files && input.files[0]); }, clear: clear };
  }

  // Where to go after signing in: a page in this folder passed as ?next= (from checkout), else the map.
  var NEXT = (function () {
    var n = new URLSearchParams(location.search).get('next') || '';
    return /^[a-z0-9-]+\.html(\?checkout=1)?$/i.test(n) ? n : '';
  })();
  function nextPage() { return NEXT || 'map.html'; }

  function redirectIfSignedIn() {
    api('/api/auth/me').then(function (d) { if (d.user) window.location.replace(nextPage()); });
  }

  /* ---------- Sign up ---------- */
  function initSignup() {
    redirectIfSignedIn();
    var form = $('#signup-form'), phone = $('#phone'), ebt = $('#ebt');
    var stateUp = initUpload('stateid'), disUp = initUpload('disability-file');
    var disBlock = $('#disability-block');

    phone.addEventListener('input', function () { phone.value = fmtPhone(phone.value); });
    // Sent here from sign in because the number has no account yet.
    var fromLogin = normPhone(new URLSearchParams(location.search).get('phone'));
    if (fromLogin.length === 10) {
      phone.value = fmtPhone(fromLogin);
      var note = $('#new-number'); if (note) note.hidden = false;
      history.replaceState(null, '', location.pathname + (NEXT ? '?next=' + encodeURIComponent(NEXT) : ''));
    }
    ebt.addEventListener('input', function () { ebt.value = fmtEbt(ebt.value); });
    $all('input[name="disabled"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var yes = $('input[name="disabled"]:checked').value === 'yes';
        disBlock.hidden = !yes; setErr('disabled', '');
        if (!yes) { disUp.clear(); setErr('disability-file', ''); }
      });
    });

    function validate() {
      var first = null;
      function chk(id, ok, msg) { setErr(id, ok ? '' : msg); if (!ok && !first) first = $('#' + id) || $('[name="' + id + '"]'); }
      chk('firstName', $('#firstName').value.trim().length > 0, 'Enter your first name.');
      chk('lastName', $('#lastName').value.trim().length > 0, 'Enter your last name.');
      var em = $('#email').value.trim();
      chk('email', !em || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em), 'Enter a valid email, or leave it blank.');
      chk('phone', normPhone(phone.value).length === 10, 'Enter a 10-digit phone number.');
      chk('password', $('#password').value.length >= 6, 'Use at least 6 characters.');
      chk('ebt', digits(ebt.value).length === 16, 'Enter the 16-digit number on the front of your EBT card.');
      var age = parseInt($('#age').value, 10);
      chk('age', age >= 18 && age <= 120, 'Enter your age (18 or older).');
      chk('transport', !!$('#transport').value, 'Choose how you usually get around.');
      var dis = $('input[name="disabled"]:checked');
      chk('disabled', !!dis, 'Choose Yes or No.');
      if (dis && dis.value === 'yes') chk('disability-file', disUp.has(), 'Upload a photo of your disability card or document.');
      chk('stateid', stateUp.has(), 'Upload a photo of your state ID.');
      chk('consent', $('#consent').checked, 'Check this box to continue.');
      return first;
    }

    function done(user) {
      form.hidden = true; $('#success-panel').hidden = false;
      $('#welcome-name').textContent = 'Welcome, ' + user.first;
      $('#delivery-note').textContent = user.deliveryEligible
        ? 'You can request delivery when you place an order.'
        : 'You can order for pickup. Delivery is available for seniors (60+) and people with a disability.';
      if (NEXT) { var go = $('#success-panel .btn'); go.href = NEXT; go.textContent = 'Back to your order'; }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      $('#success-panel h2').focus();
    }

    // Only the profile and password go to the server. The EBT number and photos stay on this page.
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = validate(); if (bad) { bad.focus(); return; }
      var profile = {
        first: $('#firstName').value.trim(), last: $('#lastName').value.trim(), email: $('#email').value.trim(),
        phone: normPhone(phone.value), age: parseInt($('#age').value, 10), transport: $('#transport').value,
        disabled: $('input[name="disabled"]:checked').value === 'yes', password: $('#password').value
      };
      var btn = $('button[type="submit"]', form); busy(btn, true);
      api('/api/auth/signup', profile).then(function (d) {
        busy(btn, false);
        if (d.status === 200 && d.user) { done(d.user); return; }
        if (d.errors) { showErrors(d.errors); return; }
        setErr('phone', message(d)); phone.focus();
      });
    });
  }

  /* ---------- Sign in ---------- */
  function initLogin() {
    redirectIfSignedIn();
    var form = $('#login-form'), phone = $('#phone'), password = $('#password');
    phone.addEventListener('input', function () { phone.value = fmtPhone(phone.value); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = normPhone(phone.value);
      setErr('phone', ''); setErr('password', '');
      if (p.length !== 10) { setErr('phone', 'Enter your 10-digit phone number.'); phone.focus(); return; }
      var btn = $('button[type="submit"]', form); busy(btn, true);
      api('/api/auth/login', { phone: p, password: password.value }).then(function (d) {
        busy(btn, false);
        if (d.status === 200 && d.user) { window.location.href = nextPage(); return; }
        // No account for this number: go straight to sign up, with the number filled in.
        if (d.status === 404) { window.location.href = 'signup.html?phone=' + p + (NEXT ? '&next=' + encodeURIComponent(NEXT) : ''); return; }
        if (d.errors) { showErrors(d.errors); if (d.errors.password) password.select(); return; }
        setErr('password', message(d)); password.focus();
      });
    });

    // Continue as guest: browse stores and shop without an account.
    var guest = $('#guest-btn');
    if (guest && NEXT) {
      // Came from confirming an order: an account is required, so no guest option here.
      guest.hidden = true;
      var or = $('.or-divider'); if (or) or.hidden = true;
    } else if (guest) {
      guest.addEventListener('click', function () {
        try { localStorage.setItem('ctfa_guest', '1'); } catch (e) {}
      });
    }
  }

  initPasswordToggle();
  if ($('#signup-form')) initSignup();
  if ($('#login-form')) initLogin();
})();
