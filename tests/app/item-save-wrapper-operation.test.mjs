import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  '../../src/client/app/trip-save-guard.js',
  '../../src/client/app/price-comparison-enhancements.js',
  '../../src/client/app/store-location-enhancements.js',
  '../../src/client/photos/photo-detail-preview-enhancements.js'
];

test('every wrapper captures or forwards one item-save operation before awaiting', async () => {
  for (const relative of files) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8');
    const start = source.indexOf('window.saveItem = async function');
    const wrapper = source.slice(start, source.indexOf('\n  };', start) + 5);
    const operationIndex = wrapper.indexOf('beginShoppingListSaveOperation');
    const firstAwait = wrapper.indexOf('await ');
    assert.ok(operationIndex >= 0, `${relative} must capture or reuse the operation`);
    assert.ok(firstAwait === -1 || operationIndex < firstAwait, `${relative} must capture before await`);
    assert.match(wrapper, /originalSave(?:Item)?\.apply\(this, \[operation/);
  }
});
