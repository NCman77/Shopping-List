import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../../src/client/app/coupon-management-ui.js', import.meta.url);

async function source() {
  return readFile(sourceUrl, 'utf8');
}

test('coupon management UI exposes the approved settings entry, storage, cleanup, alias search, and shared manager API', async () => {
  const text = await source();
  assert.match(text, /account-open-coupon-management/);
  assert.match(text, /優惠券管理/);
  assert.match(text, /account-open-personalization/);
  assert.match(text, /couponDictionary/);
  assert.match(text, /runTransaction/);
  assert.match(text, /cleanupCoupons/);
  assert.match(text, /searchBrandsByAlias/);
  assert.match(text, /shoppingListCouponManager/);
  assert.match(text, /coupon-country-view/);
  assert.match(text, /coupon-list-view/);
  assert.match(text, /coupon-editor-view/);
});

test('coupon settings entry is inserted immediately before personalization', async () => {
  const text = await source();
  const personalizationLookup = text.indexOf("getElementById('account-open-personalization')");
  const insertion = text.indexOf('insertBefore(button, personalizationButton)');
  assert.ok(personalizationLookup >= 0);
  assert.ok(insertion > personalizationLookup);
});

test('coupon editor has brand search, URL, date range, save and delete controls', async () => {
  const text = await source();
  for (const id of [
    'coupon-brand-search',
    'coupon-brand-results',
    'coupon-selected-brand',
    'coupon-url',
    'coupon-valid-from',
    'coupon-valid-until',
    'coupon-editor-save',
    'coupon-editor-delete'
  ]) {
    assert.match(text, new RegExp(id));
  }
});

test('coupon persistence keeps one record per brandId and cleans expired/orphan records', async () => {
  const text = await source();
  assert.match(text, /findIndex\(.*brandId/s);
  assert.match(text, /transaction\.set/);
  assert.match(text, /cleanupCoupons\(/);
  assert.match(text, /removed\.length/);
});


test('coupon manager uses back for settings return and close for exiting the settings flow', async () => {
  const text = await source();
  assert.match(text, /coupon-back-settings[^\n]*closeManager\(\{ returnToSettings: true \}\)/);
  assert.match(text, /coupon-close[^\n]*closeManager\(\)/);
  assert.doesNotMatch(text, /coupon-close[^\n]*returnToSettings: state\.openedFromSettings/);
});


test('coupon management top-level header matches personalization styling and country rows show an earth icon', async () => {
  const text = await source();
  assert.match(text, /id="coupon-country-header"[^>]*bg-pastelBlue[^>]*border-b-4[^>]*px-5 py-4/);
  assert.match(text, /<h3 class="text-xl font-bold text-warmBrown">優惠券管理<\/h3>/);
  assert.match(text, /coupon-country-icon/);
  assert.match(text, /fa-earth-asia/);
});


test('coupon management country rows use the shared PNG country flag renderer', async () => {
  const text = await source();
  const render = text.match(/function renderCountries\(\) \{([\s\S]*?)\n  \}\n\n  function renderList/)?.[1] || '';
  assert.match(text, /createCountryFlagElement/);
  assert.match(render, /createCountryFlagElement\(documentRef,\s*country/);
  assert.doesNotMatch(render, /fa-earth-asia/);
});
