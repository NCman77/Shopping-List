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
