import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appEnhancementsPath = new URL('../../src/client/app/app-enhancements.js', import.meta.url);
const accountSettingsPath = new URL('../../src/client/app/account-settings.js', import.meta.url);
const featureBootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);
const itemWorkflowPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);
const locationPickerPath = new URL('../../src/client/app/location-picker-chips.js', import.meta.url);

async function source(path) {
  return readFile(path, 'utf8');
}

test('feature bootstrap no longer initializes Places mode, store lookup, or nearby sorting', async () => {
  const text = await source(featureBootstrapPath);
  assert.doesNotMatch(text, /maps-mode-enhancements\.js/);
  assert.doesNotMatch(text, /store-location-enhancements\.js/);
  assert.doesNotMatch(text, /nearby-sort\.js/);
  assert.doesNotMatch(text, /Maps 模式|商店位置|附近排序/);
});

test('account settings no longer exposes Google Maps or Places API-key controls', async () => {
  const text = await source(accountSettingsPath);
  assert.doesNotMatch(text, /normalizeMapsApiKeys/);
  assert.doesNotMatch(text, /account-open-maps|account-maps-view|account-maps-primary-key|account-maps-backup-key/);
  assert.doesNotMatch(text, /Google Maps \/ Places|shopping-list:maps-settings-changed|shopping-list:maps-key-test-requested/);
});

test('item workflow no longer sorts cards by distance or renders distance labels', async () => {
  const text = await source(itemWorkflowPath);
  assert.doesNotMatch(text, /formatDistance|sortItemsByStatusAndDistanceMap/);
  assert.doesNotMatch(text, /shoppingListNearbySort|nearby-distance-label|ensureDistanceLabel/);
});

test('home-card where-to-buy actions are blue and attach to the existing category-location metadata row', async () => {
  const text = await source(appEnhancementsPath);
  assert.match(text, /home-location-map-action/);
  assert.match(text, /bg-pastelBlue/);
  assert.match(text, /const locationRow = card\.querySelector\('\.home-item-meta-row'\)/);
  assert.match(text, /locationRow\.appendChild\(locationMap\)/);
  assert.doesNotMatch(text, /actions\.appendChild\(locationMap\)/);
});

test('selected where-to-buy chips stay on one horizontally scrollable row on phones', async () => {
  const text = await source(locationPickerPath);
  assert.match(text, /id="item-multi-location-chips" class="[^"]*flex-nowrap[^"]*overflow-x-auto[^"]*no-scrollbar/);
  assert.match(text, /sm:flex-wrap/);
  assert.match(text, /sm:overflow-visible/);
});
