import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadModule() {
  try {
    return await import('../../src/client/photos/photo-detail-layout.js');
  } catch {
    return {};
  }
}

test('detail photo cards keep natural image proportions instead of forcing squares', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.DETAIL_PHOTO_CARD_CLASS, 'string');
  assert.equal(typeof mod.DETAIL_PHOTO_IMAGE_CLASS, 'string');

  assert.doesNotMatch(mod.DETAIL_PHOTO_CARD_CLASS, /aspect-square/);
  assert.doesNotMatch(mod.DETAIL_PHOTO_IMAGE_CLASS, /object-cover/);
  assert.doesNotMatch(mod.DETAIL_PHOTO_IMAGE_CLASS, /w-full\s+h-full/);
  assert.match(mod.DETAIL_PHOTO_IMAGE_CLASS, /max-w-full/);
  assert.match(mod.DETAIL_PHOTO_IMAGE_CLASS, /h-auto/);
});

test('natural detail layout is scoped to the detail photo grid and homepage rendering stays unchanged', async () => {
  const authSource = await readFile(new URL('../../src/client/app/auth-session.js', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url), 'utf8').catch(() => '');
  const appSource = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');

  assert.match(authSource, /photo-detail-layout\.js/);
  assert.match(authSource, /initPhotoDetailNaturalLayout/);
  assert.match(layoutSource, /photo-preview-grid/);
  assert.match(layoutSource, /classList\.remove\('aspect-square'\)/);
  assert.match(layoutSource, /DETAIL_PHOTO_IMAGE_CLASS/);

  // Homepage cover cards keep their existing square presentation in the base app.
  assert.match(appSource, /aspect-square/);
});
