const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'assets', 'orientation-override.js'), 'utf8');
const helpers = source.slice(source.indexOf('  /* Shared helpers'), source.indexOf('  /* 5. Portrait-native'));
const cameraStart = source.indexOf('(function () {');
const cameraSource = source.slice(cameraStart,source.indexOf('(function () {',cameraStart+1));

function tile() {
  return {
    x:0,y:0,width:0,height:80,originX:0,originY:0,depth:2,scrollFactorX:1,scrollFactorY:1,
    tileScaleX:1,tileScaleY:1,tilePositionX:0,tilePositionY:0,texture:{key:'lane'},frame:{name:0},
    setY(y) { this.y = y; return this; },
    setVisible(value) { this.visible = value; return this; },
    setPosition(x,y) { this.x = x; this.y = y; return this; },
    setSize(width,height) { this.width = width; this.height = height; return this; },
    setOrigin() { return this; },setDepth() { return this; },setScrollFactor() { return this; },
    setTileScale(x,y) { this.tileScaleX = x; this.tileScaleY = y; return this; },
    setTilePosition(x,y) { this.tilePositionX = x; this.tilePositionY = y; return this; },
    destroy() { this.destroyed = true; }
  };
}

function battleModel(window,scale) {
  const scene = {
    game:{scale},phase:'prep',order:{player:['p0','p1','p2'],enemy:['e0','e1','e2']},
    fighters:new Map(),layouts:0,hudUpdates:0,delayedCharges:[],add:{tileSprite:() => tile()},
    ground:{lane:tile(),fill:tile(),destroy() {}},designer:{layout(point) { this.anchor = point; }},
    teamCap:() => 3,lineStep:() => 96,cancelBodyDrag() {},
    cameras:{main:{centerOn() {}}},
    homeOf(side) { return {x:window.innerWidth/2+(side === 'player' ? -48 : 48),y:Math.round(window.innerHeight*.48)}; },
    placeStage(viewport,artScale) {
      this.ground.place(viewport,artScale);
      this.designer.layout({x:viewport.width/2,y:Math.round(viewport.height*.48)-24},artScale);
    },
    layout() { this.layouts++; this.placeStage({width:window.innerWidth,height:window.innerHeight},1); },
    standOf(id) {
      const side = id[0] === 'p' ? 'player' : 'enemy', home = this.homeOf(side);
      return {x:home.x+(side === 'player' ? -1 : 1)*this.lineStep()*Number(id[1]),y:home.y};
    },
    fighterOf(id) {
      if (!this.fighters.has(id)) {
        const home = this.standOf(id);
        const f = {
          home,offset:{x:0,y:0},knock:{x:0},shadow:tile(),visible:true,isDown:false,
          place(x,y) { this.body = {x,y}; },
          homePoint() { return {...this.home}; },
          centrePoint() { return this.body; },
          here() { this.place(this.home.x+this.offset.x+this.knock.x,this.home.y+this.offset.y); },
          jab(distance,impact) { this.distance = distance; impact(); },
          lunge(distance,windup,strike,impact) { this.distance = distance; impact(); }
        };
        f.here();
        this.fighters.set(id,f);
      }
      return this.fighters.get(id);
    },
    standActives() {
      this.fighters.clear();
      for (const id of [...this.order.player,...this.order.enemy]) this.fighterOf(id);
    },
    syncHud() { this.hudUpdates++; },
    presentFast(event) {
      const from = this.fighters.get(event.unitId), to = this.fighters.get(event.targetId);
      from.jab(Math.abs(to.centrePoint().x-from.centrePoint().x),event.impact);
    },
    presentCharge(event) {
      const from = this.fighters.get(event.unitId), to = this.fighters.get(event.targetId);
      this.delayedCharges.push(() => from.lunge(Math.abs(to.body.x-from.body.x),180,150,event.impact));
    },
    throwPlanFor(from,to) {
      return Math.abs(this.fighters.get(to).homePoint().x-this.fighters.get(from).homePoint().x);
    }
  };
  scene.ground.place = function (viewport,artScale) {
    const y = Math.round(viewport.height*.48)-40;
    this.lane.setPosition(0,y).setSize(viewport.width,80);
    this.fill.setSize(viewport.width,viewport.height).setTilePosition(0,-y/artScale);
  };
  return scene;
}

