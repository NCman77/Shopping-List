import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mapsModeUrl = new URL('../../src/client/app/maps-mode-enhancements.js', import.meta.url);
const photoFixUrl = new URL('../../src/client/app/photo-ui-fixes.js', import.meta.url);
const bootstrapUrl = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('API settings expose and persist a Google Maps / Places enable switch', async () => {
  const source = await readFile(mapsModeUrl, 'utf8');
  assert.match(source, /account-maps-places-enabled/);
  assert.match(source, /mapsPlacesEnabled/);
  assert.match(source, /window\.shoppingListMapsPlacesEnabled/);
  assert.match(source, /setDoc\([^\n]*mapsPlacesEnabled/);
});

test('Distance uses a no-key Google Maps URL path when Places mode is disabled', async () => {
  const source = await readFile(mapsModeUrl, 'utf8');
  assert.match(source, /createGoogleMapsUrl/);
  assert.match(source, /nearby-distance-action/);
  assert.match(source, /storeName/);
  assert.match(source, /storeDisplayName/);
  assert.match(source, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/);
  assert.match(source, /stopImmediatePropagation/);
});

test('Places-off mode redacts runtime browser keys before existing Places listeners can use them', async () => {
  const source = await readFile(mapsModeUrl, 'utf8');
  assert.match(source, /shopping-list:maps-settings-changed/);
  assert.match(source, /capture:\s*true/);
  assert.match(source, /window\.shoppingListMapsApiKeys/);
  assert.match(source, /window\.shoppingListMapsBrowserApiKey\s*=\s*''/);
  assert.match(source, /primary:\s*''/);
  assert.match(source, /backup:\s*''/);
});

test('photo upload placeholder is restored for existing items and desktop photo grid is capped without changing mobile width', async () => {
  const source = await readFile(photoFixUrl, 'utf8');
  assert.match(source, /photo-placeholder/);
  assert.match(source, /classList\.remove\('hidden'\)/);
  assert.match(source, /photo-preview-grid/);
  assert.match(source, /sm:max-w-sm/);
  assert.match(source, /sm:mx-auto/);
});

test('new isolated enhancements are bootstrapped independently', async () => {
  const source = await readFile(bootstrapUrl, 'utf8');
  assert.match(source, /maps-mode-enhancements\.js/);
  assert.match(source, /photo-ui-fixes\.js/);
});
