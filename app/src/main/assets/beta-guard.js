/*
 * YakBrowser beta-guard — injected at document start on yakkamon.com
 * origins on every launch, independent of the orientation setting.
 *
 * 1) display-mode: Android WebView reports `fullscreen` for the
 *    display-mode media feature. The site's boot code reads it to detect
 *    "installed app" visitors (fullscreen/standalone) and, when matched,
 *    deletes its public page and mounts the full game client — which no
 *    longer has a backend. A normal browser tab reports `browser`, which
 *    leaves the site's public page in place. Answer like a browser tab so
 *    every visitor lands on the same page everyone else sees.
 *
 * 2) storage hygiene: a service worker registration and its Cache Storage
 *    outlive the HTTP cache and can serve old content forever. This app
 *    never keeps them: unregister everything and delete every cache on
 *    every page start, so every launch reflects what the network serves.
 */
(function () {
  if (window.__yakBetaGuard) return;
  window.__yakBetaGuard = true;

  // --- display-mode: report like a normal browser tab -------------------
  try {
    var nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = function (query) {
      var list = nativeMatchMedia(query);
      if (typeof query !== 'string' || query.indexOf('display-mode') === -1) {
        return list;
      }
      var wantsBrowser = /\(\s*display-mode\s*:\s*browser\s*\)/.test(query);
      if (!!list.matches === wantsBrowser) return list;
      return {
        media: list.media,
        matches: wantsBrowser,
        onchange: null,
        addEventListener: function (type, listener, opts) {
          if (list.addEventListener) list.addEventListener(type, listener, opts);
        },
        removeEventListener: function (type, listener, opts) {
          if (list.removeEventListener) list.removeEventListener(type, listener, opts);
        },
        addListener: function (listener) {
          if (list.addListener) list.addListener(listener);
        },
        removeListener: function (listener) {
          if (list.removeListener) list.removeListener(listener);
        },
        dispatchEvent: function (event) {
          return list.dispatchEvent ? list.dispatchEvent(event) : false;
        }
      };
    };
  } catch (e) {}

  // --- storage hygiene: no service worker, no Cache Storage -------------
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { try { r.unregister(); } catch (e) {} });
      }).catch(function () {});
    }
  } catch (e) {}
  try {
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (k) { try { caches.delete(k); } catch (e) {} });
      }).catch(function () {});
    }
  } catch (e) {}
})();
