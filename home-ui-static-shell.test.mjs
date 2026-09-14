import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('homepage static shell removes Shin-chan subtitle', () => {
  assert.doesNotMatch(html, />Shin-chan Style</);
});

test('add item button is statically fixed for mobile', () => {
  assert.match(html, /id="add-item-btn"[^>]*class="[^"]*\bfixed\b/);
  assert.doesNotMatch(html, /id="add-item-btn"[^>]*class="[^"]*\babsolute\b/);
});

test('signed-in header statically hides user name and sign-out control', () => {
  assert.match(html, /id="user-panel"[^>]*class="[^"]*\babsolute\b[^\"]*\bright-4\b/);
  assert.match(html, /id="user-name"[^>]*class="[^"]*\bhidden\b/);
  assert.match(html, /id="sign-out-btn"[^>]*class="[^"]*\bhidden\b/);
});

test('auth session import has a cache-busting version', () => {
  assert.match(html, /from\s+"\.\/auth-session\.js\?v=20260914-home-ui-2"/);
});
