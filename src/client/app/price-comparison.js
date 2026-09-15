const PRECISION = 1e10;

function stable(value) {
  return Math.round(Number(value) * PRECISION) / PRECISION;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRange(range = {}) {
  const min = finiteOrNull(range?.min);
  const max = finiteOrNull(range?.max);
  if (min === null) return { min: null, max: null };
  return { min, max: max === null ? null : max };
}

function midpoint(range = {}) {
  const normalized = normalizeRange(range);
  if (normalized.min === null) return null;
  if (normalized.max === null) return normalized.min;
  return stable((normalized.min + normalized.max) / 2);
}

function directionalComparison(reference, actual, labelBase) {
  if (!Number.isFinite(reference) || reference <= 0 || !Number.isFinite(actual)) return null;
  const signedSaving = (reference - actual) / reference * 100;
  const rounded = Math.round(Math.abs(signedSaving));
  if (Math.round(signedSaving) === 0) {
    return { direction: 'close', percent: 0, label: `與${labelBase}接近` };
  }
  if (signedSaving > 0) {
    return { direction: 'cheaper', percent: rounded, label: `比${labelBase}便宜 ${rounded}%` };
  }
  return { direction: 'expensive', percent: rounded, label: `比${labelBase}貴 ${rounded}%` };
}

export function calculateComparison({
  onsitePriceLocal = null,
  couponDiscountPct = 0,
  selectedTaxRule = null,
  localReference = {},
  taiwanReference = {},
  localToTwdRate = null
} = {}) {
  const onsite = finiteOrNull(onsitePriceLocal);
  if (onsite !== null && onsite < 0) throw new TypeError('目前店價不能小於 0。');

  const couponRaw = finiteOrNull(couponDiscountPct);
  const coupon = couponRaw === null ? 0 : couponRaw;
  if (coupon < 0 || coupon >= 100) throw new TypeError('優惠券折扣必須介於 0%（含）到 100%（不含）之間。');

  const taxRateRaw = finiteOrNull(selectedTaxRule?.rate);
  const taxRate = taxRateRaw !== null && taxRateRaw > 0 ? taxRateRaw : 0;
  if (taxRate < 0 || taxRate >= 1) throw new TypeError('稅率資料無效。');

  const localRange = normalizeRange(localReference);
  const taiwanRange = normalizeRange(taiwanReference);
  const taiwanBaseline = midpoint(taiwanRange);
  const localReferenceMidpoint = midpoint(localRange);

  let source = null;
  let comparedLocal = null;
  let discountedGrossLocal = null;
  let estimatedNetLocal = null;

  if (onsite !== null) {
    source = 'onsite';
    comparedLocal = onsite;
    discountedGrossLocal = stable(onsite * (1 - coupon / 100));
    estimatedNetLocal = taxRate > 0
      ? stable(discountedGrossLocal / (1 + taxRate))
      : discountedGrossLocal;
  } else if (localReferenceMidpoint !== null) {
    source = 'reference';
    comparedLocal = localReferenceMidpoint;
    discountedGrossLocal = localReferenceMidpoint;
    estimatedNetLocal = localReferenceMidpoint;
  }

  const fx = finiteOrNull(localToTwdRate);
  const estimatedTwd = estimatedNetLocal !== null && fx !== null && fx > 0
    ? stable(estimatedNetLocal * fx)
    : null;

  const headline = estimatedTwd !== null && taiwanBaseline !== null
    ? directionalComparison(taiwanBaseline, estimatedTwd, '台灣常見價')
    : null;

  const endpointComparisons = [];
  if (estimatedTwd !== null && taiwanRange.min !== null) {
    const low = directionalComparison(taiwanRange.min, estimatedTwd, '台灣最低價');
    if (low) endpointComparisons.push({ endpoint: 'min', reference: taiwanRange.min, ...low });
    if (taiwanRange.max !== null) {
      const high = directionalComparison(taiwanRange.max, estimatedTwd, '台灣最高價');
      if (high) endpointComparisons.push({ endpoint: 'max', reference: taiwanRange.max, ...high });
    }
  }

  return {
    source,
    comparedLocal,
    couponDiscountPct: coupon,
    taxRate,
    discountedGrossLocal,
    estimatedNetLocal,
    estimatedTwd,
    taiwanBaseline,
    headline,
    endpointComparisons
  };
}
