import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layoutPath = new URL('../../src/client/app/item-modal-layout.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

async function readLayoutSource() {
  return readFile(layoutPath, 'utf8').catch(() => '');
}

test('add and edit forms split category and where-to-buy into equal columns while store stays retired', async () => {
  const source = await readLayoutSource();

  assert.match(source, /item-category/);
  assert.match(source, /item-multi-location-field/);
  assert.match(source, /gridTemplateColumns\s*=\s*['"]minmax\(0, 1fr\) minmax\(0, 1fr\)['"]/);
  assert.doesNotMatch(source, /item-store-field|initStoreLocationEnhancements|store-location-enhancements/);
});

test('selected where-to-buy chips span the full row below both form columns', async () => {
  const source = await readLayoutSource();

  assert.match(source, /item-multi-location-chips-row/);
  assert.match(source, /item-multi-location-chips/);
  assert.match(source, /insertAdjacentElement\('afterend', chipsRow\)/);
  assert.match(source, /chipsRow\.appendChild\(chips\)/);
  assert.match(source, /width:\s*100%/);
});

test('product detail back and edit actions live in a true fixed modal footer outside the scrolling area', async () => {
  const source = await readLayoutSource();

  assert.match(source, /item-detail-fixed-footer/);
  assert.match(source, /workflow-view-mode #item-detail-fixed-footer/);
  assert.match(source, /modalContent\.appendChild\(footer\)/);
  assert.match(source, /item-detail-inline-actions/);
  assert.match(source, /返回/);
  assert.match(source, /編輯商品/);
});

test('edit-only copy-to-trip action is moved outside the scrolling area into a fixed modal footer', async () => {
  const source = await readLayoutSource();

  assert.match(source, /copy-item-trip-action-wrap/);
  assert.match(source, /add-modal-content/);
  assert.match(source, /modalContent\.appendChild\(wrapper\)/);
  assert.match(source, /item-copy-fixed-footer/);
});

test('modal layout enhancement is bootstrapped without re-enabling retired store features', async () => {
  const bootstrap = await readFile(bootstrapPath, 'utf8');

  assert.match(bootstrap, /item-modal-layout\.js/);
  assert.match(bootstrap, /initItemModalLayout/);
  assert.doesNotMatch(bootstrap, /initStoreLocationEnhancements/);
});
