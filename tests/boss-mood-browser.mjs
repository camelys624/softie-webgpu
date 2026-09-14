import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const errors = [];
await mkdir('artifacts', { recursive: true });
async function ignored(page, fast = true) {
  await page.evaluate(fast => {
    const { boss } = window.__SOFTIE__;
    if (!boss.summon()) throw new Error('summon failed');
    if (fast) boss.encounter.startedAt = performance.now() - 9400;
  }, fast);
  await page.waitForFunction(() => !window.__SOFTIE__.boss.encounter.active);
}
const face = page => page.evaluate(() => window.__SOFTIE__.getDiagnostics().face);
const center = page => page.evaluate(() => {
  const api = window.__SOFTIE__;
  const p = api.slime.group.position.clone();
  p.y += 1.2; p.z += 1.1; p.project(api.camera);
  const r = document.querySelector('#slime-canvas').getBoundingClientRect();
  return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
});
try {
  for (const pet of [false, true]) {
    const page = await browser.newPage({ viewport: pet ? { width: 340, height: 300 } : { width: 1440, height: 1000 }, hasTouch: pet });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/?test=1${pet ? '&pet=1' : ''}`);
    await page.waitForFunction(() => window.__SOFTIE__?.getDiagnostics().frames > 5 && document.querySelector('#stage').getAttribute('aria-busy') === 'false', null, { timeout: 45000 });
    await page.waitForTimeout(1000);
    await ignored(page, pet);
    assert.equal((await face(page)).mood, 'sad');
    assert.equal((await face(page)).sadnessCount, 1);
    await page.waitForTimeout(300);
    assert.ok((await face(page)).sad > 0.9);
    await page.screenshot({ path: `artifacts/boss-sad-${pet ? 'pet' : 'web'}.png` });
    if (!pet) {
      assert.equal(await page.locator('#rage-hud-badge').innerText(), '怎么又不算数了…');
      assert.equal(await page.locator('#rage-meter-hud').getAttribute('data-mood'), 'sad');
      await page.locator('[data-language="en"]').click();
      assert.equal(await page.locator('#rage-hud-badge').innerText(), 'Moving the goalposts again…');
      const p = await center(page);
      await page.mouse.click(p.x, p.y);
    } else {
      const p = await center(page);
      await page.touchscreen.tap(p.x, p.y);
    }
    await page.waitForFunction(() => window.__SOFTIE__.slime.faceMotion.mood === 'recovering');
    if (!pet) assert.equal(await page.locator('#rage-hud-badge').innerText(), 'At least you get me.');
    await page.waitForTimeout(400);
    assert.ok((await face(page)).sad > 0 && (await face(page)).sad < 1);
    await page.waitForFunction(() => window.__SOFTIE__.slime.faceMotion.mood === 'chill', null, { timeout: 2500 });
    assert.equal((await face(page)).sadnessCount, 0);
    if (!pet) {
      assert.equal(await page.locator('#rage-hud-badge').innerText(), 'He’s wrong. I did good work.');
      await page.locator('[data-language="zh"]').click();
      assert.equal(await page.locator('#rage-hud-badge').innerText(), '他说的不算，我做得很好。');
      await page.screenshot({ path: 'artifacts/boss-workmate-recovered.png' });
    }
    await ignored(page); await ignored(page);
    assert.equal((await face(page)).sadnessCount, 2);
    assert.equal((await face(page)).comfortDuration, 3.2);
    await page.locator('#slime-canvas').focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    const elapsed = (await face(page)).comfortElapsed;
    for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
    assert.ok((await face(page)).comfortElapsed >= elapsed, 'rapid reassurance keeps recovery progress');
    assert.equal((await face(page)).angerLevel, 0);
    await page.waitForTimeout(1000);
    assert.equal((await face(page)).mood, 'recovering', 'two ignored visits take longer than one');
    await page.waitForFunction(() => window.__SOFTIE__.slime.faceMotion.mood === 'chill');
    await ignored(page); await ignored(page);
    assert.equal((await face(page)).sadnessCount, 2);
    await page.evaluate(() => { const { boss } = window.__SOFTIE__; boss.summon(); boss.hit(); });
    await page.waitForFunction(() => !window.__SOFTIE__.boss.encounter.active);
    assert.equal((await face(page)).sadnessCount, 0, 'defeating the boss clears earlier sadness');
    assert.equal((await face(page)).mood, 'happy');
    assert.equal((await face(page)).sad, 0);
    if (!pet) assert.equal(await page.locator('#rage-hud-badge').innerText(), '终于清净了，摸会儿鱼。');
    await page.waitForTimeout(1600);
    assert.equal((await face(page)).mood, 'happy', 'happiness lasts longer than a brief reaction');
    assert.ok((await face(page)).happy > 0.9);
    await page.screenshot({ path: `artifacts/boss-victory-${pet ? 'pet' : 'web'}.png` });
    const cooldown = await page.evaluate(() => window.__SOFTIE__.boss.encounter.nextAt - performance.now());
    assert.ok(cooldown > 177000 && cooldown < 300000);
    await page.evaluate(() => { const { boss } = window.__SOFTIE__; boss.summon(); boss.reset(); });
    assert.equal((await face(page)).sadnessCount, 0, 'cancellation does not count as an ignored visit');
    await ignored(page);
    await page.evaluate(() => document.querySelector('#reset').click());
    assert.equal((await face(page)).sadnessCount, 0);
    console.log(`PASS ${pet ? 'touch pet' : 'mouse web'}: ignored boss, sad face, comfort, accumulation, keyboard, defeat and reset`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
