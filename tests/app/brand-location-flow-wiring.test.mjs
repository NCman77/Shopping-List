import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('location duplicate guard routes accepted additions through brand onboarding', async () => {
  const source = await read('src/client/app/location-duplicate-guard.js');
  assert.match(source, /shoppingListRequestBrandForLocation/);
  assert.match(source, /continueAddLocation/);
});

test('brand onboarding distinguishes required creation from optional supplement', async () => {
  const source = await read('src/client/app/brand-location-create-flow.js');
  assert.match(source, /新增品牌並加入地點/);
  assert.match(source, /略過補充/);
  assert.match(source, /更新品牌並加入地點/);
  assert.match(source, /settings', 'brandDictionary'/);
});

test('homepage presentation keeps raw location identity but resolves visible labels and Maps query', async () => {
  const source = await read('src/client/app/brand-location-display.js');
  assert.match(source, /dataset\.brandLocationRaw/);
  assert.match(source, /resolveLocationDisplayName/);
  assert.match(source, /resolveLocationMapQuery/);
  assert.match(source, /filterPickerLabel/);
});

test('feature bootstrap loads brand onboarding and display before duplicate guard', async () => {
  const source = await read('src/client/app/feature-bootstrap.js');
  const onboarding = source.indexOf("import('./brand-location-create-flow.js')");
  const display = source.indexOf("import('./brand-location-display.js')");
  const guard = source.indexOf("import('./location-duplicate-guard.js')");
  assert.ok(onboarding >= 0);
  assert.ok(display >= 0);
  assert.ok(guard >= 0);
  assert.ok(onboarding < guard);
});
