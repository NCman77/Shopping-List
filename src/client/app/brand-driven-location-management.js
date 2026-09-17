import { findBrandForLocation } from './brand-location-resolver.js';
import { locationWritePatch, resolveItemLocations } from '../pricing/location-selection.js';

function clean(value) {
  return String(value ?? '').trim();
}

function unique(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const label = clean(value);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export function ensureBrandLocationDefinitions(preferredLocations = [], brands = []) {
  const result = unique(preferredLocations);

  for (const brand of Array.isArray(brands) ? brands : []) {
    const id = clean(brand?.id);
    if (!id) continue;
    const alreadyRepresented = result.some((location) => {
      const matched = findBrandForLocation([brand], location, brand?.country);
      return Boolean(matched && clean(matched.id) === id);
    });
    if (alreadyRepresented) continue;

    const fallback = clean(brand?.displayName)
      || clean((Array.isArray(brand?.aliases) ? brand.aliases : []).find((alias) => clean(alias?.value))?.value);
    if (fallback && !result.includes(fallback)) result.push(fallback);
  }

  return result;
}

export function deriveUsedManagedLocations(items = [], preferredLocations = []) {
  const discovered = [];
  const used = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    for (const rawLocation of resolveItemLocations(item)) {
      if (used.has(rawLocation)) continue;
      used.add(rawLocation);
      discovered.push(rawLocation);
    }
  }

  const ordered = unique(preferredLocations).filter((location) => used.has(location));
  const orderedSet = new Set(ordered);
  for (const location of discovered) {
    if (!orderedSet.has(location)) ordered.push(location);
  }
  return ordered;
}

export function mergeManagedLocationOrder(preferredLocations = [], currentManaged = [], nextManaged = []) {
  const preferred = unique(preferredLocations);
  const managedSet = new Set(unique(currentManaged));
  const queue = unique(nextManaged).filter((location) => managedSet.has(location));
  const result = [];

  for (const location of preferred) {
    if (managedSet.has(location)) {
      const replacement = queue.shift();
      if (replacement) result.push(replacement);
    } else {
      result.push(location);
    }
  }

  for (const location of queue) {
    if (!result.includes(location)) result.push(location);
  }
  return result;
}

function locationBelongsToBrand(rawLocation, brand, country) {
  if (!brand?.id) return false;
  const matched = findBrandForLocation([brand], rawLocation, country || brand.country);
  return Boolean(matched && String(matched.id || '') === String(brand.id));
}

export function buildBrandDeletionPlan(items = [], preferenceLocations = [], brand = null, country = brand?.country) {
  const affected = [];

  for (const item of Array.isArray(items) ? items : []) {
    const current = resolveItemLocations(item);
    const next = current.filter((location) => !locationBelongsToBrand(location, brand, country));
    if (next.length === current.length || !item?.id) continue;
    affected.push({ id: item.id, patch: locationWritePatch(next) });
  }

  const nextPreferenceLocations = unique(preferenceLocations)
    .filter((location) => !locationBelongsToBrand(location, brand, country));

  return {
    affected,
    nextPreferenceLocations,
    writeCount: affected.length
  };
}
