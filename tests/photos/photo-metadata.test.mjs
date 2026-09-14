import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCoverPhotoId, createPhotoMetadata, groupActivePhotosByItem } from './photo-metadata.js';

test('groups only active photos and sorts by order', () => {
  const grouped = groupActivePhotosByItem([
    { id: 'b', itemId: 'item-1', order: 2, status: 'active' },
    { id: 'gone', itemId: 'item-1', order: 1, status: 'deleting' },
    { id: 'a', itemId: 'item-1', order: 1, status: 'active' }
  ]);
  assert.deepEqual(grouped.get('item-1').map((photo) => photo.id), ['a', 'b']);
  assert.equal(chooseCoverPhotoId(grouped.get('item-1')), 'a');
});

test('creates a stable Firestore photo record', () => {
  assert.deepEqual(createPhotoMetadata({
    photoId: 'p1', itemId: 'i1', driveFile: { id: 'd1', name: 'p.webp' },
    compressed: { mimeType: 'image/webp', width: 1600, height: 1200, size: 123 }, order: 0, now: 10
  }), {
    id: 'p1', itemId: 'i1', driveFileId: 'd1', fileName: 'p.webp', mimeType: 'image/webp',
    width: 1600, height: 1200, size: 123, order: 0, status: 'active', createdAt: 10
  });
});
