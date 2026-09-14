import test from 'node:test';
import assert from 'node:assert/strict';
import * as photoState from './photo-visibility-state.js';

const { getPhotoVisibilityState, shouldBackfillPhotoThumbnail, shouldClearPersistentThumbnail } = photoState;

test('matching persistent thumbnail keeps a product photo visible without a Drive token', () => {
  assert.deepEqual(getPhotoVisibilityState({
    photoUrl: 'data:image/webp;base64,thumb',
    persistentCoverId: 'photo-1',
    driveCoverId: 'photo-1',
    hasDriveToken: false
  }), {
    mode: 'persistent',
    requiresAuthorization: false,
    src: 'data:image/webp;base64,thumb'
  });
});

test('legacy persistent photo remains visible when it has no Drive cover tracking field', () => {
  assert.equal(getPhotoVisibilityState({
    photoUrl: 'data:image/jpeg;base64,legacy',
    persistentCoverId: '',
    driveCoverId: '',
    hasDriveToken: false
  }).mode, 'persistent');
});

test('Drive-only photo never silently looks empty when authorization is missing', () => {
  assert.deepEqual(getPhotoVisibilityState({
    photoUrl: '',
    driveCoverId: 'photo-1',
    hasDriveToken: false
  }), {
    mode: 'authorization-required',
    requiresAuthorization: true,
    src: ''
  });
});

test('stale thumbnail is not shown after the Drive cover changes', () => {
  assert.equal(getPhotoVisibilityState({
    photoUrl: 'data:image/webp;base64,old',
    persistentCoverId: 'photo-1',
    driveCoverId: 'photo-2',
    hasDriveToken: false
  }).mode, 'authorization-required');

  assert.equal(shouldBackfillPhotoThumbnail({
    photoUrl: 'data:image/webp;base64,old',
    persistentCoverId: 'photo-1',
    driveCoverId: 'photo-2',
    hasDriveToken: true
  }), true);
});

test('tracked thumbnail is not cleared while photo metadata is still loading', () => {
  assert.equal(shouldClearPersistentThumbnail({
    photoUrl: 'data:image/webp;base64,old',
    persistentCoverId: 'photo-1',
    driveCoverId: '',
    photoMetadataLoaded: false
  }), false);
});

test('tracked thumbnail is cleared after loaded photo metadata confirms all Drive photos are removed', () => {
  assert.equal(shouldClearPersistentThumbnail({
    photoUrl: 'data:image/webp;base64,old',
    persistentCoverId: 'photo-1',
    driveCoverId: '',
    photoMetadataLoaded: true
  }), true);

  assert.equal(getPhotoVisibilityState({
    photoUrl: 'data:image/webp;base64,old',
    persistentCoverId: 'photo-1',
    driveCoverId: '',
    hasDriveToken: false
  }).mode, 'empty');
});

test('Drive-only photo can be loaded and backfilled when authorization exists', () => {
  assert.equal(getPhotoVisibilityState({
    photoUrl: '',
    driveCoverId: 'photo-1',
    hasDriveToken: true
  }).mode, 'drive');

  assert.equal(shouldBackfillPhotoThumbnail({
    photoUrl: '',
    persistentCoverId: '',
    driveCoverId: 'photo-1',
    hasDriveToken: true
  }), true);

  assert.equal(shouldBackfillPhotoThumbnail({
    photoUrl: 'data:image/webp;base64,thumb',
    persistentCoverId: 'photo-1',
    driveCoverId: 'photo-1',
    hasDriveToken: true
  }), false);
});

test('item with no photo remains an empty-photo state', () => {
  assert.equal(getPhotoVisibilityState({
    photoUrl: '',
    driveCoverId: '',
    hasDriveToken: false
  }).mode, 'empty');
});

test('new uploaded cover is persisted with its thumbnail immediately', () => {
  assert.equal(typeof photoState.resolvePhotoPersistenceForSave, 'function');
  assert.deepEqual(photoState.resolvePhotoPersistenceForSave({
    existingItem: {},
    existingActivePhotos: [],
    uploadedPhotos: [{ id: 'new-photo', thumbnailDataUrl: 'data:image/webp;base64,newthumb' }]
  }), {
    coverPhotoId: 'new-photo',
    photoUrl: 'data:image/webp;base64,newthumb',
    photoThumbCoverId: 'new-photo'
  });
});

test('unchanged cover keeps its existing persistent thumbnail', () => {
  assert.equal(typeof photoState.resolvePhotoPersistenceForSave, 'function');
  assert.deepEqual(photoState.resolvePhotoPersistenceForSave({
    existingItem: {
      photoUrl: 'data:image/webp;base64,existing',
      photoThumbCoverId: 'photo-1'
    },
    existingActivePhotos: [{ id: 'photo-1' }],
    uploadedPhotos: [{ id: 'new-photo', thumbnailDataUrl: 'data:image/webp;base64,newthumb' }]
  }), {
    coverPhotoId: 'photo-1',
    photoUrl: 'data:image/webp;base64,existing',
    photoThumbCoverId: 'photo-1'
  });
});

test('changing to an existing Drive cover clears a stale tracked thumbnail for backfill', () => {
  assert.equal(typeof photoState.resolvePhotoPersistenceForSave, 'function');
  assert.deepEqual(photoState.resolvePhotoPersistenceForSave({
    existingItem: {
      photoUrl: 'data:image/webp;base64,old',
      photoThumbCoverId: 'photo-1'
    },
    existingActivePhotos: [{ id: 'photo-2' }],
    uploadedPhotos: []
  }), {
    coverPhotoId: 'photo-2',
    photoUrl: '',
    photoThumbCoverId: null
  });
});
