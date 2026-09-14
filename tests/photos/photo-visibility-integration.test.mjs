import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authSource = await readFile(new URL('../../src/client/app/auth-session.js', import.meta.url), 'utf8');

test('photo visibility recovery boots independently from Drive upload initialization', () => {
  assert.match(authSource, /photo-visibility-enhancements\.js/);
  assert.match(authSource, /initPhotoVisibilityEnhancements/);
});

test('photo visibility recovery offers authorization instead of silently showing no photo and backfills a thumbnail', async () => {
  const source = await readFile(new URL('../../src/client/photos/photo-visibility-enhancements.js', import.meta.url), 'utf8');
  assert.match(source, /authorization-required/);
  assert.match(source, /connectGoogleDrive/);
  assert.match(source, /updateDoc/);
  assert.match(source, /photoUrl/);
  assert.match(source, /createLightweightThumbnail/);
  assert.doesNotMatch(source, /maxEdge:\s*480/);
  assert.doesNotMatch(source, /300000/);
});

test('Drive photo recovery waits for thumbnail persistence before finishing the render', async () => {
  const source = await readFile(new URL('../../src/client/photos/photo-visibility-enhancements.js', import.meta.url), 'utf8');
  assert.match(source, /await\s+backfillThumbnail\(itemId,\s*driveCoverId,\s*blob\)/);
  assert.doesNotMatch(source, /void\s+backfillThumbnail\(itemId,\s*driveCoverId,\s*blob\)/);
});

test('persistent thumbnails are never cleared before photo metadata finishes its first snapshot', async () => {
  const source = await readFile(new URL('../../src/client/photos/photo-visibility-enhancements.js', import.meta.url), 'utf8');
  assert.match(source, /photoMetadataLoaded/);
  assert.match(source, /photoMetadataLoaded:\s*state\.photoMetadataLoaded/);
  assert.match(source, /state\.photoMetadataLoaded\s*=\s*true/);
});
