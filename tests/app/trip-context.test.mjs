import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLegacyMigrationPlan } from '../../src/client/app/trip-context.js';
import { legacyTripIdForCountry } from '../../src/client/app/travel-trip.js';

const contextPath = new URL('../../src/client/app/trip-context.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('legacy migration plan is deterministic and ignores items already assigned to a trip', () => {
  const plan = buildLegacyMigrationPlan([
    { id: 'jp-1', country: '日本' },
    { id: 'jp-2' },
    { id: 'kr-1', country: '韓國' },
    { id: 'assigned', country: '日本', tripId: 'trip-existing' }
  ]);

  assert.equal(plan.length, 2);
  const jp = plan.find((entry) => entry.country === '日本');
  const kr = plan.find((entry) => entry.country === '韓國');
  assert.equal(jp.tripId, legacyTripIdForCountry('日本'));
  assert.deepEqual(jp.itemIds.sort(), ['jp-1', 'jp-2']);
  assert.equal(jp.trip.kind, 'legacy');
  assert.equal(jp.trip.title, '日本 · 既有清單');
  assert.equal(jp.trip.startDate, null);
  assert.equal(kr.tripId, legacyTripIdForCountry('韓國'));
  assert.deepEqual(kr.itemIds, ['kr-1']);
});

test('manual legacy selection remains active for the current session while startup defaults stay smart', async () => {
  const contextModule = await import('../../src/client/app/trip-context.js');
  assert.equal(typeof contextModule.resolveTripForReconcile, 'function');

  const trips = [
    { id: 'legacy-jp', title: '日本 · 既有清單', country: '日本', kind: 'legacy' },
    { id: 'tokyo-2026', title: '2026/09/21東京', country: '日本', kind: 'trip', startDate: '2026-09-21', endDate: '2026-09-27' }
  ];

  const manual = contextModule.resolveTripForReconcile({
    trips,
    persistedTripId: 'legacy-jp',
    sessionSelectedTripId: 'legacy-jp',
    today: '2026-09-15'
  });
  assert.equal(manual?.id, 'legacy-jp');

  const startup = contextModule.resolveTripForReconcile({
    trips,
    persistedTripId: 'legacy-jp',
    sessionSelectedTripId: '',
    today: '2026-09-15'
  });
  assert.equal(startup?.id, 'tokyo-2026');
});

test('trip context subscribes to trips, items, and preferences and migrates only missing tripId items', async () => {
  const source = await readFile(contextPath, 'utf8');
  assert.match(source, /collection\([^\n]*'trips'/);
  assert.match(source, /collection\([^\n]*'items'/);
  assert.match(source, /doc\([^\n]*'settings',\s*'preferences'/);
  assert.match(source, /writeBatch\(/);
  assert.match(source, /tripId/);
  assert.match(source, /groupUnassignedItemsByCountry/);
  assert.match(source, /legacyTripIdForCountry/);
});

test('trip context publishes one authoritative active trip and mirrors active country', async () => {
  const source = await readFile(contextPath, 'utf8');
  assert.match(source, /shoppingListActiveTrip/);
  assert.match(source, /shoppingListTrips/);
  assert.match(source, /shoppingListTripContextReady/);
  assert.match(source, /shoppingListSelectTrip/);
  assert.match(source, /shopping-list:active-trip-changed/);
  assert.match(source, /shopping-list:trips-changed/);
  assert.match(source, /shopping-list:active-country-changed/);
  assert.match(source, /activeTripId/);
  assert.match(source, /activeCountry/);
  assert.match(source, /writeCachedActiveTripId/);
  assert.match(source, /writeCachedActiveCountry/);
});

test('trip context fails closed until items are assigned and active trip is resolved', async () => {
  const source = await readFile(contextPath, 'utf8');
  assert.match(source, /shoppingListTripContextReady\s*=\s*false/);
  assert.match(source, /hasUnassignedItems/);
  assert.match(source, /shoppingListTripContextReady\s*=\s*true/);
});

test('feature bootstrap loads trip context independently', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /trip-context\.js/);
  assert.match(source, /initTripContext/);
  assert.match(source, /旅程資料/);
});
