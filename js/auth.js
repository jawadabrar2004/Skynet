/* Doorstep - sign up and sign in with a phone number and a one-time code.
   The server (server-auth.js) creates the code, checks it, saves the account, and signs you in
   with a secure cookie. In demo mode (no Twilio settings) the server returns the code so it can be
   shown on screen. EBT numbers and photos are checked here only and are never sent or stored. */
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
  function mask(phone) { return '(•••) •••-' + phone.slice(6); }

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
    sms_failed: 'We could not send a text to this number. Check it and try again.',
    code_expired: 'That code has expired. Tap Resend code to get a new one.',
    too_many_tries: 'Too many wrong codes. Tap Resend code to get a new one.',
    exists: 'An account already exists for this number. Sign in instead.',
    no_account: 'We could not find an account for this number. Sign up first.',
    server_error: 'Something went wrong on our side. Try again.'
  };
  function message(d) {
    if (d.error === 'wrong_code') return 'That code does not match. ' + (d.left > 0 ? d.left + (d.left === 1 ? ' try' : ' tries') + ' left.' : 'Tap Resend code to get a new one.');
    if (d.error === 'too_soon') return 'Please wait ' + d.wait + ' seconds before asking for another code.';
    return MESSAGES[d.error] || MESSAGES.server_error;
  }

  // The code is shown on screen only in demo mode (the server returns it only when no SMS is set up).
  function showCode(d) {
    $('#demo-code').textContent = d.demoCode || '';
    $('#verify-panel .alert').hidden = !d.demoCode;
  }

  function setErr(id, msg) {
    var e = $('#' + id + '-error'); if (e) e.textContent = msg || '';
    var c = $('#' + id); if (c) c.setAttribute('aria-invalid', msg ? 'true' : 'false');
    var box = $('#' + id + '-box'); if (box) box.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function busy(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', on ? 'true' : 'false'); }
  function startTimer(btn, secs) {
    clearInterval(btn._t); var left = secs; btn.disabled = true;
    function tick() {
      btn.textContent = left > 0 ? 'Resend code in ' + left + 's' : 'Resend code';
      if (left <= 0) { btn.disabled = false; clearInterval(btn._t); }
      left--;
    }
    tick(); btn._t = setInterval(tick, 1000);
  }
  function step(n) {
    $('#sb1').className = n === 1 ? 'current' : 'done';
    $('#sb2').className = n === 2 ? 'current' : n > 2 ? 'done' : '';
    ['#sb1', '#sb2'].forEach(function (id, i) {
      if (n === i + 1) $(id).setAttribute('aria-current', 'step'); else $(id).removeAttribute('aria-current');
    });
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

  function initOtp(root) {
    var inputs = $all('input', root);
    inputs.forEach(function (inp, i) {
      inp.addEventListener('input', function () {
        inp.value = digits(inp.value).slice(-1);
        root.classList.remove('bad');
        if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && i > 0) { inputs[i - 1].value = ''; inputs[i - 1].focus(); }
        if (e.key === 'ArrowLeft' && i > 0) inputs[i - 1].focus();
        if (e.key === 'ArrowRight' && i < inputs.length - 1) inputs[i + 1].focus();
      });
      inp.addEventListener('paste', function (e) {
        var t = digits((e.clipboardData || window.clipboardData).getData('text')).slice(0, inputs.length);
        if (!t) return; e.preventDefault();
        inputs.forEach(function (x, j) { x.value = t.charAt(j) || ''; });
        inputs[Math.min(t.length, inputs.length - 1)].focus();
      });
    });
    return {
      value: function () { return inputs.map(function (x) { return x.value; }).join(''); },
      clear: function () { inputs.forEach(function (x) { x.value = ''; }); root.classList.remove('bad'); inputs[0].focus(); },
      focus: function () { inputs[0].focus(); },
      bad: function () { root.classList.add('bad'); }
    };
  }

  // Shared "enter the code" step for both sign up and sign in.
  function initVerify(opts) {
    var otp = initOtp($('#otp')), resend = $('#resend-btn'), err = $('#otp-error'), status = $('#otp-status');

    function codeSent(d) {
      showCode(d); otp.clear(); err.textContent = '';
      startTimer(resend, 30);
    }
    resend.addEventListener('click', function () {
      busy(resend, true); status.textContent = '';
      opts.start().then(function (d) {
        if (d.status === 200) { codeSent(d); status.textContent = 'A new code was sent.'; }
        else { resend.disabled = false; err.textContent = message(d); }
      });
    });
    $('#change-btn').addEventListener('click', function () {
      $('#verify-panel').hidden = true; opts.form.hidden = false; step(1); opts.back();
    });
    $('#verify-form').addEventListener('submit', function (e) {
      e.preventDefault(); status.textContent = '';
      var v = otp.value(), btn = $('#verify-form button[type="submit"]');
      if (v.length < 6) { err.textContent = 'Enter all 6 digits.'; otp.bad(); return; }
      busy(btn, true);
      opts.verify(v).then(function (d) {
        busy(btn, false);
        if (d.status === 200 && d.user) { err.textContent = ''; opts.done(d.user); return; }
        err.textContent = message(d); otp.bad();
      });
    });
    return function show(d) {
      codeSent(d);
      opts.form.hidden = true; $('#verify-panel').hidden = false; step(2);
      $('#sent-to').textContent = mask(opts.phone());
      otp.focus();
    };
  }

  function redirectIfSignedIn() {
    api('/api/auth/me').then(function (d) { if (d.user) window.location.replace('map.html'); });
  }

  /* ---------- Sign up ---------- */
  function initSignup() {
    redirectIfSignedIn();
    var form = $('#signup-form'), phone = $('#phone'), ebt = $('#ebt');
    var stateUp = initUpload('stateid'), disUp = initUpload('disability-file');
    var disBlock = $('#disability-block'), profile = null;

    phone.addEventListener('input', function () { phone.value = fmtPhone(phone.value); });
    // Sent here from sign in because the number has no account yet.
    var fromLogin = normPhone(new URLSearchParams(location.search).get('phone'));
    if (fromLogin.length === 10) {
      phone.value = fmtPhone(fromLogin);
      var note = $('#new-number'); if (note) note.hidden = false;
      history.replaceState(null, '', location.pathname);
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

    // Only the profile goes to the server. The EBT number and photos stay on this page.
    function start() { return api('/api/auth/signup/start', profile); }

    var showVerify = initVerify({
      form: form,
      phone: function () { return profile.phone; },
      start: start,
      back: function () { phone.focus(); },
      verify: function (code) { return api('/api/auth/signup/verify', { phone: profile.phone, code: code }); },
      done: function (user) {
        $('#verify-panel').hidden = true; $('#success-panel').hidden = false; step(3);
        $('#welcome-name').textContent = 'Welcome, ' + user.first;
        $('#delivery-note').textContent = user.deliveryEligible
          ? 'You can request delivery when you place an order.'
          : 'You can order for pickup. Delivery is available for seniors (60+) and people with a disability.';
        $('#success-panel h2').focus();
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = validate(); if (bad) { bad.focus(); return; }
      profile = {
        first: $('#firstName').value.trim(), last: $('#lastName').value.trim(), email: $('#email').value.trim(),
        phone: normPhone(phone.value), age: parseInt($('#age').value, 10), transport: $('#transport').value,
        disabled: $('input[name="disabled"]:checked').value === 'yes'
      };
      var btn = $('button[type="submit"]', form); busy(btn, true);
      start().then(function (d) {
        busy(btn, false);
        if (d.status === 200) { showVerify(d); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        if (d.errors) {
          var firstBad = null;
          Object.keys(d.errors).forEach(function (k) { setErr(k, d.errors[k]); firstBad = firstBad || $('#' + k) || $('[name="' + k + '"]'); });
          if (firstBad) firstBad.focus();
          return;
        }
        setErr('phone', message(d)); phone.focus();
      });
    });
  }

  /* ---------- Sign in ---------- */
  function initLogin() {
    redirectIfSignedIn();
    var form = $('#login-form'), phone = $('#phone'), p = '';
    phone.addEventListener('input', function () { phone.value = fmtPhone(phone.value); });

    function start() { return api('/api/auth/login/start', { phone: p }); }

    var showVerify = initVerify({
      form: form,
      phone: function () { return p; },
      start: start,
      back: function () { phone.focus(); },
      verify: function (code) { return api('/api/auth/login/verify', { phone: p, code: code }); },
      done: function () { window.location.href = 'map.html'; }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      p = normPhone(phone.value);
      if (p.length !== 10) { setErr('phone', 'Enter your 10-digit phone number.'); phone.focus(); return; }
      var btn = $('button[type="submit"]', form); busy(btn, true);
      start().then(function (d) {
        busy(btn, false);
        if (d.status === 200) { setErr('phone', ''); showVerify(d); return; }
        // No account for this number: go straight to sign up, with the number filled in.
        if (d.status === 404) { window.location.href = 'signup.html?phone=' + p; return; }
        setErr('phone', (d.errors && d.errors.phone) || message(d)); phone.focus();
      });
    });

    // Continue as guest: browse stores and shop without an account.
    var guest = $('#guest-btn');
    if (guest) guest.addEventListener('click', function () {
      try { localStorage.setItem('ctfa_guest', '1'); } catch (e) {}
    });
  }

  if ($('#signup-form')) initSignup();
  if ($('#login-form')) initLogin();
})();
