import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('filter rename modal does not autofocus or select its input when opened', async () => {
  const source = await readFile(new URL('../../src/client/app/filter-rename-enhancements.js', import.meta.url), 'utf8');
  const body = source.match(/function openRenameModal\(kind, value\) \{([\s\S]*?)\n  \}\n\n  function enhanceManagementRows/)?.[1] || '';
  assert.doesNotMatch(body, /\.focus\(|\.select\(/);
});

test('brand-location helper editor does not autofocus an alias input when opened', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-location-create-flow.js', import.meta.url), 'utf8');
  const body = source.match(/function openEditor\(rawLocation, continueAdd\) \{([\s\S]*?)\n  \}\n\n  function collectAliases/)?.[1] || '';
  assert.doesNotMatch(body, /\.focus\(/);
});

test('homepage category and location filter state is multi-select and exposes a clear-filter event', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /category:\s*\[\]/);
  assert.match(html, /location:\s*\[\]/);
  assert.match(html, /function toggleFilterSelection\(/);
  assert.match(html, /shoppingListHomeFilterSelections/);
  assert.match(html, /shopping-list:home-filter-changed/);
  assert.match(html, /shopping-list:clear-home-filter/);
  assert.match(html, /aria-pressed/);
});


test('returning from brand dictionary to coupon manager does not autofocus the coupon search field', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-store-sync.js', import.meta.url), 'utf8');
  const body = source.match(/function restoreExternalContext\(\) \{([\s\S]*?)\n  \}\n\n  function closeExternalDictionaryAndReturn/)?.[1] || '';
  assert.doesNotMatch(body, /\.focus\(/);
});
