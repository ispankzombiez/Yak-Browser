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
 * pinned to the HUD's left edge and fitted to the measured space before the
 * right-side controls. The right cluster is zoomed slightly as before.
 *
 * A second portrait-only fix (section 5) handles the game's wide windows
 * (Workshop, Shop, Squad, Quests, ...): they are two-column layouts that the
 * game lays out for landscape widths, and whose detail/action column is
 * literally hidden below the game's 640 CSS px `sm` breakpoint. Full-screen
 * menus are reflowed at their natural size, with stacked panes and scrolling
 * where needed. Other oversized windows retain a scaled fallback.
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
 * World-coordinate DOM overlays use that same display ratio so health
 * labels and placement markers stay attached to the canvas sprites.
 * Battles use a wider 640 px minimum for three Yakkamon on each side.
 * The renderer is resized before scene start; other scenes retain 460 px.
 * The optional top/bottom formation instead uses native portrait dimensions.
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
  var MIN_BATTLE_CAMERA_W = 640;
  var yakBattleCamera = false;
  var yakBattleSystem;
  var yakTopBottomBattle = false;
  /* 460 leaves the leftmost bench Yakkamon ~13 CSS px clear of the edge on
     a 384 px phone (~18 px on narrower ones) at ~83% zoom. */
  var yakCamEarlyW = window.innerWidth;
  var yakCamEarlyH = window.innerHeight;
  var yakCamStyleDone = false;

  function yakCamSize(wantWidth) {
    var d = document.documentElement;
    var w = (d && d.clientWidth) || 0;
    var h = (d && d.clientHeight) || 0;
    var minimumWidth = yakBattleCamera
      ? (yakTopBottomBattle ? w : MIN_BATTLE_CAMERA_W) : MIN_CAMERA_W;
    /* Pre-layout or landscape: report the real values, no spoof. */
    if (!w || !h || h < w || w >= minimumWidth) {
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
      return minimumWidth;
    }
    return Math.round(h * minimumWidth / w);
  }

  function yakWantsTopBottomBattle() {
    var d = document.documentElement;
    return d && d.clientHeight >= d.clientWidth && d.hasAttribute('data-yak-battle-tb');
  }

  function yakBattleRowHome(scene, side) {
    var scale = scene.game.scale;
    var width = scale.width * scale.zoom;
    var height = scale.height * scale.zoom;
    var count = side === 'player' ? scene.teamCap() : scene.order.enemy.length;
    var direction = side === 'player' ? 1 : -1;
    return {
      x: Math.round(width / 2 + direction * scene.lineStep() * (Math.max(1, count) - 1) / 2),
      y: Math.round(side === 'player' ? Math.min(height * 0.66, height - 180) : height * 0.32)
    };
  }

  function yakHookBattleStage(scene, nativeHome) {
    var ground = scene.ground;
    if (ground && !ground.__yakRowStage) {
      ground.__yakRowStage = true;
      var place = ground.place;
      var destroy = ground.destroy;
      ground.place = function (viewport, artScale) {
        var result = place.apply(this, arguments);
        if (!scene.__yakTopBottomBattle) {
          if (this.__yakBottomLane) this.__yakBottomLane.setVisible(false);
          return result;
        }
        var enemy = scene.homeOf('enemy'), player = scene.homeOf('player');
        var delta = enemy.y - nativeHome.call(scene, 'enemy').y;
        var lane = this.lane;
        lane.setY(lane.y + delta);
        this.fill.setTilePosition(this.fill.tilePositionX, this.fill.tilePositionY - delta / artScale);
        if (!this.__yakBottomLane) {
          this.__yakBottomLane = scene.add.tileSprite(lane.x, lane.y, lane.width, lane.height, lane.texture.key, lane.frame.name)
            .setOrigin(lane.originX, lane.originY).setDepth(lane.depth)
            .setScrollFactor(lane.scrollFactorX, lane.scrollFactorY);
        }
        this.__yakBottomLane.setVisible(true).setPosition(lane.x, lane.y + player.y - enemy.y)
          .setSize(lane.width, lane.height).setTileScale(lane.tileScaleX, lane.tileScaleY)
          .setTilePosition(lane.tilePositionX, lane.tilePositionY);
        return result;
      };
      ground.destroy = function () {
        if (this.__yakBottomLane) {
          this.__yakBottomLane.destroy();
          this.__yakBottomLane = null;
        }
        return destroy.apply(this, arguments);
      };
    }
    var designer = scene.designer;
    if (designer && !designer.__yakRowStage) {
      designer.__yakRowStage = true;
      var layout = designer.layout;
      designer.layout = function (point, artScale) {
        if (scene.__yakTopBottomBattle) {
          point = {x: point.x, y: point.y + scene.homeOf('enemy').y - nativeHome.call(scene, 'enemy').y};
        }
        return layout.call(this, point, artScale);
      };
    }
  }

  function yakHookBattleRows(scene) {
    if (scene.__yakBattleRows) return true;
    if (typeof scene.homeOf !== 'function' || typeof scene.placeStage !== 'function' ||
        typeof scene.teamCap !== 'function' || typeof scene.lineStep !== 'function' ||
        typeof scene.fighterOf !== 'function' || typeof scene.presentFast !== 'function' ||
        typeof scene.presentCharge !== 'function' || typeof scene.throwPlanFor !== 'function') {
      console.warn('[YakBrowser] Could not apply top/bottom battles: unsupported battle layout.');
      return false;
    }
    scene.__yakBattleRows = true;
    var home = scene.homeOf, stage = scene.placeStage;
    scene.homeOf = function (side) {
      return this.__yakTopBottomBattle ? yakBattleRowHome(this, side) : home.apply(this, arguments);
    };
    scene.placeStage = function () {
      if (this.__yakTopBottomBattle) yakHookBattleStage(this, home);
      return stage.apply(this, arguments);
    };
    var fighterOf = scene.fighterOf;
    scene.fighterOf = function () {
      var fighter = fighterOf.apply(this, arguments);
      if (!fighter || fighter.__yakRowMotion) return fighter;
      fighter.__yakRowMotion = true;
      var here = fighter.here, jab = fighter.jab, lunge = fighter.lunge;
      fighter.here = function () {
        if (!scene.__yakTopBottomBattle) return here.apply(this, arguments);
        var travel = -this.offset.x - this.knock.x;
        this.place(this.home.x, this.home.y + this.offset.y + travel);
        this.shadow.setY(Math.round(this.home.y + travel));
      };
      fighter.jab = function (distance, impact) {
        return jab.call(this, scene.__yakTopBottomBattle && this.__yakStrikeDistance !== undefined
          ? this.__yakStrikeDistance : distance, impact);
      };
      fighter.lunge = function (distance, windup, strike, impact) {
        var target = this.__yakStrikeTarget;
        delete this.__yakStrikeTarget;
        if (scene.__yakTopBottomBattle && target) {
          var from = this.centrePoint(), to = target.centrePoint();
          distance = Math.hypot(to.x - from.x, to.y - from.y);
        }
        return lunge.call(this, distance, windup, strike, impact);
      };
      return fighter;
    };
    ['presentFast', 'presentCharge'].forEach(function (name) {
      var present = scene[name];
      scene[name] = function (event) {
        var fighter = this.fighters.get(event.unitId), target = this.fighters.get(event.targetId);
        if (!this.__yakTopBottomBattle || !fighter || !target) return present.apply(this, arguments);
        if (name === 'presentCharge') {
          if (event.move.power > 0 && event.move.reach === 'melee') fighter.__yakStrikeTarget = target;
          return present.apply(this, arguments);
        }
        var from = fighter.centrePoint(), to = target.centrePoint();
        fighter.__yakStrikeDistance = Math.hypot(to.x - from.x, to.y - from.y);
        try {
          return present.apply(this, arguments);
        } finally {
          delete fighter.__yakStrikeDistance;
        }
      };
    });
    var throwPlan = scene.throwPlanFor;
    scene.throwPlanFor = function () {
      if (!this.__yakTopBottomBattle) return throwPlan.apply(this, arguments);
      // Reuse the game's range/obstruction rules along the vertical battle axis.
      var view = Object.create(this);
      view.fighters = new Map();
      this.fighters.forEach(function (fighter, id) {
        var projected = Object.create(fighter);
        projected.homePoint = function () {
          var point = fighter.homePoint();
          return {x: point.y, y: point.x};
        };
        view.fighters.set(id, projected);
      });
      return throwPlan.apply(view, arguments);
    };
    return true;
  }

  function yakResizeSceneCamera(system) {
    var scale = system.game.scale;
    if (!scale || typeof scale.resize !== 'function' || !(scale.zoom > 0)) {
      console.warn('[YakBrowser] Could not fit scene camera: unsupported renderer scale.');
      return false;
    }
    var width = Math.round(yakCamSize(true) / scale.zoom);
    var height = Math.round(yakCamSize(false) / scale.zoom);
    if (scale.width !== width || scale.height !== height) scale.resize(width, height);
    return true;
  }

  function yakStartSceneCamera(system) {
    var battle = system.settings.key === 'DuelBattleScene';
    if (system.settings.key === 'BootScene' || system.settings.key === 'ReactPageScene') return;
    yakBattleSystem = battle ? system : null;
    yakTopBottomBattle = !!(battle && yakWantsTopBottomBattle() && yakHookBattleRows(system.scene));
    if (battle) {
      system.scene.__yakTopBottomBattle = yakTopBottomBattle;
    }
    yakBattleCamera = battle;
    yakResizeSceneCamera(system);
  }

  function yakApplyBattleRows() {
    var system = yakBattleSystem;
    if (!system || !system.isActive() || system.scene.phase !== 'prep') return;
    var scene = system.scene;
    var enabled = !!yakWantsTopBottomBattle();
    if (enabled === yakTopBottomBattle || (enabled && !yakHookBattleRows(scene))) return;
    yakTopBottomBattle = enabled;
    scene.__yakTopBottomBattle = enabled;
    scene.cancelBodyDrag();
    if (!yakResizeSceneCamera(system)) return;
    scene.cameras.main.centerOn(yakCamSize(true) / 2, yakCamSize(false) / 2);
    scene.layout();
    scene.standActives();
    scene.syncHud();
  }

  var yakBattleSettings = new MutationObserver(yakApplyBattleRows);
  yakBattleSettings.observe(document, {attributes: true, subtree: true, attributeFilter: ['data-yak-battle-tb']});

  function yakHookSceneCamera(phaser) {
    if (!phaser || !phaser.Scenes || !phaser.Scenes.Systems) {
      console.warn('[YakBrowser] Could not fit battle camera: unsupported Phaser scenes.');
      return;
    }
    var prototype = phaser.Scenes.Systems.prototype;
    var start = prototype.start;
    if (typeof start !== 'function') {
      console.warn('[YakBrowser] Could not fit battle camera: scene start is unavailable.');
      return;
    }
    if (start.__yakSceneCamera) return;
    prototype.start = function () {
      yakStartSceneCamera(this);
      return start.apply(this, arguments);
    };
    prototype.start.__yakSceneCamera = true;
  }

  // Phaser exports its namespace before constructing the game. Hook the
  // public scene lifecycle then, rather than resizing after battle UI mounts.
  try {
    var yakPhaser = window.Phaser;
    if (yakPhaser) yakHookSceneCamera(yakPhaser);
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      enumerable: true,
      get: function () { return yakPhaser; },
      set: function (value) {
        yakPhaser = value;
        yakHookSceneCamera(value);
      }
    });
  } catch (e) {
    console.warn('[YakBrowser] Could not register battle camera fitting:', e);
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
    // The tray width changes with game controls (the orb adds another 56px).
    // Measure instead of assuming a 248px tray and a fixed -64px offset.
    // Zoom the contents only when needed; the optional 1.18x enlargement on
    // the tray still applies, but cannot push controls outside the HUD.
    var EDGE_PX = 4;
    var GAP_PX = 4;
    var CLUSTER_ZOOM = 0.78;
    var TRAY = 'div[class*="absolute bottom-0 left-1/2"]:not([class*="z-20"])';
    var GROUP = 'div.absolute.bottom-3.right-3.flex.items-center';
    var style = document.createElement('style');
    style.textContent =
      '@media (orientation: portrait) {' +
      GROUP + ' { zoom: ' + CLUSTER_ZOOM + ' !important; }' +
      TRAY + ' { left: 0 !important; translate: none !important; }' +
      TRAY + ':not([data-yak-bottom-fit]) { visibility: hidden !important; }' +
      '}';
    (document.head || document.documentElement).appendChild(style);

    var observer;
    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    var resizeTargets = [];

    function observeSizes(targets) {
      if (!resizeObserver) return;
      for (var i = 0; i < resizeTargets.length; i++) {
        if (targets.indexOf(resizeTargets[i]) === -1) resizeObserver.unobserve(resizeTargets[i]);
      }
      for (var j = 0; j < targets.length; j++) {
        if (resizeTargets.indexOf(targets[j]) === -1) resizeObserver.observe(targets[j]);
      }
      resizeTargets = targets;
    }

    function update() {
      try {
        // Real layout viewport: documentElement.clientWidth ignores both the
        // JS-level camera spoof and the pre-parse fallback size.
        var vw = document.documentElement.clientWidth || window.innerWidth;
        var vh = document.documentElement.clientHeight || window.innerHeight;
        if (!vw || !vh) return;
        // Landscape viewports keep the game's own (correct) layout.
        var portrait = vh >= vw;

        var bars = document.querySelectorAll(TRAY);
        var targets = [];
        for (var i = 0; i < bars.length; i++) {
          var bar = bars[i];
          var r = bar.getBoundingClientRect();
          if (!bar.hasAttribute('data-yak-bottom-fit') && !(r.height > 40 && r.width > 150)) {
            continue;
          }
          var contents = bar.firstElementChild;
          if (!contents) continue;
          bar.style.removeProperty('margin-left');
          contents.style.removeProperty('zoom');
          targets.push(bar.parentElement);
          if (!portrait) {
            bar.removeAttribute('data-yak-bottom-fit');
            break;
          }

          r = bar.getBoundingClientRect();
          var hud = bar.parentElement.getBoundingClientRect();
          var left = Math.max(EDGE_PX, hud.left);
          var right = Math.min(vw - EDGE_PX, hud.right);
          // Include fixed gear descendants when the clock is moved up, and
          // the chat button when an enlarged tray reaches its row.
          var controls = bar.parentElement.querySelectorAll(
            'div[class*="bottom-3"][class*="right-3"], ' +
            'div[class*="bottom-3"][class*="right-3"] > *, button'
          );
          for (var k = 0; k < controls.length; k++) {
            if (bar.contains(controls[k])) continue;
            targets.push(controls[k]);
            var c = controls[k].getBoundingClientRect();
            if (c.width && c.height && c.left > vw / 2 &&
                c.top < r.bottom && c.bottom > r.top) {
              right = Math.min(right, c.left - GAP_PX);
            }
          }
          var available = right - left;
          if (available <= 0 || !r.width) {
            console.warn('YakBrowser: no space available for the bottom tray.');
            break;
          }
          var zoom = Math.min(1, available / r.width);
          if (zoom < 1) contents.style.setProperty('zoom', String(zoom), 'important');
          r = bar.getBoundingClientRect();
          bar.style.setProperty('margin-left', (left - r.left) + 'px', 'important');
          bar.setAttribute('data-yak-bottom-fit', '');
          break;
        }
        // Observe the HUD and external controls, not the tray whose size we
        // change ourselves: fitting must not trigger a ResizeObserver loop.
        observeSizes(targets);
      } catch (e) {
        console.warn('YakBrowser: bottom HUD layout failed.', e);
      } finally {
        // Discard our own style/marker mutations to avoid feeding the watcher.
        if (observer) observer.takeRecords();
      }
    }

    // React mounts the HUD after document-start. Mutation delivery runs before
    // paint, so the tray is first shown already fitted, without a delayed jump.
    observer = new MutationObserver(update);
    observer.observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-yak-clock-tl', 'data-yak-bar-lg']
    });
    window.addEventListener('resize', update);
    document.addEventListener('load', update, true);
    if (document.fonts && typeof document.fonts.addEventListener === 'function') {
      document.fonts.addEventListener('loadingdone', update);
    }
    update();
  })();

  /* 4b. Catch celebration: native portrait layout, before its first paint. */
  (function () {
    if (window.__yakCaughtPortrait) return;
    window.__yakCaughtPortrait = true;
    var CAUGHT = '[data-yak-caught]';
    var style = document.createElement('style');
    style.textContent = [
      '@media (orientation: portrait) and (max-width: 639.98px) {',
      CAUGHT + ' {',
      '  width: calc(100% - 32px) !important; min-width: 0 !important;',
      '  height: calc(100vh - 64px) !important; max-height: 720px !important;',
      '  transform: none !important; animation: none !important; zoom: 1 !important;',
      '  align-items: stretch !important;',
      '}',
      CAUGHT + ' > button { height: 40px !important; }',
      CAUGHT + ' > div[class*="w-[32rem]"] {',
      '  width: 100% !important; height: 100% !important; min-height: 0 !important;',
      '  margin-top: 0 !important;',
      '}',
      CAUGHT + ' > div[class*="w-[32rem]"] > div.bg-paper {',
      '  flex: 1 1 0 !important; min-height: 0 !important;',
      '}',
      CAUGHT + ' div.h-52 {',
      '  flex: 1 1 0 !important; height: auto !important; min-height: 0 !important;',
      '  flex-direction: column !important; overflow-y: auto !important;',
      '  overflow-x: hidden !important; gap: 12px !important; padding: 12px !important;',
      '}',
      CAUGHT + ' div.h-52 > div[class*="w-[34%]"] { width: 100% !important; }',
      CAUGHT + ' div.h-52 > div[class*="w-[34%]"] > div:first-child {',
      '  height: auto !important; min-height: 160px !important; padding-top: 20px !important;',
      '}',
      CAUGHT + ' div.h-52 > div[class*="w-[34%]"] > div:first-child > div[class*="w-2/5"] {',
      '  max-width: 128px !important;',
      '}',
      CAUGHT + ' div.h-52 > .self-stretch { display: none !important; }',
      CAUGHT + ' div.h-52 > div.flex-1.min-w-0 {',
      '  flex: 0 0 240px !important; min-height: 0 !important; width: 100% !important;',
      '}',
      CAUGHT + ' div.h-10 { height: 96px !important; }',
      CAUGHT + ' div.h-10 > div.absolute.inset-0.flex {',
      '  flex-direction: column !important; justify-content: center !important;',
      '  align-items: stretch !important; gap: 8px !important; padding: 8px !important;',
      '}',
      CAUGHT + ' div.h-10 > div.absolute.inset-0.flex > div {',
      '  width: 100% !important; min-width: 0 !important; flex: 0 0 auto !important;',
      '}',
      // Keep late-loading fonts/icons from moving the nickname field.
      CAUGHT + ' div.h-10 > div.absolute.inset-0.flex > div:first-child > :first-child {',
      '  flex: 0 0 40% !important; min-width: 0 !important; overflow: hidden !important;',
      '}',
      CAUGHT + ' div.h-10 > div.absolute.inset-0.flex > div:first-child > div.relative {',
      '  flex: 1 1 0 !important; min-width: 0 !important;',
      '}',
      CAUGHT + ' div.h-10 div.w-36 { width: 100% !important; min-height: 32px !important; }',
      CAUGHT + ' div.h-10 > div.absolute.inset-0.flex > div:last-child > button {',
      '  flex: 1 1 0 !important; min-height: 32px !important;',
      '}',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);

    function fitCaught() {
      var d = document.documentElement;
      if (!d || !d.clientWidth || !d.clientHeight) return;
      var portrait = d.clientWidth < 640 && d.clientHeight > d.clientWidth;
      var modals = document.querySelectorAll('div.animate-modal-in');
      for (var i = 0; i < modals.length; i++) {
        var modal = modals[i];
        if (!modal.querySelector('div.h-52 > div[class*="w-[34%]"]') ||
            !modal.querySelector('div.h-10 input')) continue;
        if (portrait) {
          // Replace only this card's legacy fit, including a popup already
          // open when the script is installed. Other modals keep their fits.
          var mark = modal.getAttribute('data-yak-fit') || '';
          if (mark.indexOf('s=') === 0 || mark.indexOf('generic-s=') === 0) {
            modal.style.removeProperty('width');
            modal.style.removeProperty('transform');
            modal.style.removeProperty('transform-origin');
          }
          modal.setAttribute('data-yak-caught', '');
          modal.setAttribute('data-yak-fit', 'native');
        } else if (modal.hasAttribute('data-yak-caught')) {
          modal.removeAttribute('data-yak-caught');
          modal.removeAttribute('data-yak-fit');
        }
      }
    }
    var observer = new MutationObserver(fitCaught);
    observer.observe(document, {childList: true, subtree: true});
    window.addEventListener('resize', fitCaught);
    fitCaught();
  })();

  /* Shared helpers for the window-fit passes (sections 5 and 6). ----------- */

  var yakWindowFits = [];
  var yakWindowObserver;
  var yakWindowSizes;
  var yakSizedWindows = [];
  var yakFittingWindows = false;
  var yakWindowStyle = document.createElement('style');
  yakWindowStyle.textContent =
    '[data-yak-modal-pending] { visibility: hidden !important; }\n' +
    '@media (orientation: portrait) {\n' +
    '  [data-yak-world-overlay] { zoom: var(--yak-world-zoom, 1); }\n' +
    '  [data-yak-modal-fit] { transition-property: opacity !important; }\n' +
    '  [data-yak-modal-fit].animate-modal-in { animation: none !important; }\n' +
    '}\n' +
    '@media (orientation: portrait) and (max-width: 639.98px) {\n' +
    '  [data-yak-battle-hud] > div.absolute.left-1\\/2[class*="top-2"] { top: 64px !important; }\n' +
    '  [data-yak-battle-hud] > div.absolute.right-3.bottom-2 {\n' +
    '    left: 0 !important; right: 0 !important; justify-content: center !important;\n' +
    '    pointer-events: none !important;\n' +
    '  }\n' +
    '  [data-yak-battle-hud] > div.absolute.right-3.bottom-2 > * { pointer-events: auto; }\n' +
    '  [data-yak-battle-hud] > div.absolute.right-3.bottom-2 > :nth-child(2) {\n' +
    '    position: absolute !important; right: 12px !important; bottom: 0 !important;\n' +
    '  }\n' +
    '}';
  (document.head || document.documentElement).appendChild(yakWindowStyle);

  function yakIsWorldAnchor(node) {
    return node.classList.contains('flex') &&
      node.classList.contains('-translate-x-1/2') &&
      /px$/.test(node.style.left) && /px$/.test(node.style.top);
  }

  function yakIsWorldLayer(layer) {
    if (!layer.classList.contains('fixed') ||
        !layer.classList.contains('pointer-events-none') ||
        layer.classList.contains('inset-safe-area')) return false;
    if (yakIsWorldAnchor(layer)) return true;
    if (!layer.classList.contains('inset-0')) return false;
    for (var i = 0; i < layer.children.length; i++) {
      if (yakIsWorldAnchor(layer.children[i])) return true;
    }
    return false;
  }

  function yakFitWorldOverlays() {
    var d = document.documentElement;
    var root = document.getElementById('react-root');
    if (!root || !d.clientWidth || !d.clientHeight) return;
    var canvas = document.querySelector('canvas');
    var logicalWidth = canvas && /px$/.test(canvas.style.width)
      ? parseFloat(canvas.style.width) : window.innerWidth;
    var zoom = d.clientHeight >= d.clientWidth && logicalWidth > 0
      ? d.clientWidth / logicalWidth : 1;
    if (d.style.getPropertyValue('--yak-world-zoom') !== String(zoom)) {
      d.style.setProperty('--yak-world-zoom', String(zoom));
    }
    for (var i = 0; i < root.children.length; i++) {
      var layer = root.children[i];
      if (yakIsWorldLayer(layer)) {
        if (!layer.hasAttribute('data-yak-world-overlay')) layer.setAttribute('data-yak-world-overlay', '');
        // Older fits treated world-coordinate health bars as dialogs.
        var nodes = [layer];
        for (var j = 0; j < layer.children.length; j++) nodes.push(layer.children[j]);
        for (var k = 0; k < nodes.length; k++) {
          var node = nodes[k];
          var mark = node.getAttribute('data-yak-fit') || '';
          if (mark.indexOf('s=') === 0) node.style.removeProperty('width');
          if (mark.indexOf('s=') === 0 || mark.indexOf('generic-s=') === 0) {
            node.style.removeProperty('transform');
            node.style.removeProperty('transform-origin');
          }
          node.removeAttribute('data-yak-fit');
          node.removeAttribute('data-yak-modal-fit');
          node.removeAttribute('data-yak-modal-pending');
        }
      } else {
        layer.removeAttribute('data-yak-world-overlay');
      }
      var battleHud = layer.classList.contains('inset-safe-area') &&
        layer.querySelector('div.pointer-events-auto.absolute[class*="top-1.5"].left-3');
      if (battleHud) {
        if (!layer.hasAttribute('data-yak-battle-hud')) layer.setAttribute('data-yak-battle-hud', '');
      }
      else layer.removeAttribute('data-yak-battle-hud');
    }
  }

  function yakFitWindows() {
    if (yakFittingWindows) return;
    yakFittingWindows = true;
    try {
      yakFitWorldOverlays();
      for (var i = yakSizedWindows.length - 1; i >= 0; i--) {
        if (!document.contains(yakSizedWindows[i])) {
          yakWindowSizes.unobserve(yakSizedWindows[i]);
          yakSizedWindows.splice(i, 1);
        }
      }
      for (var j = 0; j < yakWindowFits.length; j++) yakWindowFits[j]();
    } finally {
      // Attribute/style writes made by our own fit must not schedule another
      // fit; React's later mutations and genuine size changes still do.
      if (yakWindowObserver) yakWindowObserver.takeRecords();
      yakFittingWindows = false;
    }
  }

  function yakWatchWindows(fit) {
    yakWindowFits.push(fit);
    if (!yakWindowObserver) {
      yakWindowObserver = new MutationObserver(yakFitWindows);
      yakWindowObserver.observe(document, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style']
      });
      if (typeof ResizeObserver === 'function') {
        yakWindowSizes = new ResizeObserver(yakFitWindows);
      }
      window.addEventListener('resize', yakFitWindows);
      document.addEventListener('load', yakFitWindows, true);
      document.addEventListener('error', yakFitWindows, true);
      if (document.fonts && document.fonts.addEventListener) {
        document.fonts.addEventListener('loadingdone', yakFitWindows);
        document.fonts.addEventListener('loadingerror', yakFitWindows);
      }
    }
    yakFitWindows();
  }

  // Finish finite entrance/FLIP geometry before measuring. Opacity-only
  // fades, decorative loops and the catch card's own reveals remain intact.
  function yakSettleWindow(modal) {
    try {
      if (typeof document.getAnimations !== 'function') return;
      var list = document.getAnimations();
      for (var i = 0; i < list.length; i++) {
        var animation = list[i];
        var effect = animation.effect;
        var target = effect && effect.target;
        if (typeof CSSTransition === 'function' && animation instanceof CSSTransition) continue;
        if (animation.playState !== 'running' || animation.playbackRate <= 0 ||
            !target || !(target === modal || modal.contains(target))) continue;
        if (!isFinite(effect.getComputedTiming().endTime)) continue;
        var frames = effect.getKeyframes();
        var geometry = /^(transform|translate|scale|rotate|width|height|top|left|right|bottom|margin.*|padding.*|fontSize|lineHeight|zoom|flexBasis|gridTemplate.*|gap)$/;
        for (var k = 0; k < frames.length; k++) {
          if (Object.keys(frames[k]).some(function (key) { return geometry.test(key); })) {
            animation.finish();
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[YakBrowser] Could not settle window entrance geometry:', e);
    }
  }

  function yakPrepareWindow(modal) {
    if (modal.hasAttribute('data-yak-caught')) return true;
    modal.setAttribute('data-yak-modal-fit', '');
    if (yakWindowSizes && yakSizedWindows.indexOf(modal) < 0) {
      yakSizedWindows.push(modal);
      yakWindowSizes.observe(modal);
    }
    yakSettleWindow(modal);
    // Force layout to request the fonts used by newly mounted text.
    modal.getBoundingClientRect();
    var images = modal.querySelectorAll('img');
    var loading = [];
    for (var i = 0; i < images.length; i++) {
      if (!images[i].complete && images[i].loading !== 'lazy') loading.push(images[i]);
    }
    var fontsLoading = document.fonts && document.fonts.status === 'loading';
    if ((!loading.length && !fontsLoading) || modal.__yakResourceTimeout) {
      if (!loading.length && !fontsLoading) modal.__yakResourceTimeout = false;
      modal.removeAttribute('data-yak-modal-pending');
      return true;
    }
    modal.setAttribute('data-yak-modal-pending', '');
    if (modal.__yakResourceWait) return false;
    modal.__yakResourceWait = true;
    var cleanups = [];
    var done = false;
    var timer;
    function ready(timedOut) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (var j = 0; j < cleanups.length; j++) cleanups[j]();
      modal.__yakResourceWait = false;
      if (timedOut) {
        modal.__yakResourceTimeout = true;
        console.warn('[YakBrowser] Window resources timed out; fitting the available content.');
      }
      if (document.contains(modal)) yakFitWindows();
    }
    var waits = loading.map(function (image) {
      return new Promise(function (resolve) {
        function loaded(event) {
          if (event.type === 'error') console.warn('[YakBrowser] Window image failed to load.');
          resolve();
        }
        image.addEventListener('load', loaded);
        image.addEventListener('error', loaded);
        cleanups.push(function () {
          image.removeEventListener('load', loaded);
          image.removeEventListener('error', loaded);
        });
      });
    });
    if (fontsLoading) waits.push(document.fonts.ready);
    timer = setTimeout(function () { ready(true); }, 3000);
    Promise.all(waits).then(function () { ready(false); }, function (error) {
      console.warn('[YakBrowser] Window resources failed:', error);
      ready(true);
    });
    return false;
  }

  // Centres `modal` in the viewport and scales it down to fit, wherever
  // its layout box happens to sit: the transform is cleared, the pure
  // layout rect is read, and the translate is computed from THAT rect.
  // Flex-centred backdrops put the layout box at an arbitrary (usually
  // negative) offset, so assuming the box starts at (0,0) — as the old
  // section 5c math did — dropped scaled windows at the bottom-left, half
  // off-screen (the catch/celebration modal). Idempotent: calling it on
  // every event-driven pass follows content and viewport changes.
  // Returns the applied scale (clamped to 1), or null when the
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
  // narrow list floating over the map. Full-screen shells are rechecked as
  // React swaps their contents, so tab changes retain the portrait layout.
  // Other modals use the following measured fallback:
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
  //      bottom-left, half off-screen. Entrance geometry and resources are
  //      settled before the first visible fit, not by a later timer.
  //
  // Small dialogs (Welcome Back, confirmations) measure within the viewport
  // and are left untouched.
  (function () {
    var FIT_ATTR = 'data-yak-fit';
    var DESIGN_W = 640; // the game's sm breakpoint: both columns, natural size
    var FIT_MARGIN = 4; // px of slack before a window counts as overflowing

    var style = document.createElement('style');
    style.textContent = [
      '@media (orientation: portrait) and (max-width: 639.98px) {',
      '  [data-yak-portrait-shell] div.grid.shrink-0[class*="grid-cols-"] {',
      '    grid-template-columns: minmax(0, 1fr) auto !important;',
      '  }',
      '  [data-yak-portrait-shell] div.grid.shrink-0[class*="grid-cols-"] > div.min-w-0.justify-center {',
      '    grid-row: 2 !important; grid-column: 1 / -1 !important;',
      '    justify-content: flex-start !important; overflow: visible !important;',
      '    max-width: 100% !important; padding: 0 !important;',
      '  }',
      '  [data-yak-portrait-shell] div.grid.shrink-0[class*="grid-cols-"] > div.min-w-0.justify-center > div {',
      '    width: 100% !important; max-width: 100% !important;',
      '  }',
      '  [data-yak-portrait-shell] div.grid.shrink-0[class*="grid-cols-"] > div.min-w-0.justify-center > div > div {',
      '    width: 100% !important; max-width: 100% !important; height: auto !important;',
      '    min-height: 36px; flex-wrap: wrap !important; gap: 4px !important; padding: 4px !important;',
      '  }',
      '  [data-yak-portrait-shell] div.grid.shrink-0[class*="grid-cols-"] > div.min-w-0.justify-center button {',
      '    flex: 1 1 auto !important;',
      '  }',
      '  [data-yak-portrait-shell] div.grid.shrink-0[class*="grid-cols-"] > div.justify-self-end {',
      '    grid-column: 2 !important; grid-row: 1 !important;',
      '  }',
      '  [data-yak-portrait-columns] {',
      '    flex-direction: column !important; gap: 8px !important; min-height: 0 !important;',
      '  }',
      '  [data-yak-portrait-columns] > :first-child {',
      '    width: 100% !important; max-height: 36% !important;',
      '    min-height: 0 !important; flex: 0 1 36% !important;',
      '  }',
      '  [data-yak-portrait-columns] > [class*="sm:flex"] {',
      '    display: flex !important; min-height: 0 !important;',
      '    flex: 1 1 0 !important; overflow-y: auto !important;',
      '  }',
      '  [data-yak-battle-columns] { flex-direction: column !important; overflow-y: auto !important; }',
      '  [data-yak-battle-columns] > div { width: 100% !important; flex: 0 0 auto !important; }',
      '  [data-yak-pvp-columns] {',
      '    flex-direction: column !important; gap: 8px !important;',
      '    height: 100% !important; min-height: 0 !important; overflow: hidden !important;',
      '  }',
      '  [data-yak-pvp-columns] > :first-child {',
      '    width: 100% !important; min-height: 0 !important;',
      '    max-height: 45% !important; flex: 0 1 45% !important;',
      '  }',
      '  [data-yak-pvp-columns] > :first-child > :not(.min-h-0) { flex-shrink: 0 !important; }',
      '  [data-yak-pvp-columns] > :first-child div.flex.items-center.justify-between { flex-wrap: wrap !important; }',
      '  [data-yak-pvp-columns] > :nth-child(2) {',
      '    display: block !important; min-height: 0 !important;',
      '    flex: 1 1 0 !important; overflow-y: auto !important;',
      '  }',
      '  [data-yak-pvp-columns] > :only-child { max-height: 100% !important; flex: 1 1 0 !important; }',
      '  [data-yak-pvp] > div.flex.items-stretch { flex-direction: column !important; }',
      '  [data-yak-pvp] > div.grid.grid-cols-3 { grid-template-columns: minmax(0, 1fr) !important; }',
      '  [data-yak-card-tabs] { height: 76px !important; }',
      '  [data-yak-card-tabs] > div.absolute.inset-0 > div.flex.w-full {',
      '    flex-direction: column !important; align-items: flex-start !important; gap: 0 !important;',
      '  }',
      '  [data-yak-card-tabs] > div.absolute.inset-0 > div.flex.w-full > div {',
      '    max-width: 100% !important; flex-shrink: 1 !important;',
      '    justify-content: flex-start !important; overflow-x: auto !important;',
      '  }',
      '  [data-yak-card-footer], [data-yak-market-footer] { height: 84px !important; }',
      '  [data-yak-card-footer] > div.absolute.inset-0,',
      '  [data-yak-market-footer] > div.absolute.inset-0 {',
      '    flex-direction: column !important; justify-content: center !important;',
      '    gap: 4px !important; padding: 4px 8px !important;',
      '  }',
      '  [data-yak-market-footer] > div.absolute.inset-0 > div:first-child {',
      '    width: 100% !important; flex: 0 0 auto !important;',
      '    justify-content: center !important; margin: 0 !important;',
      '  }',
      '  [data-yak-market-footer] input.w-16 { min-width: 64px !important; }',
      '}',
      '@media (orientation: portrait) and (max-width: 359px) {',
      '  [data-yak-battle-columns] div.bg-paper.rounded-full.min-h-12 {',
      '    flex-wrap: wrap !important; border-radius: 1rem !important; padding: 8px !important;',
      '  }',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);

    function fitPortraitShell(modal) {
      var wrappers = modal.querySelectorAll('[class*="max-w-4xl"], [class*="max-w-6xl"]');
      for (var i = 0; i < wrappers.length; i++) {
        var wrapper = wrappers[i];
        var children = wrapper.children;
        if (children.length === 2 && children[1].classList.contains('sm:flex')) {
          wrapper.setAttribute('data-yak-portrait-columns', '');
        } else {
          wrapper.removeAttribute('data-yak-portrait-columns');
        }
        if (children.length === 2 && children[0].classList.contains('w-56') &&
            children[1].classList.contains('min-w-0')) {
          wrapper.setAttribute('data-yak-battle-columns', '');
        } else {
          wrapper.removeAttribute('data-yak-battle-columns');
        }
        var pvp = wrapper.closest('[class*="max-w-5xl"]') &&
          children.length >= 1 && children.length <= 2 &&
          children[0].classList.contains('w-62') &&
          (children.length === 1 || children[1].classList.contains('min-w-0'));
        if (pvp) wrapper.setAttribute('data-yak-pvp-columns', '');
        else wrapper.removeAttribute('data-yak-pvp-columns');
      }

      var records = modal.querySelectorAll('[class*="flex-[2]"]');
      for (var j = 0; j < records.length; j++) {
        var row = records[j].parentElement;
        var dashboard = row && row.parentElement;
        if (row && row.classList.contains('items-stretch') && dashboard &&
            dashboard.querySelector('div.grid.grid-cols-3')) {
          dashboard.setAttribute('data-yak-pvp', '');
        }
      }

      var headers = modal.querySelectorAll('div.bg-paper > div.relative.shrink-0.h-12');
      for (var h = 0; h < headers.length; h++) {
        var headerRow = headers[h].querySelector('div.flex.w-full.items-center.justify-between');
        if (headerRow && headerRow.children.length === 2 &&
            headerRow.children[1].querySelector('button')) {
          headers[h].setAttribute('data-yak-card-tabs', '');
        }
      }

      var footers = modal.querySelectorAll('div.bg-paper > div.relative.shrink-0.h-13');
      for (var f = 0; f < footers.length; f++) {
        var footerRow = footers[f].querySelector('div.absolute.inset-0.flex');
        var quantity = footerRow && footerRow.querySelector('input.w-16');
        if (quantity && quantity.getBoundingClientRect().width < 63) {
          footers[f].setAttribute('data-yak-market-footer', '');
        }
        if (footerRow && footerRow.children.length === 2 &&
            footerRow.children[1].querySelectorAll('button').length >= 2 &&
            footerRow.scrollWidth > footerRow.clientWidth + 1) {
          footers[f].setAttribute('data-yak-card-footer', '');
        }
      }
    }

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
          if (yakIsWorldLayer(layer)) continue;
          if (getComputedStyle(layer).position !== 'fixed') continue;
          var lr = layer.getBoundingClientRect();
          // Only full-viewport fixed layers (modal backdrops) count; the HUD
          // layer is inset by the safe area and is therefore skipped.
          if (lr.width < vw - 1 || lr.height < vh - 1) continue;

          var modals = layer.children;
          for (var k = 0; k < modals.length; k++) {
            var modal = modals[k];
            if (getComputedStyle(modal).display === 'none') continue;
            if (!yakPrepareWindow(modal)) continue;
            // The game's full-screen shell keeps its title in a separate
            // overlay. Scaling the shell leaves that title and the side HUD
            // behind, so reflow its current two-column content instead.
            var shell = vw < DESIGN_W &&
              modal.classList.contains('h-full') && modal.classList.contains('w-full') &&
              modal.querySelector('div.grid.shrink-0[class*="grid-cols-"]');
            if (shell) {
              modal.setAttribute('data-yak-portrait-shell', '');
              fitPortraitShell(modal);
              modal.setAttribute(FIT_ATTR, 'native');
              continue;
            }
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
            var fullBleed = (mrect.width >= vw - 1 && mrect.width <= vw + 1) ||
              (mrect.height >= vh - 1 && mrect.height <= vh + 1);
            // Content may end exactly on the screen edge — a full-bleed
            // shell's content column does — so only a real spill past the
            // viewport counts as overflow. A plain card keeps the old rule
            // and wants FIT_MARGIN of breathing room as well. The height of
            // a full-bleed shell is handled by the scroll set up in
            // applyPortraitLayout, or by the game's own scroller.
            var fits = maxRight <= vw + FIT_MARGIN && mrect.width <= vw + FIT_MARGIN;
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
        console.warn('[YakBrowser] Portrait window fitting failed:', e);
      }
    }

    yakWatchWindows(fitModals);
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
          if (yakIsWorldLayer(layer)) continue;
          if (getComputedStyle(layer).position !== 'fixed') continue;
          var lr = layer.getBoundingClientRect();
          // Only full-viewport fixed layers (modal backdrops) count; the HUD
          // layer is inset by the safe area and is therefore skipped.
          if (lr.width < vw - 1 || lr.height < vh - 1) continue;

          var modals = layer.children;
          for (var k = 0; k < modals.length; k++) {
            var modal = modals[k];
            if (getComputedStyle(modal).display === 'none') continue;
            if (!yakPrepareWindow(modal)) continue;
            var mark = modal.getAttribute(FIT_ATTR);
            // Already scaled by an earlier pass: re-place from the layout
            // rect every pass (idempotent) so mid-animation claims and later
            // layout/viewport changes self-correct.
            if (mark && mark.indexOf('generic-s=') === 0) {
              yakPlaceScaled(modal, vw, vh);
              continue;
            }
            if (mark && mark !== 'noscale') continue; // section 5 owns it
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
        console.warn('[YakBrowser] Overflow window fitting failed:', e);
      }
    }

    yakWatchWindows(fitOverflowing);
  })();
})();
