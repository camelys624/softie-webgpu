import test from 'node:test';
import assert from 'node:assert/strict';
import { BossEncounter } from '../src/boss.js';
import { bossPose } from '../src/boss-pose.js';
import { hammerPlacement } from '../src/magic-hammer.js';

test('enlarged hammer stays in the smallest window and leaves the face visible', () => {
  const face = { left: 98, top: 125, right: 157, bottom: 178 };
  const rect = hammerPlacement({ x: 128, y: 152 }, { width: 255, height: 225 },
    { width: 88, height: 96.8 }, face, { left: 14, right: 244, top: 19, bottom: 82 });
  assert.ok(rect.left >= 0 && rect.right <= 255 && rect.top >= 0 && rect.bottom <= 225);
  assert.ok(rect.left >= face.right || rect.right <= face.left || rect.bottom <= face.top || rect.top >= face.bottom);
});

test('boss goes from smug to shocked, defiant, panic and exit within the two-second deadline', () => {
  const { boss, at } = fixture();
  assert.equal(bossPose(boss, 0), null);
  boss.start();
  assert.equal(bossPose(boss, 0).phase, 'lecture');
  assert.ok(bossPose(boss, 1700).point > 0.9);
  assert.equal(bossPose(boss, 1700, true).point, 0);
  at(2000); boss.hit();
  assert.equal(bossPose(boss, 2010).phase, 'shocked');
  assert.equal(bossPose(boss, 2400).phase, 'defiant');
  at(2400); boss.hit(); at(2600); boss.hit();
  assert.equal(bossPose(boss, 2600).phase, 'panic');
  const departure = bossPose(boss, 3800);
  assert.equal(departure.phase, 'exit');
  assert.ok(departure.exit > 0 && departure.exit < 1);
  assert.equal(departure.relief, 1, 'the pet is already smiling while the costume is still airborne');
  assert.equal(bossPose(boss, 3800, true).shake, 0);
  at(4000); boss.update(); assert.equal(bossPose(boss, 4000), null);
});

function fixture(random = () => 0) {
  let time = 0;
  const boss = new BossEncounter({ now: () => time, random });
  return { boss, at(value) { time = value; } };
}

test('random visits respect cooldown and defer while the pet is being dragged', () => {
  const { boss, at } = fixture(() => 0.5);
  assert.equal(boss.nextAt, 40000);
  at(39999); boss.update(); assert.equal(boss.active, false);
  at(40000); boss.update(false); assert.equal(boss.active, false);
  at(41000); boss.update(); assert.equal(boss.active, true);
  assert.equal(boss.startedAt, 41000);
});

test('an ignored boss leaves exactly five seconds after arriving', () => {
  const { boss, at } = fixture();
  boss.start();
  at(4999); boss.update(); assert.equal(boss.active, true);
  at(5000); boss.update(); assert.equal(boss.active, false);
  assert.equal(boss.nextAt, 30000);
});

test('first hit starts a fixed two-second exit deadline; repeated hits never extend it', () => {
  const { boss, at } = fixture();
  boss.start();
  at(4800); assert.equal(boss.hit(), true);
  assert.equal(boss.deadline, 6800);
  at(4900); assert.equal(boss.hit(), false);
  at(5000); boss.update(); assert.equal(boss.active, true);
  assert.equal(boss.hit(), true);
  at(6799); assert.equal(boss.hit(), true);
  assert.equal(boss.hits, 3);
  assert.equal(boss.deadline, 6800);
  at(6800); assert.equal(boss.hit(), false);
  boss.update(); assert.equal(boss.active, false);
});

test('expired bosses reject late clicks even before the next animation frame', () => {
  const { boss, at } = fixture();
  boss.start(); at(5001);
  assert.equal(boss.hit(), false);
  boss.update(); assert.equal(boss.active, false);
});

test('summoning twice cannot reset a visit; reset clears it and reschedules', () => {
  const { boss, at } = fixture();
  assert.equal(boss.hit(), false);
  boss.start(); at(1000);
  assert.equal(boss.start(), false);
  assert.equal(boss.startedAt, 0);
  boss.hit(); boss.end();
  assert.equal(boss.active, false);
  assert.equal(boss.nextAt, 26000);
  boss.start(); assert.equal(boss.hits, 0);
  assert.equal(boss.firstHitAt, null);
});
