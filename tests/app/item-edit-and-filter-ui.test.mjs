import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modalLayoutPath = new URL('../../src/client/app/item-modal-layout.js', import.meta.url);
const renameUiPath = new URL('../../src/client/app/filter-rename-enhancements.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('add and edit forms use the unified 商品名稱 and 我的筆記 labels at runtime', async () => {
  const layout = await readFile(modalLayoutPath, 'utf8');

  assert.match(layout, /商品名稱 <span class="text-red-400">\*<\/span>/);
  assert.match(layout, /notesLabel\.textContent = '我的筆記'/);
});

test('existing-item edit mode has view-style cards while new-item mode stays distinct', async () => {
  const layout = await readFile(modalLayoutPath, 'utf8');

  assert.match(layout, /workflow-edit-mode/);
  assert.match(layout, /workflow-add-mode/);
  assert.match(layout, /item-edit-purchase-card/);
  assert.match(layout, /price-research-section/);
  assert.match(layout, /item-address/);
  assert.match(layout, /item-website/);
  assert.match(layout, /item-desc/);
  assert.match(layout, /order:\s*7/);
  assert.match(layout, /order:\s*8/);
  assert.match(layout, /order:\s*9/);
});

test('new-item form can add category and location inline through the existing handlers', async () => {
  const layout = await readFile(modalLayoutPath, 'utf8');

  assert.match(layout, /item-inline-add-category/);
  assert.match(layout, /item-inline-add-location/);
  assert.match(layout, /title:\s*'新增分類'/);
  assert.match(layout, /handlerName:\s*'handleAddCategory'/);
  assert.match(layout, /title:\s*'新增地點'/);
  assert.match(layout, /handlerName:\s*'handleAddLocation'/);
  assert.match(layout, /view\.openInputModal\(title, placeholder, handler\)/);
  assert.match(layout, /workflow-add-mode/);
});

test('homepage add-category and add-location plus buttons are removed without changing their existing handlers', async () => {
  const renameUi = await readFile(renameUiPath, 'utf8');

  assert.match(renameUi, /removeHomepageAddButtons/);
  assert.match(renameUi, /handleAddCategory/);
  assert.match(renameUi, /handleAddLocation/);
  assert.match(renameUi, /querySelector\?\.\(`button\[onclick\*="\$\{handlerName\}"\]`\)\?\.remove\(\)/);
});

test('filter management exposes rename UI and commits settings plus affected item patches together', async () => {
  const renameUi = await readFile(renameUiPath, 'utf8');

  assert.match(renameUi, /rename-option/);
  assert.match(renameUi, /filter-rename-modal/);
  assert.match(renameUi, /writeBatch/);
  assert.match(renameUi, /buildRenameItemPatch/);
  assert.match(renameUi, /renameOption/);
  assert.match(renameUi, /batch\.set\(settingsRef/);
  assert.match(renameUi, /batch\.update\(itemRef, patch\)/);
  assert.match(renameUi, /valuesFor\(pending\.kind\)\.includes\(nextName\)/);
  assert.match(renameUi, /MAX_RENAME_ITEM_WRITES = 499/);
});

test('filter rename enhancement is bootstrapped independently', async () => {
  const bootstrap = await readFile(bootstrapPath, 'utf8');

  assert.match(bootstrap, /filter-rename-enhancements\.js/);
  assert.match(bootstrap, /initFilterRenameEnhancements/);
});
