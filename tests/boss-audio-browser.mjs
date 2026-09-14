import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 340, height: 300 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.TEST_URL ?? 'http://127.0.0.1:5173'}/?pet=1&test=1`);
  await page.waitForFunction(() => window.__SOFTIE__?.getDiagnostics().frames > 10);
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    const { sound } = window.__SOFTIE__;
    window.audioProbe = { calls: 0, results: [], peak: 0 };
    const original = sound.playBossArrival.bind(sound);
    sound.playBossArrival = async (...args) => {
      window.audioProbe.calls++;
      const result = await original(...args);
      window.audioProbe.results.push(result);
      return result;
    };
    const ctx = sound.init(), analyser = ctx.createAnalyser();
    sound.masterGain.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const sample = () => {
      analyser.getFloatTimeDomainData(data);
      window.audioProbe.peak = Math.max(window.audioProbe.peak, ...data.map(Math.abs));
      window.probeFrame = requestAnimationFrame(sample);
    };
    sample();
    window.__SOFTIE__.boss.encounter.nextAt = 0;
  });
  await page.waitForFunction(() => window.audioProbe.results.length === 1);
  await page.waitForTimeout(1250);
  const first = await page.evaluate(() => ({ ...window.audioProbe, state: window.__SOFTIE__.boss.encounter.active }));
  assert.equal(first.calls, 1, 'one cue per automatic arrival');
  assert.deepEqual(first.results, [true]);
  assert.ok(first.peak > 0.08 && first.peak < 0.6, 'warning stands out while keeping a bounded waveform');
  assert.equal(first.state, true);
  await page.evaluate(() => { window.__SOFTIE__.boss.summon(); window.__SOFTIE__.boss.hit(); });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.audioProbe.calls), 1, 'hits and repeated summons cannot replay arrival');
  await page.evaluate(() => { window.__SOFTIE__.boss.reset(); window.__SOFTIE__.boss.summon(); });
  await page.waitForFunction(() => window.audioProbe.results.length === 2);
  assert.equal(await page.evaluate(() => window.audioProbe.results[1]), true);
  await page.evaluate(async () => {
    const { sound } = window.__SOFTIE__;
    sound.toggle();
    window.__SOFTIE__.boss.reset(); window.__SOFTIE__.boss.summon();
  });
  await page.waitForFunction(() => window.audioProbe.results.length === 3);
  assert.equal(await page.evaluate(() => window.audioProbe.results[2]), false, 'muted arrivals stay silent');
  const stale = await page.evaluate(async () => {
    const { sound } = window.__SOFTIE__;
    sound.enabled = true;
    const ctx = sound.ctx, resume = ctx.resume.bind(ctx);
    await ctx.suspend();
    let release;
    ctx.resume = () => new Promise(resolve => { release = async () => { await resume(); resolve(); }; });
    window.__SOFTIE__.boss.reset(); window.__SOFTIE__.boss.summon();
    window.__SOFTIE__.boss.reset();
    await release();
    ctx.resume = resume;
    await new Promise(resolve => setTimeout(resolve, 20));
    return window.audioProbe.results.at(-1);
  });
  assert.equal(stale, false, 'audio unlocking after departure does not play a stale cue');
  assert.deepEqual(errors, []);
  console.log('PASS automatic/manual arrival, audible waveform, one cue per visit, mute and delayed unlock');
} finally { await browser.close(); }
