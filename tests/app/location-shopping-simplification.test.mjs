import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authSessionPath = new URL('../../src/client/app/auth-session.js', import.meta.url);
const featureBootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);
const locationPickerPath = new URL('../../src/client/app/location-picker-chips.js', import.meta.url);
const retiredFeaturesPath = new URL('../../src/client/app/retired-location-features.js', import.meta.url);
const homeLocationDisplayPath = new URL('../../src/client/app/home-location-display.js', import.meta.url);

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

test('account API controls are removed after account settings initialize', async () => {
  const bootstrap = await source(featureBootstrapPath);
  const cleanup = await source(retiredFeaturesPath);
  assert.match(bootstrap, /retired-location-features\.js/);
  assert.match(cleanup, /account-open-maps/);
  assert.match(cleanup, /account-maps-view/);
  assert.match(cleanup, /\.remove\(\)/);
});

test('home-card where-to-buy actions are moved beside the existing location and styled blue', async () => {
  const auth = await source(authSessionPath);
  const display = await source(homeLocationDisplayPath);
  assert.match(auth, /home-location-display\.js/);
  assert.match(display, /home-location-map-action/);
  assert.match(display, /bg-pastelBlue/);
  assert.match(display, /enhanced-item-actions/);
  assert.match(display, /aria-label\^="在 Google 地圖搜尋"/);
  assert.match(display, /appendChild\(button\)/);
  assert.match(display, /legacyLink\.remove\(\)/);
});

test('selected where-to-buy chips stay on one horizontally scrollable row on phones', async () => {
  const text = await source(locationPickerPath);
  assert.match(text, /id="item-multi-location-chips" class="[^"]*flex-nowrap[^"]*overflow-x-auto[^"]*no-scrollbar/);
  assert.match(text, /sm:flex-wrap/);
  assert.match(text, /sm:overflow-visible/);
  assert.match(text, /shrink-0/);
});
