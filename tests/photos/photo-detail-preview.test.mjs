import test from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  try {
    return await import('../../src/client/photos/photo-detail-preview.js');
  } catch {
    return {};
  }
}

test('detail preview requests a 1280px width cap and preserves encoder output dimensions', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.createDetailPhotoPreview, 'function');

  const calls = [];
  const result = await mod.createDetailPhotoPreview(new Blob(['photo']), {
    compress: async (_blob, options) => {
      calls.push(options);
      return { blob: new Blob(['preview']), width: 1280, height: 1707, previewUrl: '' };
    },
    toDataUrl: async () => 'data:image/webp;base64,preview',
    revoke: () => {}
  });

  assert.equal(calls[0].maxWidth, 1280);
  assert.deepEqual(result, {
    dataUrl: 'data:image/webp;base64,preview',
    width: 1280,
    height: 1707
  });
});

test('legacy detail preview backfill downloads only photos missing a persistent preview', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.createDetailPreviewBackfillService, 'function');

  const downloads = [];
  const updates = [];
  const service = mod.createDetailPreviewBackfillService({
    downloadPhoto: async (fileId) => { downloads.push(fileId); return new Blob([fileId]); },
    createPreview: async () => ({ dataUrl: 'data:image/webp;base64,detail', width: 1280, height: 960 }),
    updatePreview: async (photoId, preview) => updates.push({ photoId, preview })
  });

  const result = await service.backfillPhotos([
    { id: 'photo-1', driveFileId: 'drive-1', status: 'active', previewDataUrl: 'data:image/webp;base64,ready' },
    { id: 'photo-2', driveFileId: 'drive-2', status: 'active' }
  ]);

  assert.deepEqual(downloads, ['drive-2']);
  assert.equal(result.updated, 1);
  assert.deepEqual(updates, [{
    photoId: 'photo-2',
    preview: { dataUrl: 'data:image/webp;base64,detail', width: 1280, height: 960 }
  }]);
});
