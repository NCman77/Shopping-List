import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexPath = new URL('../../index.html', import.meta.url);
const modalLayoutPath = new URL('../../src/client/app/item-modal-layout.js', import.meta.url);
const workflowPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);
const homeUiPath = new URL('../../src/client/app/home-ui-enhancements.js', import.meta.url);

test('item labels are unified and homepage add-category/add-location buttons are removed', async () => {
  const source = await readFile(indexPath, 'utf8');

  assert.match(source, />商品名稱\s*<span class="text-red-400">\*<\/span>/);
  assert.match(source, />我的筆記<\/label>/);
  assert.doesNotMatch(source, /onclick="openInputModal\('新增分類',[\s\S]*?handleAddCategory\)"/);
  assert.doesNotMatch(source, /onclick="openInputModal\('新增地點',[\s\S]*?handleAddLocation\)"/);
});

test('existing-item edit mode has its own view-style layout class while add mode remains distinct', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const layout = await readFile(modalLayoutPath, 'utf8');

  assert.match(workflow, /workflow-edit-mode/);
  assert.match(workflow, /workflow-add-mode/);
  assert.match(layout, /\.workflow-edit-mode/);
  assert.match(layout, /item-edit-purchase-card/);
  assert.match(layout, /price-research-section/);
  assert.match(layout, /item-address/);
  assert.match(layout, /item-website/);
  assert.match(layout, /item-desc/);
});

test('new-item form can add category and location inline without restoring homepage plus buttons', async () => {
  const layout = await readFile(modalLayoutPath, 'utf8');

  assert.match(layout, /item-inline-add-category/);
  assert.match(layout, /item-inline-add-location/);
  assert.match(layout, /openInputModal\('新增分類'/);
  assert.match(layout, /handleAddCategory/);
  assert.match(layout, /openInputModal\('新增地點'/);
  assert.match(layout, /handleAddLocation/);
  assert.match(layout, /workflow-add-mode/);
});

test('filter management exposes rename UI and commits settings plus affected item patches together', async () => {
  const homeUi = await readFile(homeUiPath, 'utf8');

  assert.match(homeUi, /rename-option/);
  assert.match(homeUi, /filter-rename-modal/);
  assert.match(homeUi, /writeBatch/);
  assert.match(homeUi, /buildRenameItemPatch/);
  assert.match(homeUi, /renameOption/);
  assert.match(homeUi, /batch\.set\(settingsRef/);
  assert.match(homeUi, /batch\.update\(itemRef, patch\)/);
  assert.match(homeUi, /valuesFor\(kind\)\.includes\(nextName\)/);
});
