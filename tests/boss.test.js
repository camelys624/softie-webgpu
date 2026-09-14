import test from 'node:test';
import assert from 'node:assert/strict';
import { BossEncounter } from '../src/boss.js';
import { bossPose } from '../src/boss-pose.js';
import { hammerPlacement } from '../src/magic-hammer.js';
import { BOSS_DIALOGUES } from '../src/boss-dialogue.js';

test('every configured dialogue is selectable and consecutive visits cannot repeat', () => {
  const count = BOSS_DIALOGUES.length;
  for (let i = 0; i < count; i++) {
    const { boss } = fixture(() => (i + 0.5) / count);
    boss.start();
    assert.equal(boss.line, i);
    const previous = boss.line;
    assert.equal(boss.start(), false);
    assert.equal(boss.line, previous, 'a visit keeps its dialogue');
    for (let j = 0; j < count * 2; j++) {
      const last = boss.line;
      boss.end(); boss.start();
      assert.notEqual(boss.line, last);
      for (const lang of ['zh', 'en']) {
        assert.ok(BOSS_DIALOGUES[boss.line][lang].line);
        assert.ok(BOSS_DIALOGUES[boss.line][lang].apology);
      }
    }
  }
});

test('enlarged hammer stays in the smallest window and leaves the face visible', () => {
  const face = { left: 98, top: 125, right: 157, bottom: 178 };
  const rect = hammerPlacement({ x: 128, y: 152 }, { width: 255, height: 225 },
    { width: 88, height: 96.8 }, face, { left: 14, right: 244, top: 19, bottom: 82 });
  assert.ok(rect.left >= 0 && rect.right <= 255 && rect.top >= 0 && rect.bottom <= 225);
  assert.ok(rect.left >= face.right || rect.right <= face.left || rect.bottom <= face.top || rect.top >= face.bottom);
});

test('boss goes from smug to shocked, defiant, panic and exit within the five-second deadline', () => {
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
  const departure = bossPose(boss, 6800);
  assert.equal(departure.phase, 'exit');
  assert.ok(departure.exit > 0 && departure.exit < 1);
  assert.equal(departure.relief, 1, 'the pet is already smiling while the costume is still airborne');
  assert.equal(bossPose(boss, 6800, true).shake, 0);
  at(7000); boss.update(); assert.equal(bossPose(boss, 7000), null);
});

function fixture(random = () => 0) {
  let time = 0;
  const boss = new BossEncounter({ now: () => time, random });
  return { boss, at(value) { time = value; } };
}

test('random visits respect cooldown and defer while the pet is being dragged', () => {
  const { boss, at } = fixture(() => 0.5);
  assert.equal(boss.nextAt, 240000);
  at(239999); boss.update(); assert.equal(boss.active, false);
  at(240000); boss.update(false); assert.equal(boss.active, false);
  at(241000); boss.update(); assert.equal(boss.active, true);
  assert.equal(boss.startedAt, 241000);
});

test('an ignored boss leaves exactly ten seconds after arriving', () => {
  const { boss, at } = fixture();
  boss.start();
  at(9999); boss.update(); assert.equal(boss.active, true);
  at(10000); boss.update(); assert.equal(boss.active, false);
  assert.equal(boss.nextAt, 190000);
});

test('first hit starts a fixed five-second exit deadline; repeated hits never extend it', () => {
  const { boss, at } = fixture();
  boss.start();
  at(9800); assert.equal(boss.hit(), true);
  assert.equal(boss.deadline, 14800);
  at(9900); assert.equal(boss.hit(), false);
  at(10000); boss.update(); assert.equal(boss.active, true);
  assert.equal(boss.hit(), true);
  at(14799); assert.equal(boss.hit(), true);
  assert.equal(boss.hits, 3);
  assert.equal(boss.deadline, 14800);
  at(14800); assert.equal(boss.hit(), false);
  boss.update(); assert.equal(boss.active, false);
});

test('expired bosses reject late clicks even before the next animation frame', () => {
  const { boss, at } = fixture();
  boss.start(); at(10001);
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
  assert.equal(boss.nextAt, 181000);
  boss.start(); assert.equal(boss.hits, 0);
  assert.equal(boss.firstHitAt, null);
});

test('automatic visits wait three to five minutes, including after a successful hit', () => {
  for (const random of [0, 0.5, 0.999999]) {
    const { boss, at } = fixture(() => random);
    assert.ok(boss.nextAt >= 180000 && boss.nextAt <= 300000);
    boss.start(); boss.hit();
    at(5000); boss.update();
    assert.ok(boss.nextAt - 5000 >= 180000 && boss.nextAt - 5000 <= 300000);
    at(184999); boss.update();
    assert.equal(boss.active, false);
    assert.equal(boss.start(), true, 'manual summons remain available during the cooldown');
  }
});
