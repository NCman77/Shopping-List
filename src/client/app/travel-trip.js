import { DEFAULT_COUNTRY, resolveItemCountry } from './travel-country.js';
import { currencyForCountry } from './currency.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value) {
  return String(value ?? '').trim();
}

function validIsoDate(value) {
  const date = clean(value);
  if (!ISO_DATE_RE.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateTripDraft(draft = {}) {
  const country = clean(draft.country);
  const startDate = clean(draft.startDate);
  const endDate = clean(draft.endDate);
  if (!country) return { valid: false, error: '請選擇國家。' };
  if (!validIsoDate(startDate) || !validIsoDate(endDate)) {
    return { valid: false, error: '請選擇正確的旅遊日期。' };
  }
  if (endDate < startDate) return { valid: false, error: '結束日期不能早於開始日期。' };
  return { valid: true, error: '' };
}

export function normalizeTrip(trip = {}) {
  const kind = clean(trip.kind) === 'legacy' ? 'legacy' : 'trip';
  const country = clean(trip.country) || DEFAULT_COUNTRY;
  const currencyCode = clean(trip.currencyCode).toUpperCase() || currencyForCountry(country);
  return {
    ...trip,
    id: clean(trip.id),
    title: clean(trip.title),
    country,
    currencyCode,
    startDate: kind === 'legacy' ? null : clean(trip.startDate) || null,
    endDate: kind === 'legacy' ? null : clean(trip.endDate) || null,
    kind
  };
}

export function tripDisplayTitle(trip = {}) {
  const normalized = normalizeTrip(trip);
  if (normalized.title) return normalized.title;
  if (normalized.kind === 'legacy') return `${normalized.country} · 既有清單`;
  if (normalized.startDate) return `${normalized.country} · ${normalized.startDate.replaceAll('-', '/')}`;
  return normalized.country;
}

export function classifyTrip(trip = {}, today = todayIso()) {
  const normalized = normalizeTrip(trip);
  if (normalized.kind === 'legacy') return 'legacy';
  if (!validIsoDate(normalized.startDate) || !validIsoDate(normalized.endDate)) return 'legacy';
  const current = validIsoDate(today) ? today : todayIso();
  if (normalized.startDate <= current && current <= normalized.endDate) return 'ongoing';
  if (normalized.startDate > current) return 'upcoming';
  return 'past';
}

function sortGroupRank(type) {
  return { ongoing: 0, upcoming: 1, past: 2, legacy: 3 }[type] ?? 4;
}

export function sortTripsForPicker(trips = [], today = todayIso()) {
  return (Array.isArray(trips) ? trips : [])
    .map(normalizeTrip)
    .sort((a, b) => {
      const typeA = classifyTrip(a, today);
      const typeB = classifyTrip(b, today);
      const rank = sortGroupRank(typeA) - sortGroupRank(typeB);
      if (rank) return rank;
      if (typeA === 'ongoing' || typeA === 'upcoming') {
        return String(a.startDate || '').localeCompare(String(b.startDate || ''));
      }
      if (typeA === 'past') {
        return String(b.endDate || '').localeCompare(String(a.endDate || ''));
      }
      return tripDisplayTitle(a).localeCompare(tripDisplayTitle(b), 'zh-Hant');
    });
}

export function resolveActiveTrip({ trips = [], persistedTripId = '', today = todayIso() } = {}) {
  const normalized = (Array.isArray(trips) ? trips : []).map(normalizeTrip).filter((trip) => trip.id);
  if (!normalized.length) return null;

  const ongoing = normalized
    .filter((trip) => classifyTrip(trip, today) === 'ongoing')
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0];
  if (ongoing) return ongoing;

  const persisted = normalized.find((trip) => trip.id === clean(persistedTripId));
  if (persisted) {
    const type = classifyTrip(persisted, today);
    if (type === 'ongoing' || type === 'upcoming') return persisted;
  }

  const upcoming = normalized
    .filter((trip) => classifyTrip(trip, today) === 'upcoming')
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0];
  if (upcoming) return upcoming;

  const past = normalized
    .filter((trip) => classifyTrip(trip, today) === 'past')
    .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0];
  if (past) return past;

  return normalized.find((trip) => classifyTrip(trip, today) === 'legacy') || null;
}

export function legacyTripIdForCountry(country) {
  const normalized = clean(country) || DEFAULT_COUNTRY;
  const encoded = Array.from(normalized)
    .map((char) => char.codePointAt(0).toString(16))
    .join('-');
  return `legacy-${encoded || 'default'}`;
}

export function groupUnassignedItemsByCountry(items = []) {
  const grouped = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || clean(item.tripId)) continue;
    const country = resolveItemCountry(item);
    if (!grouped.has(country)) grouped.set(country, []);
    grouped.get(country).push(item);
  }
  return grouped;
}

export function itemMatchesActiveTrip(item, activeTrip) {
  const itemTripId = clean(item?.tripId);
  const activeTripId = clean(activeTrip?.id);
  return Boolean(itemTripId && activeTripId && itemTripId === activeTripId);
}

export function activeTripCacheKey(userId) {
  return `shopping-list:active-trip:${clean(userId)}`;
}

export function readCachedActiveTripId(storage, userId) {
  const uid = clean(userId);
  if (!uid || !storage || typeof storage.getItem !== 'function') return '';
  try {
    return clean(storage.getItem(activeTripCacheKey(uid)));
  } catch {
    return '';
  }
}

export function writeCachedActiveTripId(storage, userId, tripId) {
  const uid = clean(userId);
  const value = clean(tripId);
  if (!uid || !storage || typeof storage.setItem !== 'function') return value;
  try {
    if (value) storage.setItem(activeTripCacheKey(uid), value);
    else storage.removeItem?.(activeTripCacheKey(uid));
  } catch {}
  return value;
}
