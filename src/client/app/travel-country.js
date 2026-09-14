export const DEFAULT_COUNTRY = '日本';

function cleanCountry(value) {
  return String(value ?? '').trim();
}

export function normalizeCountries(values) {
  const normalized = [];
  for (const value of Array.isArray(values) ? values : []) {
    const country = cleanCountry(value);
    if (country && !normalized.includes(country)) normalized.push(country);
  }
  if (!normalized.includes(DEFAULT_COUNTRY)) normalized.push(DEFAULT_COUNTRY);
  return normalized;
}

export function resolveItemCountry(item) {
  return cleanCountry(item?.country) || DEFAULT_COUNTRY;
}

export function filterItemsForCountry(items, country) {
  const activeCountry = cleanCountry(country) || DEFAULT_COUNTRY;
  return (Array.isArray(items) ? items : []).filter((item) => resolveItemCountry(item) === activeCountry);
}

export function activeCountryCacheKey(userId) {
  return `shopping-list:active-country:${String(userId ?? '').trim()}`;
}

export function readCachedActiveCountry(storage, userId) {
  if (!storage || typeof storage.getItem !== 'function' || !String(userId ?? '').trim()) return DEFAULT_COUNTRY;
  try {
    return cleanCountry(storage.getItem(activeCountryCacheKey(userId))) || DEFAULT_COUNTRY;
  } catch {
    return DEFAULT_COUNTRY;
  }
}

export function writeCachedActiveCountry(storage, userId, country) {
  const uid = String(userId ?? '').trim();
  const normalized = cleanCountry(country) || DEFAULT_COUNTRY;
  if (!storage || typeof storage.setItem !== 'function' || !uid) return normalized;
  try {
    storage.setItem(activeCountryCacheKey(uid), normalized);
  } catch {}
  return normalized;
}