function camera(width = 384, height = 832, engineReady = false, topBottom = false) {
  const window = {innerWidth:width,innerHeight:height};
  const root = element();
  root.clientWidth = width; root.clientHeight = height;
  if (topBottom) root.setAttribute('data-yak-battle-tb');
  const document = {documentElement:root,head:{appendChild() {}},createElement:() => ({})};
  let settingsChanged;
  const resizes = [], warnings = [];
  const scale = {
    width:Math.max(width,460)*3,height:Math.round(height*Math.max(width,460)/width)*3,zoom:1/3,
    resize(w,h) { this.width = w; this.height = h; resizes.push([w,h]); }
  };
  class Systems {
    constructor(key) {
      this.settings = {key}; this.game = {scale};
      this.scene = battleModel(window,scale); this.scene.sys = this;
    }
    isActive() { return true; }
    start(data) {
      this.firstLayout = {width:window.innerWidth,height:window.innerHeight,rendererWidth:scale.width, data};
      return this;
    }
  }
  const phaser = {Scenes:{Systems}};
  if (engineReady) window.Phaser = phaser;
  vm.runInNewContext(cameraSource,{
    window,document,console:{warn:message => warnings.push(message)},
    MutationObserver:class { constructor(callback) { settingsChanged = callback; } observe() {} }
  });
  if (!engineReady) window.Phaser = phaser;
  return {
    window,document,scale,resizes,warnings,start:key => new Systems(key).start('scene-data'),
    toggle(value) {
      if (value) root.setAttribute('data-yak-battle-tb'); else root.removeAttribute('data-yak-battle-tb');
      settingsChanged();
    }
  };
}

test('top/bottom teams fit in two native-size rows and retain native slot order', () => {
  for (const [width,height] of [[320,568],[384,832],[412,915]]) {
    const c = camera(width,height,false,true), battle = c.start('DuelBattleScene'), scene = battle.scene;
    assert.equal(battle.firstLayout.width,width);
    assert.equal(battle.firstLayout.height,height);
    scene.layout(); scene.standActives();
    const enemies = scene.order.enemy.map(id => scene.standOf(id));
    const players = scene.order.player.map(id => scene.standOf(id));
    assert.ok(enemies[0].y < players[0].y-120);
    for (const row of [enemies,players]) {
      for (const point of row) {
        assert.ok(point.x-43 >= 8 && point.x+43 <= width-8);
        assert.ok(point.y-44 >= 100 && point.y+95 <= height-75);
        assert.equal(point.y,row[0].y);
      }
    }
    assert.deepEqual(players.map(p => p.x),enemies.map(p => p.x).reverse());
    const bottomLane = scene.ground.__yakBottomLane;
    assert.ok(bottomLane.visible);
    assert.equal(bottomLane.y-scene.ground.lane.y,players[0].y-enemies[0].y);
    assert.equal(scene.ground.fill.height,height);
    scene.ground.destroy();
    assert.equal(bottomLane.destroyed,true);
  }
});

test('formation changes apply live only in preparation, remain deferred during combat, and do not affect landscape', () => {
  const c = camera(), battle = c.start('DuelBattleScene'), scene = battle.scene;
  const lineup = [...scene.order.player];
  c.toggle(true);
  assert.equal(c.window.innerWidth,384);
  assert.ok(scene.homeOf('enemy').y < scene.homeOf('player').y);
  assert.equal(scene.layouts,1);
  const bottomLane = scene.ground.__yakBottomLane;
  c.toggle(false);
  assert.equal(c.window.innerWidth,640);
  assert.equal(bottomLane.visible,false);
  assert.equal(scene.homeOf('enemy').y,scene.homeOf('player').y);
  scene.phase = 'running';
  c.toggle(true);
  assert.equal(c.window.innerWidth,640);
  assert.equal(scene.layouts,2);
  assert.deepEqual(scene.order.player,lineup);
  assert.equal(c.start('DuelBattleScene').firstLayout.width,384);
  c.start('FarmScene');
  assert.equal(c.window.innerWidth,460);
  const landscape = camera(832,384,false,true), wide = landscape.start('DuelBattleScene');
  assert.equal(wide.firstLayout.width,832);
  assert.equal(wide.scene.homeOf('player').y,wide.scene.homeOf('enemy').y);
});

