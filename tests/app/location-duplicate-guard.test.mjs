import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('location duplicate guard wraps the existing add handler instead of replacing storage logic', async () => {
  const source = await readFile(new URL('../../src/client/app/location-duplicate-guard.js', import.meta.url), 'utf8');
  assert.match(source, /const originalAddLocation = window\.handleAddLocation/);
  assert.match(source, /detectLocationDuplicate/);
  assert.match(source, /originalAddLocation\(location\)/);
  assert.doesNotMatch(source, /setDoc\(/);
  assert.doesNotMatch(source, /updateDoc\(/);
});

test('exact duplicates are blocked while dictionary and kana-romaji matches require explicit confirmation', async () => {
  const source = await readFile(new URL('../../src/client/app/location-duplicate-guard.js', import.meta.url), 'utf8');
  assert.match(source, /result\.kind === 'exact'/);
  assert.match(source, /地點已存在/);
  assert.match(source, /可能已存在/);
  assert.match(source, /取消/);
  assert.match(source, /仍然新增/);
  assert.match(source, /result\.kind === 'dictionary'/);
  assert.match(source, /result\.kind === 'similar'/);
});

test('duplicate guard scopes brand matching to the active trip country', async () => {
  const source = await readFile(new URL('../../src/client/app/location-duplicate-guard.js', import.meta.url), 'utf8');
  assert.match(source, /shoppingListActiveTrip\?\.country/);
  assert.match(source, /shoppingListActiveCountry/);
  assert.match(source, /DEFAULT_COUNTRY/);
});
