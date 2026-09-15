export const RATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PROVIDER_BASE_URL = 'https://open.er-api.com/v6/latest/';

function cleanCurrency(value) {
  return String(value ?? '').trim().toUpperCase();
}

function cacheKey(currencyCode) {
  return `shopping-list:exchange-rate:${cleanCurrency(currencyCode)}:TWD`;
}

export function normalizeRatePayload(payload, baseCurrency) {
  const currencyCode = cleanCurrency(baseCurrency);
  const rateToTwd = Number(payload?.rates?.TWD);
  if (!currencyCode || !Number.isFinite(rateToTwd) || rateToTwd <= 0) {
    throw new TypeError('Invalid exchange-rate payload');
  }
  const unix = Number(payload?.time_last_update_unix);
  return {
    currencyCode,
    rateToTwd,
    updatedAt: Number.isFinite(unix) && unix > 0 ? unix * 1000 : null
  };
}

export function writeRateCache(storage, currencyCode, data, cachedAt = Date.now()) {
  if (!storage || typeof storage.setItem !== 'function') return;
  const payload = {
    currencyCode: cleanCurrency(currencyCode),
    rateToTwd: Number(data?.rateToTwd),
    updatedAt: data?.updatedAt == null ? null : Number(data.updatedAt),
    cachedAt: Number(cachedAt)
  };
  try {
    storage.setItem(cacheKey(currencyCode), JSON.stringify(payload));
  } catch {}
}

export function readRateCache(storage, currencyCode, now = Date.now()) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(cacheKey(currencyCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const rateToTwd = Number(parsed?.rateToTwd);
    const cachedAt = Number(parsed?.cachedAt);
    if (!Number.isFinite(rateToTwd) || rateToTwd <= 0 || !Number.isFinite(cachedAt)) return null;
    return {
      currencyCode: cleanCurrency(parsed?.currencyCode || currencyCode),
      rateToTwd,
      updatedAt: parsed?.updatedAt == null ? null : Number(parsed.updatedAt),
      cachedAt,
      stale: Number(now) - cachedAt >= RATE_CACHE_TTL_MS
    };
  } catch {
    return null;
  }
}

export function convertToTwd(value, rateToTwd) {
  const amount = Number(value);
  const rate = Number(rateToTwd);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0) return null;
  return amount * rate;
}

export async function fetchRateToTwd({
  currencyCode,
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  now = Date.now()
} = {}) {
  const currency = cleanCurrency(currencyCode);
  if (!currency) {
    return { currencyCode: '', rateToTwd: null, updatedAt: null, stale: true, source: 'unavailable' };
  }
  if (currency === 'TWD') {
    return { currencyCode: 'TWD', rateToTwd: 1, updatedAt: Number(now), stale: false, source: 'identity' };
  }

  const cached = readRateCache(storage, currency, now);
  if (cached && !cached.stale) return { ...cached, source: 'cache' };

  try {
    if (typeof fetchImpl !== 'function') throw new Error('Fetch unavailable');
    const response = await fetchImpl(`${PROVIDER_BASE_URL}${encodeURIComponent(currency)}`);
    if (!response || response.ok === false) throw new Error(`Exchange-rate request failed${response?.status ? ` (${response.status})` : ''}`);
    const payload = await response.json();
    if (payload?.result && payload.result !== 'success') throw new Error('Exchange-rate provider returned an error');
    const normalized = normalizeRatePayload(payload, currency);
    writeRateCache(storage, currency, normalized, now);
    return { ...normalized, cachedAt: Number(now), stale: false, source: 'network' };
  } catch (error) {
    if (cached) return { ...cached, stale: true, source: 'stale-cache', error };
    return {
      currencyCode: currency,
      rateToTwd: null,
      updatedAt: null,
      cachedAt: null,
      stale: true,
      source: 'unavailable',
      error
    };
  }
}
