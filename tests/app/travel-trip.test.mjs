import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTripDraft,
  normalizeTrip,
  tripDisplayTitle,
  classifyTrip,
  sortTripsForPicker,
  resolveActiveTrip,
  legacyTripIdForCountry,
  groupUnassignedItemsByCountry,
  itemMatchesActiveTrip,
  activeTripCacheKey,
  readCachedActiveTripId,
  writeCachedActiveTripId
} from '../../src/client/app/travel-trip.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('normal trip validation requires country and ordered ISO dates', () => {
  assert.equal(validateTripDraft({ country: '日本', startDate: '2026-09-21', endDate: '2026-09-27' }).valid, true);
  assert.equal(validateTripDraft({ country: '', startDate: '2026-09-21', endDate: '2026-09-27' }).valid, false);
  assert.equal(validateTripDraft({ country: '日本', startDate: '', endDate: '2026-09-27' }).valid, false);
  assert.equal(validateTripDraft({ country: '日本', startDate: '2026-09-28', endDate: '2026-09-27' }).valid, false);
  assert.equal(validateTripDraft({ country: '日本', startDate: '09/21/2026', endDate: '2026-09-27' }).valid, false);
});

test('normalizeTrip cleans values and title fallback is generated from country and date', () => {
  const trip = normalizeTrip({ id: ' t1 ', title: '  ', country: ' 日本 ', startDate: '2026-09-21', endDate: '2026-09-27', kind: 'trip' });
  assert.equal(trip.id, 't1');
  assert.equal(trip.country, '日本');
  assert.equal(tripDisplayTitle(trip), '日本 · 2026/09/21');

  const titled = normalizeTrip({ id: 't2', title: ' 東京生日旅行 ', country: '日本', startDate: '2027-03-12', endDate: '2027-03-18' });
  assert.equal(tripDisplayTitle(titled), '東京生日旅行');
});

test('classifyTrip distinguishes ongoing, upcoming, past, and legacy', () => {
  assert.equal(classifyTrip({ kind: 'trip', startDate: '2026-09-10', endDate: '2026-09-20' }, '2026-09-15'), 'ongoing');
  assert.equal(classifyTrip({ kind: 'trip', startDate: '2026-09-21', endDate: '2026-09-27' }, '2026-09-15'), 'upcoming');
  assert.equal(classifyTrip({ kind: 'trip', startDate: '2026-08-01', endDate: '2026-08-07' }, '2026-09-15'), 'past');
  assert.equal(classifyTrip({ kind: 'legacy', startDate: null, endDate: null }, '2026-09-15'), 'legacy');
});

test('active-trip resolution prefers ongoing over a manually persisted future trip', () => {
  const trips = [
    { id: 'future-manual', kind: 'trip', country: '日本', startDate: '2026-12-01', endDate: '2026-12-05' },
    { id: 'ongoing-trip', kind: 'trip', country: '日本', startDate: '2026-09-10', endDate: '2026-09-20' }
  ];
  assert.equal(resolveActiveTrip({ trips, persistedTripId: 'future-manual', today: '2026-09-15' }).id, 'ongoing-trip');
});

test('startup active-trip resolution chooses the dated trip nearest today instead of a stale persisted future trip', () => {
  const trips = [
    { id: 'nearest', kind: 'trip', country: '韓國', startDate: '2026-10-01', endDate: '2026-10-05' },
    { id: 'manual', kind: 'trip', country: '日本', startDate: '2027-03-01', endDate: '2027-03-05' }
  ];
  assert.equal(resolveActiveTrip({ trips, persistedTripId: 'manual', today: '2026-09-15' }).id, 'nearest');
});

