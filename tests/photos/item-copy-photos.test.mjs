import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const uiPath = new URL('../../src/client/app/item-copy-ui.js', import.meta.url);

test('photo copy uses Drive service to download source and upload new files for target item', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /createDrivePhotoService/);
  assert.match(source, /downloadPhoto\(/);
  assert.match(source, /uploadPhoto\(\{[^}]*itemId:\s*newItemId/s);
  assert.match(source, /driveFileId:\s*entry\.driveFile\.id/);
  assert.match(source, /itemId:\s*newItemId/);
});

test('copied photos rebuild cover thumbnail using new photo metadata ids', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /createLightweightThumbnail/);
  assert.match(source, /resolvePhotoPersistenceForSave/);
  assert.match(source, /thumbnailDataUrl/);
  assert.match(source, /photoThumbCoverId/);
  assert.match(source, /coverPhotoId/);
});

test('copy commits target item and target photo metadata only after uploads and cleans new Drive files on failure', async () => {
  const source = await readFile(uiPath, 'utf8');
  const uploadIndex = source.indexOf('uploadPhoto');
  const commitIndex = source.indexOf('batch.commit');
  assert.ok(uploadIndex >= 0 && commitIndex > uploadIndex);
  assert.match(source, /uploadedDriveFileIds/);
  assert.match(source, /deletePhoto\(/);
  assert.match(source, /catch \(error\)/);
  assert.doesNotMatch(source, /deletePhoto\(photo\.driveFileId\)/);
});

test('copy reads only active source photo metadata and never reuses source drive file ids as target metadata', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /status[^\n]*active/);
  assert.match(source, /sourcePhotos/);
  assert.match(source, /doc\(collection\([^\n]*'itemPhotos'/);
  assert.doesNotMatch(source, /driveFileId:\s*photo\.driveFileId/);
});
