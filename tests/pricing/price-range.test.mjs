import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePriceRange,
  normalizePriceResearch,
  rangeMidpoint
} from '../../src/client/pricing/price-range.js';

test('invalid or non-positive price values become null', () => {
  assert.deepEqual(normalizePriceRange('', -10), {
    min: null,
    max: null,
    low: null,
    high: null
  });
});

test('one-sided range keeps the omitted form field null but has effective equal bounds', () => {
  assert.deepEqual(normalizePriceRange(null, '699'), {
    min: null,
    max: 699,
    low: 699,
    high: 699
  });
});

test('reversed two-sided range is stored in valid ascending order', () => {
  assert.deepEqual(normalizePriceRange('699', '399'), {
    min: 399,
    max: 699,
    low: 399,
    high: 699
  });
});

test('Taiwan range midpoint uses the approved common-price baseline', () => {
  assert.equal(rangeMidpoint(normalizePriceRange(399, 699)), 549);
});

test('price research normalizes both ranges and currency metadata', () => {
  assert.deepEqual(normalizePriceResearch({
    taiwanMinTwd: '699',
    taiwanMaxTwd: '399',
    localMin: '1280',
    localMax: '',
    currencyCode: ' jpy ',
    updatedAt: 123
  }), {
    taiwanMinTwd: 399,
    taiwanMaxTwd: 699,
    localMin: 1280,
    localMax: null,
    currencyCode: 'JPY',
    updatedAt: 123
  });
});
