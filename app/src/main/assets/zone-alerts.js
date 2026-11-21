/* YakBrowser arrival alerts: watches the game's own server connection
   (WebSocket) for "state" messages and reports hunting-zone refresh times
   and tentative farm-visitor reminders to the app.

   Read-only: the socket is subclassed (statics and instanceof keep
   working) and a passive message listener is added; nothing the game
   sends or receives is changed. state.hunting.grounds is keyed by zone id
   and every zone has its own naturalCallAt (absolute, server clock), so
   the app is told the time REMAINING by the server's clock (naturalCallAt
   - serverTime), which ignores any skew on this device's clock.

   Farm arrivals.schedule.dueAt is an opportunity, not a guaranteed spawn.
   A missing/expired schedule or a standing visitor cancels that reminder.
   Times are reported on each state sync; the app skips alarms it already
   has scheduled, including after settings/permission changes. The bridge object
   is injected by the app for yakkamon.com only; without it this is a
   no-op. Idempotent. */
(function () {
  if (window.__yakZoneAlerts) return;
  window.__yakZoneAlerts = true;
  var bridge = window.YakZoneBridge;
  var Native = window.WebSocket;
  if (!bridge || !Native) return;

  function onState(msg) {
    var hunting = msg && msg.state && msg.state.hunting;
    var serverTime = msg && msg.serverTime;
    if (!hunting || typeof serverTime !== 'number' || !isFinite(serverTime)) {
      console.warn('YakBrowser: arrival state has no valid hunting data or server clock.');
      return;
    }
    var zones = {};
    var grounds = hunting.grounds || {};
    for (var id in grounds) {
      if (!Object.prototype.hasOwnProperty.call(grounds, id)) continue;
      var at = grounds[id] && grounds[id].naturalCallAt;
      if (typeof at !== 'number' || !isFinite(at) || at <= serverTime) continue;
      zones[id] = { at: at, remaining: at - serverTime };
    }
    var arrivals = hunting.arrivals;
    var dueAt = arrivals && arrivals.schedule && arrivals.schedule.dueAt;
    var farm = null;
    if (dueAt != null && (typeof dueAt !== 'number' || !isFinite(dueAt))) {
      console.warn('YakBrowser: ignoring an invalid farm arrival time.');
    } else if (arrivals && !arrivals.standing && typeof dueAt === 'number' && dueAt > serverTime) {
      farm = { at: dueAt, remaining: dueAt - serverTime };
    }
    bridge.postMessage(JSON.stringify({ zones: zones, farm: farm }));
  }

  function Watched(url, protocols) {
    var ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    ws.addEventListener('message', function (e) {
      try {
        if (typeof e.data !== 'string' || e.data.indexOf('"state"') < 0) return;
        var msg = JSON.parse(e.data);
        if (msg && msg.type === 'state') onState(msg);
      } catch (err) {
        console.warn('YakBrowser: failed to read or report an arrival state message.');
      }
    });
    return ws;
  }
  Watched.prototype = Native.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { Watched[k] = Native[k]; });
  window.WebSocket = Watched;
})();
