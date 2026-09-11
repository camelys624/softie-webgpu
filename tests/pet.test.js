import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPetMenu,
  createPetController,
  gazeFromCursor,
  isPetMode,
  petCamera,
  petSizeFromSearch,
  petWindowSize,
} from '../src/pet.js';

test('pet URL and framing helpers keep every supported window size usable', () => {
  assert.equal(isPetMode('?pet=1&size=large'), true);
  assert.equal(isPetMode('?size=large'), false);
  assert.equal(petSizeFromSearch('?pet=1&size=small'), 'small');
  assert.equal(petSizeFromSearch('?pet=1&size=unknown'), 'medium');
  assert.deepEqual(petWindowSize('small'), { width: 255, height: 225 });
  assert.deepEqual(petWindowSize('large'), { width: 476, height: 420 });
  assert.equal(petCamera(340, 300).aspect, 340 / 300);
  assert.ok(petCamera(225, 420).visibleHeight > petCamera(476, 420).visibleHeight);
});

test('global cursor gaze is directional, finite, and bounded', () => {
  assert.deepEqual(gazeFromCursor({ x: 500, y: 100 }, { x: 100, y: 300 }), { x: 400 / 420, y: 200 / 420 });
  assert.deepEqual(gazeFromCursor({ x: -1000, y: 2000 }, { x: 100, y: 100 }), { x: -1, y: -1 });
  assert.deepEqual(gazeFromCursor(null, { x: 0, y: 0 }), { x: 0, y: 0 });
});

test('pet menu reflects state and controller routes native commands', () => {
  const sent = [];
  const listeners = new Map();
  const calls = [];
  const desktop = {
    hyprland: false,
    send: (channel, payload) => sent.push({ channel, payload }),
    on: (channel, listener) => listeners.set(channel, listener),
  };
  const ui = {
    state: { colorName: 'mint', stiffness: 35, damping: 45, soundEnabled: true, language: 'zh' },
    t: key => `t:${key}`,
    poke: () => calls.push(['poke']),
    reset: () => calls.push(['reset']),
    toggleSound: () => calls.push(['sound']),
    pickColor: value => calls.push(['color', value]),
    setParameter: (kind, value) => calls.push([kind, value]),
    setLanguage: value => calls.push(['language', value]),
  };
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = { querySelector: () => null };
  globalThis.window = { addEventListener: () => {} };
  try {
    const menu = buildPetMenu({ ...ui.state, size: 'medium' }, ui.t);
    const colorMenu = menu.find(item => item.label === 't:color').submenu;
    assert.equal(colorMenu.find(item => item.id === 'color:mint').checked, true);
    assert.equal(menu.find(item => item.id === 'sound').checked, true);

    const sizes = [];
    const controller = createPetController({ desktop, ui, size: 'medium', onSize: value => sizes.push(value) });
    assert.equal(controller.run('poke'), true);
    assert.equal(controller.run('color:grape'), true);
    assert.equal(controller.run('stiffness:75'), true);
    assert.equal(controller.run('size:large'), true);
    assert.equal(controller.run('language:en'), true);
    assert.equal(controller.run('unknown'), false);
    assert.deepEqual(calls, [['poke'], ['color', 'grape'], ['stiffness', 75], ['language', 'en']]);
    assert.deepEqual(sizes, ['large']);
    assert.equal(controller.size, 'large');
    assert.ok(sent.some(message => message.channel === 'softie:menu'));
    assert.equal(typeof listeners.get('softie:command'), 'function');
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
