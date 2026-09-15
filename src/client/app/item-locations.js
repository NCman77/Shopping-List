function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeItemLocations(item = {}) {
  const source = Array.isArray(item?.locations) && item.locations.length
    ? item.locations
    : [item?.location];
  const seen = new Set();
  const values = [];
  for (const raw of source) {
    const value = clean(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

export function buildLocationWritePatch(values = []) {
  const locations = normalizeItemLocations({ locations: values });
  return {
    locations,
    location: locations[0] || ''
  };
}

export function itemMatchesLocation(item = {}, selected = 'all') {
  const target = clean(selected);
  return !target || target === 'all' || normalizeItemLocations(item).includes(target);
}

export function usedLocationsForTrip(items = [], tripId = '') {
  const id = clean(tripId);
  if (!id) return [];
  const seen = new Set();
  const values = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (clean(item?.tripId) !== id) continue;
    for (const value of normalizeItemLocations(item)) {
      if (seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}
