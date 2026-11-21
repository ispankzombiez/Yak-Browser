/* Learn only the next refresh from the Battles view's native timer model.
   Do not infer future days or change the game's state. The app accepts these
   reports only while its game activity is open, then schedules one alarm. */
(function () {
  if (window.__yakBattleAlerts) return;
  var bridge = window.YakZoneBridge;
  if (!bridge) return;
  window.__yakBattleAlerts = true;
  var warned = new WeakSet();

  function reportTimer() {
    var panes = document.querySelectorAll('#react-root [class*="max-w-4xl"] > div.w-56');
    for (var i = 0; i < panes.length; i++) {
      var pane = panes[i];
      var wrapper = pane.parentElement;
      var key = Object.keys(wrapper).find(function (name) { return name.indexOf('__reactFiber$') === 0; });
      var fiber = key && wrapper[key];
      var root = fiber;
      for (var level = 0; root && root.return && level < 100; level++) root = root.return;
      if (root && root.stateNode && root.stateNode.current !== root && fiber.alternate) {
        fiber = fiber.alternate;
      }
      var model;
      for (var depth = 0; fiber && depth < 20; depth++, fiber = fiber.return) {
        var candidate = fiber.memoizedProps && fiber.memoizedProps.model;
        if (candidate && Array.isArray(candidate.entries) &&
            Object.prototype.hasOwnProperty.call(candidate, 'nextBoardAt')) {
          model = candidate;
          break;
        }
      }
      if (!model) {
        if (!warned.has(pane)) {
          warned.add(pane);
          console.warn('YakBrowser: could not read the Battles refresh timer model.');
        }
        continue;
      }
      var at = model.nextBoardAt, now = model.now;
      if (model.finished || at === null) {
        bridge.postMessage(JSON.stringify({battle:null}));
      } else if (typeof at === 'number' && isFinite(at) &&
                 typeof now === 'number' && isFinite(now) && at > now) {
        bridge.postMessage(JSON.stringify({battle:{at:at,remaining:at-now}}));
      } else {
        console.warn('YakBrowser: ignoring an invalid Battles refresh timer.');
      }
    }
  }

  new MutationObserver(reportTimer).observe(document, {
    childList:true, subtree:true, characterData:true
  });
  document.addEventListener('visibilitychange', reportTimer);
  reportTimer();
})();
