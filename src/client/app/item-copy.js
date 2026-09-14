function clean(value) {
  return String(value ?? '').trim();
}

export function buildCopiedItemData({ source = {}, targetTrip = {}, newItemId = '', now = Date.now() } = {}) {
  const sourceId = clean(source.id);
  const targetTripId = clean(targetTrip.id);
  const targetCountry = clean(targetTrip.country);
  const itemId = clean(newItemId);

  if (!sourceId) throw new TypeError('缺少來源商品 ID。');
  if (!targetTripId || !targetCountry) throw new TypeError('目標旅程資料不完整。');
  if (!itemId) throw new TypeError('缺少新商品 ID。');

  return {
    name: clean(source.name),
    category: clean(source.category),
    location: clean(source.location),
    address: clean(source.address),
    website: clean(source.website),
    description: clean(source.description),
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
}

export function findExistingCopy(items = [], sourceItemId = '', targetTripId = '') {
  const sourceId = clean(sourceItemId);
  const tripId = clean(targetTripId);
  if (!sourceId || !tripId) return null;
  return (Array.isArray(items) ? items : []).find((item) => (
    clean(item?.copiedFromItemId) === sourceId && clean(item?.tripId) === tripId
  )) || null;
}
