import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildItemCouponEditorRows } from '../../src/client/app/item-coupon-ui.js';

const sourceUrl = new URL('../../src/client/app/item-coupon-ui.js', import.meta.url);

const brands = [
  {
    id: 'matsumoto', country: '日本',
    aliases: [
      { language: '中文', value: '松本清' },
      { language: '日文', value: 'マツモトキヨシ' },
      { language: '英文', value: 'Matsumoto Kiyoshi' }
    ]
  },
  {
    id: 'tsuruha', country: '日本',
    aliases: [
      { language: '中文', value: '鶴羽藥妝' },
      { language: '日文', value: 'ツルハドラッグ' },
      { language: '英文', value: 'TSURUHA' }
    ]
  }
];

const coupons = [
  {
    brandId: 'matsumoto', country: '日本', couponUrl: 'https://m.example/coupon',
    validFrom: '2026-09-01', validUntil: '2026-09-30'
  }
];

test('add/edit coupon rows derive every selected store and deduplicate aliases by brandId', () => {
  const rows = buildItemCouponEditorRows({
    locations: ['Matsumoto Kiyoshi', 'マツモトキヨシ', 'ツルハドラッグ TSURUHA'],
    brands,
    coupons,
    country: '日本',
    todayKey: '2026-09-17'
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.brandId), ['matsumoto', 'tsuruha']);
  assert.deepEqual(rows.map((row) => row.displayName), ['松本清', '鶴羽藥妝']);
  assert.equal(rows[0].coupon?.couponUrl, 'https://m.example/coupon');
  assert.equal(rows[1].coupon, null);
});

test('unresolved location stays visible without guessing a coupon brand', () => {
  const rows = buildItemCouponEditorRows({
    locations: ['Unknown Shop'], brands, coupons, country: '日本', todayKey: '2026-09-17'
  });
  assert.deepEqual(rows, [{
    rawLocation: 'Unknown Shop',
    brandId: '',
    displayName: 'Unknown Shop',
    coupon: null,
    status: 'unresolved'
  }]);
});

test('item coupon UI is derived from raw multi-location state and never writes coupon data into item documents', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /item-coupon-section/);
  assert.match(source, /item-multi-location-options/);
  assert.match(source, /shoppingListCouponManager\.open/);
  assert.match(source, /returnContext:\s*\{\s*source:\s*['"]item-form['"]/s);
  assert.doesNotMatch(source, /updateDoc\([^)]*coupon/i);
  assert.doesNotMatch(source, /setDoc\([^)]*items/i);
});

test('coupon UI rerenders from coupon manager subscription without resetting the product form', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /shoppingListCouponManager\.subscribe/);
  assert.doesNotMatch(source, /openAddModal\(/);
  assert.doesNotMatch(source, /openEditModal\(/);
  assert.doesNotMatch(source, /resetItem/i);
});
