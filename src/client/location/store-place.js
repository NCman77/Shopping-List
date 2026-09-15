import { haversineMeters, normalizeCoordinate } from './distance.js';

function clean(value) {
  return String(value ?? '').trim();
}

function displayNameOf(value) {
  if (typeof value === 'string') return clean(value);
  return clean(value?.text);
}

export function normalizePlace(place = {}) {
  const placeId = clean(place.id || place.placeId);
  const coordinate = normalizeCoordinate(place.location);
  if (!placeId || !coordinate) return null;
  return {
    placeId,
    displayName: displayNameOf(place.displayName || place.name),
    address: clean(place.formattedAddress || place.address),
    lat: coordinate.lat,
    lng: coordinate.lng,
    businessStatus: clean(place.businessStatus)
  };
}

export function dedupeAndSortPlaces(places = [], origin) {
  const normalizedOrigin = normalizeCoordinate(origin);
  const seen = new Set();
  const results = [];

  for (const raw of Array.isArray(places) ? places : []) {
    const place = normalizePlace(raw);
    if (!place || seen.has(place.placeId)) continue;
    const status = place.businessStatus.toUpperCase();
    if (status.startsWith('CLOSED')) continue;
    seen.add(place.placeId);
    const distanceMeters = normalizedOrigin
      ? haversineMeters(normalizedOrigin, { lat: place.lat, lng: place.lng })
      : Number.POSITIVE_INFINITY;
    results.push({ ...place, distanceMeters });
  }

  return results.sort((a, b) => {
    const aKnown = Number.isFinite(a.distanceMeters);
    const bKnown = Number.isFinite(b.distanceMeters);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown && a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
    return a.displayName.localeCompare(b.displayName, 'zh-Hant');
  });
}
