import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLocationSelection,
  availableLocationChoices,
  itemMatchesLocation,
  locationWritePatch,
  normalizeLocations,
  removeLocationSelection,
  resolveItemLocations
} from '../../src/client/pricing/location-selection.js';

test('normalizes multiple locations without losing user order', () => {
  assert.deepEqual(normalizeLocations([' 新宿 ', '澀谷', '新宿', '', null]), ['新宿', '澀谷']);
});

test('legacy single location remains readable without migration', () => {
  assert.deepEqual(resolveItemLocations({ location: '新宿' }), ['新宿']);
  assert.deepEqual(resolveItemLocations({ location: '新宿', locations: [] }), ['新宿']);
});

test('new locations array wins over legacy location and stays deduplicated', () => {
  assert.deepEqual(resolveItemLocations({ location: '新宿', locations: ['澀谷', '銀座', '澀谷'] }), ['澀谷', '銀座']);
});

test('write patch synchronizes legacy location to the first selected value', () => {
  assert.deepEqual(locationWritePatch(['澀谷', '新宿']), {
    locations: ['澀谷', '新宿'],
    location: '澀谷'
  });
  assert.deepEqual(locationWritePatch([]), { locations: [], location: '' });
});

test('an item matches any selected location and all remains inclusive', () => {
  const item = { location: '新宿', locations: ['新宿', '澀谷'] };
  assert.equal(itemMatchesLocation(item, '新宿'), true);
  assert.equal(itemMatchesLocation(item, '澀谷'), true);
  assert.equal(itemMatchesLocation(item, '銀座'), false);
  assert.equal(itemMatchesLocation(item, 'all'), true);
  assert.equal(itemMatchesLocation(item, ['銀座', '澀谷']), true);
  assert.equal(itemMatchesLocation(item, ['銀座', '池袋']), false);
  assert.equal(itemMatchesLocation(item, []), true);
});

test('adding a location preserves order and never duplicates a selected chip', () => {
  assert.deepEqual(addLocationSelection(['新宿'], '澀谷'), ['新宿', '澀谷']);
  assert.deepEqual(addLocationSelection(['新宿', '澀谷'], '新宿'), ['新宿', '澀谷']);
  assert.deepEqual(addLocationSelection(['新宿'], '   '), ['新宿']);
});

test('removing a location deletes only the requested chip', () => {
  assert.deepEqual(removeLocationSelection(['新宿', '澀谷', '銀座'], '澀谷'), ['新宿', '銀座']);
  assert.deepEqual(removeLocationSelection(['新宿', '澀谷'], '不存在'), ['新宿', '澀谷']);
});

test('picker choices exclude locations already selected while keeping definition order', () => {
  assert.deepEqual(
    availableLocationChoices(['新宿', '澀谷', '銀座', '新宿'], ['澀谷']),
    ['新宿', '銀座']
  );
});
