import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSelectedStorePatch } from '../../src/client/app/store-location-enhancements.js';

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

test('selected branch keeps the user brand query for future nearby-branch searches', () => {
  const patch = buildSelectedStorePatch({
    storeName: '松本清',
    place: {
      placeId: 'branch-1',
      displayName: 'マツモトキヨシ 新宿三丁目Part2店',
      address: '東京都新宿区新宿3-17-3',
      lat: 35.6912,
      lng: 139.7046
    },
    resolvedAt: 12345
  });
  assert.deepEqual(patch, {
    storeName: '松本清',
    storePlaceId: 'branch-1',
    storeDisplayName: 'マツモトキヨシ 新宿三丁目Part2店',
    storeAddress: '東京都新宿区新宿3-17-3',
    storeLat: 35.6912,
    storeLng: 139.7046,
    storeResolvedAt: 12345
  });
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
