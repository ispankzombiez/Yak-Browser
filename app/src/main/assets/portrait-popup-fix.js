// Portrait readability fix for yakkamon.com's anchored info cards.
//
// Root cause (game bundle main-CMZkoge-.js, constant Iq): every anchored
// card -- the monster info popup included (name, type, task, stamina,
// "View details") -- is positioned by the E0 wrapper with Tailwind
// `scale-[0.45] md:scale-100`, i.e. the site renders these cards at 45%
// size on any viewport narrower than 768px (every phone). Desktop sees
// them at 100%. On a phone that makes the card hard to read, and the two
// round red buttons inside it (close / cancel-job, both w-6 = 24px) end
// up ~11px -- nearly impossible to tap accurately.
//
// Presentation-only, portrait-scoped, per the app's "the site owns the
// experience" rule:
//   * restore the cards to their desktop 100% scale. Tailwind v4 compiles
//     the arbitrary scale to the NATIVE `scale` property (`.scale-\[0\.45\]
//     {scale:.45}`), separate from `transform` (entrance pop) and
//     `translate` (anchor offset), so overriding `scale` alone leaves the
//     pop animation and above/below positioning untouched. `!important`
//     is required because the site's stylesheet loads after this
//     document-start style and the selectors are equal specificity.
//     This mirrors exactly what the site itself does at md+ (`scale: 1`).
//   * widen the round red buttons inside these cards to a 32px tap
//     target via min-width (so wider buttons like "View details" are
//     unaffected). Scoped to descendants of the card so no other game
//     button changes.
// Landscape keeps the site's own behavior (md+ is already 100% there;
// narrow landscape stays at the site's chosen 45%).
(function () {
  try {
    if (document.getElementById("yak-portrait-popup-fix")) return;
    var style = document.createElement("style");
    style.id = "yak-portrait-popup-fix";
    style.textContent =
      "@media (orientation: portrait) {\n" +
      '  [class*="scale-[0.45]"] { scale: 1 !important; }\n' +
      '  [class*="scale-[0.45]"] button[class*="active:translate-y-px"] { min-width: 32px; }\n' +
      "}\n";
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {
    // Never block the page over a cosmetic fix.
  }
})();
