import test from 'node:test';
import assert from 'node:assert/strict';
import { valuesUsedByTrip } from '../../src/client/app/trip-filter-options.js';
import { buildCopiedItemData } from '../../src/client/app/item-copy.js';

test('trip location extraction includes every selected location while category behavior stays scalar', () => {
  const items = [
    { tripId: 'trip-a', category: '美妝', locations: ['新宿', ' 澀谷 ', '新宿'] },
    { tripId: 'trip-a', category: '藥妝', location: '池袋' },
    { tripId: 'trip-b', category: '食品', locations: ['銀座'] }
  ];

  assert.deepEqual(valuesUsedByTrip(items, 'trip-a', 'location'), ['新宿', '澀谷', '池袋']);
  assert.deepEqual(valuesUsedByTrip(items, 'trip-a', 'category'), ['美妝', '藥妝']);
});

test('copied items preserve normalized locations and legacy first location', () => {
  const copied = buildCopiedItemData({
    source: {
      id: 'source-1',
      name: '商品',
      category: '美妝',
      location: '舊地點',
      locations: ['新宿', ' 澀谷 ', '新宿']
    },
    targetTrip: { id: 'trip-b', country: '日本' },
    newItemId: 'copy-1',
    now: 123
  });

  assert.deepEqual(copied.locations, ['新宿', '澀谷']);
  assert.equal(copied.location, '新宿');
});
