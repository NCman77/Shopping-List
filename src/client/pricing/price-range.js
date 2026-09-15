function positiveOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizePriceRange(minValue, maxValue) {
  let min = positiveOrNull(minValue);
  let max = positiveOrNull(maxValue);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  const effective = [min, max].filter((value) => value !== null);
  if (!effective.length) return { min: null, max: null, low: null, high: null };
  if (effective.length === 1) {
    return { min, max, low: effective[0], high: effective[0] };
  }
  return { min, max, low: min, high: max };
}

export function rangeMidpoint(range = {}) {
  const low = positiveOrNull(range?.low);
  const high = positiveOrNull(range?.high);
  if (low === null || high === null) return null;
  return (low + high) / 2;
}

export function compareValueToRange(value, range = {}) {
  const amount = positiveOrNull(value);
  const low = positiveOrNull(range?.low);
  const high = positiveOrNull(range?.high);
  if (amount === null || low === null || high === null) return null;
  return {
    value: amount,
    low,
    high,
    versusLowPercent: ((low - amount) / low) * 100,
    versusHighPercent: ((high - amount) / high) * 100
  };
}

export function normalizePriceResearch(research = {}) {
  const taiwan = normalizePriceRange(research?.taiwanMinTwd, research?.taiwanMaxTwd);
  const local = normalizePriceRange(research?.localMin, research?.localMax);
  return {
    taiwanMinTwd: taiwan.min,
    taiwanMaxTwd: taiwan.max,
    localMin: local.min,
    localMax: local.max,
    currencyCode: String(research?.currencyCode ?? '').trim().toUpperCase(),
    updatedAt: finiteOrNull(research?.updatedAt)
  };
}
