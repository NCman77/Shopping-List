import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../src/client/app/item-modal-layout.js', import.meta.url), 'utf8');

test('edit detail card keeps coupon section after selected locations and before price research', () => {
  const chipsIndex = source.indexOf("documentRef.getElementById('item-multi-location-chips-row')");
  const couponIndex = source.indexOf("documentRef.getElementById('item-coupon-section')");
  const priceIndex = source.indexOf("documentRef.getElementById('price-research-section')");

  assert.ok(chipsIndex >= 0, 'selected-location row must stay in the edit detail card');
  assert.ok(couponIndex > chipsIndex, 'coupon section must follow selected locations');
  assert.ok(priceIndex > couponIndex, 'price research must remain after coupon section');
});
