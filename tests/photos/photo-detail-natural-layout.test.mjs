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

test('detail view uses a large single-column layout while preserving each photo aspect ratio', async () => {
  const mod = await loadModule();
  const source = await readFile(new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url), 'utf8');

  assert.equal(typeof mod.DETAIL_PHOTO_CARD_CLASS, 'string');
  assert.equal(typeof mod.DETAIL_PHOTO_IMAGE_CLASS, 'string');
  assert.match(source, /\.workflow-view-mode #photo-preview-grid\s*\{[\s\S]*display:\s*grid\s*!important/);
  assert.match(source, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/);
  assert.match(source, /max-width:\s*1280px\s*!important/);
  assert.doesNotMatch(source, /\.workflow-view-mode #photo-preview-grid > div\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid img\s*\{[^}]*position:\s*static\s*!important[^}]*height:\s*auto\s*!important[^}]*object-fit:\s*contain\s*!important/s);
  assert.doesNotMatch(source, /#item-list[\s\S]*aspect-ratio/);
});

test('normalization only records image readiness and leaves base edit-mode classes untouched', async () => {
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

test('detail sizing remains scoped to the detail modal and homepage card rendering stays unchanged', async () => {
  const authSource = await readFile(new URL('../../src/client/app/auth-session.js', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');

  assert.match(authSource, /photo-detail-layout\.js/);
  assert.match(authSource, /initPhotoDetailNaturalLayout/);
  assert.match(layoutSource, /workflow-view-mode/);
  assert.match(layoutSource, /photo-preview-grid/);
  assert.match(layoutSource, /waitForPhotoGrid/);

  // The base app remains untouched; this regression fix is scoped to view-mode CSS only.
  assert.match(appSource, /aspect-square/);
});
