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

test('view-mode photo cards explicitly disable square aspect ratio so portrait images cannot overlap following fields', async () => {
  const source = await readFile(new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url), 'utf8');

  assert.match(source, /\.workflow-view-mode #photo-preview-grid > div\s*\{[^}]*aspect-ratio:\s*auto\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid > div\s*\{[^}]*height:\s*auto\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid > div\s*\{[^}]*min-height:\s*0\s*!important/s);
});

test('placeholder icon is removed once a real image exists in the detail photo card', () => {
  const cardClasses = fakeClassList(['relative', 'aspect-square']);
  const imageClasses = fakeClassList(['absolute', 'inset-0', 'w-full', 'h-full', 'object-cover']);
  let placeholderRemoved = false;
  const placeholder = { remove() { placeholderRemoved = true; } };
  const icon = { closest(selector) { return selector === 'div' ? placeholder : null; } };
  const image = { classList: imageClasses };
  const card = {
    classList: cardClasses,
    querySelector(selector) {
      if (selector === 'img') return image;
      if (selector === '.fa-image') return icon;
      return null;
    }
  };

  normalizeDetailPhotoCard(card);

  assert.equal(placeholderRemoved, true);
  assert.equal(cardClasses.contains('aspect-square'), false);
  assert.equal(imageClasses.contains('object-cover'), false);
  assert.equal(imageClasses.contains('object-contain'), true);
});
