import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('header keeps a 52px toolbar above a 144px visual and removes all decorative dots', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<header[^>]*h-\[196px\]/);
  assert.match(html, /id="header-toolbar"[^>]*h-\[52px\]/);
  assert.match(html, /id="user-panel"/);
  assert.doesNotMatch(html, /top-4 left-4 w-4 h-4 rounded-full bg-pastelYellow/);
  assert.doesNotMatch(html, /top-8 right-6 w-3 h-3 rounded-full bg-pastelBlue/);
  assert.doesNotMatch(html, /bottom-4 right-10 w-5 h-5 rounded-full bg-pastelGreen/);
});

test('account avatar is laid out by the toolbar rather than absolutely positioned over the photo', async () => {
  const source = await readFile(new URL('../../src/client/app/home-ui-enhancements.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /#user-panel\s*\{[^}]*position:\s*absolute\s*!important/s);
  assert.match(source, /#user-panel\s*\{[^}]*backdrop-filter:\s*blur\(/s);
});
