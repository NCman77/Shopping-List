import test from 'node:test';
import assert from 'node:assert/strict';
import { createExchangeRateService, convertLocalToTwd, FX_CACHE_KEY, FX_ENDPOINT } from '../../src/client/app/exchange-rates.js';

function createStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    read(key) { return map.get(key); }
  };
}

function okPayload({ now = 1000, next = 90000, rates = { TWD: 1, JPY: 4.4, CAD: 0.043 } } = {}) {
  return {
    result: 'success',
    time_last_update_unix: now,
    time_next_update_unix: next,
    rates
  };
}

test('local amounts convert back to TWD from a TWD-base rate table', () => {
  assert.equal(convertLocalToTwd(2200, 'JPY', { JPY: 4.4 }), 500);
  assert.equal(convertLocalToTwd(43, 'CAD', { CAD: 0.043 }), 1000);
  assert.equal(convertLocalToTwd(100, 'ZZZ', { JPY: 4.4 }), null);
});

test('exchange rate service uses the approved no-key endpoint and versioned browser cache key', () => {
  assert.equal(FX_ENDPOINT, 'https://open.er-api.com/v6/latest/TWD');
  assert.equal(FX_CACHE_KEY, 'shopping-list:fx:v1:TWD');
});

test('fresh cache returns without calling fetch', async () => {
  const now = 1_000_000;
  const storage = createStorage({
    [FX_CACHE_KEY]: JSON.stringify({ rates: { TWD: 1, JPY: 4.5 }, providerUpdatedAt: now - 1000, providerNextUpdateAt: now + 50000, fetchedAt: now - 1000, provider: 'ExchangeRate-API' })
  });
  let calls = 0;
  const service = createExchangeRateService({ storage, now: () => now, fetchImpl: async () => { calls += 1; throw new Error('should not fetch'); } });
  const result = await service.getRates();
  assert.equal(calls, 0);
  assert.equal(result.source, 'cache');
  assert.equal(result.stale, false);
});

test('concurrent refreshes share one in-flight request and cache a valid response', async () => {
  const now = 2_000_000;
  const storage = createStorage();
  let calls = 0;
  let resolveFetch;
  const fetchImpl = async () => {
    calls += 1;
    await new Promise((resolve) => { resolveFetch = resolve; });
    return { ok: true, json: async () => okPayload({ now: 1900, next: 9999999 }) };
  };
  const service = createExchangeRateService({ storage, now: () => now, fetchImpl });
  const first = service.getRates();
  const second = service.getRates();
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveFetch();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a.rates, b.rates);
  assert.equal(a.source, 'network');
  assert.ok(storage.read(FX_CACHE_KEY));
});

test('network failure falls back to stale cache and marks very old cache strongly', async () => {
  const eightDays = 8 * 24 * 60 * 60 * 1000;
  const now = 20_000_000_000;
  const storage = createStorage({
    [FX_CACHE_KEY]: JSON.stringify({ rates: { TWD: 1, JPY: 4 }, providerUpdatedAt: now - eightDays, providerNextUpdateAt: now - 1000, fetchedAt: now - eightDays, provider: 'ExchangeRate-API' })
  });
  const service = createExchangeRateService({ storage, now: () => now, fetchImpl: async () => { throw new Error('offline'); } });
  const result = await service.getRates();
  assert.equal(result.source, 'stale-cache');
  assert.equal(result.stale, true);
  assert.equal(result.veryStale, true);
  assert.equal(result.unavailable, false);
});

test('no cache plus fetch failure returns an unavailable state instead of rejecting the shopping UI', async () => {
  const service = createExchangeRateService({ storage: createStorage(), now: () => 123, fetchImpl: async () => { throw new Error('offline'); } });
  const result = await service.getRates();
  assert.equal(result.unavailable, true);
  assert.equal(result.rates, null);
  assert.match(result.error.message, /offline/);
});
