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
/*
 * PORTRAIT CAMERA WIDENING (boot-critical, runs first).
 *
 * The game boots its Phaser camera at window.innerWidth x window.innerHeight,
 * and its battle/gym layout centres the field with the team benches OUTSIDE
 * it (player bench left of the field, enemy bench right). Landscape phones
 * the game was designed for are ~768-832 CSS px wide, so the whole board
 * fits; at our portrait width (~384 px) the player's leftmost bench
 * Yakkamon lands at negative x and is cut off at the screen edge.
 *
 * So the page's JS is told the viewport is at least MIN_CAMERA_W px wide —
 * in exact proportion (height scales with width) so the canvas downscale
 * stays uniform. The game renders a wider world slice; the canvas CSS is
 * pinned back to the real viewport, which zooms the scene out slightly
 * (~83% on a 384 px phone) instead of cutting anything off.
 *
 * The decision is made per read from documentElement.clientWidth/Height
 * (the real layout viewport), because at document-start the layout isn't
 * done yet: clientWidth is 0, and the pre-parse fallback (980 px) would
 * look "wide enough". Before layout, the captured pre-parse size is
 * reported unchanged. Only JS readers of innerWidth/innerHeight see the
 * widened values: CSS media queries, layout, and this script's own
 * sections all use documentElement.clientWidth/Height directly.
 */
