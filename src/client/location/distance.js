import { resolveShoppingStatus } from '../app/item-workflow.js';

const EARTH_RADIUS_METERS = 6371008.8;
const STATUS_RANK = { wanted: 0, not_wanted: 1, purchased: 2 };

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function mappedDistance(distancesByItemId, itemId) {
  if (!distancesByItemId || typeof distancesByItemId !== 'object') return Number.POSITIVE_INFINITY;
  if (!Object.prototype.hasOwnProperty.call(distancesByItemId, itemId)) return Number.POSITIVE_INFINITY;
  const raw = distancesByItemId[itemId];
  if (raw === null || raw === undefined || raw === '') return Number.POSITIVE_INFINITY;
  const distance = Number(raw);
  return Number.isFinite(distance) && distance >= 0 ? distance : Number.POSITIVE_INFINITY;
}

export function normalizeCoordinate(point) {
  if (!point) return null;
  const lat = number(typeof point.lat === 'function' ? point.lat() : point.lat);
  const lng = number(typeof point.lng === 'function' ? point.lng() : point.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function haversineMeters(a, b) {
  const start = normalizeCoordinate(a);
  const end = normalizeCoordinate(b);
  if (!start || !end) return Number.NaN;
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(end.lat - start.lat);
  const dLng = radians(end.lng - start.lng);
  const lat1 = radians(start.lat);
  const lat2 = radians(end.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1000) return `${Math.round(value)} m`;
  const roundedKilometres = Math.round(value / 100) / 10;
  return `${roundedKilometres.toFixed(1)} km`;
}

export function movedBeyondThreshold(previous, next, thresholdMeters = 150) {
  if (!normalizeCoordinate(next)) return false;
  if (!normalizeCoordinate(previous)) return true;
  const threshold = Math.max(0, Number(thresholdMeters) || 0);
  const distance = haversineMeters(previous, next);
  return Number.isFinite(distance) && distance >= threshold;
}

export function itemStoreCoordinate(item = {}) {
  return normalizeCoordinate({ lat: item.storeLat, lng: item.storeLng });
}

export function distanceForItem(item = {}, origin) {
  const coordinate = itemStoreCoordinate(item);
  const normalizedOrigin = normalizeCoordinate(origin);
  if (!coordinate || !normalizedOrigin) return Number.POSITIVE_INFINITY;
  const result = haversineMeters(normalizedOrigin, coordinate);
  return Number.isFinite(result) ? result : Number.POSITIVE_INFINITY;
}

export function sortItemsByStatusAndDistance(items = [], origin) {
  const normalizedOrigin = normalizeCoordinate(origin);
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const rankA = STATUS_RANK[resolveShoppingStatus(a)] ?? 0;
    const rankB = STATUS_RANK[resolveShoppingStatus(b)] ?? 0;
    if (rankA !== rankB) return rankA - rankB;

    if (normalizedOrigin) {
      const distanceA = distanceForItem(a, normalizedOrigin);
      const distanceB = distanceForItem(b, normalizedOrigin);
      const knownA = Number.isFinite(distanceA);
      const knownB = Number.isFinite(distanceB);
      if (knownA !== knownB) return knownA ? -1 : 1;
      if (knownA && distanceA !== distanceB) return distanceA - distanceB;
    }

    return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
  });
}

export function sortItemsByStatusAndDistanceMap(items = [], distancesByItemId = {}) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const rankA = STATUS_RANK[resolveShoppingStatus(a)] ?? 0;
    const rankB = STATUS_RANK[resolveShoppingStatus(b)] ?? 0;
    if (rankA !== rankB) return rankA - rankB;

    const distanceA = mappedDistance(distancesByItemId, a?.id);
    const distanceB = mappedDistance(distancesByItemId, b?.id);
    const knownA = Number.isFinite(distanceA);
    const knownB = Number.isFinite(distanceB);
    if (knownA !== knownB) return knownA ? -1 : 1;
    if (knownA && distanceA !== distanceB) return distanceA - distanceB;

    return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
  });
}
