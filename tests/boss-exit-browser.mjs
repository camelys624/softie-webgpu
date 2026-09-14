import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const errors = [];
await mkdir('artifacts', { recursive: true });
try {
  for (const [name, width, height] of [['storyboard', 600, 520], ['small', 255, 225]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/?pet=1&test=1`);
    await page.waitForFunction(() => window.__SOFTIE__?.getDiagnostics().frames > 5 && document.querySelector('#stage').getAttribute('aria-busy') === 'false', null, { timeout: 45000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const { boss } = window.__SOFTIE__;
      boss.summon();
      boss.hit();
      // Freeze only the encounter clock, keeping the real WebGPU render loop running.
      const update = boss.update;
      const now = boss.encounter.now;
      window.restoreEncounterClock = () => { boss.update = update; boss.encounter.now = now; };
      window.exitProgress = 0;
      boss.encounter.now = () => boss.encounter.firstHitAt + 4100 + window.exitProgress * 900;
      boss.update = () => update(boss.encounter.now());
    });
    let previousTail;
    for (const progress of [0.04, 0.30, 0.50, 0.67, 0.80, 0.95, 0.99]) {
      await page.evaluate(p => { window.exitProgress = p; }, progress);
      await page.waitForFunction(p => Math.abs(window.__SOFTIE__.boss.pose.exit - p) < 0.001, progress);
      await page.waitForTimeout(250);
      assert.equal(await page.locator('.boss-hammer').isVisible(), false);
      assert.equal(await page.locator('.boss-bubble').isVisible(), false);
      await page.screenshot({ path: `artifacts/boss-exit-${name}-${Math.round(progress * 100)}.png` });
      if (progress >= 0.50) {
        const tail = await page.evaluate(() => {
          const model = window.__SOFTIE__.boss.model.group;
          const trousers = model.getObjectByName('boss-trousers');
          trousers.geometry.computeBoundingBox();
          const box = trousers.geometry.boundingBox;
          const puff = model.getObjectByName('boss-exit-puff');
          const curl = model.getObjectByName('boss-exit-curl');
          return { width: box.max.x - box.min.x, opacity: trousers.material.opacity,
            cloudSize: puff.parent.scale.x, cloudOpacity: puff.material.opacity, tailSize: curl.parent.scale.x };
        });
        if (previousTail) {
          for (const key of Object.keys(tail)) assert.ok(tail[key] < previousTail[key], `${key} keeps decreasing through the final frames`);
        }
        if (progress === 0.99) {
          assert.ok(tail.width < 0.01 && tail.opacity < 0.01 && tail.cloudSize < 0.01, 'the final cleanup removes an already tiny, transparent effect');
        }
        previousTail = tail;
      }
      if (progress === 0.67) {
        const frame = await page.evaluate(() => {
          const api = window.__SOFTIE__;
          const trousers = api.boss.model.group.getObjectByName('boss-trousers');
          const points = [];
          const cloud = api.boss.model.group.getObjectByName('boss-exit-cloud');
          cloud.updateWorldMatrix(true, true);
          cloud.traverse(mesh => {
            if (!mesh.isMesh) return;
            mesh.geometry.computeBoundingBox();
            const { min, max } = mesh.geometry.boundingBox;
            for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
              const p = min.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld).project(api.camera);
              points.push([p.x, p.y]);
            }
          });
          return { points, relief: api.boss.pose.relief, opacity: trousers.material.opacity, body: api.slime.body.visible };
        });
        assert.equal(frame.relief, 1);
        assert.ok(frame.opacity > 0.4 && frame.opacity < 1, 'the recognizable outfit is already fading instead of holding still');
        assert.equal(frame.body, true);
        assert.ok(frame.points.every(([x, y]) => Math.abs(x) < 1 && Math.abs(y) < 1), `cloud, curls and stars fit within the desktop window: ${JSON.stringify(frame.points.filter(([x, y]) => Math.abs(x) >= 1 || Math.abs(y) >= 1))}`);
      }
    }
    await page.evaluate(() => { window.exitProgress = 1; });
    await page.waitForFunction(() => !window.__SOFTIE__.boss.encounter.active);
    assert.equal(await page.evaluate(() => window.__SOFTIE__.slime.bossPose), null);
    if (name === 'small') {
      await page.evaluate(() => {
        window.restoreEncounterClock();
        const { boss } = window.__SOFTIE__;
        boss.summon();
        boss.encounter.startedAt = performance.now() - 9500;
      });
      await page.waitForFunction(() => window.__SOFTIE__.boss.pose?.phase === 'exit');
      const target = await page.evaluate(() => {
        const api = window.__SOFTIE__;
        const p = api.slime.group.position.clone();
        p.y += 1.2; p.z += 1.15; p.project(api.camera);
        const r = document.querySelector('#slime-canvas').getBoundingClientRect();
        return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
      });
      await page.mouse.click(target.x, target.y);
      await page.waitForFunction(() => window.__SOFTIE__.boss.encounter.hits === 1);
      assert.equal(await page.evaluate(() => {
        const b = window.__SOFTIE__.boss.encounter;
        return b.deadline - b.firstHitAt;
      }), 5000, 'a late first mouse hit still gets its full five-second encounter');
      await page.evaluate(() => window.__SOFTIE__.boss.reset());
      assert.equal(await page.locator('.boss-hammer').isVisible(), false);
      console.log('PASS late first hit interrupts ignored departure and reset clears it');
    }
    await page.close();
    console.log(`PASS ${name}: launch, flight, readable happy tableau, dissolve and complete cleanup`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
