import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCopiedItemData } from '../../src/client/app/item-copy.js';

const pricingUiPath = new URL('../../src/client/app/price-comparison-enhancements.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);
const workflowPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);
const tripSavePath = new URL('../../src/client/app/trip-save-guard.js', import.meta.url);

test('price enhancement provides pre-trip research and multi-location form controls', async () => {
  const source = await readFile(pricingUiPath, 'utf8');
  assert.match(source, /價格功課/);
  assert.match(source, /item-price-tw-min/);
  assert.match(source, /item-price-tw-max/);
  assert.match(source, /item-price-local-min/);
  assert.match(source, /item-price-local-max/);
  assert.match(source, /item-multi-location-field/);
  assert.match(source, /multi-location-control/);
  assert.match(source, /locationWritePatch/);
  assert.match(source, /normalizePriceResearch/);
});

test('price form snapshots its patch and updates only the successful captured operation', async () => {
  const source = await readFile(pricingUiPath, 'utf8');
  assert.match(source, /registerItemSaveSnapshotProvider\('price-comparison'/);
  assert.match(source, /operation\.extensions\?\.\['price-comparison'\]/);
  assert.match(source, /result\.operationId === operation\.operationId/);
  assert.match(source, /auth\.currentUser\?\.uid === operation\.userId/);
  assert.match(source, /const locationPatch = locationWritePatch\(state\.selectedLocations\)/);
  assert.match(source, /return \{ \.\.\.locationPatch, priceResearch \}/);
  assert.match(source, /updateDoc/);
  assert.match(source, /priceResearch/);
});

test('pricing enhancement bootstraps independently and waits for trip-save wrapper readiness', async () => {
  const [bootstrap, tripSave] = await Promise.all([
    readFile(bootstrapPath, 'utf8'),
    readFile(tripSavePath, 'utf8')
  ]);
  assert.match(bootstrap, /price-comparison-enhancements\.js/);
  assert.match(bootstrap, /initPriceComparisonEnhancements/);
  assert.match(bootstrap, /商品比價/);
  assert.match(tripSave, /__shoppingListTripSaveGuardReady/);
});

test('item workflow owns multi-location eligibility and locks new controls in view mode', async () => {
  const source = await readFile(workflowPath, 'utf8');
  assert.match(source, /itemMatchesLocation/);
  assert.match(source, /shoppingListMultiLocationFilter/);
  assert.match(source, /price-edit-control/);
  assert.match(source, /multi-location-control/);
});

test('copied items preserve all candidate locations and price research', () => {
  const copied = buildCopiedItemData({
    source: {
      id: 'source-price',
      name: '護髮',
      country: '日本',
      location: '新宿',
      locations: ['新宿', '澀谷'],
      priceResearch: {
        taiwanMinTwd: 399,
        taiwanMaxTwd: 699,
        localMin: 1280,
        localMax: 1680,
        currencyCode: 'JPY',
        updatedAt: 123
      }
    },
    targetTrip: { id: 'trip-new', country: '日本' },
    newItemId: 'copy-price',
    now: 500
  });
  assert.deepEqual(copied.locations, ['新宿', '澀谷']);
  assert.equal(copied.location, '新宿');
  assert.deepEqual(copied.priceResearch, {
    taiwanMinTwd: 399,
    taiwanMaxTwd: 699,
    localMin: 1280,
    localMax: 1680,
    currencyCode: 'JPY',
    updatedAt: 123
  });
});


test('price comparison no longer renders the Rates By Exchange Rate attribution label', async () => {
  const source = await readFile(pricingUiPath, 'utf8');
  assert.doesNotMatch(source, /匯率來源：Rates By Exchange Rate API/);
});