test('vertical attacks retain impact callbacks and use the new battle axis without moving home anchors', () => {
  const c = camera(384,832,false,true), scene = c.start('DuelBattleScene').scene;
  scene.standActives();
  const from = scene.fighters.get('p0'), to = scene.fighters.get('e0'), home = {...from.home};
  let impacts = 0;
  scene.presentFast({unitId:'p0',targetId:'e0',impact:() => impacts++});
  assert.equal(impacts,1);
  assert.equal(from.distance,Math.hypot(to.body.x-from.body.x,to.body.y-from.body.y));
  assert.equal(scene.throwPlanFor('p0','e0'),Math.abs(to.home.y-from.home.y));
  scene.presentCharge({unitId:'p0',targetId:'e0',move:{power:1,reach:'melee'},impact:() => impacts++});
  assert.equal(impacts,1);
  scene.delayedCharges.shift()();
  assert.equal(impacts,2);
  assert.equal(from.distance,Math.hypot(to.body.x-from.body.x,to.body.y-from.body.y));
  assert.equal(from.__yakStrikeTarget,undefined);
  from.offset = {x:20,y:3}; from.knock.x = 4;
  from.here();
  assert.equal(from.body.x,home.x);
  assert.equal(from.body.y,home.y-21);
  assert.equal(from.shadow.y,home.y-24);
  assert.deepEqual(from.home,home);
});

test('fits the six-position battle row before first layout and restores the farm camera', () => {
  for (const width of [320,384,412]) {
    const c = camera(width);
    assert.equal(c.window.innerWidth,460);
    const battle = c.start('DuelBattleScene');
    const logicalWidth = battle.firstLayout.width;
    assert.equal(battle.firstLayout.rendererWidth,logicalWidth*3);
    assert.equal(battle.firstLayout.data,'scene-data');
    // Native battle spacing is 96 px; reserve the complete health/name label.
    for (const offset of [-240,-144,-48,48,144,240]) {
      const left = (logicalWidth/2+offset-56)*width/logicalWidth;
      const right = (logicalWidth/2+offset+56)*width/logicalWidth;
      assert.ok(left >= 8 && right <= width-8,'outer battle label must fit with edge clearance');
    }
    c.start('ReactPageScene');
    assert.equal(c.window.innerWidth,logicalWidth);
    c.start('FarmScene');
    assert.equal(c.window.innerWidth,460);
    assert.equal(c.scale.width,1380);
    assert.equal(c.resizes.length,2);
    assert.deepEqual(c.warnings,[]);
  }
});

test('scene camera fitting handles an existing engine, revisits, and landscape without extra resizing', () => {
  const c = camera(384,832,true);
  c.start('DuelBattleScene');
  c.start('DuelBattleScene');
  assert.equal(c.resizes.length,1);
  c.start('SafariScene');
  assert.equal(c.window.innerWidth,460);
  c.start('DuelBattleScene');
  assert.equal(c.resizes.length,3);
  const landscape = camera(832,384);
  landscape.start('DuelBattleScene');
  assert.equal(landscape.window.innerWidth,832);
  assert.equal(landscape.window.innerHeight,384);
  assert.equal(landscape.resizes.length,0);
});

function element() {
  const attributes = new Map(), listeners = new Map();
  return {
    images:[], complete:false, connected:true,
    hasAttribute:name => attributes.has(name),
    setAttribute:(name,value = '') => attributes.set(name,value),
    getAttribute:name => attributes.has(name) ? attributes.get(name) : null,
    removeAttribute:name => attributes.delete(name),
    contains(target) { return target === this || this.images.includes(target); },
    querySelectorAll() { return this.images; },
    getBoundingClientRect:() => ({width:100,height:100}),
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type) { listeners.get(type)?.({type}); }
  };
}

function layer(classes, properties = {}) {
  const e = element(), values = {...properties};
  e.children = [];
  e.classList = {contains:name => classes.split(' ').includes(name)};
  e.setClasses = value => { classes = value; };
  e.style = {
    ...properties,
    getPropertyValue:name => values[name] || '',
    setProperty(name,value) { values[name] = value; this[name] = value; },
    removeProperty(name) { delete values[name]; delete this[name]; }
  };
  e.querySelector = () => null;
  return e;
}

function watcher() {
  const warnings = [], timers = new Map();
  let observer, nextTimer = 0;
  const document = {
    head:{appendChild() {}},
    createElement:() => ({}),
    getElementById:() => null,
    contains:e => e.connected,
    addEventListener() {},
    getAnimations:() => [],
    fonts:{status:'loaded',ready:Promise.resolve(),addEventListener() {}}
  };
  const context = vm.createContext({
    document, window:{addEventListener() {}},
    console:{warn:message => warnings.push(message)},
    CSSTransition:class {},
    MutationObserver:class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe(target) { this.target = target; }
      takeRecords() { return []; }
    },
    ResizeObserver:class { observe() {} unobserve() {} },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout:id => timers.delete(id)
  });
  vm.runInContext(helpers, context);
  return {
    context, document, warnings, timers,
    mutate:() => observer.callback(),
    observedDocument:() => observer.target === document
  };
}

