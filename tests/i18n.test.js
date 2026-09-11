import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { messages, translate } from '../src/i18n.js';

test('both languages cover all visible, metadata, accessibility and error keys', async () => {
  assert.deepEqual(Object.keys(messages.zh).sort(), Object.keys(messages.en).sort());
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-(?:i18n(?:-label|-title|-content)?|color-name)="([^"]+)"/g)].map(match => match[1]);
  keys.push('connecting', 'connected', 'disconnected', 'gpuUnsupported', 'nativeRequired', 'deviceLost', 'initFailed');
  keys.push('petSound', 'petSize', 'petSizeSmall', 'petSizeMedium', 'petSizeLarge', 'petDefault', 'petQuit');
  for (const key of keys) for (const language of ['zh', 'en']) {
    assert.equal(typeof translate(language, key), 'string', `${language}.${key}`);
    assert.ok(translate(language, key).length > 0);
  }
  assert.match(html, /<html lang="zh-CN">/);
  assert.equal(translate('unknown', 'heading'), messages.zh.heading);
});
