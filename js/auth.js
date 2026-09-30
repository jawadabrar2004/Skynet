/* CT Food Access Finder - sign up and sign in (DEMO).
   No text messages are sent: the one-time code is shown on screen so the flow can be tested.
   To go live, replace genCode()/verify with a real SMS provider (Twilio Verify, Firebase Auth, etc.)
   and send uploads + EBT number to a secure backend. Nothing sensitive is stored in the browser. */
(function () {
  'use strict';
  var USERS = 'ctfa_users', SESSION = 'ctfa_session', mem = {};

  function read(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : (mem[k] || null); } catch (e) { return mem[k] || null; } }
  function write(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function getValidSession() {
    var session = read(SESSION);
    if (!session || !session.phone) return null;
    var users = read(USERS) || {};
    var user = users[session.phone];
    if (!user) return null;
    return { phone: session.phone, first: session.first || user.first || '' };
  }

  function redirectSignedInUser() {
    if (!getValidSession()) return false;
    // Authentication pages live beside map.html in /pages/.
    window.location.replace('map.html');
    return true;
  }
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
  function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
  function setErr(id, msg) {
    var e = $('#' + id + '-error'); if (e) e.textContent = msg || '';
    var c = $('#' + id); if (c) c.setAttribute('aria-invalid', msg ? 'true' : 'false');
    var box = $('#' + id + '-box'); if (box) box.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function startTimer(btn, secs) {
    clearInterval(btn._t); var left = secs; btn.disabled = true;
    function tick() {
      btn.textContent = left > 0 ? 'Resend code in ' + left + 's' : 'Resend code';
      if (left <= 0) { btn.disabled = false; clearInterval(btn._t); }
      left--;
    }
    tick(); btn._t = setInterval(tick, 1000);
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

  function mask(phone) { return '(\u2022\u2022\u2022) \u2022\u2022\u2022-' + phone.slice(6); }

  /* ---------- Sign up ---------- */
  function initSignup() {
    if (redirectSignedInUser()) return;
    var form = $('#signup-form'), phone = $('#phone'), ebt = $('#ebt');
    var stateUp = initUpload('stateid'), disUp = initUpload('disability-file');
    var disBlock = $('#disability-block'), state = { code: '', data: null };
    var otp = initOtp($('#otp'));

    phone.addEventListener('input', function () { phone.value = fmtPhone(phone.value); });
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
      var p = normPhone(phone.value);
      var users = read(USERS) || {};
      chk('phone', p.length === 10, 'Enter a 10-digit phone number.');
      if (p.length === 10 && users[p]) chk('phone', false, 'An account already exists for this number. Sign in instead.');
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

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = validate(); if (bad) { bad.focus(); return; }
      var dis = $('input[name="disabled"]:checked').value === 'yes', age = parseInt($('#age').value, 10);
      state.data = {
        first: $('#firstName').value.trim(), last: $('#lastName').value.trim(),
        phone: normPhone(phone.value), age: age, disabled: dis, transport: $('#transport').value,
        deliveryEligible: dis || age >= 60
      };
      sendCode();
      form.hidden = true; $('#verify-panel').hidden = false;
      $('#sb1').className = 'done'; $('#sb1').removeAttribute('aria-current');
      $('#sb2').className = 'current'; $('#sb2').setAttribute('aria-current', 'step');
      $('#sent-to').textContent = mask(state.data.phone);
      otp.focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    function sendCode() {
      state.code = genCode(); $('#demo-code').textContent = state.code;
      startTimer($('#resend-btn'), 30);
    }
    $('#resend-btn').addEventListener('click', function () {
      sendCode(); otp.clear(); $('#otp-error').textContent = ''; $('#otp-status').textContent = 'A new code was sent.';
    });
    $('#change-btn').addEventListener('click', function () {
      $('#verify-panel').hidden = true; form.hidden = false;
      $('#sb2').className = ''; $('#sb2').removeAttribute('aria-current');
      $('#sb1').className = 'current'; $('#sb1').setAttribute('aria-current', 'step');
      phone.focus();
    });
    $('#verify-form').addEventListener('submit', function (e) {
      e.preventDefault(); var v = otp.value(), err = $('#otp-error'); $('#otp-status').textContent = '';
      if (v.length < 6) { err.textContent = 'Enter all 6 digits.'; otp.bad(); return; }
      if (v !== state.code) { err.textContent = 'That code does not match. Check it and try again.'; otp.bad(); return; }
      var users = read(USERS) || {}, d = state.data;
      users[d.phone] = { first: d.first, last: d.last, age: d.age, disabled: d.disabled, transport: d.transport, deliveryEligible: d.deliveryEligible };
      write(USERS, users); write(SESSION, { phone: d.phone, first: d.first });
      $('#verify-panel').hidden = true; $('#success-panel').hidden = false;
      $('#sb2').className = 'done'; $('#sb2').removeAttribute('aria-current');
      $('#welcome-name').textContent = 'Welcome, ' + d.first;
      $('#delivery-note').textContent = d.deliveryEligible
        ? 'You can request delivery when you place an order.'
        : 'You can order for pickup. Delivery is available for seniors (60+) and people with a disability.';
      $('#success-panel h2').focus();
    });
  }

  /* ---------- Sign in ---------- */
  function initLogin() {
    if (redirectSignedInUser()) return;
    var form = $('#login-form'), phone = $('#phone'), state = { code: '', phone: '' };
    var otp = initOtp($('#otp'));
    phone.addEventListener('input', function () { phone.value = fmtPhone(phone.value); });

    function sendCode() { state.code = genCode(); $('#demo-code').textContent = state.code; startTimer($('#resend-btn'), 30); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = normPhone(phone.value), users = read(USERS) || {};
      if (p.length !== 10) { setErr('phone', 'Enter your 10-digit phone number.'); phone.focus(); return; }
      if (!users[p]) { setErr('phone', 'We could not find an account for this number. Sign up first.'); phone.focus(); return; }
      setErr('phone', ''); state.phone = p; sendCode();
      form.hidden = true; $('#verify-panel').hidden = false;
      $('#sb1').className = 'done'; $('#sb1').removeAttribute('aria-current');
      $('#sb2').className = 'current'; $('#sb2').setAttribute('aria-current', 'step');
      $('#sent-to').textContent = mask(p); otp.focus();
    });
    $('#resend-btn').addEventListener('click', function () {
      sendCode(); otp.clear(); $('#otp-error').textContent = ''; $('#otp-status').textContent = 'A new code was sent.';
    });
    $('#change-btn').addEventListener('click', function () {
      $('#verify-panel').hidden = true; form.hidden = false;
      $('#sb2').className = ''; $('#sb2').removeAttribute('aria-current');
      $('#sb1').className = 'current'; $('#sb1').setAttribute('aria-current', 'step'); phone.focus();
    });
    $('#verify-form').addEventListener('submit', function (e) {
      e.preventDefault(); var v = otp.value(), err = $('#otp-error');
      if (v.length < 6) { err.textContent = 'Enter all 6 digits.'; otp.bad(); return; }
      if (v !== state.code) { err.textContent = 'That code does not match. Check it and try again.'; otp.bad(); return; }
      var users = read(USERS) || {}, u = users[state.phone];
      write(SESSION, { phone: state.phone, first: u ? u.first : '' });
      window.location.href = 'map.html';
    });
  }

  if ($('#signup-form')) initSignup();
  if ($('#login-form')) initLogin();
})();
