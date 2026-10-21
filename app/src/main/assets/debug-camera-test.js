// LOCAL QA ONLY — injected by MainActivity in debug builds; never part of a
// shipped build. The game boots its Phaser camera at window.innerWidth x
// window.innerHeight, so in portrait the battle field (designed landscape)
// gets a narrow 384px-wide slice and the team bench is cut off at the left.
// This reports a proportionally wider viewport to the page's JS (factor k,
// tunable live via localStorage['yak_k'], default 1.15) and stretches the
// canvas back over the real viewport — proportional spoofing means the
// downscale stays uniform. CSS media queries and layout see the real
// viewport; only JS readers of innerWidth/innerHeight see the widened one.
(() => {
  try {
    if (window.__yakSpoof) return;
    // The shipped portrait camera widening (in orientation-override.js) wins;
    // this QA knob is only for experimenting with the factor.
    if (window.__yakCameraSpoof) return;
    window.__yakSpoof = true;
    let k = 1.15;
    try {
      const s = parseFloat(localStorage.getItem('yak_k'));
      if (s > 1) k = s;
    } catch (e) {}
    if (k > 1) {
      // Read the real layout viewport at access time — at document-start the
      // meta viewport hasn't been parsed yet and innerWidth reads the 980px
      // fallback; documentElement.clientWidth is correct by the time the
      // game's boot script actually reads innerWidth.
      const cw = () => document.documentElement.clientWidth || 384;
      const ch = () => document.documentElement.clientHeight || 832;
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        get: () => Math.round(cw() * k)
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        get: () => Math.round(ch() * k)
      });
    }
    const st = document.createElement('style');
    st.textContent = 'canvas { width: 100% !important; height: 100% !important; }';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}
})();
