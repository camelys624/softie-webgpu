import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('artifacts', { recursive: true });
const errors = [];
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
async function ready(page, query = '?test=1') {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/' + query);
  await page.waitForFunction(() => window.__SOFTIE__?.getDiagnostics().frames > 5 && document.querySelector('#stage').getAttribute('aria-busy') === 'false', null, { timeout: 45000 });
  await page.waitForTimeout(1000);
}
async function summon(page) {
  assert.equal(await page.evaluate(() => window.__SOFTIE__.boss.summon()), true);
  await page.waitForFunction(() => document.querySelector('.boss-bubble').offsetHeight > 0);
}
async function center(page) {
  return page.evaluate(() => {
    const api = window.__SOFTIE__;
    const p = api.slime.group.position.clone();
    p.y += 1.25;
    p.project(api.camera);
    const r = document.querySelector('#slime-canvas').getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await ready(page);
  await page.locator('#boss-summon').click();
  assert.equal(await page.evaluate(() => window.__SOFTIE__.boss.encounter.active), true);
  assert.equal(await page.evaluate(() => window.__SOFTIE__.slime.group.visible && window.__SOFTIE__.slime.body.visible), true);
  assert.equal(await page.evaluate(() => window.__SOFTIE__.boss.pose.phase), 'lecture');
  assert.equal(await page.evaluate(() => window.__SOFTIE__.slime.face.geometry.drawRange.start), 0);
  const target = await center(page);
  await page.mouse.move(target.x, target.y);
  assert.equal(await page.locator('.boss-hammer').isVisible(), true);
  assert.ok((await page.locator('.boss-hammer').boundingBox()).width >= 160);
  await page.screenshot({ path: 'artifacts/boss-web.png' });
  await page.mouse.down();
  await page.waitForTimeout(650);
  const held = await page.evaluate(() => window.__SOFTIE__.getDiagnostics());
  assert.ok(held.boss.hits >= 3);
  assert.equal(held.boss.phase, 'panic');
  assert.equal(held.physics.dragging, false);
  assert.equal(await page.locator('.boss-purify').isVisible(), true);
  const starCount = await page.locator('.boss-impact-star').count();
  assert.ok(starCount >= 3 && starCount <= 6, 'held hits keep at most two sparse bursts');
  await page.screenshot({ path: 'artifacts/boss-hit.png' });
  await page.waitForFunction(() => window.__SOFTIE__.boss.pose?.phase === 'exit');
  await page.screenshot({ path: 'artifacts/boss-exit.png' });
  await page.waitForFunction(() => !window.__SOFTIE__.boss.encounter.active, null, { timeout: 3000 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__SOFTIE__.slime.group.visible), true);
  assert.equal(await page.evaluate(() => window.__SOFTIE__.slime.bossPose), null);
  assert.equal(await page.locator('.boss-hammer').isVisible(), false);
  assert.equal(await page.locator('.boss-purify').isVisible(), false);
  assert.equal(await page.locator('.boss-impact-star').count(), 0, 'departure clears impact particles');
  assert.equal(await page.evaluate(() => window.__SOFTIE__.slime.face.geometry.drawRange.start), 0);
  await page.waitForTimeout(700);
  const restored = await center(page);
  await page.mouse.move(restored.x, restored.y);
  await page.mouse.down();
  assert.equal(await page.evaluate(() => window.__SOFTIE__.getDiagnostics().physics.dragging), true);
  await page.mouse.up();
  console.log('PASS web summon, hammer hover, hold-to-hit, timed exit and slime restoration');

  await summon(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(9100);
  assert.equal(await page.evaluate(() => window.__SOFTIE__.boss.encounter.active), true);
  await page.waitForFunction(() => !window.__SOFTIE__.boss.encounter.active, null, { timeout: 2000 });
  console.log('PASS ignored boss exits after ten seconds');

  await summon(page);
  const pt = await center(page);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(0, 0);
  const before = await page.evaluate(() => window.__SOFTIE__.boss.encounter.hits);
  await page.waitForTimeout(550);
  assert.equal(await page.evaluate(() => window.__SOFTIE__.boss.encounter.hits), before);
  await page.mouse.up();
  await page.evaluate(() => window.__SOFTIE__.boss.reset());
  await page.locator('[data-language="en"]').click();
  await summon(page);
  await page.waitForFunction(() => /[a-z]/i.test(document.querySelector('.boss-bubble p').textContent));
  assert.equal(await page.locator('.boss-bubble').evaluate(e => e.children.length), 1);
  await page.locator('#slime-canvas').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__SOFTIE__.boss.encounter.hits), 1);
  await page.evaluate(() => window.__SOFTIE__.boss.reset());
  console.log('PASS off-target hits stop, language switch, keyboard and reset');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.__SOFTIE__.slime.setColor('#a5e0cd');
    window.__SOFTIE__.slime.setAccessory('badge');
  });
  await summon(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  const quiet = await page.evaluate(() => ({
    pose: window.__SOFTIE__.boss.pose,
    effects: window.__SOFTIE__.boss.model.group.children.filter(m => m.userData.rig === 'effect').some(m => m.visible),
  }));
  assert.equal(quiet.pose.point, 0);
  assert.equal(quiet.pose.shake, 0);
  assert.equal(quiet.effects, false);
  assert.equal(await page.locator('.boss-purify').isVisible(), false);
  await page.waitForFunction(() => !window.__SOFTIE__.boss.encounter.active);
  assert.deepEqual(await page.evaluate(() => ({ color: window.__SOFTIE__.slime.color, accessory: window.__SOFTIE__.slime.accessory, pose: window.__SOFTIE__.slime.bossPose })), { color: '#a5e0cd', accessory: 'badge', pose: null });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await summon(page);
  const cancelPoint = await center(page);
  await page.mouse.move(cancelPoint.x, cancelPoint.y);
  await page.mouse.down();
  await page.evaluate(() => document.querySelector('#slime-canvas').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
  const cancelHits = await page.evaluate(() => window.__SOFTIE__.boss.encounter.hits);
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => window.__SOFTIE__.boss.encounter.hits), cancelHits);
  await page.mouse.up();
  await page.evaluate(() => window.__SOFTIE__.boss.reset());
  console.log('PASS reduced motion, outfit/color preservation and pointer cancellation');

  for (const [size, width, height] of [['small', 255, 225], ['medium', 340, 300], ['large', 476, 420]]) {
    const pet = await browser.newPage({ viewport: { width, height } });
    await ready(pet, `?pet=1&test=1&size=${size}`);
    await summon(pet);
    const p = await center(pet);
    await pet.mouse.move(p.x, p.y);
    assert.equal(await pet.locator('.boss-hammer').isVisible(), true);
    const hammer = await pet.locator('.boss-hammer').boundingBox();
    assert.ok(hammer.width >= 88 && hammer.x >= 0 && hammer.y >= 0 && hammer.x + hammer.width <= width && hammer.y + hammer.height <= height);
    assert.ok(p.x < hammer.x || p.x > hammer.x + hammer.width || p.y < hammer.y || p.y > hammer.y + hammer.height, 'hovered face point remains visible');
    const bubble = await pet.locator('.boss-bubble').boundingBox();
    assert.ok(bubble.x >= 0 && bubble.x + bubble.width <= width && bubble.y >= 0 && bubble.y + bubble.height <= height);
    await pet.screenshot({ path: `artifacts/boss-pet-${size}.png` });
    await pet.mouse.click(p.x, p.y);
    assert.equal(await pet.evaluate(() => window.__SOFTIE__.boss.encounter.hits), 1);
    await pet.evaluate(() => window.__SOFTIE__.boss.reset());
    await pet.locator('[data-language="en"]').evaluate(button => button.click());
    await summon(pet);
    await pet.waitForFunction(() => /[a-z]/i.test(document.querySelector('.boss-bubble p').textContent));
    await pet.screenshot({ path: `artifacts/boss-pet-${size}-en.png` });
    await pet.close();
    console.log(`PASS ${size} pet framing, bubble bounds and hammer interaction`);
  }
  const touch = await browser.newPage({ viewport: { width: 340, height: 300 }, hasTouch: true });
  await ready(touch, '?pet=1&test=1');
  await summon(touch);
  const touchPoint = await center(touch);
  await touch.touchscreen.tap(touchPoint.x, touchPoint.y);
  await touch.waitForTimeout(70);
  assert.equal(await touch.evaluate(() => window.__SOFTIE__.boss.encounter.hits), 1);
  assert.equal(await touch.locator('.boss-purify').isVisible(), true);
  assert.equal(await touch.locator('.boss-hammer').isVisible(), false);
  await touch.close();
  console.log('PASS touch tap retains purification burst after release');
  assert.deepEqual(errors, []);
  console.log('PASS no browser errors');
} finally { await browser.close(); }
