import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { valuesUsedByTrip } from '../../src/client/app/trip-filter-options.js';

const sourcePath = new URL('../../src/client/app/trip-filter-options.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);
const homeUiPath = new URL('../../src/client/app/home-ui-enhancements.js', import.meta.url);

test('valuesUsedByTrip returns only unique non-empty values from the active trip', () => {
  const items = [
    { tripId: 'a', category: '藥妝', location: '新宿' },
    { tripId: 'a', category: '服飾', location: '澀谷' },
    { tripId: 'a', category: '藥妝', location: '新宿' },
    { tripId: 'b', category: '食品', location: '銀座' },
    { tripId: 'a', category: '  ', location: '' }
  ];
  assert.deepEqual(valuesUsedByTrip(items, 'a', 'category'), ['藥妝', '服飾']);
  assert.deepEqual(valuesUsedByTrip(items, 'a', 'location'), ['新宿', '澀谷']);
  assert.deepEqual(valuesUsedByTrip(items, 'missing', 'category'), []);
});

test('active-trip option enhancer hides unused homepage chips but preserves all/global controls', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /#category-filters \.cat-btn/);
  assert.match(source, /#location-filters \.loc-btn/);
  assert.match(source, /data-cat/);
  assert.match(source, /data-loc/);
  assert.match(source, /===\s*'all'/);
  assert.match(source, /classList\.toggle\('hidden'/);
});

test('switching trips resets category and location to all before applying new option visibility', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const eventIndex = source.indexOf('shopping-list:active-trip-changed');
  assert.ok(eventIndex >= 0);
  const slice = source.slice(eventIndex, eventIndex + 700);
  assert.match(slice, /data-cat="all"/);
  assert.match(slice, /data-loc="all"/);
  assert.match(slice, /\.click\(\)/);
});

test('global category/location management remains account-level and is not rewritten by trip filter enhancer', async () => {
  const enhancer = await readFile(sourcePath, 'utf8');
  const homeUi = await readFile(homeUiPath, 'utf8');
  assert.doesNotMatch(enhancer, /setDoc\(/);
  assert.match(homeUi, /FIELD_BY_KIND/);
  assert.match(homeUi, /persistValues/);
});

test('feature bootstrap loads active-trip filter options independently', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /trip-filter-options\.js/);
  assert.match(source, /initTripFilterOptions/);
  assert.match(source, /旅程篩選選項/);
});
