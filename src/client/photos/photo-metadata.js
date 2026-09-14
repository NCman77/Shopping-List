export function groupActivePhotosByItem(photoDocs = []) {
  const grouped = new Map();
  for (const photo of photoDocs) {
    if (!photo?.itemId) continue;
    if (photo.status && photo.status !== 'active') continue;
    if (!grouped.has(photo.itemId)) grouped.set(photo.itemId, []);
    grouped.get(photo.itemId).push(photo);
  }
  for (const photos of grouped.values()) {
    photos.sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    });
  }
  return grouped;
}

export function createPhotoMetadata({ photoId, itemId, driveFile, compressed, order = 0, now = Date.now() }) {
  return {
    id: photoId,
    itemId,
    driveFileId: driveFile.id,
    fileName: driveFile.name,
    mimeType: compressed.mimeType,
    width: compressed.width,
    height: compressed.height,
    size: compressed.size,
    order,
    status: 'active',
    createdAt: now
  };
}

export function chooseCoverPhotoId(photos = []) {
  return photos.length ? photos[0].id : null;
}
