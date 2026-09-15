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

export function addLocationSelection(values = [], value = '') {
  return normalizeLocations([...normalizeLocations(values), value]);
}

export function removeLocationSelection(values = [], value = '') {
  const target = clean(value);
  return normalizeLocations(values).filter((location) => location !== target);
}

export function availableLocationChoices(definitions = [], selected = []) {
  const selectedSet = new Set(normalizeLocations(selected));
  return normalizeLocations(definitions).filter((location) => !selectedSet.has(location));
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
