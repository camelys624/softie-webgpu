import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeSlime } from '../src/slime.js';
import { JellyPhysics } from '../src/physics.js';

test('body and face use the exact same point deformation during a grab', () => {
  const physics = new JellyPhysics();
  const slime = makeSlime(physics);
  physics.beginGrab({ x: 0.35, y: 1.2, z: 1 }, { x: 0.35, y: 1.2, z: 1 });
  physics.moveGrab({ x: 0.85, y: 2.1, z: 1 });
  slime.faceMotion.grab(true);
  slime.faceMotion.lookAt(0.8, -0.3);
  for (let i = 0; i < 40; i++) physics.update(1 / 120);
  slime.update(0.4);
  const expected = {};
  for (const geometry of [slime.body.geometry, slime.face.geometry]) {
    const rest = geometry.userData.posed ?? geometry.userData.rest;
    const current = geometry.attributes.position.array;
    for (let n = 0; n < rest.length; n += 33) {
      physics.deform(rest[n], rest[n + 1], rest[n + 2], expected);
      assert.ok(Math.abs(current[n] - expected.x) < 1e-6);
      assert.ok(Math.abs(current[n + 1] - expected.y) < 1e-6);
      assert.ok(Math.abs(current[n + 2] - expected.z) < 1e-6);
    }
  }
  assert.equal(slime.group.position.x, physics.position.x);
  assert.ok(slime.faceMotion.state.squish > 0.5);
  assert.equal(slime.group.getObjectByName('rear-glass-interface').geometry, slime.body.geometry);
  slime.dispose();
});

test('glass palette tints transmission without darkening the surface and resets consistently', () => {
  const slime = makeSlime(new JellyPhysics());
  const initial = slime.gel.attenuationColor.clone();
  for (const color of ['#a4dfd0', '#c7aaf0', '#f17fa9', '#ff8833', '#33aaff']) {
    slime.setColor(color);
    assert.deepEqual(slime.gel.color.toArray(), [1, 1, 1]);
    assert.equal(Math.max(...slime.gel.attenuationColor.toArray()), 1);
    assert.equal(slime.gel.transmission, 1);
    assert.ok(slime.face.material.color.r < 0.05, 'bright colors keep black eyes');
  }
  // Pure black obsidian test: no NaN, dark attenuation absorption, eyes invert to light
  slime.setColor('#000000');
  assert.ok(!Number.isNaN(slime.gel.attenuationColor.r), 'no NaN on pure black');
  assert.ok(slime.gel.attenuationColor.r < 0.05, 'attenuation absorbs heavily for black');
  assert.ok(slime.face.material.color.r > 0.08, 'eyes adapt to porcelain color on black body');
  assert.ok(slime.face.material.roughness < 0.1, 'white eyes have high gloss / low roughness');

  slime.setColor('#f17fa9');
  assert.ok(slime.gel.attenuationColor.equals(initial));
  assert.ok(slime.face.material.color.r < 0.05, 'face resets to black on strawberry');
  slime.dispose();
});

