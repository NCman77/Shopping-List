import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeDetailPhotoCard } from '../../src/client/photos/photo-detail-layout.js';

function fakeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...tokens) { tokens.forEach((token) => values.add(token)); },
    remove(...tokens) { tokens.forEach((token) => values.delete(token)); },
    contains(token) { return values.has(token); },
    values
  };
}

test('detail layout waits for the asynchronously-created photo grid instead of exiting early', async () => {
  const source = await readFile(new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url), 'utf8');

  assert.match(source, /waitForPhotoGrid/);
  assert.match(source, /await\s+waitForPhotoGrid/);
  assert.doesNotMatch(source, /if\s*\(!grid\s*\|\|\s*!MutationObserverImpl\)\s*return/);
});

test('view mode hides placeholder-only cards so stale photo metadata cannot create a large gray blank block', async () => {
  const source = await readFile(new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url), 'utf8');

  assert.match(source, /data-detail-image-ready=["']false["']/);
  assert.match(source, /display:\s*none\s*!important/);
});

test('normalizing a loaded detail card removes its placeholder without changing edit-mode square/crop classes', () => {
  const cardClasses = fakeClassList(['relative', 'aspect-square']);
  const imageClasses = fakeClassList(['absolute', 'inset-0', 'w-full', 'h-full', 'object-cover']);
  let placeholderRemoved = false;
  const placeholder = { remove() { placeholderRemoved = true; } };
  const icon = { closest(selector) { return selector === 'div' ? placeholder : null; } };
  const image = { classList: imageClasses };
  const card = {
    classList: cardClasses,
    dataset: {},
    querySelector(selector) {
      if (selector === 'img') return image;
      if (selector === '.fa-image') return icon;
      return null;
    }
  };

  normalizeDetailPhotoCard(card);

  assert.equal(placeholderRemoved, true);
  assert.equal(card.dataset.detailImageReady, 'true');
  assert.equal(cardClasses.contains('aspect-square'), true);
  assert.equal(imageClasses.contains('object-cover'), true);
  assert.equal(imageClasses.contains('absolute'), true);
});
