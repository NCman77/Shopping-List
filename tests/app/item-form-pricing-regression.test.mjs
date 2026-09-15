import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizePriceRange, buildReferencePricePatch, readReferencePriceFields } from '../../src/client/app/item-pricing.js';

const formUiUrl = new URL('../../src/client/app/item-form-pricing-locations.js', import.meta.url);
const bootstrapUrl = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('reference prices are optional and support a single amount or min/max range', () => {
  assert.deepEqual(normalizePriceRange('', '', 'TWD'), { min: null, max: null });
  assert.deepEqual(normalizePriceRange('399', '', 'TWD'), { min: 399, max: null });
  assert.deepEqual(normalizePriceRange('399', '699', 'TWD'), { min: 399, max: 699 });
  assert.deepEqual(normalizePriceRange('18.999', '', 'CAD'), { min: 19, max: null });
  assert.throws(() => normalizePriceRange('699', '399', 'TWD'), /最高價不能低於最低價/);
  assert.throws(() => normalizePriceRange('-1', '', 'TWD'), /不能小於 0/);
});

test('reference price patch persists only user-entered research values', () => {
  const patch = buildReferencePricePatch({
    twdMin: '399',
    twdMax: '699',
    localMin: '1280',
    localMax: '',
    localCurrency: 'JPY'
  });
  assert.deepEqual(patch, {
    priceTwdMin: 399,
    priceTwdMax: 699,
    priceLocalMin: 1280,
    priceLocalMax: null,
    priceLocalCurrency: 'JPY'
  });
  assert.deepEqual(readReferencePriceFields(patch), patch);
  assert.equal('estimatedTwd' in patch, false);
  assert.equal('savingsPct' in patch, false);
});

test('item form enhancement exposes multi-location picker, compact range controls, and stable save guard integration', async () => {
  const source = await readFile(formUiUrl, 'utf8');
  const bootstrap = await readFile(bootstrapUrl, 'utf8');
  assert.match(source, /shoppingListItemFormFields/);
  assert.match(source, /item-location-multi/);
  assert.match(source, /location-multi-picker/);
  assert.match(source, /價格參考/);
  assert.match(source, /台灣價/);
  assert.match(source, /price-twd-min/);
  assert.match(source, /price-local-min/);
  assert.match(source, /範圍/);
  assert.match(source, /shoppingListLastItemSave/);
  assert.match(source, /updateDoc/);
  assert.match(source, /state\.userId !== savingUserId/);
  assert.match(bootstrap, /initTripSaveGuard/);
  assert.match(bootstrap, /initItemFormPricingLocations/);
  assert.ok(bootstrap.indexOf('initTripSaveGuard') < bootstrap.indexOf('initItemFormPricingLocations'));
  assert.ok(bootstrap.indexOf('initItemFormPricingLocations') < bootstrap.indexOf('initStoreLocationEnhancements'));
});