test('bubbles visibly drift at independent speeds and follow the body deformation', () => {
  const physics = new JellyPhysics();
  const slime = makeSlime(physics);
  slime.update(0);
  const before = Float32Array.from(slime.bubbles.instanceMatrix.array);
  slime.update(3);
  const after = Float32Array.from(slime.bubbles.instanceMatrix.array);
  let rising = 0, drifting = 0;
  const speeds = new Set();
  for (let i = 0; i < slime.bubbles.count; i++) {
    const n = i * 16;
    if (after[n + 13] - before[n + 13] > 0.07) rising++;
    if (Math.abs(after[n + 12] - before[n + 12]) > 0.01) drifting++;
    speeds.add(Math.round((after[n + 13] - before[n + 13]) * 100));
  }
  assert.ok(rising > 90);
  assert.ok(drifting > 60);
  assert.ok(speeds.size > 6);
  slime.update(1);
  slime.update(3);
  assert.deepEqual(slime.bubbles.instanceMatrix.array, after, 'absolute-time motion is frame-rate independent');

  physics.beginGrab({ x: 0.3, y: 1.2, z: 1 }, { x: 0.3, y: 1.2, z: 1 });
  physics.moveGrab({ x: 0.8, y: 2.0, z: 1 });
  for (let i = 0; i < 40; i++) physics.update(1 / 120);
  slime.update(3);
  const out = {};
  for (let i = 0; i < slime.bubbles.count; i++) {
    const n = i * 16;
    physics.deform(after[n + 12], after[n + 13], after[n + 14], out);
    assert.ok(Math.hypot(
      slime.bubbles.instanceMatrix.array[n + 12] - out.x,
      slime.bubbles.instanceMatrix.array[n + 13] - out.y,
      slime.bubbles.instanceMatrix.array[n + 14] - out.z,
    ) < 1e-6);
  }
  slime.dispose();
});

test('bubble loops remain inside the gel and wrap only at invisible sizes', () => {
  const slime = makeSlime(new JellyPhysics());
  const radiusAt = y => {
    const c = Math.pow(Math.max(0, Math.min(1, (y - 0.035) / 2.36)), 1 / 1.28) * 2 - 1;
    return Math.pow(Math.sqrt(Math.max(0, 1 - c * c)), 0.82) * (1 - 0.07 * c);
  };
  let previous, wraps = 0;
  for (let frame = 0; frame <= 360; frame++) {
    slime.update(frame / 4);
    const current = slime.bubbles.instanceMatrix.array;
    assert.ok(current.every(Number.isFinite));
    for (let i = 0; i < slime.bubbles.count; i++) {
      const n = i * 16;
      const x = current[n + 12], y = current[n + 13], z = current[n + 14];
      const size = current[n];
      assert.ok(size > 0, 'instance transforms never become singular');
      const narrowest = Math.min(radiusAt(y - size * 1.12), radiusAt(y + size * 1.12));
      assert.ok(Math.hypot(x / 1.66, z / 1.18) + size / 1.18 < narrowest);
      if (previous && previous[n + 13] - y > 1) {
        wraps++;
        assert.ok(size < 0.003 && previous[n] < 0.003, 'wrap is hidden by the fade');
      }
    }
    previous = Float32Array.from(current);
  }
  assert.ok(wraps > slime.bubbles.count);
  slime.dispose();
});

test('mesh and normal buffers remain finite through repeated impacts', () => {
  const physics = new JellyPhysics();
  const slime = makeSlime(physics);
  for (let frame = 0; frame < 180; frame++) {
    if (frame % 25 === 0) physics.poke();
    physics.update(1 / 60);
    slime.update(frame / 60);
  }
  for (const geometry of [slime.body.geometry, slime.face.geometry]) {
    for (const key of ['position', 'normal']) {
      assert.ok(geometry.attributes[key].array.every(Number.isFinite), key);
    }
  }
  assert.equal(slime.bubbles.count, 116);
  slime.dispose();
});

test('renderer registers only a WebGPU backend and no automatic fallback', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /new THREE\.Renderer\(new THREE\.WebGPUBackend/);
  assert.match(source, /getFallback: null/);
  assert.doesNotMatch(source, /new THREE\.(WebGLRenderer|WebGLBackend|WebGPURenderer)/);
});

test('dizzy stars halo activates only during dizzy reaction and animates stably', () => {
  const slime = makeSlime(new JellyPhysics());
  slime.update(0);
  assert.equal(slime.dizzyStars.visible, false, 'hidden when idle');
  slime.faceMotion.react('dizzy');
  for (let t = 0.02; t <= 0.5; t += 0.02) slime.update(t);
  assert.equal(slime.dizzyStars.visible, true, 'visible when dizzy');
  assert.equal(slime.dizzyStars.children.length, 5, 'contains 5 spinning stars');
  for (const star of slime.dizzyStars.children) {
    assert.ok(Number.isFinite(star.position.x));
    assert.ok(Number.isFinite(star.position.y));
    assert.ok(Number.isFinite(star.position.z));
    assert.ok(star.scale.x > 0);
  }
  for (let t = 0.52; t <= 4.0; t += 0.02) slime.update(t);
  assert.equal(slime.dizzyStars.visible, false, 'hidden after dizzy settles');
  slime.dispose();
});

