/* Doorstep - "What do you want today?" page, shown after a store is confirmed on the map.
   Whatever the shopper types is sent to the SNAP assistant (assistant.html?q=...). */
(function () {
  'use strict';

  var store = null;
  try { store = JSON.parse(localStorage.getItem('ctfa_store') || 'null'); } catch (e) {}
  var eyebrow = document.getElementById('shop-eyebrow');
  if (store && store.name && eyebrow) eyebrow.lastChild.textContent = 'Shopping at ' + store.name;

  var form = document.getElementById('form');
  var box = document.getElementById('box');

  // Enter sends (Shift+Enter makes a new line), like the assistant's chat box.
  box.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (box.value.trim()) form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  });
  form.addEventListener('submit', function (e) {
    if (!box.value.trim()) { e.preventDefault(); box.focus(); }
  });

  if (!window.matchMedia('(max-width: 820px)').matches) box.focus({ preventScroll: true });
})();
