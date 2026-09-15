import test from 'node:test';
import assert from 'node:assert/strict';
import { sortItemsByStatusAndDistanceMap } from '../../src/client/location/distance.js';

test('distance-map sorting preserves status groups and treats missing map entries as unknown even if raw coordinates exist', () => {
  const items = [
    { id: 'stale-near', shoppingStatus: 'wanted', createdAt: 10, storeLat: 35.6801, storeLng: 139.7601 },
    { id: 'fresh-far', shoppingStatus: 'wanted', createdAt: 20, storeLat: 1, storeLng: 1 },
    { id: 'unknown-newer', shoppingStatus: 'wanted', createdAt: 30 },
    { id: 'not-wanted', shoppingStatus: 'not_wanted', createdAt: 40 },
    { id: 'purchased', shoppingStatus: 'purchased', createdAt: 50 }
  ];
  const distancesByItemId = { 'fresh-far': 1200, 'not-wanted': 100, purchased: 50 };
  assert.deepEqual(
    sortItemsByStatusAndDistanceMap(items, distancesByItemId).map((item) => item.id),
    ['fresh-far', 'unknown-newer', 'stale-near', 'not-wanted', 'purchased']
  );
});

test('equal or missing vetted distances fall back to newest-first', () => {
  const items = [
    { id: 'old', shoppingStatus: 'wanted', createdAt: 1 },
    { id: 'new', shoppingStatus: 'wanted', createdAt: 2 },
    { id: 'equal-old', shoppingStatus: 'wanted', createdAt: 3 },
    { id: 'equal-new', shoppingStatus: 'wanted', createdAt: 4 }
  ];
  const distancesByItemId = { 'equal-old': 500, 'equal-new': 500 };
  assert.deepEqual(
    sortItemsByStatusAndDistanceMap(items, distancesByItemId).map((item) => item.id),
    ['equal-new', 'equal-old', 'new', 'old']
  );
});
