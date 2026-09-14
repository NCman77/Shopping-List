import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  actionForShoppingStatus,
  detectHorizontalSwipe,
  detailStateForOpen
} from '../../src/client/app/item-workflow.js';

const enhancementPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('wanted items offer not-wanted action and not-wanted items offer restore', () => {
  assert.deepEqual(actionForShoppingStatus({ purchased: false }), {
    label: '不想買',
    targetStatus: 'not_wanted',
    requiresConfirmation: true
  });
  assert.deepEqual(actionForShoppingStatus({ shoppingStatus: 'not_wanted', purchased: false }), {
    label: '恢復',
    targetStatus: 'wanted',
    requiresConfirmation: false
  });
  assert.equal(actionForShoppingStatus({ purchased: true }), null);
});

test('horizontal swipe ignores vertical gestures and uses approved direction labels', () => {
  assert.equal(detectHorizontalSwipe({ startX: 200, startY: 20, endX: 100, endY: 25 }), 'left');
  assert.equal(detectHorizontalSwipe({ startX: 100, startY: 20, endX: 210, endY: 30 }), 'right');
  assert.equal(detectHorizontalSwipe({ startX: 100, startY: 20, endX: 130, endY: 160 }), null);
  assert.equal(detectHorizontalSwipe({ startX: 100, startY: 20, endX: 125, endY: 22 }), null);
});

test('existing product opens in view mode while new product opens editable', () => {
  assert.deepEqual(detailStateForOpen({ itemId: 'abc' }), { mode: 'view', canSave: false, canEdit: true });
  assert.deepEqual(detailStateForOpen({ itemId: '' }), { mode: 'edit', canSave: true, canEdit: false });
});

test('workflow enhancement contains not-wanted confirmation pagination gestures and view/edit controls', async () => {
  const source = await readFile(enhancementPath, 'utf8');
  assert.match(source, /不想買/);
  assert.match(source, /恢復/);
  assert.match(source, /不想買這個商品/);
  assert.match(source, /PAGE_SIZE\s*=\s*10/);
  assert.match(source, /touchstart/);
  assert.match(source, /touchend/);
  assert.match(source, /編輯/);
  assert.match(source, /買到了嗎/);
  assert.match(source, /shopping-list:active-country-changed/);
});

test('restore action handles Firestore rejection and workflow owns the filtered empty state', async () => {
  const source = await readFile(enhancementPath, 'utf8');
  assert.match(source, /writeStatus\(id, action\.targetStatus\)\.catch\(\(\) => \{\}\)/);
  assert.match(source, /getElementById\(['"]empty-state['"]\)/);
  assert.match(source, /itemsLoaded/);
});

test('feature bootstrap loads item workflow independently', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /item-workflow-enhancements\.js/);
  assert.match(source, /initItemWorkflowEnhancements/);
});
