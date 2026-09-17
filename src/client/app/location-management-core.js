import { findBrandForLocation } from './brand-location-resolver.js';
import { locationWritePatch, resolveItemLocations } from '../pricing/location-selection.js';

function clean(value) {
  return String(value ?? '').trim();
}

function unique(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const raw = clean(value);
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export function buildManagedLocationValues(items = [], configuredLocations = []) {
  const used = [];
  const usedSet = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    for (const raw of resolveItemLocations(item)) {
      if (usedSet.has(raw)) continue;
      usedSet.add(raw);
      used.push(raw);
    }
  }

  const configured = unique(configuredLocations);
  const ordered = configured.filter((raw) => usedSet.has(raw));
  const configuredSet = new Set(configured);
  for (const raw of used) {
    if (!configuredSet.has(raw)) ordered.push(raw);
  }
  return ordered;
}

export function mergeManagedLocationOrder(configuredLocations = [], managedOrder = []) {
  const configured = unique(configuredLocations);
  const managed = unique(managedOrder);
  const managedSet = new Set(managed);
  let nextManagedIndex = 0;

  const merged = configured.map((raw) => {
    if (!managedSet.has(raw)) return raw;
    const replacement = managed[nextManagedIndex];
    nextManagedIndex += 1;
    return replacement || raw;
  });

  while (nextManagedIndex < managed.length) {
    merged.push(managed[nextManagedIndex]);
    nextManagedIndex += 1;
  }
  return unique(merged);
}

function rawMatchesBrand(raw, brand) {
  const country = clean(brand?.country);
  if (!raw || !brand?.id || !country) return false;
  return Boolean(findBrandForLocation([brand], raw, country));
}

export function buildBrandDeletionLocationPlan(items = [], configuredLocations = [], brand = null) {
  const matched = new Set();
  const affected = [];

  for (const item of Array.isArray(items) ? items : []) {
    const current = resolveItemLocations(item);
    const next = [];
    let changed = false;
    for (const raw of current) {
      if (rawMatchesBrand(raw, brand)) {
        matched.add(raw);
        changed = true;
      } else {
        next.push(raw);
      }
    }
    if (changed && item?.id) affected.push({ id: item.id, patch: locationWritePatch(next) });
  }

  const nextConfiguredLocations = unique(configuredLocations).filter((raw) => {
    if (!rawMatchesBrand(raw, brand)) return true;
    matched.add(raw);
    return false;
  });

  return {
    affected,
    writeCount: affected.length,
    matchedRawLocations: [...matched],
    nextConfiguredLocations
  };
}
