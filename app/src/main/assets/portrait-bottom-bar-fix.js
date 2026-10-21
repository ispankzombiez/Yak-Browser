// Portrait sizing fix for yakkamon.com's bottom HUD items bar.
//
// The bottom bar is the anchored tray holding the "Items" button plus the
// row of useable-item slots (pokeball/berry/etc with their count badges).
// On a phone it renders at the site's compact size -- a ~59px-tall tray
// spanning [4, 761, 248, 59] (measured on the reference device) -- which
// makes the item slots small tap targets for one-handed portrait play.
//
// The bar has room to grow now that the clock group can be moved out of
// the bottom-right (see portrait-clock-fix.js). This bumps it a modest
// ~18% so the slots are easier to hit, while keeping its left edge pinned
// and leaving clear air before the right-side chat/gear column.
//
// Opt-in via the app's "Enlarge bottom bar" setting (default OFF): the
// rules below only apply while the app has set data-yak-bar-lg on <html>.
// The style element is installed once per document; the app flips the
// attribute live (on page start and on resume), so toggling the setting
// grows or reverts the bar immediately without reloading the game. With
// the attribute absent the bar stays at the site's original size.
//
// Presentation-only, portrait-scoped, per the app's "the site owns the
// experience" rule:
//   * transform: scale(1.18) from the LEFT BOTTOM origin, so the bar
//     grows rightward and upward from its anchored corner and the Items
//     button stays exactly where the site put it. Measured result:
//     248x58.6 -> 292.6x69.2, right edge 252 -> 297 (the chat/gear column
//     sits at x=331, so ~34px of clearance remains).
//   * Tailwind v4 compiles this tray's sizing to NATIVE width/height
//     (h-13.5 etc), NOT to `transform`, so adding a `transform` here does
//     not fight the site's own layout -- it layers cleanly on top. The
//     tray carries no site transform of its own; it is positioned by
//     left/bottom anchoring only.
//   * !important is required because the site's stylesheet loads after
//     this document-start style. The selector pins the tray by its
//     Tailwind class substring so no other bottom element is touched.
// Landscape keeps the site's own behavior (this is inside the portrait
// media query).
(function () {
  'use strict';

  if (window.__yakBottomBarFix) {
    return;
  }
  window.__yakBottomBarFix = true;

  var TRAY = 'div[class*="absolute bottom-0 left-1/2"]';
  var style = document.createElement('style');
  style.textContent =
    '@media (orientation: portrait) {' +
    '  html[data-yak-bar-lg] ' + TRAY + ' {' +
    '    transform: scale(1.18) !important;' +
    '    transform-origin: left bottom !important;' +
    '  }' +
    '}';
  (document.head || document.documentElement).appendChild(style);
})();
