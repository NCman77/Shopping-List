import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bootstrapUrl = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

async function bootstrapSource() {
  return readFile(bootstrapUrl, 'utf8');
}

test('feature bootstrap initializes coupon management after brand dictionary', async () => {
  const text = await bootstrapSource();
  const brand = text.indexOf("import('./brand-dictionary-ui.js')");
  const coupon = text.indexOf("import('./coupon-management-ui.js')");
  assert.ok(brand >= 0, 'brand dictionary bootstrap must exist');
  assert.ok(coupon > brand, 'coupon management must initialize after brand dictionary');
  assert.match(text, /initCouponManagementUi/);
  assert.match(text, /優惠券管理/);
});
