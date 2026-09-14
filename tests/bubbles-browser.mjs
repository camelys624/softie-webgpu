import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const errors = [];
await mkdir('artifacts', { recursive: true });
const visibleMood = (page, mood) => page.waitForFunction(mood => {
  const e = document.querySelector('.mood-bubble');
  return !e.hidden && e.dataset.mood === mood && Number(e.style.opacity) > 0.9;
}, mood);
async function bounds(page, selector) {
  const result = await page.evaluate(selector => {
    const api = window.__SOFTIE__;
    const r = document.querySelector('#slime-canvas').getBoundingClientRect();
    const project = (x, y) => {
      const p = api.slime.group.position.clone();
      api.physics.deform(x, y, 1.24, p);
      p.add(api.physics.position).project(api.camera);
      return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
    };
    const a = project(-0.64, 1.58), b = project(0.64, 0.88);
    const e = document.querySelector(selector).getBoundingClientRect();
    return { inWindow: e.left >= 0 && e.right <= innerWidth && e.top >= 0 && e.bottom + 5 <= innerHeight,
      clearFace: e.right <= a.x || e.left >= b.x || e.bottom + 6 <= a.y || e.top >= b.y,
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }, selector);
  assert.ok(result.inWindow && result.clearFace, `${selector} stays in the window and clear of the face`);
  return result;
}
try {
  for (const [size, width, height] of [['small', 255, 225], ['medium', 340, 300], ['large', 476, 420]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/?pet=1&test=1`);
    await page.waitForFunction(() => window.__SOFTIE__?.getDiagnostics().frames > 5 && document.querySelector('#stage').getAttribute('aria-busy') === 'false', null, { timeout: 45000 });
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.mood-bubble').isVisible(), false);
    await page.evaluate(() => window.__SOFTIE__.slime.faceMotion.bossIgnored());
    await visibleMood(page, 'sad');
    assert.equal(await page.locator('.mood-bubble').innerText(), '怎么又不算数了…');
    await bounds(page, '.mood-bubble');
    await page.screenshot({ path: `artifacts/mood-bubble-${size}.png` });
    await page.evaluate(() => window.__SOFTIE__.boss.summon());
    await page.waitForFunction(() => document.querySelector('.boss-bubble p').textContent.length > 0);
    assert.equal(await page.locator('.mood-bubble').isVisible(), false);
    assert.equal(await page.locator('.boss-bubble').evaluate(e => e.children.length === 1 && e.firstElementChild.tagName === 'P'), true);
    const target = await bounds(page, '.boss-bubble');
    await page.mouse.move(target.x, target.y);
    const hammer = await page.locator('.boss-hammer').boundingBox();
    const boss = await page.locator('.boss-bubble').boundingBox();
    assert.ok(hammer && (hammer.x + hammer.width <= boss.x || hammer.x >= boss.x + boss.width || hammer.y + hammer.height <= boss.y || hammer.y >= boss.y + boss.height), 'hammer avoids the boss speech');
    await page.screenshot({ path: `artifacts/boss-simple-bubble-${size}.png` });
    await page.evaluate(() => { window.__SOFTIE__.boss.encounter.startedAt = performance.now() - 9990; });
    await visibleMood(page, 'sad');
    assert.equal(await page.locator('.boss-bubble').isVisible(), false);
    if (size === 'small') {
      await page.waitForTimeout(4200);
      assert.equal(await page.locator('.mood-bubble').isVisible(), false, 'unchanged mood becomes quiet after four seconds');
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.mood-bubble').isVisible(), false);
    }
    await page.locator('#slime-canvas').focus();
    await page.keyboard.press('Space');
    await visibleMood(page, 'recovering');
    assert.equal(await page.locator('.mood-bubble').innerText(), '还好，你懂我。');
    await page.locator('[data-language="en"]').evaluate(e => e.click());
    await page.waitForFunction(() => document.querySelector('.mood-bubble p').textContent === 'At least you get me.');
    await bounds(page, '.mood-bubble');
    await visibleMood(page, 'reassured');
    await page.evaluate(() => { const { boss } = window.__SOFTIE__; boss.summon(); boss.hit(); });
    await visibleMood(page, 'happy');
    assert.equal(await page.locator('.mood-bubble').innerText(), 'Finally, some peace. Break time.');
    await bounds(page, '.mood-bubble');
    await page.screenshot({ path: `artifacts/mood-bubble-happy-${size}-en.png` });
    await page.evaluate(() => document.querySelector('#reset').click());
    assert.equal(await page.locator('.mood-bubble').isVisible(), false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.__SOFTIE__.slime.faceMotion.bossIgnored());
    await visibleMood(page, 'sad');
    assert.equal(await page.locator('.mood-bubble').evaluate(e => e.style.opacity), '1');
    await page.close();
    console.log(`PASS ${size}: mood dialogue, boss priority, content-only speech, bounds, hammer, language and reset`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
