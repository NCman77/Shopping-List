import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  captureRegisteredItemSaveExtensions,
  createItemSaveOperation,
  createItemSaveResult,
  isItemSaveOperationCurrent,
  registerItemSaveSnapshotProvider
} from '../../src/client/app/item-save-operation.js';

test('item operation keeps the original form and photo values', () => {
  const fields = { 'item-name': '商品 A', 'item-status': false };
  const pendingPhotos = [{ clientId: 'photo-a' }];
  const removedPhotoIds = new Set(['old-photo']);
  const extensions = { price: { amount: 100 } };
  const operation = createItemSaveOperation({
    operationId: 'op-a', userId: 'user-a', itemId: 'item-a', modalGeneration: 3,
    fields, pendingPhotos, removedPhotoIds, extensions
  });

  fields['item-name'] = '商品 B';
  pendingPhotos.push({ clientId: 'photo-b' });
  removedPhotoIds.add('another-photo');
  extensions.price.amount = 999;

  assert.equal(operation.fields['item-name'], '商品 A');
  assert.deepEqual(operation.pendingPhotos.map((photo) => photo.clientId), ['photo-a']);
  assert.deepEqual(operation.removedPhotoIds, ['old-photo']);
  assert.equal(operation.extensions.price.amount, 100);
  assert.equal(Object.isFrozen(operation), true);
});

test('operation currentness requires the same user and modal generation', () => {
  const operation = createItemSaveOperation({ operationId: 'op', userId: 'user-a', itemId: 'item-a', modalGeneration: 2 });
  assert.equal(isItemSaveOperationCurrent(operation, { userId: 'user-a', modalGeneration: 2 }), true);
  assert.equal(isItemSaveOperationCurrent(operation, { userId: 'user-b', modalGeneration: 2 }), false);
  assert.equal(isItemSaveOperationCurrent(operation, { userId: 'user-a', modalGeneration: 3 }), false);
});

test('snapshot providers run synchronously and explicit results retain ownership', () => {
  const unregister = registerItemSaveSnapshotProvider('price', () => ({ amount: 100 }));
  const extensions = captureRegisteredItemSaveExtensions();
  unregister();
  assert.deepEqual(extensions.price, { amount: 100 });

  const operation = createItemSaveOperation({ operationId: 'op', userId: 'user-a', itemId: 'item-a', extensions });
  assert.deepEqual(createItemSaveResult(operation, true), {
    operationId: 'op', itemId: 'item-a', userId: 'user-a', succeeded: true, reason: ''
  });
});

test('enhanced save begins before its first await and reads snapshot fields', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  const start = source.indexOf('window.saveItem = async function');
  const end = source.indexOf('const originalAskDelete', start);
  const save = source.slice(start, end);
  const capture = save.indexOf('beginShoppingListSaveOperation');
  const firstAwait = save.indexOf('await ');

  assert.ok(capture >= 0 && firstAwait > capture);
  assert.match(save, /operation\.fields/);
  assert.match(save, /operation\.pendingPhotos/);
  assert.match(save, /operation\.removedPhotoIds/);
  assert.match(save, /createItemSaveResult/);
  assert.doesNotMatch(save, /const saveSucceeded = Boolean\(modalContent/);
});
