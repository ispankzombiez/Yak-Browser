/* YakBrowser portrait fix: optionally move the site's clock group — the
   clock pill and the two round icons next to it, anchored in the
   bottom-right corner — to the top-left corner of the screen.
   Portrait screens only (@media (orientation: portrait)), so landscape
   never sees the override, and only while the app has set the opt-in
   attribute on <html> ("Clock top-left" setting, default OFF). The
   style element is installed once per document; the app toggles the
   attribute live, so flipping the setting moves the group immediately
   without reloading the game.

   Structure (bundle-stable): GROUP = div.absolute.bottom-3.right-3
   .flex.items-center, whose children are [INNER = div.flex.items-center
   holding the pill + the two icon imgs] and [the site's gear BUTTON].
   The selector pins GROUP by its Tailwind anchoring classes; !important
   beats the loaded site stylesheet and any inline resize styles.

   THE SITE'S ZOOM: the game writes `zoom: 0.78 !important` INLINE on
   GROUP (its small-screen shrink — the source of every odd sub-size
   here: h-7.5 rendering 23, size-6 rendering 19, computed 49px
   rendering 38). Inline !important outranks author !important, so CSS
   cannot remove it. Every length below is therefore in the group's
   LOCAL units = screen px / 0.78, and renders at exactly the screen
   target (validated live over CDP on the reference device). If the
   site ever changes the factor or the reference viewport, rescale.

   Placement (screen targets, local values in parentheses):
   - GROUP position:fixed at top 34 / left 4 (43.59 / 5.13) — the
     screen-space spot of the topmost right HUD pill (renders
     [278,34,90,32] there). Fixed, not frame-anchored, because that
     pill's row is screen-stable while the HUD frame drifts with
     safe-area/status-bar changes.
   - INNER transform:scale(1.3465) from the top-left: natural row is
     ~23px tall on screen (29.5 local); 23 * 1.3465 = 31.5 = the right
     pills' height, proportions kept (clock pill ends up ~85px wide,
     near their 90). The scale must NOT sit on GROUP: a transformed
     element becomes the containing block for fixed descendants, which
     drags the gear into the clock box.
   - The site's gear BUTTON stays bottom-right: fixed to the same
     viewport box the site's own fixed chrome anchors to, sized to the
     chat bubble's footprint — 49x48 box with a 25x24 glyph at 12px
     padding (62.82 / 61.54 / 32.05 / 30.77 / 15.38 local) — centered
     under the chat bubble (same x column: right 4 => x331 = chat x)
     and at its original height from the screen edge (bottom 8 =>
     glyph bottom 812).
   (The app's native floating gear lives at the window's top-left; if
   "Settings access" ever shows it again it overlaps this row — that
   toggle is off on the reference device.) */
(function () {
  'use strict';

  if (window.__yakClockFix) {
    return;
  }
  window.__yakClockFix = true;

  var GROUP = 'div.absolute.bottom-3.right-3.flex.items-center';
  var style = document.createElement('style');
  style.textContent =
    '@media (orientation: portrait) {' +
    '  html[data-yak-clock-tl] ' + GROUP + ' {' +
    '    position: fixed !important;' +
    '    top: 43.59px !important;' +
    '    left: 5.13px !important;' +
    '    right: auto !important;' +
    '    bottom: auto !important;' +
    '  }' +
    '  html[data-yak-clock-tl] ' + GROUP + ' > div.flex.items-center {' +
    '    transform: scale(1.3465) !important;' +
    '    transform-origin: top left !important;' +
    '  }' +
    '  html[data-yak-clock-tl] ' + GROUP + ' > button {' +
    '    position: fixed !important;' +
    '    margin: 0 !important;' +
    '    width: 62.82px !important;' +
    '    height: 61.54px !important;' +
    '    padding: 15.38px !important;' +
    '    right: 5.13px !important;' +
    '    bottom: 10.26px !important;' +
    '  }' +
    '  html[data-yak-clock-tl] ' + GROUP + ' > button > img {' +
    '    width: 32.05px !important;' +
    '    height: 30.77px !important;' +
    '  }' +
    '}';
  (document.head || document.documentElement).appendChild(style);
})();
