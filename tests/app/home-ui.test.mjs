import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('auth session loads the home UI enhancements in the browser', async () => {
  const source = await readFile(new URL('../../src/client/app/auth-session.js', import.meta.url), 'utf8');
  assert.match(source, /import\('\.\/home-ui-enhancements\.js'\)/);
});

test('Drive app initialization also installs durable thumbnail persistence', async () => {
  const source = await readFile(new URL('../../src/client/app/auth-session.js', import.meta.url), 'utf8');
  assert.match(source, /photo-thumbnail-persistence\.js/);
  assert.match(source, /initPhotoThumbnailPersistence/);
});
