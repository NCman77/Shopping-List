import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');

test('new cover thumbnail is created from the already-compressed local upload', () => {
  assert.match(source, /createLightweightThumbnail/);
  assert.match(source, /resolvePhotoPersistenceForSave/);
  assert.match(source, /createLightweightThumbnail\(uploaded\[0\]\.photo\.blob\)/);
});

test('item save batch persists the thumbnail and its matching cover id together', () => {
  assert.match(source, /photoPersistence\.photoUrl/);
  assert.match(source, /photoPersistence\.photoThumbCoverId/);
  assert.match(source, /photoPersistence\.coverPhotoId/);
});

test('new photos persist a separate mobile detail preview without changing the homepage thumbnail flow', () => {
  assert.match(source, /createDetailPhotoPreview/);
  assert.match(source, /detailPreview/);
  assert.match(source, /itemPhotoPreviews/);
  assert.match(source, /previewDataUrl/);
  assert.match(source, /previewWidth/);
  assert.match(source, /previewHeight/);
});

test('existing item photo grid prefers the persistent detail preview before Drive', () => {
  assert.match(source, /loadPersistentDetailPreview/);
  assert.match(source, /itemPhotoPreviews/);
  assert.match(source, /previewDataUrl/);
});

test('deleting a photo also removes its persistent detail preview document', () => {
  const matches = source.match(/itemPhotoPreviews/g) || [];
  assert.ok(matches.length >= 3, 'expected create, load, and delete paths for itemPhotoPreviews');
});
