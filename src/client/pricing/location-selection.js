function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeLocations(values = []) {
  const normalized = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const location = clean(value);
    if (!location || seen.has(location)) continue;
    seen.add(location);
    normalized.push(location);
  }
  return normalized;
}

export function resolveItemLocations(item = {}) {
  const multiple = normalizeLocations(item?.locations);
  if (multiple.length) return multiple;
  const legacy = clean(item?.location);
  return legacy ? [legacy] : [];
}

export function locationWritePatch(values = []) {
  const locations = normalizeLocations(values);
  return {
    locations,
    location: locations[0] || ''
  };
}

export function itemMatchesLocation(item = {}, location = 'all') {
  const target = clean(location);
  if (!target || target === 'all') return true;
  return resolveItemLocations(item).includes(target);
}
