import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const errors = [];
await mkdir('artifacts', { recursive: true });
try {
  for (const [width, height] of [[600, 520], [340, 300]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/?pet=1&test=1`);
    await page.waitForFunction(() => window.__SOFTIE__?.getDiagnostics().frames > 5 && document.querySelector('#stage').getAttribute('aria-busy') === 'false', null, { timeout: 45000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `artifacts/expression-calm-${width}.png` });
    await page.evaluate(() => window.__SOFTIE__.slime.faceMotion.addAnger(0.5));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__SOFTIE__.slime.moodBrows.visible && !window.__SOFTIE__.slime.angerCross.visible), true);
    await page.screenshot({ path: `artifacts/expression-annoyed-${width}.png` });
    await page.evaluate(() => window.__SOFTIE__.slime.faceMotion.addAnger(0.5));
    await page.waitForTimeout(400);
    await page.waitForFunction(() => document.querySelector('.mood-bubble p').textContent === '这合理吗？！');
    assert.equal(await page.evaluate(() => {
      const { slime } = window.__SOFTIE__;
      return slime.moodBrows.visible && slime.angerCross.visible && slime.group.scale.x > 1.04 && slime.gel.transmission === 1;
    }), true);
    await page.screenshot({ path: `artifacts/expression-angry-${width}.png` });
    await page.evaluate(() => window.__SOFTIE__.boss.summon());
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => !window.__SOFTIE__.slime.moodBrows.visible && !window.__SOFTIE__.slime.angerCross.visible && window.__SOFTIE__.slime.group.scale.x === 1), true);
    await page.evaluate(() => document.querySelector('#reset').click());
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => !window.__SOFTIE__.slime.moodBrows.visible && window.__SOFTIE__.slime.group.scale.x === 1), true);
    await page.close();
    console.log(`PASS ${width}: calm, annoyed, angry, dialogue, boss priority, reset`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
