/*
 * YakBrowser beta-guard — injected at document start on yakkamon.com
 * origins on every launch, independent of the orientation setting.
 *
 * display-mode: Android WebView reports `fullscreen` for the
 * display-mode media feature. The site's boot code reads it to detect
 * "installed app" visitors (fullscreen/standalone) and, when matched,
 * deletes its public page and mounts the full game client — bypassing
 * the site's own beta-access gate. A normal browser tab reports
 * `browser`, which leaves the site's public page in place and lets the
 * site's gate (session + /auth/beta-access) decide who sees the game.
 *
 * Cache policy (deliberately NOT touched here): caching is the SITE's
 * call — HTTP cache headers are honored as-is and any service worker the
 * site itself installs keeps running. The app only guarantees that a
 * FRESH install starts on an empty cache (one-time first-run purge plus
 * allowBackup=false); upgrades are never wiped.
 */
(function () {
  if (window.__yakBetaGuard) return;
  window.__yakBetaGuard = true;

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
})();
