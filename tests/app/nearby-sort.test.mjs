import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nearbySortStateChanged, freshStoreCoordinate } from '../../src/client/app/nearby-sort.js';
import { COORDINATE_CACHE_MAX_AGE_MS } from '../../src/client/location/places-usage-policy.js';

const sourcePath = new URL('../../src/client/app/nearby-sort.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('nearby sort exposes an explicit homepage toggle and in-memory public state', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /附近排序/);
  assert.match(source, /shoppingListNearbySort/);
  assert.match(source, /shopping-list:nearby-sort-changed/);
  assert.match(source, /nearby-sort-toggle/);
});

test('nearby sort watches location with the 150m movement threshold and clears the watcher on disable or sign-out', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /watchPosition/);
  assert.match(source, /clearPositionWatch/);
  assert.match(source, /movedBeyondThreshold/);
  assert.match(source, /150/);
  assert.match(source, /onAuthStateChanged/);
});

test('only the enabled preference is persisted and live coordinates are never written to Firestore', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /nearbySortEnabled/);
  assert.match(source, /function persistEnabled\(enabled,\s*userId\s*=\s*state\.userId\)/);
  assert.match(source, /const ref = settingsRef\(userId\)/);
  assert.match(source, /setDoc\(ref,\s*\{\s*nearbySortEnabled:/);
  assert.match(source, /\{ merge: true \}/);
  assert.doesNotMatch(source, /setDoc\([^\n]*(lat|lng|latitude|longitude)/i);
  assert.doesNotMatch(source, /updateDoc\([^\n]*(origin|accuracy)/i);
});

test('permission/location failures turn nearby mode off for the session without hiding the shopping list', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /permissionBlocked/);
  assert.match(source, /定位/);
  assert.match(source, /enabled:\s*false/);
});

test('disabled nearby snapshots do not emit a sorting change, while real active sort changes do', () => {
  const disabled = { enabled: false, origin: null, distancesByItemId: {} };
  assert.equal(nearbySortStateChanged(disabled, { enabled: false, origin: null, distancesByItemId: {} }), false);
  assert.equal(nearbySortStateChanged(disabled, {
    enabled: true,
    origin: { lat: 35.68, lng: 139.76, accuracy: 20 },
    distancesByItemId: { a: 120 }
  }), true);
  assert.equal(nearbySortStateChanged({
    enabled: true,
    origin: { lat: 35.68, lng: 139.76, accuracy: 20 },
    distancesByItemId: { a: 120 }
  }, {
    enabled: true,
    origin: { lat: 35.68, lng: 139.76, accuracy: 25 },
    distancesByItemId: { a: 120 }
  }), false, 'accuracy-only GPS noise must not reset pagination');
  assert.equal(nearbySortStateChanged({
    enabled: true,
    origin: { lat: 35.68, lng: 139.76 },
    distancesByItemId: { a: 120 }
  }, {
    enabled: true,
    origin: { lat: 35.6815, lng: 139.76 },
    distancesByItemId: { a: 280 }
  }), true);
  assert.equal(nearbySortStateChanged({
    enabled: true,
    origin: { lat: 35.68, lng: 139.76 },
    distancesByItemId: { a: 120 }
  }, disabled), true, 'turning nearby sort off must restore normal ordering');
});

test('store coordinates are usable only while their 30-day cache is fresh', () => {
  const now = Date.UTC(2026, 8, 15, 0, 0, 0);
  assert.deepEqual(freshStoreCoordinate({
    storeLat: 35.69,
    storeLng: 139.70,
    storeResolvedAt: now - COORDINATE_CACHE_MAX_AGE_MS + 1
  }, now), { lat: 35.69, lng: 139.70 });
  assert.equal(freshStoreCoordinate({
    storeLat: 35.69,
    storeLng: 139.70,
    storeResolvedAt: now - COORDINATE_CACHE_MAX_AGE_MS
  }, now), null);
  assert.equal(freshStoreCoordinate({ storeLat: 35.69, storeLng: 139.70 }, now), null);
  assert.equal(freshStoreCoordinate({ storeLat: null, storeLng: null, storeResolvedAt: now }, now), null);
});

test('distance sorting and lazy backfill both use freshness without clearing reusable Place IDs', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /isCoordinateCacheFresh/);
  assert.match(source, /freshStoreCoordinate\(item/);
  assert.match(source, /!freshStoreCoordinate\(item/);
  assert.match(source, /storeResolvedAt:\s*Date\.now\(\)/);
  assert.doesNotMatch(source, /storePlaceId:\s*['"]{2}/);
});

test('nearby module is bootstrapped independently from the existing item workflow', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /nearby-sort\.js/);
  assert.match(source, /initNearbySort/);
});
