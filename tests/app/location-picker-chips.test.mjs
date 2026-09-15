import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pricingUiPath = new URL('../../src/client/app/price-comparison-enhancements.js', import.meta.url);

test('where-to-buy uses a compact select plus removable selected-location chips', async () => {
  const source = await readFile(pricingUiPath, 'utf8');

  assert.match(source, /id="item-multi-location-select"/);
  assert.match(source, /id="item-multi-location-chips"/);
  assert.match(source, /multi-location-remove/);
  assert.match(source, /選擇購買地點/);
  assert.match(source, /state\.selectedLocations\s*=\s*addLocationSelection/);
  assert.match(source, /state\.selectedLocations\s*=\s*removeLocationSelection/);
});

test('view mode hides picker and remove controls while keeping selected chips visible', async () => {
  const source = await readFile(pricingUiPath, 'utf8');

  assert.match(source, /\.workflow-view-mode #item-multi-location-select-wrapper\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode \.multi-location-remove\s*\{[^}]*display:\s*none\s*!important/s);
  assert.doesNotMatch(source, /\.workflow-view-mode #item-multi-location-chips\s*\{[^}]*display:\s*none/s);
});

test('temporary legacy options are excluded from the selectable location definitions', async () => {
  const source = await readFile(pricingUiPath, 'utf8');

  assert.match(source, /option\.dataset\.pricingTemporary\s*!==\s*['"]true['"]/);
  assert.match(source, /\(舊\)/);
});