test('worker accessories switch visibility and follow soft-body deformation field', () => {
  const physics = new JellyPhysics();
  const slime = makeSlime(physics);

  assert.equal(slime.accessory, 'none');
  assert.equal(slime.accessories.badge.group.visible, false);
  assert.equal(slime.accessories.darkCircles.group.visible, false);
  assert.equal(slime.accessories.bandaid.group.visible, false);

  // Switch to badge
  slime.setAccessory('badge');
  assert.equal(slime.accessory, 'badge');
  assert.equal(slime.accessories.badge.group.visible, true);
  assert.equal(slime.accessories.darkCircles.group.visible, false);
  assert.equal(slime.accessories.bandaid.group.visible, false);

  // Switch to coffee
  slime.setAccessory('coffee');
  assert.equal(slime.accessory, 'coffee');
  assert.equal(slime.accessories.coffee.group.visible, true);
  assert.equal(slime.accessories.badge.group.visible, false);

  // Switch to darkCircles (compatibility alias)
  slime.setAccessory('darkCircles');
  assert.equal(slime.accessory, 'darkCircles');
  assert.equal(slime.accessories.badge.group.visible, false);
  assert.equal(slime.accessories.darkCircles.group.visible, true);

  // Switch to bandaid and deform
  slime.setAccessory('bandaid');
  assert.equal(slime.accessory, 'bandaid');
  assert.equal(slime.accessories.bandaid.group.visible, true);

  physics.beginGrab({ x: -0.3, y: 1.4, z: 1 }, { x: -0.3, y: 1.4, z: 1 });
  physics.moveGrab({ x: -0.6, y: 2.2, z: 1 });
  for (let i = 0; i < 30; i++) physics.update(1 / 120);
  slime.update(0.3);

  for (const mesh of slime.accessories.bandaid.meshes) {
    const pos = mesh.geometry.attributes.position.array;
    assert.ok(pos.every(Number.isFinite));
  }

  // Switch back to none
  slime.setAccessory('none');
  assert.equal(slime.accessory, 'none');
  assert.equal(slime.accessories.bandaid.group.visible, false);

  slime.dispose();
});

test('3D anger cross pops on right forehead during rage, uses renderOrder 5, and pulses stably', () => {
  const physics = new JellyPhysics();
  const slime = makeSlime(physics);

  slime.update(0);
  assert.equal(slime.angerCross.visible, false, 'hidden when idle');
  assert.equal(slime.angerCross.renderOrder, 5, 'renderOrder 5 ensures top compositing over gel');

  // Trigger rage
  slime.faceMotion.react('angry');
  for (let t = 0.05; t <= 0.4; t += 0.05) slime.update(t);

  assert.equal(slime.angerCross.visible, true, 'visible during rage');
  assert.ok(slime.angerCross.position.x > 0.25, 'located on right side of forehead');
  assert.ok(slime.angerCross.position.y > 1.50, 'located well above eye level');
  assert.ok(slime.angerCross.position.z > 0.80, 'located in front of slime surface');
  assert.ok(slime.angerCross.scale.x > 0.40, 'scaled up during rage');
  assert.ok(Number.isFinite(slime.angerCross.rotation.z), 'rotation angle is finite');

  // After rage finishes and anger completely settles
  slime.faceMotion.calmDown(1.0);
  for (let t = 0.5; t <= 3.5; t += 0.1) slime.update(t);
  assert.equal(slime.angerCross.visible, false, 'hidden after rage settles');

  slime.dispose();
});
