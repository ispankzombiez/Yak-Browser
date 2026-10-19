/*
 * YakBrowser - forced-landscape orientation SPOOF for a portrait-locked app.
 *
 * The activity is locked to PORTRAIT (when the orientation lock setting is
 * ON), but the Yakkamon game refuses to run in portrait: it renders a
 * "Turn your phone — Yakkamon plays in landscape." gate when this matches:
 *
 *     window.matchMedia("(orientation: portrait) and (pointer: coarse)")
 *
 * A plain orientation override is not enough, because that gate uses a
 * COMPOUND media query that a simple true/false swap cannot cover. Instead,
 * every orientation clause inside any media query is rewritten to a clause the
 * engine evaluates natively:
 *
 *     (orientation: landscape)  -> (min-width: 0px)        (always true)
 *     (orientation: portrait)   -> (min-width: 99999999px) (always false)
 *
 * The rest of the query (pointer: coarse, display-mode, etc.) is still
 * evaluated against the real viewport, and MediaQueryList change events keep
 * working, because the rewritten query is handed to the native matchMedia.
 *
 * Direct orientation signals are also spoofed:
 *
 *   1. window.orientation (legacy)              -> 0
 *   2. screen.orientation.type / .angle         -> 'landscape-primary' / 0
 *
 * (The real viewport stays portrait — only the orientation *reports* lie.)
 *
 * A small portrait-only LAYOUT fix is also applied (section 4): the game's
 * bottom item bar is centred while the chat/plant/settings buttons (including
 * the moon timer pill) are anchored to the right edge. In a real landscape
 * viewport (~832 CSS px wide) the two never touch, but in our portrait
 * viewport (~384 px) they exceed the available width and collide. The bar is
 * pushed fully left (flush with the nav rail) and the right cluster is zoomed
 * slightly, so the timer no longer sits on top of the bar.
 *
 * A second portrait-only fix (section 5) handles the game's wide windows
 * (Workshop, Shop, Squad, Quests, ...): they are two-column layouts that the
 * game lays out for landscape widths, and whose detail/action column is
 * literally hidden below the game's 640 CSS px `sm` breakpoint. Each open
 * modal is re-laid-out at that design width and scaled into the portrait
 * viewport with a transform, so both columns — including every action button —
 * stay visible and tappable.
 *
 * It is injected at document start (before any page script) and is idempotent:
 * a guard flag prevents double installation if injected more than once.
 * It is NOT installed at all when the orientation lock is turned off.
 */
