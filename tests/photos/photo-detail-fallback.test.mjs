import test from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  try {
    return await import('../../src/client/photos/photo-detail-preview.js');
  } catch {
    return {};
  }
}

test('detail photo never resolves to blank when the homepage cover thumbnail still exists', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.resolveDetailPhotoDisplay, 'function');

  assert.deepEqual(mod.resolveDetailPhotoDisplay({
    previewDataUrl: '',
    homepagePhotoUrl: 'data:image/webp;base64,cover',
    isCover: true,
    hasDriveToken: false
  }), {
    mode: 'homepage-fallback',
    src: 'data:image/webp;base64,cover'
  });
});

test('missing persistent preview with Drive access requests an immediate Drive backfill', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.resolveDetailPhotoDisplay, 'function');

  assert.deepEqual(mod.resolveDetailPhotoDisplay({
    previewDataUrl: '',
    homepagePhotoUrl: '',
    isCover: false,
    hasDriveToken: true
  }), {
    mode: 'drive-backfill',
    src: ''
  });
});

test('missing non-cover detail photo without Drive access becomes an explicit authorization state', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.resolveDetailPhotoDisplay, 'function');

  assert.deepEqual(mod.resolveDetailPhotoDisplay({
    previewDataUrl: '',
    homepagePhotoUrl: '',
    isCover: false,
    hasDriveToken: false
  }), {
    mode: 'authorization-required',
    src: ''
  });
});
