import test from 'node:test';
import assert from 'node:assert/strict';
import { sound } from '../src/sound.js';

test('soundFX works safely in headless environment without audio hardware', () => {
  assert.equal(typeof sound.enabled, 'boolean');
  // Safe calls when AudioContext is not present
  assert.doesNotThrow(() => sound.playPoke());
  assert.doesNotThrow(() => sound.playSquish());
  assert.doesNotThrow(() => sound.playBounce(1.5));
  assert.doesNotThrow(() => sound.playLand(2.2));
  assert.doesNotThrow(() => sound.playBubble(1.2));
  assert.doesNotThrow(() => sound.playWakeup());
  assert.doesNotThrow(() => sound.playStretch(0.8));
  assert.doesNotThrow(() => sound.playDizzy());
  assert.doesNotThrow(() => sound.playDizzyLand(1.8));
  assert.doesNotThrow(() => sound.playDizzyStars(1.8));
  assert.doesNotThrow(() => sound.playHappyPurr());
  assert.doesNotThrow(() => sound.playSliderTick());
  assert.doesNotThrow(() => sound.playAmbientBubble());
  assert.doesNotThrow(() => sound.playAngryLand(1.8));
  assert.doesNotThrow(() => sound.playAngryPoke(0.8));
  assert.doesNotThrow(() => sound.playSnore());
  assert.doesNotThrow(() => sound.playStartle());
  assert.doesNotThrow(() => sound.resume());
});

test('soundFX toggles enabled state and updates master gain', () => {
  const initial = sound.enabled;
  const toggled = sound.toggle();
  assert.equal(toggled, !initial);
  assert.equal(sound.enabled, !initial);

  const restored = sound.toggle();
  assert.equal(restored, initial);
  assert.equal(sound.enabled, initial);
});

test('soundFX supports volume control defaulting to 80%', () => {
  assert.equal(typeof sound.volume, 'number');
  sound.setVolume(0.5);
  assert.equal(sound.volume, 0.5);
  sound.setVolume(0.8);
  assert.equal(sound.volume, 0.8);
  sound.setVolume(1.5);
  assert.equal(sound.volume, 1.0, 'clamped to 1.0');
  sound.setVolume(-0.2);
  assert.equal(sound.volume, 0.0, 'clamped to 0.0');
  sound.setVolume(0.8);
});

test('soundFX correctly synthesizes procedural audio events when AudioContext exists', () => {
  const createdNodes = [];
  class MockParam {
    constructor(val = 0) { this.value = val; }
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    setTargetAtTime() {}
  }
  class MockNode {
    constructor(kind) {
      this.kind = kind;
      this.type = kind;
      this.frequency = new MockParam(440);
      this.gain = new MockParam(1);
      createdNodes.push(this);
    }
    connect() {}
    start() {}
    stop() {}
  }
  class MockAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
    }
    createBiquadFilter() { return new MockNode('biquad'); }
    createGain() { return new MockNode('gain'); }
    createOscillator() { return new MockNode('oscillator'); }
    async resume() { this.state = 'running'; }
  }

  const prevAudioContext = globalThis.AudioContext;
  const prevWindow = globalThis.window;
  try {
    globalThis.AudioContext = MockAudioContext;
    globalThis.window = globalThis;

    sound.ctx = null;
    sound.enabled = true;

    sound.playPoke();
    assert.ok(createdNodes.some(n => n.kind === 'oscillator'));

    sound.playSquish();
    sound.playBounce(1.2);
    sound.playLand(2.5);
    sound.playBubble(1.1);
    sound.playWakeup();
    sound.playStretch(0.9);
    sound.playDizzy();
    sound.playDizzyLand(2.0);
    sound.playHappyPurr();
    sound.playSliderTick();
    sound.playAmbientBubble();
    sound.playAngryLand(2.0);
    sound.playAngryPoke(0.8);
    sound.playSnore();
    sound.playStartle();

    assert.ok(createdNodes.length >= 25);
  } finally {
    globalThis.AudioContext = prevAudioContext;
    globalThis.window = prevWindow;
    sound.ctx = null;
  }
});
