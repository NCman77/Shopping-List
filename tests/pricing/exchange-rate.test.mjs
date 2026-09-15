import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RATE_CACHE_TTL_MS,
  fetchRateToTwd,
  normalizeRatePayload,
  readRateCache,
  writeRateCache
} from '../../src/client/pricing/exchange-rate.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

test('provider payload normalization extracts TWD rate and update timestamp', () => {
  const normalized = normalizeRatePayload({
    result: 'success',
    time_last_update_unix: 1700000000,
    rates: { TWD: 0.215 }
  }, 'JPY');
  assert.deepEqual(normalized, {
    currencyCode: 'JPY',
    rateToTwd: 0.215,
    updatedAt: 1700000000000
  });
});

test('rate cache distinguishes fresh from stale data at 24 hours', () => {
  const storage = memoryStorage();
  writeRateCache(storage, 'JPY', { rateToTwd: 0.215, updatedAt: 1000 }, 5000);
  assert.equal(readRateCache(storage, 'JPY', 5000 + RATE_CACHE_TTL_MS - 1).stale, false);
  assert.equal(readRateCache(storage, 'JPY', 5000 + RATE_CACHE_TTL_MS + 1).stale, true);
});

test('network failure falls back to stale cached FX instead of breaking local calculation', async () => {
  const storage = memoryStorage();
  writeRateCache(storage, 'JPY', { rateToTwd: 0.21, updatedAt: 1000 }, 1000);
  const result = await fetchRateToTwd({
    currencyCode: 'JPY',
    storage,
    now: 1000 + RATE_CACHE_TTL_MS + 100,
    fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.equal(result.rateToTwd, 0.21);
  assert.equal(result.stale, true);
  assert.equal(result.source, 'stale-cache');
});

test('TWD conversion needs no network request', async () => {
  let calls = 0;
  const result = await fetchRateToTwd({
    currencyCode: 'TWD',
    storage: memoryStorage(),
    fetchImpl: async () => { calls += 1; throw new Error('should not run'); }
  });
  assert.equal(result.rateToTwd, 1);
  assert.equal(result.stale, false);
  assert.equal(calls, 0);
});
