const DAY_MS = 24 * 60 * 60 * 1000;
const LAT_CELL_DEGREES = 0.002;
const MIN_COSINE = 0.2;

export const AUTOCOMPLETE_DEBOUNCE_MS = 450;
export const COORDINATE_CACHE_MAX_AGE_MS = 30 * DAY_MS;
export const NEARBY_CACHE_TTL_MS = 5 * 60 * 1000;

function clean(value) {
  return String(value ?? '').trim();
}

function normalizedCoordinate(origin) {
  const lat = Number(origin?.lat);
  const lng = Number(origin?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function autocompleteMode(input) {
  const query = clean(input);
  if (!query) return 'none';
  return [...query].length === 1 ? 'manual' : 'auto';
}

export function isCoordinateCacheFresh(resolvedAt, now = Date.now()) {
  if (resolvedAt === null || resolvedAt === undefined || resolvedAt === '') return false;
  const timestamp = Number(resolvedAt);
  const current = Number(now);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(current)) return false;
  const age = current - timestamp;
  return age >= 0 && age < COORDINATE_CACHE_MAX_AGE_MS;
}

export function makeNearbyCacheKey({ query, origin, credentialGeneration = 0 } = {}) {
  const normalizedQuery = clean(query).toLocaleLowerCase();
  const point = normalizedCoordinate(origin);
  if (!normalizedQuery || !point) return null;

  const latitudeBucket = Math.round(point.lat / LAT_CELL_DEGREES);
  const cosine = Math.max(MIN_COSINE, Math.abs(Math.cos(point.lat * Math.PI / 180)));
  const longitudeStep = LAT_CELL_DEGREES / cosine;
  const longitudeBucket = Math.round(point.lng / longitudeStep);
  const generation = Number.isFinite(Number(credentialGeneration)) ? Number(credentialGeneration) : 0;
  return `${generation}|${normalizedQuery}|${latitudeBucket}|${longitudeBucket}`;
}

export class NearbySearchCache {
  constructor({ ttlMs = NEARBY_CACHE_TTL_MS, now = () => Date.now() } = {}) {
    this.ttlMs = Math.max(0, Number(ttlMs) || 0);
    this.now = typeof now === 'function' ? now : () => Date.now();
    this.entries = new Map();
  }

  get(key) {
    if (!key) return undefined;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.savedAt >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (!key) return value;
    this.entries.set(key, { value, savedAt: this.now() });
    return value;
  }

  delete(key) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}

export function normalizeMapsApiKeys(settings = {}) {
  const nested = settings?.mapsApiKeys && typeof settings.mapsApiKeys === 'object'
    ? settings.mapsApiKeys
    : {};
  const nestedPrimary = clean(nested.primary);
  const backup = clean(nested.backup);
  const legacy = clean(settings?.mapsBrowserApiKey);
  const primary = nestedPrimary || legacy;
  const source = nestedPrimary ? 'nested' : legacy ? 'legacy' : 'empty';
  return { primary, backup, source };
}

export function classifyMapsError(error) {
  const code = clean(error?.code);
  const name = clean(error?.name);
  const message = clean(error?.message);
  const text = `${code} ${name} ${message}`.toLocaleLowerCase();

  if (/billing|billingnotenabled|billing not enabled|billing disabled/.test(text)) return 'billing';
  if (/overquota|resource_exhausted|quota|rate.?limit|too many requests|429/.test(text)) return 'quota';
  if (/invalidkey|invalid key|referernotallowed|referrernotallowed|api.?not.?activated|authfailure|authentication|api key.*invalid|key.*revoked|key.*restricted/.test(text)) {
    return 'credential';
  }
  if (error instanceof TypeError || /failed to fetch|network|load error|script.*load|connection/.test(text)) return 'network';
  return 'generic';
}
