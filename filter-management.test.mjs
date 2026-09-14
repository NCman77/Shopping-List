import test from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  try {
    return await import('./filter-management.js');
  } catch (error) {
    assert.fail(`filter-management.js should exist and load: ${error.message}`);
  }
}

test('moveOption reorders an option without changing the other values', async () => {
  const { moveOption } = await loadModule();
  assert.deepEqual(moveOption(['美妝', '藥妝', '服飾'], 2, 0), ['服飾', '美妝', '藥妝']);
});

test('removeOption removes only the selected option and preserves order', async () => {
  const { removeOption } = await loadModule();
  assert.deepEqual(removeOption(['東京', '新宿', '澀谷'], '新宿'), ['東京', '澀谷']);
});

test('findItemsUsingOption returns every item still using a category', async () => {
  const { findItemsUsingOption } = await loadModule();
  const items = [
    { id: '1', name: '防曬', category: '美妝', location: '新宿' },
    { id: '2', name: '護髮', category: '美妝', location: '澀谷' },
    { id: '3', name: '鞋子', category: '服飾', location: '新宿' }
  ];
  assert.deepEqual(
    findItemsUsingOption(items, 'category', '美妝').map((item) => item.name),
    ['防曬', '護髮']
  );
});

test('findItemsUsingOption returns every item still using a location', async () => {
  const { findItemsUsingOption } = await loadModule();
  const items = [
    { id: '1', name: '防曬', category: '美妝', location: '新宿' },
    { id: '2', name: '護髮', category: '美妝', location: '澀谷' },
    { id: '3', name: '鞋子', category: '服飾', location: '新宿' }
  ];
  assert.deepEqual(
    findItemsUsingOption(items, 'location', '新宿').map((item) => item.name),
    ['防曬', '鞋子']
  );
});
