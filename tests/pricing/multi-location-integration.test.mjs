import test from 'node:test';
import assert from 'node:assert/strict';
import { valuesUsedByTrip } from '../../src/client/app/trip-filter-options.js';
import { findItemsUsingOption } from '../../src/client/filters/filter-management.js';

test('active-trip location discovery includes every selected location from locations[]', () => {
  const items = [
    { tripId: 'trip-a', location: '新宿', locations: ['新宿', '澀谷'] },
    { tripId: 'trip-a', location: '銀座' },
    { tripId: 'trip-b', location: '池袋', locations: ['池袋', '上野'] }
  ];
  assert.deepEqual(valuesUsedByTrip(items, 'trip-a', 'location'), ['新宿', '澀谷', '銀座']);
});

test('location deletion warnings find products using a secondary selected location', () => {
  const items = [
    { id: 'one', name: '商品 A', location: '新宿', locations: ['新宿', '澀谷'] },
    { id: 'two', name: '商品 B', location: '銀座' }
  ];
  assert.deepEqual(findItemsUsingOption(items, 'location', '澀谷').map((item) => item.id), ['one']);
});

test('category usage logic remains exact and unchanged', () => {
  const items = [{ id: 'one', category: '藥妝', locations: ['新宿', '澀谷'] }];
  assert.deepEqual(findItemsUsingOption(items, 'category', '藥妝').map((item) => item.id), ['one']);
});
