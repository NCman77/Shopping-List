import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mapsModeUrl = new URL('../../src/client/app/maps-mode-enhancements.js', import.meta.url);
const photoFixUrl = new URL('../../src/client/app/photo-ui-fixes.js', import.meta.url);
const bootstrapUrl = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('legacy Maps mode module still keeps its persisted toggle logic for historical compatibility', async () => {
  const source = await readFile(mapsModeUrl, 'utf8');
  assert.match(source, /account-maps-places-enabled/);
  assert.match(source, /mapsPlacesEnabled/);
  assert.match(source, /window\.shoppingListMapsPlacesEnabled/);
  assert.match(source, /setDoc\([^\n]*mapsPlacesEnabled/);
});

test('legacy Maps mode retains its no-key URL path without being bootstrapped', async () => {
  const source = await readFile(mapsModeUrl, 'utf8');
  assert.match(source, /createGoogleMapsUrl/);
  assert.match(source, /nearby-distance-action/);
  assert.match(source, /storeName/);
  assert.match(source, /storeDisplayName/);
  assert.match(source, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/);
  assert.match(source, /stopImmediatePropagation/);
});

test('retired Places mode is no longer bootstrapped even though its compatibility module remains', async () => {
  const source = await readFile(mapsModeUrl, 'utf8');
  const bootstrap = await readFile(bootstrapUrl, 'utf8');
  assert.match(source, /export function installMapsSettingsRuntimeGuard/);
  assert.match(source, /shopping-list:maps-settings-changed/);
  assert.match(source, /capture:\s*true/);
  assert.match(source, /window\.shoppingListMapsApiKeys/);
  assert.match(source, /window\.shoppingListMapsBrowserApiKey\s*=\s*''/);
  assert.doesNotMatch(bootstrap, /maps-mode-enhancements\.js/);
  assert.doesNotMatch(bootstrap, /initMapsModeEnhancements|installMapsSettingsRuntimeGuard/);
});

test('photo upload placeholder is restored for existing items and desktop photo grid is capped without changing mobile width', async () => {
  const source = await readFile(photoFixUrl, 'utf8');
  assert.match(source, /getElementById\('add-modal'\)/);
  assert.doesNotMatch(source, /getElementById\('item-modal'\)/);
  assert.match(source, /photo-placeholder/);
  assert.match(source, /classList\.remove\('hidden'\)/);
  assert.match(source, /photo-preview-grid/);
  assert.match(source, /lg:max-w-md/);
  assert.match(source, /lg:mx-auto/);
  assert.doesNotMatch(source, /sm:max-w|md:max-w/);
});

test('photo UI remains bootstrapped while retired Maps mode stays unloaded', async () => {
  const source = await readFile(bootstrapUrl, 'utf8');
  assert.doesNotMatch(source, /maps-mode-enhancements\.js/);
  assert.match(source, /photo-ui-fixes\.js/);
});
