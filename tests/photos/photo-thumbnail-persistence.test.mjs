import test from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  try {
    return await import('../../src/client/photos/photo-thumbnail-persistence.js');
  } catch {
    return {};
  }
}

test('backfill downloads a missing Drive cover once and persists its thumbnail', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.createPhotoThumbnailPersistenceService, 'function');

  const updates = [];
  const downloads = [];
  const service = mod.createPhotoThumbnailPersistenceService({
    getItem: async () => ({ id: 'item-1', photoUrl: '', photoThumbCoverId: null }),
    listPhotosForItem: async () => [{ id: 'photo-1', driveFileId: 'drive-1', order: 0, status: 'active' }],
    downloadPhoto: async (fileId) => { downloads.push(fileId); return new Blob(['photo']); },
    createThumbnail: async () => 'data:image/webp;base64,thumb',
    updateItem: async (itemId, patch) => updates.push({ itemId, patch })
  });

  const result = await service.backfillItem('item-1');

  assert.equal(result.status, 'updated');
  assert.deepEqual(downloads, ['drive-1']);
  assert.deepEqual(updates, [{
    itemId: 'item-1',
    patch: {
      coverPhotoId: 'photo-1',
      photoUrl: 'data:image/webp;base64,thumb',
      photoThumbCoverId: 'photo-1'
    }
  }]);
});

test('matching Firestore thumbnail avoids a Drive download entirely', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.createPhotoThumbnailPersistenceService, 'function');

  let downloads = 0;
  let updates = 0;
  const service = mod.createPhotoThumbnailPersistenceService({
    getItem: async () => ({
      id: 'item-1',
      photoUrl: 'data:image/webp;base64,thumb',
      photoThumbCoverId: 'photo-1'
    }),
    listPhotosForItem: async () => [{ id: 'photo-1', driveFileId: 'drive-1', order: 0, status: 'active' }],
    downloadPhoto: async () => { downloads += 1; return new Blob(['photo']); },
    createThumbnail: async () => 'data:image/webp;base64,new',
    updateItem: async () => { updates += 1; }
  });

  const result = await service.backfillItem('item-1');

  assert.equal(result.status, 'ready');
  assert.equal(downloads, 0);
  assert.equal(updates, 0);
});

test('matching but oversized Firestore thumbnail is recompressed for faster list loading', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.createPhotoThumbnailPersistenceService, 'function');

  const updates = [];
  let downloads = 0;
  const service = mod.createPhotoThumbnailPersistenceService({
    getItem: async () => ({
      id: 'item-1',
      photoUrl: `data:image/webp;base64,${'x'.repeat(90000)}`,
      photoThumbCoverId: 'photo-1'
    }),
    listPhotosForItem: async () => [{ id: 'photo-1', driveFileId: 'drive-1', order: 0, status: 'active' }],
    downloadPhoto: async () => { downloads += 1; return new Blob(['photo']); },
    createThumbnail: async () => 'data:image/webp;base64,small',
    updateItem: async (itemId, patch) => updates.push({ itemId, patch })
  });

  const result = await service.backfillItem('item-1');

  assert.equal(result.status, 'updated');
  assert.equal(downloads, 1);
  assert.equal(updates[0].patch.photoUrl, 'data:image/webp;base64,small');
});

test('thumbnail encoder failure returns an empty fallback instead of rejecting the item save', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.createLightweightThumbnail, 'function');

  const thumbnail = await mod.createLightweightThumbnail(new Blob(['photo']), {
    compress: async () => { throw new Error('encoder unavailable'); },
    toDataUrl: async () => { throw new Error('must not run'); }
  });

  assert.equal(thumbnail, '');
});

test('removing the final tracked Drive photo clears its persistent thumbnail', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.createPhotoThumbnailPersistenceService, 'function');

  const updates = [];
  const service = mod.createPhotoThumbnailPersistenceService({
    getItem: async () => ({
      id: 'item-1',
      photoUrl: 'data:image/webp;base64,thumb',
      photoThumbCoverId: 'photo-1'
    }),
    listPhotosForItem: async () => [],
    downloadPhoto: async () => { throw new Error('must not download'); },
    createThumbnail: async () => 'unused',
    updateItem: async (itemId, patch) => updates.push({ itemId, patch })
  });

  const result = await service.backfillItem('item-1');

  assert.equal(result.status, 'cleared');
  assert.deepEqual(updates, [{
    itemId: 'item-1',
    patch: { coverPhotoId: null, photoUrl: '', photoThumbCoverId: null }
  }]);
});
