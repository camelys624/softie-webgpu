import test from 'node:test';
import assert from 'node:assert/strict';
import { FaceMotion } from '../src/face-motion.js';

function advance(face, seconds, hz = 60) {
  for (let i = 0; i < Math.round(seconds * hz); i++) face.update(face.time + 1 / hz);
}

test('grab overrides reactions, release smiles, and one-shots return to neutral', () => {
  const face = new FaceMotion();
  face.react('surprised'); advance(face, 0.25);
  assert.ok(face.state.surprised > 0.8);
  face.grab(true); face.react('wink'); advance(face, 0.4);
  assert.equal(face.expression, 'squish');
  assert.ok(face.state.squish > 0.99 && face.state.surprised < 0.01);
  face.grab(false); advance(face, 0.3);
  assert.equal(face.expression, 'happy');
  assert.ok(face.state.happy > 0.9);
  advance(face, 2);
  assert.equal(face.expression, 'idle');
  assert.equal(face.state.happy, 0);
  face.react('wink'); advance(face, 0.25);
  assert.ok(face.state.wink > 0.8);
  face.grab(true); face.grab(false, false); advance(face, 0.4);
  assert.equal(face.expression, 'idle', 'cancel does not trigger celebration');
  face.reset();
  assert.ok(Object.values(face.state).every(value => value === 0));
});

test('gaze is bounded, eased, frame-rate independent, and smoothly recenters', () => {
  const at30 = new FaceMotion(), at120 = new FaceMotion();
  for (const face of [at30, at120]) face.lookAt(20, -20);
  advance(at30, 0.1, 30);
  assert.ok(at30.state.gazeX > 0 && at30.state.gazeX < 1);
  advance(at30, 0.9, 30); advance(at120, 1, 120);
  assert.ok(Math.abs(at30.state.gazeX - at120.state.gazeX) < 1e-9);
  assert.ok(at30.state.gazeX <= 1 && at30.state.gazeY >= -1);
  at30.lookAt(0, 0); advance(at30, 1, 30);
  assert.ok(Math.abs(at30.state.gazeX) < 0.001);
  at30.lookAt(NaN, Infinity); advance(at30, 0.1);
  assert.ok(Object.values(at30.state).every(Number.isFinite));
});

test('idle blinks briefly; reduced motion disables idle blink and gaze', () => {
  const face = new FaceMotion();
  face.update(4.31);
  assert.ok(face.state.blink > 0.95);
  face.update(4.5);
  assert.equal(face.state.blink, 0);
  face.reducedMotion = true;
  face.lookAt(1, 1); advance(face, 1);
  assert.equal(face.state.gazeX, 0);
  face.update(face.blinkAt + 0.11);
  assert.equal(face.state.blink, 0);
});

test('mood state machine accumulates anger, shifts expressions, and naturally cools down', () => {
  const face = new FaceMotion();
  assert.equal(face.mood, 'chill');
  assert.equal(face.anger, 0);

  // Provoke into annoyed
  face.addAnger(0.4);
  assert.equal(face.mood, 'annoyed');
  advance(face, 0.25);
  assert.ok(face.state.annoyed > 0.5);

  // Provoke further into rage
  face.addAnger(0.4);
  assert.equal(face.mood, 'rage');
  advance(face, 0.25);
  assert.ok(face.state.angry > 0.5);

  // High anger release triggers angry reaction instead of happy celebration
  face.grab(true);
  face.grab(false, true);
  advance(face, 0.3);
  assert.equal(face.expression, 'angry');

  // Natural anger decay over several seconds without disturbance
  advance(face, 12);
  assert.equal(face.anger, 0);
  assert.equal(face.mood, 'chill');
});

test('sleep system enables napping when calm and triggers startled wake-up on poke', () => {
  const face = new FaceMotion();
  face.fallAsleep();
  assert.equal(face.isSleeping, true);
  assert.equal(face.mood, 'sleepy');
  advance(face, 0.4);
  assert.ok(face.state.sleepy > 0.8);

  // Sudden touch startles awake
  face.wakeUp(true);
  assert.equal(face.isSleeping, false);
  advance(face, 0.2);
  assert.equal(face.expression, 'startle');
  assert.ok(face.state.startle > 0.7);

  // Angry softie refuses to fall asleep
  face.reset();
  face.addAnger(0.7);
  face.fallAsleep();
  assert.equal(face.isSleeping, false, 'cannot fall asleep when enraged');
});
