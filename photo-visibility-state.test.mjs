import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhotoVisibilityState, shouldBackfillPhotoThumbnail } from './photo-visibility-state.js';

test('persistent thumbnail keeps a product photo visible without a Drive token', () => {
  assert.deepEqual(getPhotoVisibilityState({
    photoUrl: 'data:image/webp;base64,thumb',
    hasDrivePhoto: true,
    hasDriveToken: false
  }), {
    mode: 'persistent',
    requiresAuthorization: false,
    src: 'data:image/webp;base64,thumb'
  });
});

test('Drive-only photo never silently looks empty when authorization is missing', () => {
  assert.deepEqual(getPhotoVisibilityState({
    photoUrl: '',
    hasDrivePhoto: true,
    hasDriveToken: false
  }), {
    mode: 'authorization-required',
    requiresAuthorization: true,
    src: ''
  });
});

test('Drive-only photo can be loaded and backfilled when authorization exists', () => {
  assert.equal(getPhotoVisibilityState({
    photoUrl: '',
    hasDrivePhoto: true,
    hasDriveToken: true
  }).mode, 'drive');

  assert.equal(shouldBackfillPhotoThumbnail({
    photoUrl: '',
    hasDrivePhoto: true,
    hasDriveToken: true
  }), true);

  assert.equal(shouldBackfillPhotoThumbnail({
    photoUrl: 'data:image/webp;base64,thumb',
    hasDrivePhoto: true,
    hasDriveToken: true
  }), false);
});

test('item with no photo remains an empty-photo state', () => {
  assert.equal(getPhotoVisibilityState({
    photoUrl: '',
    hasDrivePhoto: false,
    hasDriveToken: false
  }).mode, 'empty');
});
