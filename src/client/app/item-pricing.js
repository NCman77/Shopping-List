import { currencyMeta } from './currency.js';

function clean(value) {
  return String(value ?? '').trim();
}

function nullableFinite(value) {
  if (value === null || value === undefined || clean(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value, digits) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function normalizePriceRange(minInput, maxInput, currencyCode) {
  const rawMin = clean(minInput);
  const rawMax = clean(maxInput);
  if (!rawMin && !rawMax) return { min: null, max: null };
  const meta = currencyMeta(currencyCode);
  if (!meta) throw new TypeError('無法辨識價格幣別。');
  if (!rawMin && rawMax) throw new TypeError('請先輸入起始價格。');
  const minNumber = Number(rawMin);
  const maxNumber = rawMax ? Number(rawMax) : null;
  if (!Number.isFinite(minNumber) || (rawMax && !Number.isFinite(maxNumber))) {
    throw new TypeError('價格必須是有效數字。');
  }
  if (minNumber < 0 || (maxNumber !== null && maxNumber < 0)) {
    throw new TypeError('價格不能小於 0。');
  }
  const min = rounded(minNumber, meta.digits);
  const max = maxNumber === null ? null : rounded(maxNumber, meta.digits);
  if (max !== null && max < min) throw new TypeError('最高價不能低於最低價。');
  return { min, max };
}

export function buildReferencePricePatch({
  twdMin = '',
  twdMax = '',
  localMin = '',
  localMax = '',
  localCurrency = ''
} = {}) {
  const twd = normalizePriceRange(twdMin, twdMax, 'TWD');
  const localCode = clean(localCurrency).toUpperCase();
  const local = normalizePriceRange(localMin, localMax, localCode);
  const hasLocal = local.min !== null || local.max !== null;
  return {
    priceTwdMin: twd.min,
    priceTwdMax: twd.max,
    priceLocalMin: local.min,
    priceLocalMax: local.max,
    priceLocalCurrency: hasLocal ? localCode : ''
  };
}

export function readReferencePriceFields(item = {}) {
  return {
    priceTwdMin: nullableFinite(item?.priceTwdMin),
    priceTwdMax: nullableFinite(item?.priceTwdMax),
    priceLocalMin: nullableFinite(item?.priceLocalMin),
    priceLocalMax: nullableFinite(item?.priceLocalMax),
    priceLocalCurrency: clean(item?.priceLocalCurrency).toUpperCase()
  };
}
