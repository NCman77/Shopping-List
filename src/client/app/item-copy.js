import { locationWritePatch, resolveItemLocations } from '../pricing/location-selection.js';
import { normalizePriceResearch } from '../pricing/price-range.js';

function clean(value) {
  return String(value ?? '').trim();
}

function finiteOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildCopiedItemData({ source = {}, targetTrip = {}, newItemId = '', now = Date.now() } = {}) {
  const sourceId = clean(source.id);
  const targetTripId = clean(targetTrip.id);
  const targetCountry = clean(targetTrip.country);
  const itemId = clean(newItemId);

  if (!sourceId) throw new TypeError('缺少來源商品 ID。');
  if (!targetTripId || !targetCountry) throw new TypeError('目標旅程資料不完整。');
  if (!itemId) throw new TypeError('缺少新商品 ID。');

  const locationPatch = locationWritePatch(resolveItemLocations(source));
  const copied = {
    name: clean(source.name),
    category: clean(source.category),
    ...locationPatch,
    address: clean(source.address),
    website: clean(source.website),
    description: clean(source.description),
    storeName: clean(source.storeName),
    storePlaceId: clean(source.storePlaceId),
    storeDisplayName: clean(source.storeDisplayName),
    storeAddress: clean(source.storeAddress),
    storeLat: finiteOrNull(source.storeLat),
    storeLng: finiteOrNull(source.storeLng),
    storeResolvedAt: finiteOrNull(source.storeResolvedAt),
    shoppingStatus: 'wanted',
    purchased: false,
    photoUrl: '',
    photoThumbCoverId: null,
    coverPhotoId: null,
    tripId: targetTripId,
    country: targetCountry,
    copiedFromItemId: sourceId,
    createdAt: now,
    updatedAt: now
  };

  if (source?.priceResearch && typeof source.priceResearch === 'object') {
    copied.priceResearch = normalizePriceResearch(source.priceResearch);
  }

  return copied;
}

export function findExistingCopy(items = [], sourceItemId = '', targetTripId = '') {
  const sourceId = clean(sourceItemId);
  const tripId = clean(targetTripId);
  if (!sourceId || !tripId) return null;
  return (Array.isArray(items) ? items : []).find((item) => (
    clean(item?.copiedFromItemId) === sourceId && clean(item?.tripId) === tripId
  )) || null;
}
