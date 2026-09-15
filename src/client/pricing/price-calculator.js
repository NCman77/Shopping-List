import { normalizePriceRange, rangeMidpoint } from './price-range.js';

function positiveOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function normalizeCouponPercent(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

export function calculateLocalPrice({ storePrice, couponPercent = 0, taxRate = null } = {}) {
  const price = positiveOrNull(storePrice);
  const coupon = normalizeCouponPercent(couponPercent);
  const normalizedTaxRate = taxRate === null || taxRate === undefined || taxRate === ''
    ? null
    : nonNegativeOrNull(taxRate);
  if (price === null) {
    return {
      storePrice: null,
      couponPercent: coupon,
      taxRate: normalizedTaxRate,
      postCouponPrice: null,
      estimatedFinalPrice: null
    };
  }
  const postCouponPrice = price * (1 - coupon / 100);
  const estimatedFinalPrice = normalizedTaxRate === null
    ? postCouponPrice
    : postCouponPrice / (1 + normalizedTaxRate);
  return {
    storePrice: price,
    couponPercent: coupon,
    taxRate: normalizedTaxRate,
    postCouponPrice,
    estimatedFinalPrice
  };
}

export function buildTaiwanComparison({ estimatedTwd, research = {} } = {}) {
  const amount = nonNegativeOrNull(estimatedTwd);
  const range = normalizePriceRange(research?.taiwanMinTwd, research?.taiwanMaxTwd);
  const baselineTwd = rangeMidpoint(range);
  if (amount === null || baselineTwd === null || range.low === null || range.high === null) return null;
  const percentDifference = ((baselineTwd - amount) / baselineTwd) * 100;
  return {
    estimatedTwd: amount,
    baselineTwd,
    percentDifference,
    direction: percentDifference > 0 ? 'cheaper' : percentDifference < 0 ? 'more_expensive' : 'same',
    lowTwd: range.low,
    highTwd: range.high,
    versusLowPercent: ((range.low - amount) / range.low) * 100,
    versusHighPercent: ((range.high - amount) / range.high) * 100
  };
}