(function () {
  'use strict';

  if (window.__yakOrientationOverride) {
    return;
  }
  window.__yakOrientationOverride = true;

  var LANDSCAPE_TYPE = 'landscape-primary';
  var LANDSCAPE_ANGLE = 0;

  /* 1. Legacy window.orientation ------------------------------------------------ */
  try {
    Object.defineProperty(window, 'orientation', {
      configurable: true,
      get: function () {
        return LANDSCAPE_ANGLE;
      }
    });
  } catch (e) {
    /* readonly in this engine; carry on */
  }

  /* 2. Screen Orientation API ---------------------------------------------------- */
  var screenOrientation = {
    type: LANDSCAPE_TYPE,
    angle: LANDSCAPE_ANGLE,
    onchange: null,
    /* Orientation lock always succeeds: the site is permanently "landscape". */
    lock: function () {
      return Promise.resolve();
    },
    unlock: function () {
      /* no-op: nothing to unlock */
    },
    /* The reported orientation never changes while the lock is on, so no
       'change' events ever need to fire. */
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () {
      return true;
    },
    addListener: function () {},
    removeListener: function () {},
    hasListener: function () {
      return false;
    }
  };
  try {
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      get: function () {
        return screenOrientation;
      }
    });
  } catch (e) {
    try {
      window.screen.orientation = screenOrientation;
    } catch (ignored) {
      /* nothing else we can do */
    }
  }

  /* 3. Media queries: rewrite orientation clauses, incl. compound queries ------- */
  if (typeof window.matchMedia === 'function') {
    var nativeMatchMedia = window.matchMedia.bind(window);

    // Matches "(orientation: portrait)" / "(orientation: landscape)", including
    // extra whitespace and the -webkit- prefix variant.
    var ORIENTATION_CLAUSE =
      /\(\s*(?:-webkit-)?orientation\s*:\s*(portrait|landscape)\s*\)/gi;

    var ALWAYS_TRUE = '(min-width: 0px)';
    var ALWAYS_FALSE = '(min-width: 99999999px)';

    window.matchMedia = function (query) {
      if (typeof query !== 'string' || query.indexOf('orientation') === -1) {
        return nativeMatchMedia(query);
      }

      var rewritten = query.replace(ORIENTATION_CLAUSE, function (_match, word) {
        // Under the forced-landscape lie: landscape clauses are true,
        // portrait clauses are false.
        return String(word).toLowerCase() === 'landscape'
          ? ALWAYS_TRUE
          : ALWAYS_FALSE;
      });

      if (rewritten === query) {
        return nativeMatchMedia(query); // no orientation clause; untouched
      }
      return nativeMatchMedia(rewritten);
    };
  }

  /* 4. Portrait layout fix: bottom bar vs. right-side button cluster ----------- */
  (function () {
    // Measured at 384 CSS px viewport: item bar = 248 px, right cluster
    // (moon timer + plant/paw/settings buttons) = 148 px — together 396 px,
    // so they physically cannot coexist at full size in portrait. Two tweaks:
    //
    //   a) The item bar is nudged left so its left edge sits flush with the
    //      left nav rail (x = 4 px) — as far left as the Items button allows.
    //   b) The right cluster is zoomed to 78%, which pulls its left edge
    //      (the moon timer pill) clear of the bar's right edge (~5-8 px gap).
    //
    // Both are applied only while the viewport is portrait. margin-left shifts
    // the `left: 50%` bar without fighting its own `translate: -50%` centring;
    // zoom scales the cluster subtree (incl. touch targets) as one piece.
    var NUDGE_PX = -64;
    var CLUSTER_ZOOM = 0.78;

    function update() {
      try {
        if (typeof window.innerWidth !== 'number') return;
        // Landscape viewports keep the game's own (correct) layout.
        var portrait = window.innerHeight >= window.innerWidth;

        // a) the big centred item bar (the look-alikes are 12 px label pills)
        var bars = document.querySelectorAll(
          'div[class*="left-1/2"][class*="bottom-0"]'
        );
        for (var i = 0; i < bars.length; i++) {
          var r = bars[i].getBoundingClientRect();
          if (r.height > 40 && r.width > 150) {
            if (portrait) {
              bars[i].style.setProperty('margin-left', NUDGE_PX + 'px', 'important');
            } else {
              bars[i].style.removeProperty('margin-left');
            }
            break;
          }
        }

        // b) the right-anchored cluster holding the moon timer + buttons
        var clusters = document.querySelectorAll(
          'div[class*="bottom-3"][class*="right-3"]'
        );
        for (var j = 0; j < clusters.length; j++) {
          var cr = clusters[j].getBoundingClientRect();
          if (cr.width > 100 && cr.height > 20) {
            if (portrait) {
              clusters[j].style.setProperty('zoom', String(CLUSTER_ZOOM), 'important');
            } else {
              clusters[j].style.removeProperty('zoom');
            }
            break;
          }
        }
      } catch (e) {
        /* never let layout tweaks break the page */
      }
    }

    // The bar only exists once the game HUD has mounted, and the DOM is
    // re-rendered by React, so poll cheaply and (re-)apply as needed.
    setInterval(update, 2000);
    window.addEventListener('resize', update);
    update();
  })();

  /* 5. Portrait modal fit: wide windows (Workshop, Shop, Squad, Quests...) --- */
  // These windows are two-column layouts designed for landscape widths. Below
  // the game's `sm` breakpoint (640 CSS px) the right-hand detail/action
  // column is literally `hidden ... sm:flex` — gone — and the rest of the
  // window is laid out to overflow the portrait viewport. Portrait only, each
  // open modal is handled once (a data attribute marks it; React unmounts
  // modals when they close, so the marker disappears with them):
  //
  //   a) force the landscape-only detail column visible, and
  //   b) lay the window out at the game's own 640 px design width (where both
  //      columns render at natural size), then scale it into the viewport
  //      with a transform. Transforms keep hit-testing aligned, so every
  //      button stays exactly where it looks.
  //
  // Small dialogs (Welcome Back, confirmations) measure within the viewport
  // and are left untouched.
  (function () {
    var FIT_ATTR = 'data-yak-fit';
    var DESIGN_W = 640; // the game's sm breakpoint: both columns, natural size
    var FIT_MARGIN = 4; // px of slack before a window counts as overflowing

    function fitModals() {
      try {
        if (typeof window.innerWidth !== 'number') return;
        if (window.innerWidth >= window.innerHeight) return; // portrait only
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var root = document.getElementById('react-root');
        if (!root) return;

        var layers = root.children;
        for (var i = 0; i < layers.length; i++) {
          var layer = layers[i];
          if (getComputedStyle(layer).position !== 'fixed') continue;
          var lr = layer.getBoundingClientRect();
          // Only full-viewport fixed layers (modal backdrops) count; the HUD
          // layer is inset by the safe area and is therefore skipped.
          if (lr.width < vw - 1 || lr.height < vh - 1) continue;

          var modals = layer.children;
          for (var k = 0; k < modals.length; k++) {
            var modal = modals[k];
            if (getComputedStyle(modal).display === 'none') continue;
            if (modal.hasAttribute(FIT_ATTR)) continue;

            /* a) reveal the landscape-only detail column -------------------- */
            var cols = modal.querySelectorAll(
              '[class*="max-w-4xl"] > [class*="sm:flex"]'
            );
            for (var c = 0; c < cols.length; c++) {
              if (getComputedStyle(cols[c]).display === 'none') {
                cols[c].style.setProperty('display', 'flex', 'important');
              }
            }

            /* b) measure the natural content width -------------------------- */
            var maxRight = 0;
            var all = modal.querySelectorAll('*');
            for (var j = 0; j < all.length; j++) {
              var tag = all[j].tagName;
              if (tag === 'svg' || tag === 'canvas') continue;
              var ar = all[j].getBoundingClientRect();
              if (ar.width > 0 && ar.right > maxRight) maxRight = ar.right;
            }
            var mrect = modal.getBoundingClientRect();
            var naturalW = Math.max(maxRight, mrect.right);
            if (naturalW <= vw - FIT_MARGIN) {
              modal.setAttribute(FIT_ATTR, 'noscale'); // fits as-is
              continue;
            }

            /* c) design-width layout + scale-to-fit ------------------------- */
            modal.style.setProperty('width', DESIGN_W + 'px', 'important');
            var naturalH = modal.getBoundingClientRect().height;
            var scale = (vw - 8) / DESIGN_W;
            var tx = (vw - DESIGN_W * scale) / 2;
            var ty = (vh - naturalH * scale) / 2;
            modal.style.setProperty(
              'transform',
              'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + scale.toFixed(4) + ')',
              'important'
            );
            modal.style.setProperty('transform-origin', '0 0', 'important');
            modal.setAttribute(FIT_ATTR, 's=' + scale.toFixed(3));
          }
        }
      } catch (e) {
        /* never let layout tweaks break the page */
      }
    }

    // Modals mount/unmount constantly (React), so poll cheaply and also react
    // to DOM changes for a near-instant fit when a window opens.
    setInterval(fitModals, 800);
    window.addEventListener('resize', fitModals);
    try {
      var reactRoot = document.getElementById('react-root');
      if (reactRoot) {
        var mo = new MutationObserver(function () {
          setTimeout(fitModals, 60);
        });
        mo.observe(reactRoot, { childList: true, subtree: true });
      }
    } catch (e) {
      /* the observer is an optimisation; the poll still runs */
    }
    fitModals();
  })();
})();
