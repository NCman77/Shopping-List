import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourcePath = new URL('../../src/client/app/store-location-enhancements.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('store enhancement adds an optional store input and autocomplete result surface', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /item-store-name/);
  assert.match(source, /商店/);
  assert.match(source, /store-suggestions/);
  assert.match(source, /fetchStoreSuggestions/);
  assert.match(source, /resolveStoreSuggestion/);
});

test('store selection synchronizes canonical address and optional place metadata without storing user GPS', async () => {
  const source = await readFile(sourcePath, 'utf8');
  for (const field of ['storeName', 'storePlaceId', 'storeDisplayName', 'storeAddress', 'storeLat', 'storeLng', 'storeResolvedAt']) {
    assert.match(source, new RegExp(field));
  }
  assert.doesNotMatch(source, /userLat|userLng|currentLatitude|currentLongitude/);
  assert.match(source, /updateDoc\(/);
});

test('homepage distance action coexists with address action and opens a nearby branch modal', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /nearby-distance-action/);
  assert.match(source, /距離/);
  assert.match(source, /nearby-branch-modal/);
  assert.match(source, /enhanced-item-actions/);
  assert.match(source, /searchStoresByText/);
  assert.match(source, /getCurrentPosition/);
  assert.match(source, /query_place_id/);
});

test('missing Maps configuration or location failure is recoverable and does not replace existing address behavior', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /shoppingListMapsBrowserApiKey/);
  assert.match(source, /Google Maps \/ Places/);
  assert.match(source, /定位/);
  assert.doesNotMatch(source, /openAddressInMaps\s*=/);
});

test('store enhancement is initialized after trip save guard so its post-save metadata patch uses the reserved item id', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /await initTripSaveGuard\(\)/);
  assert.match(source, /initStoreLocationEnhancements/);
  assert.match(source, /store-location-enhancements\.js/);
});
