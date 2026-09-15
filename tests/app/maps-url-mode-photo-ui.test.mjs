import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const accountUrl = new URL('../../src/client/app/account-settings.js', import.meta.url);
const storeUrl = new URL('../../src/client/app/store-location-enhancements.js', import.meta.url);
const nearbyUrl = new URL('../../src/client/app/nearby-sort.js', import.meta.url);
const appUrl = new URL('../../src/client/app/app-enhancements.js', import.meta.url);

test('API settings expose and publish a Google Maps / Places enable switch', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /account-maps-places-enabled/);
  assert.match(source, /mapsPlacesEnabled/);
  assert.match(source, /window\.shoppingListMapsPlacesEnabled/);
  assert.match(source, /mapsPlacesEnabled:\s*Boolean/);
});

test('Distance uses a no-key Google Maps URL path when Places mode is disabled', async () => {
  const source = await readFile(storeUrl, 'utf8');
  assert.match(source, /createGoogleMapsUrl/);
  assert.match(source, /function placesModeEnabled/);
  assert.match(source, /function openDistanceAction/);
  assert.match(source, /if \(!placesModeEnabled\(\)\)/);
  assert.match(source, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/);
  assert.match(source, /openBranchModal\(item\)/);
});

test('Places-off mode suppresses autocomplete and nearby coordinate backfill API calls', async () => {
  const storeSource = await readFile(storeUrl, 'utf8');
  const nearbySource = await readFile(nearbyUrl, 'utf8');
  assert.match(storeSource, /if \(!placesModeEnabled\(\)\) return hideSuggestions\(\)/);
  assert.match(nearbySource, /shoppingListMapsPlacesEnabled/);
});

test('photo upload placeholder is restored for existing items and desktop photo grid is capped without changing mobile width', async () => {
  const source = await readFile(appUrl, 'utf8');
  assert.match(source, /placeholder\.classList\.remove\('hidden'\)/);
  assert.match(source, /id="photo-preview-grid" class="grid grid-cols-3 gap-2 sm:max-w-sm sm:mx-auto"/);
});