test('PvP list fitting handles loading, detail arrival, and reused non-PvP wrappers', () => {
  const start = source.indexOf('    function fitPortraitShell(');
  const fitting = source.slice(start,source.indexOf('    // Stacks the wrapper',start));
  const context = vm.createContext({});
  vm.runInContext(fitting,context);
  const wrapper = layer('flex max-w-4xl');
  wrapper.closest = () => ({});
  wrapper.children = [layer('flex w-62 shrink-0 flex-col')];
  const modal = {querySelectorAll:selector => selector.includes('max-w-4xl') ? [wrapper] : []};
  context.fitPortraitShell(modal);
  assert.ok(wrapper.hasAttribute('data-yak-pvp-columns'));
  wrapper.children.push(layer('flex min-h-0 min-w-0 flex-1'));
  context.fitPortraitShell(modal);
  assert.ok(wrapper.hasAttribute('data-yak-pvp-columns'));
  wrapper.children[0].setClasses('w-56');
  context.fitPortraitShell(modal);
  assert.ok(!wrapper.hasAttribute('data-yak-pvp-columns'));
  wrapper.children[0].setClasses('w-62');
  wrapper.closest = () => null;
  context.fitPortraitShell(modal);
  assert.ok(!wrapper.hasAttribute('data-yak-pvp-columns'));
});

test('fits both passes synchronously when the root mounts after document-start registration', () => {
  const w = watcher(), calls = [];
  w.context.yakWatchWindows(() => calls.push('portrait'));
  w.context.yakWatchWindows(() => calls.push('overflow'));
  calls.length = 0;
  w.mutate();
  assert.deepEqual(calls, ['portrait','overflow']);
  assert.equal(w.observedDocument(), true);
  assert.equal(w.timers.size, 0);
});

test('settles finite geometry but leaves fades, decorative loops and catch reveals alone', () => {
  const w = watcher(), modal = element(), child = element();
  child.complete = true;
  modal.images.push(child);
  const animations = [
    {target:modal,key:'transform',end:600},
    {target:child,key:'opacity',end:600},
    {target:child,key:'rotate',end:Infinity},
    {target:element(),key:'transform',end:600}
  ].map(({target,key,end}) => ({
    playState:'running',playbackRate:1,finished:false,
    effect:{target,getComputedTiming:() => ({endTime:end}),getKeyframes:() => [{[key]:'value'}]},
    finish() { this.finished = true; }
  }));
  animations.push(Object.assign(new w.context.CSSTransition(), {
    ...animations[0], effect:{target:child,getComputedTiming:() => ({endTime:600}),getKeyframes:() => [{transform:'none'}]}
  }));
  w.document.getAnimations = () => animations;
  assert.equal(w.context.yakPrepareWindow(modal), true);
  assert.deepEqual(animations.map(a => a.finished), [true,false,false,false,false]);
  animations[0].finished = false;
  modal.setAttribute('data-yak-caught','');
  w.context.yakPrepareWindow(modal);
  assert.equal(animations[0].finished, false);
});

test('keeps the first render hidden until images and newly requested fonts are ready', async () => {
  const w = watcher(), modal = element(), image = element();
  modal.images.push(image);
  let fontsReady;
  w.document.fonts.status = 'loading';
  w.document.fonts.ready = new Promise(resolve => { fontsReady = resolve; });
  let visibleFits = 0;
  w.context.yakWatchWindows(() => {
    if (w.context.yakPrepareWindow(modal)) visibleFits++;
  });
  assert.equal(modal.hasAttribute('data-yak-modal-pending'), true);
  image.complete = true;
  image.emit('load');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(visibleFits, 0);
  w.document.fonts.status = 'loaded';
  fontsReady();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(visibleFits, 1);
  assert.equal(modal.hasAttribute('data-yak-modal-pending'), false);
  assert.equal(w.timers.size, 0);
});

test('a stalled resource does not permanently hide the window and reports the timeout', () => {
  const w = watcher(), modal = element();
  modal.images.push(element());
  let visibleFits = 0;
  w.context.yakWatchWindows(() => {
    if (w.context.yakPrepareWindow(modal)) visibleFits++;
  });
  [...w.timers.values()][0]();
  assert.equal(visibleFits, 1);
  assert.equal(modal.hasAttribute('data-yak-modal-pending'), false);
  assert.equal(w.warnings.length, 1);
  assert.equal(w.timers.size, 0);
});

