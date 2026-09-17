import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupCoupons,
  couponDateStatus,
  deriveItemCouponRows,
  findUniqueBrandMatch,
  normalizeCouponUrl,
  searchBrandsByAlias,
  validateCouponDraft
} from '../../src/client/app/coupon-core.js';

const brands = [
  {
    id: 'matsumoto',
    country: '日本',
    aliases: [
      { language: '中文', value: '松本清' },
      { language: '日文', value: 'マツモトキヨシ' },
      { language: '英文', value: 'Matsumoto Kiyoshi' }
    ]
  },
  {
    id: 'tsuruha',
    country: '日本',
    aliases: [
      { language: '中文', value: '鶴羽藥妝' },
      { language: '日文', value: 'ツルハドラッグ' },
      { language: '英文', value: 'TSURUHA' }
    ]
  }
];

const coupons = [
  {
    brandId: 'matsumoto',
    country: '日本',
    couponUrl: 'https://m.example/coupon?a=1#use',
    validFrom: '2026-09-01',
    validUntil: '2026-09-30'
  },
  {
    brandId: 'tsuruha',
    country: '日本',
    couponUrl: 'https://t.example/coupon',
    validFrom: '2026-09-20',
    validUntil: '2026-10-31'
  }
];

test('coupon URL requires absolute http(s) and preserves query and fragment', () => {
  assert.equal(
    normalizeCouponUrl('https://example.jp/coupon?a=1#use'),
    'https://example.jp/coupon?a=1#use'
  );
  assert.throws(() => normalizeCouponUrl('javascript:alert(1)'));
  assert.throws(() => normalizeCouponUrl('/coupon'));
});

test('coupon end date is active through that calendar day', () => {
  const coupon = { validFrom: '2026-09-01', validUntil: '2026-09-17' };
  assert.equal(couponDateStatus(coupon, '2026-09-17'), 'active');
  assert.equal(couponDateStatus(coupon, '2026-09-18'), 'expired');
  assert.equal(couponDateStatus(coupon, '2026-08-31'), 'future');
});

test('coupon draft validates required fields, URL, and date order', () => {
  const valid = validateCouponDraft({
    brandId: 'matsumoto',
    country: '日本',
    couponUrl: 'https://example.jp/coupon?a=1#use',
    validFrom: '2026-09-01',
    validUntil: '2026-09-30'
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.couponUrl, 'https://example.jp/coupon?a=1#use');

  assert.equal(validateCouponDraft({
    brandId: 'matsumoto', country: '日本', couponUrl: 'https://example.jp',
    validFrom: '2026-10-01', validUntil: '2026-09-30'
  }).ok, false);
  assert.equal(validateCouponDraft({
    brandId: 'matsumoto', country: '日本', couponUrl: 'javascript:alert(1)',
    validFrom: '2026-09-01', validUntil: '2026-09-30'
  }).ok, false);
});

test('brand matching accepts any populated alias and search finds all aliases', () => {
  assert.equal(findUniqueBrandMatch(brands, '松本清', '日本').brand.id, 'matsumoto');
  assert.equal(findUniqueBrandMatch(brands, 'マツモトキヨシ', '日本').brand.id, 'matsumoto');
  assert.equal(findUniqueBrandMatch(brands, 'Matsumoto Kiyoshi', '日本').brand.id, 'matsumoto');
  assert.deepEqual(searchBrandsByAlias(brands, 'matsumoto', '日本').map((brand) => brand.id), ['matsumoto']);
  assert.deepEqual(searchBrandsByAlias(brands, '松本', '日本').map((brand) => brand.id), ['matsumoto']);
  assert.deepEqual(searchBrandsByAlias(brands, 'ツルハ', '日本').map((brand) => brand.id), ['tsuruha']);
});

test('ambiguous brand matches never silently choose the first brand', () => {
  const ambiguousBrands = [
    ...brands,
    {
      id: 'duplicate-matsumoto',
      country: '日本',
      aliases: [{ language: '英文', value: 'Matsumoto Kiyoshi' }]
    }
  ];
  const result = findUniqueBrandMatch(ambiguousBrands, 'Matsumoto Kiyoshi', '日本');
  assert.equal(result.kind, 'ambiguous');
  assert.deepEqual(result.brands.map((brand) => brand.id), ['matsumoto', 'duplicate-matsumoto']);
});

test('cleanup removes expired and orphan coupons while keeping active/future valid brand coupons', () => {
  const input = [
    ...coupons,
    {
      brandId: 'expired', country: '日本', couponUrl: 'https://expired.example',
      validFrom: '2026-08-01', validUntil: '2026-09-16'
    },
    {
      brandId: 'orphan', country: '日本', couponUrl: 'https://orphan.example',
      validFrom: '2026-09-01', validUntil: '2026-09-30'
    }
  ];
  const brandsWithExpired = [
    ...brands,
    { id: 'expired', country: '日本', aliases: [{ language: '日文', value: '期限切れ' }] }
  ];
  const result = cleanupCoupons(input, brandsWithExpired, '2026-09-17');
  assert.deepEqual(result.kept.map((coupon) => coupon.brandId), ['matsumoto', 'tsuruha']);
  assert.deepEqual(result.removed.map((coupon) => coupon.brandId), ['expired', 'orphan']);
});

test('multi-location item resolves every distinct brand once and uses Chinese-first display names', () => {
  const rows = deriveItemCouponRows({
    locations: ['Matsumoto Kiyoshi', 'マツモトキヨシ', 'ツルハドラッグ TSURUHA'],
    brands,
    coupons,
    country: '日本',
    todayKey: '2026-09-17',
    includeInactive: true
  });
  assert.deepEqual(rows.map((row) => row.brandId), ['matsumoto', 'tsuruha']);
  assert.deepEqual(rows.map((row) => row.displayName), ['松本清', '鶴羽藥妝']);
  assert.deepEqual(rows.map((row) => row.status), ['active', 'future']);
});

test('item detail derivation excludes future and expired coupons when inactive coupons are not requested', () => {
  const rows = deriveItemCouponRows({
    locations: ['Matsumoto Kiyoshi', 'ツルハドラッグ TSURUHA'],
    brands,
    coupons,
    country: '日本',
    todayKey: '2026-09-17',
    includeInactive: false
  });
  assert.deepEqual(rows.map((row) => row.brandId), ['matsumoto']);
});

test('unmatched or ambiguous locations are not assigned to guessed coupons', () => {
  const ambiguousBrands = [
    ...brands,
    {
      id: 'duplicate-matsumoto',
      country: '日本',
      aliases: [{ language: '英文', value: 'Matsumoto Kiyoshi' }]
    }
  ];
  const rows = deriveItemCouponRows({
    locations: ['Unknown Store', 'Matsumoto Kiyoshi'],
    brands: ambiguousBrands,
    coupons,
    country: '日本',
    todayKey: '2026-09-17',
    includeInactive: true
  });
  assert.equal(rows.length, 0);
});
