import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSelectedStorePatch } from '../../src/client/app/store-location-enhancements.js';

const sourcePath = new URL('../../src/client/app/store-location-enhancements.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('legacy store enhancement retains its optional store input and autocomplete result surface', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /item-store-name/);
  assert.match(source, /商店/);
  assert.match(source, /store-suggestions/);
  assert.match(source, /fetchStoreSuggestions/);
  assert.match(source, /resolveStoreSuggestion/);
});

test('autocomplete uses two-character auto mode, 450ms debounce, and a manual path for one-character stores', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /AUTOCOMPLETE_DEBOUNCE_MS/);
  assert.match(source, /autocompleteMode/);
  assert.match(source, /setTimeout\([^;]*AUTOCOMPLETE_DEBOUNCE_MS/s);
  assert.match(source, /showManualSuggestionSearch/);
  assert.match(source, /runManualSuggestionSearch/);
  assert.match(source, /mode === 'manual'/);
  assert.match(source, /手動搜尋|搜尋「/);
});

test('autocomplete session starts only for an actual request and is discarded after selection, modal reset, account or key change', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /AutocompleteSessionToken/);
  assert.match(source, /function resetSuggestionSession/);
  assert.match(source, /state\.sessionToken = null/);
  assert.match(source, /shopping-list:maps-settings-changed/);
  assert.match(source, /state\.suggestionRequest \+= 1/);
  assert.match(source, /resolvedStoreValue/);
});

test('store selection synchronizes canonical address and optional place metadata without storing user GPS', async () => {
  const source = await readFile(sourcePath, 'utf8');
  for (const field of ['storeName', 'storePlaceId', 'storeDisplayName', 'storeAddress', 'storeLat', 'storeLng', 'storeResolvedAt']) {
    assert.match(source, new RegExp(field));
  }
  assert.doesNotMatch(source, /userLat|userLng|currentLatitude|currentLongitude/);
  assert.match(source, /updateDoc\(/);
});

test('selected branch keeps the user brand query for historical compatibility', () => {
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

test('legacy distance search query uses saved store name and only falls back to resolved branch name', async () => {
  const module = await import('../../src/client/app/store-location-enhancements.js');
  assert.equal(typeof module.branchSearchQuery, 'function');
  assert.equal(module.branchSearchQuery({ storeName: '松本清', storeDisplayName: 'マツモトキヨシ 新宿店' }), '松本清');
  assert.equal(module.branchSearchQuery({ storeName: '', storeDisplayName: 'Don Quijote Shinjuku' }), 'Don Quijote Shinjuku');
  assert.equal(module.branchSearchQuery({}), '');
});

test('post-save metadata uses the captured operation after the modal clears item-id', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /operation\.extensions\?\.\['store-location'\]/);
  assert.match(source, /result\.itemId === operation\.itemId/);
  assert.match(source, /itemRef\(operation\.itemId, operation\.userId\)/);
  assert.doesNotMatch(source, /const itemId = clean\(document\.getElementById\('item-id'\)\?\.value\)/);
});

test('post-save metadata stays scoped to the account that started the save', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /result\.userId === operation\.userId/);
  assert.match(source, /auth\.currentUser\?\.uid === operation\.userId/);
  assert.match(source, /state\.userId === operation\.userId/);
  assert.match(source, /itemRef\(operation\.itemId, operation\.userId\)/);
});

test('legacy homepage distance action remains isolated in the retired module', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /nearby-distance-action/);
  assert.match(source, /距離/);
  assert.match(source, /nearby-branch-modal/);
  assert.match(source, /enhanced-item-actions/);
  assert.match(source, /searchStoresByText/);
  assert.match(source, /getCurrentPosition/);
  assert.match(source, /query_place_id/);
});

test('legacy opening Distance only prefills the query; Search or Enter explicitly triggers nearby Text Search', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const openStart = source.indexOf('function openBranchModal');
  const searchStart = source.indexOf('async function runBranchSearch');
  assert.ok(openStart >= 0 && searchStart > openStart);
  const openBody = source.slice(openStart, searchStart);
  assert.doesNotMatch(openBody, /runBranchSearch\(/);
  assert.match(openBody, /按搜尋/);
  assert.match(source, /nearby-branch-search[^\n]*addEventListener|nearby-branch-search/s);
  assert.match(source, /event\.key === 'Enter'/);
});

test('nearby branch requests use memory cache, credential generation and in-flight suppression and clear on account/key changes', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /NearbySearchCache/);
  assert.match(source, /makeNearbyCacheKey/);
  assert.match(source, /nearbyCache/);
  assert.match(source, /branchSearchInFlight/);
  assert.match(source, /credentialGeneration/);
  assert.match(source, /nearbyCache\.clear\(\)/);
  assert.match(source, /shopping-list:maps-settings-changed/);
});

test('legacy Maps access uses primary/backup runtime credentials and classifies quota failures without quota failover', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /shoppingListMapsApiKeys/);
  assert.match(source, /loadPlacesLibraryWithFailover/);
  assert.match(source, /classifyMapsError/);
  assert.match(source, /quota/);
  assert.match(source, /配額|Cloud Console/);
});

test('legacy add/edit form layout remains in the retired module for historical compatibility', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /const purchaseMetaRow = document\.getElementById\('item-location'\)\?\.closest\('\.flex-1'\)\?\.parentElement/);
  assert.match(source, /purchaseMetaRow\.id = 'item-purchase-meta-row'/);
  assert.match(source, /grid-cols-\[minmax\(0,0\.8fr\)_minmax\(0,0\.8fr\)_minmax\(0,1\.4fr\)\]/);
  assert.match(source, /purchaseMetaRow\.appendChild\(field\)/);
  assert.match(source, /store-suggestions[^`]*right-0[^`]*w-\[min\(92vw,24rem\)\]/s);
});

test('missing Maps configuration or location failure remains recoverable inside the retired module', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /shoppingListMapsBrowserApiKey|shoppingListMapsApiKeys/);
  assert.match(source, /Google Maps \/ Places/);
  assert.match(source, /定位/);
  assert.doesNotMatch(source, /openAddressInMaps\s*=/);
});

test('trip save guard remains bootstrapped while store location enhancement is retired', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /trip-save-guard\.js/);
  assert.match(source, /initTripSaveGuard/);
  assert.doesNotMatch(source, /initStoreLocationEnhancements/);
  assert.doesNotMatch(source, /store-location-enhancements\.js/);
});
