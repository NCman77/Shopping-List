import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergeUniqueOption } from '../../src/client/app/settings-merge-guard.js';
import { resolveCountryForSave } from '../../src/client/app/country-save-guard.js';

test('category and location additions preserve existing settings by merging only the changed list', () => {
  assert.deepEqual(mergeUniqueOption(['美妝'], ' 藥妝 '), ['美妝', '藥妝']);
  assert.deepEqual(mergeUniqueOption(['美妝', '藥妝'], '藥妝'), ['美妝', '藥妝']);
  assert.deepEqual(mergeUniqueOption([], ''), []);
});

test('item country preserves an existing country and uses active country for new items', () => {
  assert.equal(resolveCountryForSave({ existingItem: { country: '韓國' }, activeCountry: '泰國' }), '韓國');
  assert.equal(resolveCountryForSave({ existingItem: {}, activeCountry: '泰國' }), '日本');
  assert.equal(resolveCountryForSave({ existingItem: null, activeCountry: ' 泰國 ' }), '泰國');
});

test('settings merge guard replaces destructive add handlers with Firestore merge writes', async () => {
  const source = await readFile(new URL('../../src/client/app/settings-merge-guard.js', import.meta.url), 'utf8');
  assert.match(source, /handleAddCategory/);
  assert.match(source, /handleAddLocation/);
  assert.match(source, /\{ merge: true \}/);
  assert.match(source, /addOption\('categories'/);
  assert.match(source, /addOption\('locations'/);
});

test('country save guard assigns an id before enhanced save and merges country after successful save', async () => {
  const source = await readFile(new URL('../../src/client/app/country-save-guard.js', import.meta.url), 'utf8');
  assert.match(source, /item-id/);
  assert.match(source, /randomUUID/);
  assert.match(source, /item-website/);
  assert.match(source, /await originalSave/);
  assert.match(source, /setDoc\(itemRef, \{ country \}, \{ merge: true \}\)/);
});

test('feature bootstrap loads both data guards independently', async () => {
  const source = await readFile(new URL('../../src/client/app/feature-bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /settings-merge-guard\.js/);
  assert.match(source, /country-save-guard\.js/);
});
