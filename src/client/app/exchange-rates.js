export const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/TWD';
export const FX_CACHE_KEY = 'shopping-list:fx:v1:TWD';

const DAY_MS = 24 * 60 * 60 * 1000;
const VERY_STALE_MS = 7 * DAY_MS;
const PROVIDER = 'ExchangeRate-API';
const CONVERSION_PRECISION = 1e10;

function clean(value) {
  return String(value ?? '').trim();
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function stableConversion(value) {
  return Math.round(value * CONVERSION_PRECISION) / CONVERSION_PRECISION;
}

function validRates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rates = {};
  for (const [code, raw] of Object.entries(value)) {
    const rate = finitePositive(raw);
    if (!rate) continue;
    rates[clean(code).toUpperCase()] = rate;
  }
  if (!finitePositive(rates.TWD)) return null;
  return rates;
}

function parseCache(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const rates = validRates(parsed?.rates);
    if (!rates) return null;
    return {
      rates,
      providerUpdatedAt: Number(parsed?.providerUpdatedAt) || 0,
      providerNextUpdateAt: Number(parsed?.providerNextUpdateAt) || 0,
      fetchedAt: Number(parsed?.fetchedAt) || 0,
      provider: clean(parsed?.provider) || PROVIDER
    };
  } catch {
    return null;
  }
}

function writeCache(storage, value) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    storage.setItem(FX_CACHE_KEY, JSON.stringify(value));
  } catch {}
}

function ageMs(cache, nowMs) {
  const basis = Number(cache?.fetchedAt) || Number(cache?.providerUpdatedAt) || 0;
  return basis > 0 ? Math.max(0, nowMs - basis) : Number.POSITIVE_INFINITY;
}

function cacheIsFresh(cache, nowMs) {
  if (!cache?.rates) return false;
  const fetchedAt = Number(cache.fetchedAt) || 0;
  if (!fetchedAt || nowMs - fetchedAt >= DAY_MS) return false;
  const next = Number(cache.providerNextUpdateAt) || 0;
  if (next && nowMs >= next) return false;
  return true;
}

function cacheResult(cache, nowMs, source) {
  const age = ageMs(cache, nowMs);
  const stale = source === 'stale-cache' || !cacheIsFresh(cache, nowMs);
  return {
    rates: cache.rates,
    fetchedAt: cache.fetchedAt,
    providerUpdatedAt: cache.providerUpdatedAt,
    providerNextUpdateAt: cache.providerNextUpdateAt,
    provider: cache.provider || PROVIDER,
    source,
    stale,
    veryStale: age > VERY_STALE_MS,
    unavailable: false,
    error: null
  };
}

export function convertLocalToTwd(amount, localCode, rateTable) {
  const value = Number(amount);
  const code = clean(localCode).toUpperCase();
  if (!Number.isFinite(value) || !code || !rateTable || typeof rateTable !== 'object') return null;
  if (code === 'TWD') return value;
  const rate = finitePositive(rateTable[code]);
  if (!rate) return null;
  return stableConversion(value / rate);
}

export function createExchangeRateService({
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  now = () => Date.now()
} = {}) {
  let inFlight = null;
  let lastStatus = null;

  async function fetchFresh() {
    if (typeof fetchImpl !== 'function') throw new Error('目前無法連線取得匯率。');
    const response = await fetchImpl(FX_ENDPOINT, { method: 'GET', cache: 'no-store' });
    if (!response?.ok) throw new Error(`匯率服務回應失敗 (${response?.status || 'unknown'})`);
    const payload = await response.json();
    if (payload?.result !== 'success') throw new Error(clean(payload?.['error-type']) || '匯率服務回傳無效資料。');
    const rates = validRates(payload?.rates);
    if (!rates) throw new Error('匯率服務回傳的匯率資料不完整。');
    const fetchedAt = Number(now());
    const cache = {
      rates,
      providerUpdatedAt: Math.max(0, Number(payload?.time_last_update_unix) || 0) * 1000,
      providerNextUpdateAt: Math.max(0, Number(payload?.time_next_update_unix) || 0) * 1000,
      fetchedAt,
      provider: PROVIDER
    };
    writeCache(storage, cache);
    return cacheResult(cache, fetchedAt, 'network');
  }

  async function getRates({ force = false } = {}) {
    const nowMs = Number(now());
    const cached = parseCache(storage);
    if (!force && cacheIsFresh(cached, nowMs)) {
      lastStatus = cacheResult(cached, nowMs, 'cache');
      return lastStatus;
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const result = await fetchFresh();
        lastStatus = result;
        return result;
      } catch (error) {
        const fallback = parseCache(storage) || cached;
        if (fallback?.rates) {
          const result = cacheResult(fallback, Number(now()), 'stale-cache');
          result.error = error instanceof Error ? error : new Error(String(error));
          lastStatus = result;
          return result;
        }
        const result = {
          rates: null,
          fetchedAt: 0,
          providerUpdatedAt: 0,
          providerNextUpdateAt: 0,
          provider: PROVIDER,
          source: 'unavailable',
          stale: false,
          veryStale: false,
          unavailable: true,
          error: error instanceof Error ? error : new Error(String(error))
        };
        lastStatus = result;
        return result;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  return {
    getRates,
    getStatus() {
      return lastStatus;
    }
  };
}
