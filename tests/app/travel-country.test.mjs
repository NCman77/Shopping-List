import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COUNTRY,
  normalizeCountries,
  resolveItemCountry,
  filterItemsForCountry,
  activeCountryCacheKey,
  readCachedActiveCountry,
  writeCachedActiveCountry
} from '../../src/client/app/travel-country.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

test('legacy items without country resolve to Japan', () => {
  assert.equal(DEFAULT_COUNTRY, '日本');
  assert.equal(resolveItemCountry({ name: '舊商品' }), '日本');
  assert.equal(resolveItemCountry({ country: ' 韓國 ' }), '韓國');
});

test('country list is trimmed, de-duplicated and always contains Japan', () => {
  assert.deepEqual(normalizeCountries([' 韓國 ', '日本', '韓國', '', null]), ['韓國', '日本']);
  assert.deepEqual(normalizeCountries([]), ['日本']);
});

test('items are strictly filtered to the active country with Japan legacy fallback', () => {
  const items = [
    { id: 'legacy', name: 'Legacy' },
    { id: 'jp', country: '日本' },
    { id: 'kr', country: '韓國' }
  ];
  assert.deepEqual(filterItemsForCountry(items, '日本').map((item) => item.id), ['legacy', 'jp']);
  assert.deepEqual(filterItemsForCountry(items, '韓國').map((item) => item.id), ['kr']);
});

test('active country cache is user-scoped and normalizes empty values', () => {
  const storage = memoryStorage();
  assert.equal(activeCountryCacheKey('uid-1'), 'shopping-list:active-country:uid-1');
  assert.equal(readCachedActiveCountry(storage, 'uid-1'), '日本');
  writeCachedActiveCountry(storage, 'uid-1', ' 泰國 ');
  writeCachedActiveCountry(storage, 'uid-2', '韓國');
  assert.equal(readCachedActiveCountry(storage, 'uid-1'), '泰國');
  assert.equal(readCachedActiveCountry(storage, 'uid-2'), '韓國');
});
