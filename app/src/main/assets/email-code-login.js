(function () {
  'use strict';
  if (window.__yakEmailCodeLogin) return;
  window.__yakEmailCodeLogin = true;

  var style = document.createElement('style');
  style.id = 'yak-email-code-login';
  style.textContent =
    '#verify-google, #google-btn, .g_id_signin,' +
    'iframe[src^="https://accounts.google.com/gsi/button"] {' +
    'display:none !important;' +
    '}';

  function mount() {
    var parent = document.head || document.documentElement;
    if (!parent) return false;
    parent.appendChild(style);
    return true;
  }

  if (!mount()) {
    var observer = new MutationObserver(function () {
      if (mount()) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }
})();