(function () {
  'use strict';

  if (window.__yakCameraSpoof) {
    return;
  }
  window.__yakCameraSpoof = true;

  var MIN_CAMERA_W = 460;
  /* 460 leaves the leftmost bench Yakkamon ~13 CSS px clear of the edge on
     a 384 px phone (~18 px on narrower ones) at ~83% zoom. */
  var yakCamEarlyW = window.innerWidth;
  var yakCamEarlyH = window.innerHeight;
  var yakCamStyleDone = false;

  function yakCamSize(wantWidth) {
    var d = document.documentElement;
    var w = (d && d.clientWidth) || 0;
    var h = (d && d.clientHeight) || 0;
    /* Pre-layout or landscape: report the real values, no spoof. */
    if (!w || !h || h < w || w >= MIN_CAMERA_W) {
      return wantWidth ? (w || yakCamEarlyW) : (h || yakCamEarlyH);
    }
    if (!yakCamStyleDone) {
      yakCamStyleDone = true;
      try {
        var st = document.createElement('style');
        st.textContent =
          'canvas { width: 100% !important; height: 100% !important; }';
        (document.head || d).appendChild(st);
      } catch (e) {
        /* style is best-effort; the spoof itself continues */
      }
    }
    if (wantWidth) {
      return MIN_CAMERA_W;
    }
    return Math.round(h * MIN_CAMERA_W / w);
  }

  try {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      get: function () {
        return yakCamSize(true);
      }
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      get: function () {
        return yakCamSize(false);
      }
    });
  } catch (e) {
    /* readonly in this engine; carry on unspoofed */
  }
})();

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
        // Real layout viewport: documentElement.clientWidth ignores both the
        // JS-level camera spoof and the pre-parse fallback size.
        var vw = document.documentElement.clientWidth || window.innerWidth;
        var vh = document.documentElement.clientHeight || window.innerHeight;
        if (!vw || !vh) return;
        // Landscape viewports keep the game's own (correct) layout.
        var portrait = vh >= vw;

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

  /* Shared helpers for the window-fit passes (sections 5 and 6). ----------- */

  // True while a *running* animation (CSS or Web Animations API) targets
  // `el` or anything inside it. Claiming a modal while it is flying into
  // place measures a meaningless rect, and the claim is one-shot — the
  // window then lives at the wrong spot/size for as long as it stays open
  // (seen on the catch/celebration modal, whose contents FLIP in over
  // ~600 ms). Engines without document.getAnimations (very old WebViews)
  // report false and keep the previous claim-immediately behaviour.
  function yakAnimationsRunning(el) {
    try {
      if (typeof document.getAnimations !== 'function') return false;
      var list = document.getAnimations();
      for (var i = 0; i < list.length; i++) {
        if (list[i].playState !== 'running') continue;
        var target = list[i].effect && list[i].effect.target;
        if (target && (target === el || el.contains(target))) return true;
      }
    } catch (e) {
      /* probing animations must never break the page */
    }
    return false;
  }

  // Bounded "still animating in" check shared by sections 5 and 6: records
  // when a modal was first seen and reports true only while it is both
  // young AND animating, so a never-ending decorative animation inside a
  // window cannot block its fit forever.
  function yakSeenRecently(modal) {
    if (!modal.__yakFitSeenAt) modal.__yakFitSeenAt = Date.now();
    return Date.now() - modal.__yakFitSeenAt < 700 && yakAnimationsRunning(modal);
  }

  // Centres `modal` in the viewport and scales it down to fit, wherever
  // its layout box happens to sit: the transform is cleared, the pure
  // layout rect is read, and the translate is computed from THAT rect.
  // Flex-centred backdrops put the layout box at an arbitrary (usually
  // negative) offset, so assuming the box starts at (0,0) — as the old
  // section 5c math did — dropped scaled windows at the bottom-left, half
  // off-screen (the catch/celebration modal). Idempotent: calling it on
  // every pass re-centres after animations settle and follows viewport
  // changes. Returns the applied scale (clamped to 1), or null when the
  // box cannot be measured.
  function yakPlaceScaled(modal, vw, vh) {
    try {
      modal.style.setProperty('transform-origin', '0 0', 'important');
      // Clear any transform (ours or the game's) so the rect read below is
      // the pure layout box. The final value replaces it in the same task,
      // so nothing is ever painted in between.
      modal.style.setProperty('transform', 'none', 'important');
      var r = modal.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      var scale = Math.min((vw - 8) / r.width, (vh - 8) / r.height, 1);
      var tx = (vw - r.width * scale) / 2 - r.left;
      var ty = (vh - r.height * scale) / 2 - r.top;
      modal.style.setProperty(
        'transform',
        'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + scale.toFixed(4) + ')',
        'important'
      );
      return scale;
    } catch (e) {
      return null;
    }
  }

  /* 5. Portrait-native windows: stack columns, reveal the hidden pane ------- */
  // These windows are two-column layouts designed for landscape widths. Below
  // the game's `sm` breakpoint (640 CSS px) the right-hand detail/action
  // column is literally `hidden ... sm:flex` — gone — and what remains is a
  // narrow list floating over the map. Portrait only, each open modal is
  // handled once (a data attribute marks it; React unmounts modals when they
  // close, so the marker disappears with them):
  //
  //   a) re-flow the window the way the game would if it had been built for
  //      phones: stack the two columns vertically and reveal the hidden
  //      detail pane. Everything then renders at the game's own 100% size —
  //      no scaling, native touch targets, native text — using the full
  //      portrait height. Long stacks scroll inside the window instead of
  //      clipping (overflow-x stays hidden so nothing spills sideways).
  //   b) measure: if even the stacked layout overflows the portrait width,
  //      revert and use the old fallback — lay the window out at the game's
  //      own 640 px design width (where both columns render at natural size)
  //      and scale it into the viewport with a transform. Transforms keep
  //      hit-testing aligned, so every button stays exactly where it looks.
  //      Placement is computed from the window's real layout rect (see the
  //      shared yakPlaceScaled helper) and re-applied on every pass: the
  //      old math assumed the layout box started at (0,0), but flex-centred
  //      backdrops (e.g. the catch/"joined your team" celebration modal)
  //      place it at a negative offset, which dropped scaled windows at the
  //      bottom-left, half off-screen. Windows are also not claimed while
  //      they are still animating in, since mid-flight rects are garbage.
  //
  // Small dialogs (Welcome Back, confirmations) measure within the viewport
  // and are left untouched.
  (function () {
    var FIT_ATTR = 'data-yak-fit';
    var DESIGN_W = 640; // the game's sm breakpoint: both columns, natural size
    var FIT_MARGIN = 4; // px of slack before a window counts as overflowing

    // Stacks the wrapper's columns, reveals the hidden detail pane and lets
    // the window scroll internally. Refs to everything touched are kept on
    // the modal so the fallback can revert precisely (never removing styles
    // the game itself may own).
    function applyPortraitLayout(modal) {
      var wrapper = modal.querySelector('[class*="max-w-4xl"]');
      if (!wrapper) return false;
      var hidden = null;
      var cols = wrapper.children;
      for (var i = 0; i < cols.length; i++) {
        if (getComputedStyle(cols[i]).display === 'none') { hidden = cols[i]; break; }
      }
      if (!hidden) return false; // nothing hidden — nothing to re-flow
      var list = null;
      for (var j = 0; j < cols.length; j++) {
        if (cols[j] !== hidden) { list = cols[j]; break; }
      }
      hidden.style.setProperty('display', 'flex', 'important');
      wrapper.style.setProperty('flex-direction', 'column', 'important');
      if (list) list.style.setProperty('width', '100%', 'important');
      modal.style.setProperty('overflow-y', 'auto', 'important');
      modal.style.setProperty('overflow-x', 'hidden', 'important');
      modal.__yakStack = { wrapper: wrapper, hidden: hidden, list: list };
      return true;
    }

    function revertPortraitLayout(modal) {
      var s = modal.__yakStack;
      if (!s) return;
      s.wrapper.style.removeProperty('flex-direction');
      s.hidden.style.removeProperty('display');
      if (s.list) s.list.style.removeProperty('width');
      modal.style.removeProperty('overflow-y');
      modal.style.removeProperty('overflow-x');
      modal.__yakStack = null;
    }

    function fitModals() {
      try {
        var vw = document.documentElement.clientWidth || window.innerWidth;
        var vh = document.documentElement.clientHeight || window.innerHeight;
        if (!vw || !vh) return;
        if (vw >= vh) return; // portrait only
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
            // Already scaled by an earlier pass: re-place it from its layout
            // rect every pass (idempotent), so a claim that was computed
            // while the window was still animating in — or a later layout
            // or viewport change — self-corrects instead of sticking.
            var mark5 = modal.getAttribute(FIT_ATTR);
            if (mark5 && mark5.indexOf('s=') === 0) {
              yakPlaceScaled(modal, vw, vh);
              continue;
            }
            // React sometimes replaces the very nodes we styled (data swaps);
            // the mark would stick while our layout silently reverts — detect
            // the detached stack and run the whole flow again.
            if (modal.getAttribute(FIT_ATTR) === 'native' && modal.__yakStack &&
                !document.contains(modal.__yakStack.wrapper)) {
              modal.removeAttribute(FIT_ATTR);
            }
            if (modal.hasAttribute(FIT_ATTR)) continue;
            // Never claim a window that is still flying/spinning into place:
            // the measurement below would be meaningless (bounded, so
            // decorative loops cannot block the fit).
            if (yakSeenRecently(modal)) continue;

            /* a) portrait-native: stack the columns, reveal the detail pane */
            var applied = applyPortraitLayout(modal);

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
            var fullBleed = mrect.width >= vw - 1 || mrect.height >= vh - 1;
            // Content may end exactly on the screen edge — a full-bleed
            // shell's content column does — so only a real spill past the
            // viewport counts as overflow. A plain card keeps the old rule
            // and wants FIT_MARGIN of breathing room as well. The height of
            // a full-bleed shell is handled by the scroll set up in
            // applyPortraitLayout, or by the game's own scroller.
            var fits = maxRight <= vw + FIT_MARGIN;
            if (mrect.width < vw - 1) {
              fits = fits && mrect.right <= vw - FIT_MARGIN;
            }
            if (fits) {
              // Stacked windows and full-bleed mobile shells are the game's
              // own portrait layout: section 6 leaves them alone. Plain
              // cards keep the legacy 'noscale' mark so section 6 still
              // re-checks their height.
              modal.setAttribute(
                FIT_ATTR, (applied || fullBleed) ? 'native' : 'noscale'
              );
              continue;
            }

            /* c) stacked layout still overflows: revert, old fallback ------- */
            if (applied) revertPortraitLayout(modal);
            var cols = modal.querySelectorAll(
              '[class*="max-w-4xl"] > [class*="sm:flex"]'
            );
            for (var c = 0; c < cols.length; c++) {
              if (getComputedStyle(cols[c]).display === 'none') {
                cols[c].style.setProperty('display', 'flex', 'important');
              }
            }
            // Lay the window out at the game's design width, then centre and
            // scale it from its REAL layout rect (yakPlaceScaled). The old
            // math assumed the box started at (0,0), but flex-centred
            // backdrops (the catch/celebration modal) place it at a negative
            // offset — the window landed bottom-left, clipped off-screen and
            // scaled against the wrong width. Placement is re-run every
            // pass, so a mid-animation claim corrects itself once settled.
            modal.style.setProperty('width', DESIGN_W + 'px', 'important');
            var scale = yakPlaceScaled(modal, vw, vh) || (vw - 8) / DESIGN_W;
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

  /* 5b. Narrow-portrait polish for rows sized for the landscape canvas ----- */
  // Some windows (Dojo's challenge cards) lay content out as a horizontal
  // row sized for the game's 640px canvas — at phone widths the middle text
  // gets crushed between a fixed-size sprite and a fixed-size button (down
  // to ~50px, one word per line). These rules are scoped to the game's own
  // `sm` breakpoint (its portrait range) and only target ROW-direction
  // cards, letting the description wrap onto its own full-width line.
  // Because the rules key off the game's Tailwind utility classes, a game
  // update that renames them simply drops the polish — the layout falls
  // back to the game's own rendering, never worse than unstyled.
  (function () {
    if (document.getElementById('yak-portrait-polish')) return;
    var st = document.createElement('style');
    st.id = 'yak-portrait-polish';
    st.textContent = [
      '@media (max-width: 639.98px) {',
      '  div.flex:not([class*="flex-col"])',
      '    [class*="rounded-2xl"][class*="bg-black/30"] {',
      '    flex-wrap: wrap !important;',
      '    width: 100% !important;',
      '  }',
      '  div.flex:not([class*="flex-col"])',
      '    [class*="rounded-2xl"][class*="bg-black/30"]',
      '    > div[class*="flex-1"] {',
      '    min-width: 100% !important;',
      '  }',
      '  div.flex:not([class*="flex-col"])',
      '    [class*="rounded-2xl"][class*="bg-black/30"] > button {',
      '    margin-left: auto !important;',
      '  }',
      /* Tab strips (Squad/Shop/Quests/News headers) are sized for a 640px
         canvas: at phone widths each tab gets ~43px while "Achievements"
         needs ~63px, so the pills overlap. Title + close share the top
         row and the tab strip gets its own full-width row below. */
      '  div[class*="pr-[max(1.5rem"]',
      '    > div.flex.shrink-0.items-center.pb-3 {',
      '    flex-wrap: wrap !important;',
      '  }',
      '  div[class*="pr-[max(1.5rem"]',
      '    > div.flex.shrink-0.items-center.pb-3',
      '    > div.min-w-0.justify-center {',
      '    min-width: 100% !important;',
      '    order: 3 !important;',
      '  }',
      // note: attribute form — the token is "mr-1.5", and a `.mr-1.5`
      // class selector is a CSS parse error (dot mid-identifier).
      '  div[class*="pr-[max(1.5rem"]',
      '    > div.flex.shrink-0.items-center.pb-3',
      '    > div[class*="mr-1.5"] {',
      '    margin-left: auto !important;',
      '  }',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  })();

  /* 6. Generic window safety net: any *other* window that overflows --------- */
  // Section 5 claims every window it re-flows ('native': stacked two-column
  // layouts and full-bleed mobile shells — those scroll internally and are
  // left completely alone here) or scaled ('s=...'). The game will keep
  // shipping new window shapes (events, trading, ...), so this last-resort
  // pass catches anything section 5 didn't claim: a full-viewport backdrop
  // whose visible box is taller or wider than the portrait screen gets
  // centred and scaled down to fit. Boxes that already fit are left alone.
  // One refinement: section 5's 'noscale' mark only means "width fits", so
  // plain cards with that mark are re-examined here for height overflow,
  // which section 5 never measures.
  (function () {
    var FIT_ATTR = 'data-yak-fit';
    var FIT_MARGIN = 4;

    function fitOverflowing() {
      try {
        var vw = document.documentElement.clientWidth || window.innerWidth;
        var vh = document.documentElement.clientHeight || window.innerHeight;
        if (!vw || !vh) return;
        if (vw >= vh) return; // portrait only
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
            var mark = modal.getAttribute(FIT_ATTR);
            // Already scaled by an earlier pass: re-place from the layout
            // rect every pass (idempotent) so mid-animation claims and later
            // layout/viewport changes self-correct.
            if (mark && mark.indexOf('generic-s=') === 0) {
              yakPlaceScaled(modal, vw, vh);
              continue;
            }
            if (mark && mark !== 'noscale') continue; // section 5 owns it
            // Never claim a window that is still animating into place —
            // the rect below would be meaningless (bounded; see section 5).
            if (!mark && yakSeenRecently(modal)) continue;

            var mrect = modal.getBoundingClientRect();
            if (mrect.width <= vw - FIT_MARGIN && mrect.height <= vh - FIT_MARGIN) {
              if (!mark) modal.setAttribute(FIT_ATTR, 'generic-fit');
              continue;
            }

            // Scale first, then measure the pure *layout* rect and shift the
            // window into the viewport centre (yakPlaceScaled). The
            // correction step makes the result independent of where the
            // window's layout happens to sit (the game scroll-locks layers
            // around its own modals, which can offset fixed-position
            // children), so any shape ends up centred.
            var scale = yakPlaceScaled(modal, vw, vh);
            modal.setAttribute(FIT_ATTR, 'generic-s=' + (scale || 0).toFixed(3));
          }
        }
      } catch (e) {
        /* never let layout tweaks break the page */
      }
    }

    // Same rhythm as section 5: poll + DOM observer, portrait only.
    setInterval(fitOverflowing, 800);
    window.addEventListener('resize', fitOverflowing);
    try {
      var reactRoot = document.getElementById('react-root');
      if (reactRoot) {
        var mo = new MutationObserver(function () {
          setTimeout(fitOverflowing, 60);
        });
        mo.observe(reactRoot, { childList: true, subtree: true });
      }
    } catch (e) {
      /* the observer is an optimisation; the poll still runs */
    }
    fitOverflowing();
  })();
})();
