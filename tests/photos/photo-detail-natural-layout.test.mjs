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

function fakeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...tokens) { tokens.forEach((token) => values.add(token)); },
    remove(...tokens) { tokens.forEach((token) => values.delete(token)); },
    contains(token) { return values.has(token); },
    values
  };
}

test('detail view CSS defines natural image proportions without changing edit-mode classes', async () => {
  const mod = await loadModule();
  const source = await readFile(new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url), 'utf8');

  assert.equal(typeof mod.DETAIL_PHOTO_CARD_CLASS, 'string');
  assert.equal(typeof mod.DETAIL_PHOTO_IMAGE_CLASS, 'string');
  assert.match(source, /\.workflow-view-mode #photo-preview-grid img/);
  assert.match(source, /height:\s*auto\s*!important/);
  assert.match(source, /object-fit:\s*contain\s*!important/);
  assert.doesNotMatch(source, /classList\.remove\(['"]aspect-square['"]\)/);
});

test('normalization only records image readiness and does not rewrite square/crop classes', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.normalizeDetailPhotoCard, 'function');

  const imageClasses = fakeClassList(['absolute', 'inset-0', 'w-full', 'h-full', 'object-cover']);
  const cardClasses = fakeClassList(['relative', 'aspect-square', 'rounded-xl']);
  const image = { classList: imageClasses };
  const card = {
    classList: cardClasses,
    dataset: {},
    querySelector(selector) { return selector === 'img' ? image : null; }
  };

  mod.normalizeDetailPhotoCard(card);

  assert.equal(card.dataset.detailImageReady, 'true');
  assert.equal(cardClasses.contains('aspect-square'), true);
  assert.equal(imageClasses.contains('absolute'), true);
  assert.equal(imageClasses.contains('w-full'), true);
  assert.equal(imageClasses.contains('h-full'), true);
  assert.equal(imageClasses.contains('object-cover'), true);
});

test('natural-ratio behavior remains scoped to the detail modal and homepage rendering stays unchanged', async () => {
  const authSource = await readFile(new URL('../../src/client/app/auth-session.js', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');

  assert.match(authSource, /photo-detail-layout\.js/);
  assert.match(authSource, /initPhotoDetailNaturalLayout/);
  assert.match(layoutSource, /workflow-view-mode/);
  assert.match(layoutSource, /photo-preview-grid/);
  assert.match(layoutSource, /waitForPhotoGrid/);

  // Homepage and edit-mode photo cards keep the base app's square presentation.
  assert.match(appSource, /aspect-square/);
});
