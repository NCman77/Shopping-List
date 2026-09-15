import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOCOMPLETE_DEBOUNCE_MS,
  COORDINATE_CACHE_MAX_AGE_MS,
  NEARBY_CACHE_TTL_MS,
  NearbySearchCache,
  autocompleteMode,
  classifyMapsError,
  isCoordinateCacheFresh,
  makeNearbyCacheKey,
  normalizeMapsApiKeys
} from '../../src/client/location/places-usage-policy.js';

test('autocomplete policy keeps one-character names manually searchable and auto-queries from two characters', () => {
  assert.equal(AUTOCOMPLETE_DEBOUNCE_MS, 450);
  assert.equal(autocompleteMode(''), 'none');
  assert.equal(autocompleteMode('  '), 'none');
  assert.equal(autocompleteMode('松'), 'manual');
  assert.equal(autocompleteMode('Ａ'), 'manual');
  assert.equal(autocompleteMode('松本'), 'auto');
  assert.equal(autocompleteMode('ab'), 'auto');
});

test('coordinate cache is valid for less than 30 days and stale at the exact 30-day boundary', () => {
  const now = Date.UTC(2026, 8, 15, 0, 0, 0);
  assert.equal(COORDINATE_CACHE_MAX_AGE_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(isCoordinateCacheFresh(now - COORDINATE_CACHE_MAX_AGE_MS + 1, now), true);
  assert.equal(isCoordinateCacheFresh(now - COORDINATE_CACHE_MAX_AGE_MS, now), false);
  assert.equal(isCoordinateCacheFresh(now + 1, now), false);
  assert.equal(isCoordinateCacheFresh(null, now), false);
});

test('nearby cache key normalizes query and keeps effectively nearby origins in the same location cell', () => {
  const a = makeNearbyCacheKey({ query: '  松本清 ', origin: { lat: 35.6900, lng: 139.7000 }, credentialGeneration: 3 });
  const b = makeNearbyCacheKey({ query: '松本清', origin: { lat: 35.6903, lng: 139.7003 }, credentialGeneration: 3 });
  const c = makeNearbyCacheKey({ query: '松本清', origin: { lat: 35.6940, lng: 139.7040 }, credentialGeneration: 3 });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(makeNearbyCacheKey({ query: '', origin: { lat: 35.69, lng: 139.7 }, credentialGeneration: 3 }), null);
  assert.equal(makeNearbyCacheKey({ query: '松本清', origin: null, credentialGeneration: 3 }), null);
});

test('nearby cache expires after five minutes and can be cleared explicitly', () => {
  let now = 1_000_000;
  const cache = new NearbySearchCache({ now: () => now });
  assert.equal(NEARBY_CACHE_TTL_MS, 5 * 60 * 1000);
  cache.set('key', [{ placeId: 'p1' }]);
  assert.deepEqual(cache.get('key'), [{ placeId: 'p1' }]);
  now += NEARBY_CACHE_TTL_MS;
  assert.equal(cache.get('key'), undefined);
  cache.set('key', ['again']);
  cache.clear();
  assert.equal(cache.get('key'), undefined);
});

test('Maps key normalization prefers nested primary/backup and falls back to legacy primary without migration', () => {
  assert.deepEqual(normalizeMapsApiKeys({
    mapsApiKeys: { primary: ' primary ', backup: ' backup ' },
    mapsBrowserApiKey: 'legacy'
  }), { primary: 'primary', backup: 'backup', source: 'nested' });
  assert.deepEqual(normalizeMapsApiKeys({ mapsApiKeys: { primary: '', backup: 'b' }, mapsBrowserApiKey: ' legacy ' }), {
    primary: 'legacy', backup: 'b', source: 'legacy'
  });
  assert.deepEqual(normalizeMapsApiKeys({}), { primary: '', backup: '', source: 'empty' });
});

test('Maps errors distinguish credential failure from quota/billing/network failure', () => {
  assert.equal(classifyMapsError(new Error('InvalidKeyMapError')), 'credential');
  assert.equal(classifyMapsError(new Error('RefererNotAllowedMapError')), 'credential');
  assert.equal(classifyMapsError(new Error('OverQuotaMapError')), 'quota');
  assert.equal(classifyMapsError({ code: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' }), 'quota');
  assert.equal(classifyMapsError(new Error('BillingNotEnabledMapError')), 'billing');
  assert.equal(classifyMapsError(new TypeError('Failed to fetch')), 'network');
  assert.equal(classifyMapsError(new Error('unknown')), 'generic');
});
