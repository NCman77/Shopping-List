import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('detail photo fallback is bootstrapped independently', async () => {
  const authSource = await readFile(new URL('../../src/client/app/auth-session.js', import.meta.url), 'utf8');
  assert.match(authSource, /photo-detail-fallback-enhancements\.js/);
  assert.match(authSource, /initPhotoDetailFallbackEnhancements/);
});

test('detail fallback uses the existing homepage cover before showing a blank card', async () => {
  const source = await readFile(new URL('../../src/client/photos/photo-detail-fallback-enhancements.js', import.meta.url), 'utf8');
  assert.match(source, /resolveDetailPhotoDisplay/);
  assert.match(source, /photoUrl/);
  assert.match(source, /homepage-fallback/);
  assert.match(source, /object-contain/);
});

test('missing non-cover previews expose an explicit one-time Drive load action', async () => {
  const source = await readFile(new URL('../../src/client/photos/photo-detail-fallback-enhancements.js', import.meta.url), 'utf8');
  assert.match(source, /載入完整照片/);
  assert.match(source, /connectGoogleDrive/);
  assert.match(source, /drive-backfill/);
});
