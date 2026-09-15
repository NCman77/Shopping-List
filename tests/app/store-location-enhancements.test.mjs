import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSelectedStorePatch } from '../../src/client/app/store-location-enhancements.js';

const sourcePath = new URL('../../src/client/app/store-location-enhancements.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);
const indexPath = new URL('../../index.html', import.meta.url);

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

test('distance search query automatically uses the saved store name and only falls back to resolved branch name', async () => {
  const module = await import('../../src/client/app/store-location-enhancements.js');
  assert.equal(typeof module.branchSearchQuery, 'function');
  assert.equal(module.branchSearchQuery({ storeName: '松本清', storeDisplayName: 'マツモトキヨシ 新宿店' }), '松本清');
  assert.equal(module.branchSearchQuery({ storeName: '', storeDisplayName: 'Don Quijote Shinjuku' }), 'Don Quijote Shinjuku');
  assert.equal(module.branchSearchQuery({}), '');
});

test('post-save metadata uses the stable trip-guard save result after the modal clears item-id', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /shoppingListLastItemSave/);
  assert.match(source, /const itemId = clean\(window\.shoppingListLastItemSave\?\.itemId\)/);
  assert.doesNotMatch(source, /const itemId = clean\(document\.getElementById\('item-id'\)\?\.value\)/);
});

test('post-save metadata stays scoped to the account that started the save', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /const savingUserId = clean\(auth\.currentUser\?\.uid \|\| state\.userId\)/);
  assert.match(source, /window\.shoppingListLastItemSave\?\.userId === savingUserId/);
  assert.match(source, /auth\.currentUser\?\.uid === savingUserId/);
  assert.match(source, /state\.userId === savingUserId/);
  assert.match(source, /itemRef\(itemId, savingUserId\)/);
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

test('add/edit form keeps category, location and store on one compact row with a wide autocomplete overlay', async () => {
  const [index, source] = await Promise.all([
    readFile(indexPath, 'utf8'),
    readFile(sourcePath, 'utf8')
  ]);
  assert.match(index, /id="item-purchase-meta-row"/);
  assert.match(index, /grid-cols-\[minmax\(0,0\.8fr\)_minmax\(0,0\.8fr\)_minmax\(0,1\.4fr\)\]/);
  assert.match(source, /document\.getElementById\('item-purchase-meta-row'\)/);
  assert.match(source, /purchaseMetaRow\.appendChild\(field\)/);
  assert.match(source, /store-suggestions[^`]*right-0[^`]*w-\[min\(92vw,24rem\)\]/s);
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
