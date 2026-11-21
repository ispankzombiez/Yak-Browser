const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'assets', 'zone-alerts.js'), 'utf8');
const battleScript = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'assets', 'battle-alerts.js'), 'utf8');

function battleWatcher(model) {
  const messages = [], warnings = [];
  let changed;
  const wrapper = {__reactFiber$test:{memoizedProps:{},return:{memoizedProps:{model}}}};
  const pane = {parentElement:wrapper};
  let panes = [pane];
  vm.runInNewContext(battleScript, {
    window:{YakZoneBridge:{postMessage:json => messages.push(JSON.parse(json))}},
    document:{querySelectorAll:() => panes,addEventListener() {}},
    MutationObserver:class {constructor(callback) {changed=callback;} observe() {}},
    console:{warn:message => warnings.push(message)}
  });
  return {messages,warnings,wrapper,changed,close() {panes=[];changed();}};
}

test('learns only the native next challenge refresh and keeps it when Battles closes', () => {
  const model = {entries:[],nextBoardAt:9000,now:1000,finished:false};
  const w = battleWatcher(model);
  assert.deepEqual(w.messages,[{battle:{at:9000,remaining:8000}}]);
  w.close();
  assert.equal(w.messages.length,1);
  // No recurrence or predicted second arrival is sent without a new native model.
  assert.equal(w.messages.filter(m => m.battle?.at !== 9000).length,0);
});

test('resends a learned refresh for re-enabled alerts and cancels a finished battle board', () => {
  const model = {entries:[],nextBoardAt:9000,now:1000,finished:false};
  const w = battleWatcher(model);
  model.now=2000;w.changed();
  assert.deepEqual(w.messages.at(-1),{battle:{at:9000,remaining:7000}});
  model.finished=true;w.changed();
  assert.deepEqual(w.messages.at(-1),{battle:null});
  model.finished=false;model.nextBoardAt=null;w.changed();
  assert.deepEqual(w.messages.at(-1),{battle:null});
});

test('uses the committed React timer, not its stale alternate, and rejects invalid timers', () => {
  const model = {entries:[],nextBoardAt:9000,now:1000,finished:false};
  const w = battleWatcher(model);
  const currentRoot = {stateNode:{}};
  currentRoot.stateNode.current=currentRoot;
  w.wrapper.__reactFiber$test.return = {memoizedProps:{model},return:{stateNode:{current:currentRoot}}};
  w.wrapper.__reactFiber$test.alternate = {
    return:{memoizedProps:{model:{...model,nextBoardAt:12000,now:3000}},return:currentRoot}
  };
  w.changed();
  assert.deepEqual(w.messages.at(-1),{battle:{at:12000,remaining:9000}});
  delete w.wrapper.__reactFiber$test.alternate;
  for (const at of ['9000',NaN,500]) {
    model.nextBoardAt=at;w.changed();
  }
  assert.equal(w.messages.length,2);
  assert.equal(w.warnings.length,3);
});

function watcher() {
  const messages = [], warnings = [];
  class Socket {
    addEventListener(type, listener) {
      if (type === 'message') this.receive = listener;
    }
  }
  const window = {WebSocket:Socket, YakZoneBridge:{postMessage:json => messages.push(JSON.parse(json))}};
  vm.runInNewContext(script, {window, console:{warn:message => warnings.push(message)}});
  const socket = new window.WebSocket('wss://example.invalid');
  return {
    messages, warnings,
    state(hunting, serverTime = 1000) {
      socket.receive({data:JSON.stringify({type:'state',state:{hunting},serverTime})});
    }
  };
}

test('reports independent zone and tentative farm timers using the server clock', () => {
  const w = watcher();
  w.state({
    grounds:{safari:{naturalCallAt:9000},mistmere:{naturalCallAt:12000}},
    arrivals:{schedule:{dueAt:4000}}
  });
  assert.deepEqual(w.messages, [{
    zones:{safari:{at:9000,remaining:8000},mistmere:{at:12000,remaining:11000}},
    farm:{at:4000,remaining:3000}
  }]);
});

test('clears farm reminders for standing visitors, expired times, or removed schedules', () => {
  const w = watcher();
  w.state({arrivals:{schedule:{dueAt:4000}}});
  for (const arrivals of [
    {standing:{appearedAt:900},schedule:{dueAt:4000}},
    {schedule:{dueAt:1000}},
    {}
  ]) {
    w.state({arrivals});
    assert.equal(w.messages.at(-1).farm, null);
  }
  assert.equal(w.messages[0].farm.at, 4000);
});

test('resends unchanged timers so native scheduling can recover after alerts are re-enabled', () => {
  const w = watcher();
  const hunting = {grounds:{safari:{naturalCallAt:9000}},arrivals:{schedule:{dueAt:4000}}};
  w.state(hunting);
  w.state(hunting,2000);
  assert.equal(w.messages.length,2);
  assert.equal(w.messages[0].farm.at,w.messages[1].farm.at);
  assert.equal(w.messages[1].farm.remaining,2000);
});

test('rejects invalid server clocks and warns rather than scheduling invalid farm times', () => {
  const w = watcher();
  w.state({arrivals:{schedule:{dueAt:4000}}},'1000');
  assert.equal(w.messages.length,0);
  assert.equal(w.warnings.length,1);
  w.state({arrivals:{schedule:{dueAt:'4000'}}});
  assert.deepEqual(w.messages,[{zones:{},farm:null}]);
  assert.equal(w.warnings.length,2);
});
