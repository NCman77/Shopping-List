import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaiwanComparison,
  calculateLocalPrice,
  normalizeCouponPercent
} from '../../src/client/pricing/price-calculator.js';

test('coupon percentage is normalized to a safe 0-100 range', () => {
  assert.equal(normalizeCouponPercent(-5), 0);
  assert.equal(normalizeCouponPercent('10'), 10);
  assert.equal(normalizeCouponPercent(120), 100);
  assert.equal(normalizeCouponPercent('nope'), 0);
});

test('tax-free removes included 10 percent tax by division, not subtraction', () => {
  const result = calculateLocalPrice({ storePrice: 1100, couponPercent: 0, taxRate: 0.10 });
  assert.equal(result.postCouponPrice, 1100);
  assert.ok(Math.abs(result.estimatedFinalPrice - 1000) < 1e-9);
});

test('reduced 8 percent tax-inclusive price is removed correctly', () => {
  const result = calculateLocalPrice({ storePrice: 1080, couponPercent: 0, taxRate: 0.08 });
  assert.ok(Math.abs(result.estimatedFinalPrice - 1000) < 1e-9);
});

test('coupon is applied before removing included tax', () => {
  const result = calculateLocalPrice({ storePrice: 1480, couponPercent: 10, taxRate: 0.10 });
  assert.equal(result.postCouponPrice, 1332);
  assert.ok(Math.abs(result.estimatedFinalPrice - 1210.909090909091) < 1e-9);
});

test('Taiwan headline comparison uses range midpoint and exposes low/high comparisons', () => {
  const result = buildTaiwanComparison({
    estimatedTwd: 260,
    research: { taiwanMinTwd: 399, taiwanMaxTwd: 699 }
  });
  assert.equal(result.baselineTwd, 549);
  assert.equal(result.direction, 'cheaper');
  assert.ok(Math.abs(result.percentDifference - ((549 - 260) / 549 * 100)) < 1e-9);
  assert.ok(Math.abs(result.versusLowPercent - ((399 - 260) / 399 * 100)) < 1e-9);
  assert.ok(Math.abs(result.versusHighPercent - ((699 - 260) / 699 * 100)) < 1e-9);
});
