import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineMeters,
  formatDistance,
  movedBeyondThreshold,
  sortItemsByStatusAndDistance
} from '../../src/client/location/distance.js';

test('haversine distance returns a realistic Tokyo Station to Shinjuku distance', () => {
  const meters = haversineMeters(
    { lat: 35.681236, lng: 139.767125 },
    { lat: 35.689592, lng: 139.700413 }
  );
  assert.ok(meters > 5800 && meters < 6300, `unexpected distance ${meters}`);
});

test('distance formatting uses meters below 1km and one decimal kilometre above it', () => {
  assert.equal(formatDistance(85.4), '85 m');
  assert.equal(formatDistance(999), '999 m');
  assert.equal(formatDistance(1450), '1.5 km');
  assert.equal(formatDistance(Number.NaN), '');
});

test('movement threshold ignores GPS jitter and reacts after about 150m', () => {
  const start = { lat: 35.681236, lng: 139.767125 };
  assert.equal(movedBeyondThreshold(start, { lat: 35.6813, lng: 139.7672 }, 150), false);
  assert.equal(movedBeyondThreshold(start, { lat: 35.6830, lng: 139.767125 }, 150), true);
  assert.equal(movedBeyondThreshold(null, start, 150), true);
});

test('nearby sorting preserves status groups then puts known nearer stores first and unknown stores last', () => {
  const origin = { lat: 35.681236, lng: 139.767125 };
  const items = [
    { id: 'p-near', shoppingStatus: 'purchased', createdAt: 90, storeLat: 35.6814, storeLng: 139.7672 },
    { id: 'w-unknown', shoppingStatus: 'wanted', createdAt: 80 },
    { id: 'w-far', shoppingStatus: 'wanted', createdAt: 70, storeLat: 35.689592, storeLng: 139.700413 },
    { id: 'n-near', shoppingStatus: 'not_wanted', createdAt: 60, storeLat: 35.6815, storeLng: 139.7672 },
    { id: 'w-near', shoppingStatus: 'wanted', createdAt: 50, storeLat: 35.6815, storeLng: 139.7672 },
    { id: 'n-unknown', shoppingStatus: 'not_wanted', createdAt: 40 }
  ];

  assert.deepEqual(
    sortItemsByStatusAndDistance(items, origin).map((item) => item.id),
    ['w-near', 'w-far', 'w-unknown', 'n-near', 'n-unknown', 'p-near']
  );
});

test('distance sorting falls back to newest-first for equal or unknown distances', () => {
  const origin = { lat: 35.68, lng: 139.76 };
  const items = [
    { id: 'older', shoppingStatus: 'wanted', createdAt: 10 },
    { id: 'newer', shoppingStatus: 'wanted', createdAt: 20 }
  ];
  assert.deepEqual(sortItemsByStatusAndDistance(items, origin).map((item) => item.id), ['newer', 'older']);
});