test('world anchors are not mistaken for modal backdrops, titles, or screen-space HUD', () => {
  const w = watcher();
  const world = layer('pointer-events-none fixed inset-0 z-50');
  world.children.push(layer('absolute flex -translate-x-1/2', {left:'374px',top:'488px'}));
  assert.equal(w.context.yakIsWorldLayer(world), true);
  assert.equal(w.context.yakIsWorldLayer(layer('pointer-events-none fixed flex -translate-x-1/2 z-50', {left:'86px',top:'479px'})), true);
  assert.equal(w.context.yakIsWorldLayer(layer('pointer-events-none fixed flex -translate-x-1/2 z-30', {left:'86px',top:'479px'})), true);
  assert.equal(w.context.yakIsWorldLayer(layer('pointer-events-none fixed flex -translate-x-1/2 z-50', {left:'50%',top:'50%'})), false);
  assert.equal(w.context.yakIsWorldLayer(layer('pointer-events-none fixed inset-safe-area z-50', {left:'4px',top:'22px'})), false);
  for (const classes of [
    'pointer-events-auto fixed inset-0 z-60',
    'pointer-events-none fixed inset-0 z-75',
    'pointer-events-none fixed inset-safe-area z-50'
  ]) assert.equal(w.context.yakIsWorldLayer(layer(classes)), false);
  const title = layer('pointer-events-none fixed inset-0 z-75');
  title.children.push(layer('absolute', {left:'100px',top:'50px'}));
  assert.equal(w.context.yakIsWorldLayer(title),false);
});

test('projects world layers with the renderer scale and removes only their legacy fits', () => {
  const w = watcher();
  const world = layer('pointer-events-none fixed inset-0 z-50');
  const health = layer('absolute flex -translate-x-1/2', {left:'374px',top:'488px',width:'640px',transform:'scale(.5875)','transform-origin':'0 0'});
  health.setAttribute('data-yak-fit','s=0.588');
  world.children.push(health);
  const hud = layer('pointer-events-none fixed inset-safe-area z-50');
  hud.querySelector = () => ({});
  const canvas = {style:{width:'460px'}};
  w.document.documentElement = {clientWidth:384,clientHeight:832,style:layer('').style};
  w.document.getElementById = () => ({children:[world,hud]});
  w.document.querySelector = () => canvas;
  w.context.yakFitWorldOverlays();
  assert.equal(Number(w.document.documentElement.style.getPropertyValue('--yak-world-zoom')),384/460);
  assert.equal(world.hasAttribute('data-yak-world-overlay'),true);
  assert.equal(health.getAttribute('data-yak-fit'),null);
  assert.equal(health.style.width,undefined);
  assert.equal(health.style.transform,undefined);
  assert.equal(health.style.left,'374px');
  assert.equal(health.style.top,'488px');
  assert.equal(hud.hasAttribute('data-yak-battle-hud'),true);
  w.document.documentElement.clientWidth = 832;
  w.document.documentElement.clientHeight = 384;
  hud.querySelector = () => null;
  w.context.yakFitWorldOverlays();
  assert.equal(w.document.documentElement.style.getPropertyValue('--yak-world-zoom'),'1');
  assert.equal(hud.hasAttribute('data-yak-battle-hud'),false);
});

test('opening and closing the battle picker keeps the same world projection', () => {
  const w = watcher();
  const world = layer('pointer-events-none fixed inset-0 z-50');
  const health = layer('absolute flex -translate-x-1/2', {left:'374px',top:'488px'});
  world.children.push(health);
  const spot = layer('pointer-events-none fixed flex -translate-x-1/2 z-50', {left:'86px',top:'479px'});
  w.document.documentElement = {clientWidth:384,clientHeight:832,style:layer('').style};
  w.document.getElementById = () => ({children:[world,spot]});
  w.document.querySelector = () => ({style:{width:'460px'}});
  for (const level of ['z-50','z-30','z-50','z-30']) {
    world.setClasses('pointer-events-none fixed inset-0 '+level);
    spot.setClasses('pointer-events-none fixed flex -translate-x-1/2 '+level);
    w.context.yakFitWorldOverlays();
    assert.equal(world.hasAttribute('data-yak-world-overlay'),true);
    assert.equal(spot.hasAttribute('data-yak-world-overlay'),true);
    assert.equal(health.getAttribute('data-yak-fit'),null);
    assert.equal(w.document.documentElement.style.getPropertyValue('--yak-world-zoom'),String(384/460));
  }
});
