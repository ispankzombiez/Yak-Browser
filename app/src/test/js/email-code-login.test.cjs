const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'assets', 'email-code-login.js'), 'utf8');

function fixture(ready) {
  const styles = [];
  const parent = {appendChild: style => styles.push(style)};
  const observers = [];
  const document = {head: ready ? parent : null, documentElement: null, createElement: () => ({})};
  const context = vm.createContext({
    window: {}, document,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { assert.equal(target, document); }
      disconnect() { this.disconnected = true; }
    }
  });
  return {styles, parent, observers, document, run: () => vm.runInContext(source, context)};
}

test('installs the login override synchronously and does not duplicate it on fallback injection', () => {
  const f = fixture(true);
  f.run();
  assert.equal(f.styles.length, 1);
  f.run();
  assert.equal(f.styles.length, 1);
  assert.equal(f.observers.length, 0);
});

test('document-start before the HTML root exists installs as soon as the root mounts', () => {
  const f = fixture(false);
  f.run();
  assert.equal(f.styles.length, 0);
  f.document.documentElement = f.parent;
  f.observers[0].callback();
  assert.equal(f.styles.length, 1);
  assert.equal(f.observers[0].disconnected, true);
});
