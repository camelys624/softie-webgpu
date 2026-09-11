import test from 'node:test';
import assert from 'node:assert/strict';
import { RageMeter } from '../src/rage-meter.js';

test('RageMeter instantiates and safely handles headless updates and pulse', () => {
  const meter = new RageMeter();
  assert.equal(meter.progress, 0);
  assert.equal(meter.mood, 'chill');
  assert.equal(meter.hitFlash, 0);

  // Pulse adds hitFlash and slosh velocity
  meter.pulse(1.2);
  assert.equal(meter.hitFlash, 1.0);
  assert.ok(meter.scaleVelX > 0);
  assert.ok(meter.scaleVelY < 0);

  // Update progresses anger smoothly
  meter.update(0.1, 0.5, 'annoyed', false);
  assert.equal(meter.progress, 0.5);
  assert.equal(meter.mood, 'annoyed');
  assert.ok(meter.displayProgress > 0);
  assert.ok(meter.hitFlash < 1.0);

  // Max rage updates
  meter.update(0.1, 1.0, 'rage', false);
  assert.equal(meter.progress, 1.0);
  assert.equal(meter.mood, 'rage');

  // Sleep mode updates
  meter.update(0.1, 0.0, 'sleepy', true);
  assert.equal(meter.isSleeping, true);

  // Reset clears state
  meter.reset();
  assert.equal(meter.progress, 0);
  assert.equal(meter.displayProgress, 0);
  assert.equal(meter.hitFlash, 0);
  assert.equal(meter.mood, 'chill');

  // Dispose handles safely
  meter.dispose();
});