test('active-trip resolution chooses the dated trip with the nearest date boundary, then legacy', () => {
  const upcoming = [
    { id: 'later', kind: 'trip', country: '日本', startDate: '2027-03-01', endDate: '2027-03-05' },
    { id: 'near', kind: 'trip', country: '日本', startDate: '2026-10-01', endDate: '2026-10-05' }
  ];
  assert.equal(resolveActiveTrip({ trips: upcoming, persistedTripId: '', today: '2026-09-15' }).id, 'near');

  const past = [
    { id: 'old', kind: 'trip', country: '日本', startDate: '2026-01-01', endDate: '2026-01-05' },
    { id: 'recent', kind: 'trip', country: '泰國', startDate: '2026-09-01', endDate: '2026-09-14' }
  ];
  assert.equal(resolveActiveTrip({ trips: past, persistedTripId: '', today: '2026-09-15' }).id, 'recent');

  const mixed = [
    { id: 'future-five-days', kind: 'trip', country: '韓國', startDate: '2026-09-20', endDate: '2026-09-25' },
    { id: 'past-yesterday', kind: 'trip', country: '泰國', startDate: '2026-09-10', endDate: '2026-09-14' }
  ];
  assert.equal(resolveActiveTrip({ trips: mixed, persistedTripId: '', today: '2026-09-15' }).id, 'past-yesterday');

  assert.equal(resolveActiveTrip({ trips: [{ id: 'legacy-jp', kind: 'legacy', country: '日本', startDate: null, endDate: null }], persistedTripId: '', today: '2026-09-15' }).id, 'legacy-jp');
  assert.equal(resolveActiveTrip({ trips: [], persistedTripId: '', today: '2026-09-15' }), null);
});

test('picker sorting groups ongoing, upcoming, past, and legacy deterministically', () => {
  const result = sortTripsForPicker([
    { id: 'legacy', kind: 'legacy', country: '日本', startDate: null, endDate: null },
    { id: 'past-old', kind: 'trip', startDate: '2026-01-01', endDate: '2026-01-05' },
    { id: 'future-late', kind: 'trip', startDate: '2027-05-01', endDate: '2027-05-05' },
    { id: 'past-new', kind: 'trip', startDate: '2026-08-01', endDate: '2026-08-05' },
    { id: 'ongoing', kind: 'trip', startDate: '2026-09-10', endDate: '2026-09-20' },
    { id: 'future-near', kind: 'trip', startDate: '2026-10-01', endDate: '2026-10-05' }
  ], '2026-09-15');
  assert.deepEqual(result.map((trip) => trip.id), ['ongoing', 'future-near', 'future-late', 'past-new', 'past-old', 'legacy']);
});

test('legacy trip ids are stable, safe, and distinct per country', () => {
  const jp1 = legacyTripIdForCountry('日本');
  const jp2 = legacyTripIdForCountry(' 日本 ');
  const kr = legacyTripIdForCountry('韓國');
  assert.equal(jp1, jp2);
  assert.notEqual(jp1, kr);
  assert.match(jp1, /^legacy-[a-z0-9_-]+$/);
});

test('unassigned legacy items are grouped by resolved country and assigned items are ignored', () => {
  const grouped = groupUnassignedItemsByCountry([
    { id: 'a', name: 'A', country: '日本' },
    { id: 'b', name: 'B', country: '韓國' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D', country: '日本', tripId: 'existing-trip' }
  ]);
  assert.deepEqual([...grouped.keys()].sort(), ['日本', '韓國']);
  assert.deepEqual(grouped.get('日本').map((item) => item.id).sort(), ['a', 'c']);
  assert.deepEqual(grouped.get('韓國').map((item) => item.id), ['b']);
});

test('trip membership is authoritative for item visibility', () => {
  assert.equal(itemMatchesActiveTrip({ tripId: 'trip-a', country: '日本' }, { id: 'trip-a', country: '日本' }), true);
  assert.equal(itemMatchesActiveTrip({ tripId: 'trip-b', country: '日本' }, { id: 'trip-a', country: '日本' }), false);
  assert.equal(itemMatchesActiveTrip({ country: '日本' }, { id: 'trip-a', country: '日本' }), false);
  assert.equal(itemMatchesActiveTrip({ tripId: 'trip-a' }, null), false);
});

test('active-trip cache is scoped per user', () => {
  const storage = memoryStorage();
  assert.equal(activeTripCacheKey('user-1'), 'shopping-list:active-trip:user-1');
  assert.equal(readCachedActiveTripId(storage, 'user-1'), '');
  assert.equal(writeCachedActiveTripId(storage, 'user-1', 'trip-123'), 'trip-123');
  assert.equal(readCachedActiveTripId(storage, 'user-1'), 'trip-123');
  assert.equal(readCachedActiveTripId(storage, 'user-2'), '');
});
