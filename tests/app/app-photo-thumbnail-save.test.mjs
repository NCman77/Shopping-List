import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
let detailSource = '';
try {
  detailSource = await readFile(new URL('../../src/client/photos/photo-detail-preview-enhancements.js', import.meta.url), 'utf8');
} catch {}

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

test('mobile detail previews are isolated from homepage item/photo subscriptions', () => {
  assert.match(detailSource, /itemPhotoPreviews/);
  assert.match(detailSource, /createDetailPhotoPreview/);
  assert.match(detailSource, /detailPreviewReady/);
  assert.doesNotMatch(source, /onSnapshot\([^\n]*itemPhotoPreviews/);
});

test('existing item photo grid loads a persistent detail preview before relying on Drive', () => {
  assert.match(detailSource, /loadPersistentDetailPreview/);
  assert.match(detailSource, /previewDataUrl/);
  assert.match(detailSource, /object-contain/);
});

test('detail preview cleanup is wired for removed photos', () => {
  assert.match(detailSource, /cleanupRemovedPreviews/);
  assert.match(detailSource, /deleteDoc/);
});
