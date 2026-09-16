import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  captureRegisteredItemSaveExtensions,
  createOwnedItemSavePhotoService,
  createItemSaveOperation,
  createItemSaveResult,
  deleteCapturedItemPhoto,
  isItemSaveOperationCurrent,
  registerItemSaveSnapshotProvider
} from '../../src/client/app/item-save-operation.js';
import { resolvePhotoPersistenceForSave } from '../../src/client/photos/photo-visibility-state.js';

function deferred() {
  let resolve;
  const promise = new Promise((accept) => { resolve = accept; });
  return { promise, resolve };
}

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

test('deferred save never writes photos with credentials from a later user', async () => {
  let currentUserId = 'user-a';
  const uploadGate = deferred();
  const serviceOwners = [];
  const writes = [];
  const cleanups = [];
  const operation = createItemSaveOperation({ operationId: 'op-a', userId: 'user-a', itemId: 'item-a' });
  const photoService = createOwnedItemSavePhotoService(operation, {
    getCurrentUserId: () => currentUserId,
    createService: (userId) => {
      serviceOwners.push(userId);
      return {
        hasAccessToken: () => true,
        uploadPhoto: async () => { writes.push(userId); return { id: 'drive-a' }; },
        deletePhoto: async () => { writes.push(userId); },
        queueCleanup: (fileId) => { cleanups.push({ userId, fileId }); }
      };
    }
  });

  const save = (async () => {
    await uploadGate.promise;
    return photoService.uploadPhoto({ blob: new Blob(['a']), itemId: operation.itemId });
  })();
  currentUserId = 'user-b';
  uploadGate.resolve();

  await assert.rejects(save, { code: 'item-save-operation-stale' });
  assert.deepEqual(serviceOwners, ['user-a']);
  assert.deepEqual(writes, []);
  photoService.queueCleanup('drive-a');
  assert.deepEqual(cleanups, [{ userId: 'user-a', fileId: 'drive-a' }]);
});

test('deferred upload keeps photo order cover and deletion ownership from capture time', async () => {
  const uploadGate = deferred();
  const capturedActive = [{ id: 'photo-cover', driveFileId: 'drive-cover', thumbnailDataUrl: 'data:image/webp;base64,AA==' }];
  const capturedRemoved = { 'photo-remove': 'drive-remove' };
  const operation = createItemSaveOperation({
    operationId: 'op-a', userId: 'user-a', itemId: 'item-a',
    existingActivePhotos: capturedActive,
    removedPhotoDriveFileIds: capturedRemoved
  });

  const upload = (async () => {
    await uploadGate.promise;
    const persistence = resolvePhotoPersistenceForSave({
      existingActivePhotos: operation.existingActivePhotos,
      uploadedPhotos: [{ id: 'photo-new', thumbnailDataUrl: 'data:image/webp;base64,BB==' }]
    });
    return {
      order: operation.existingActivePhotos.length,
      coverPhotoId: persistence.coverPhotoId,
      removedDriveFileId: operation.removedPhotoDriveFileIds['photo-remove']
    };
  })();

  capturedActive[0].id = 'photo-later';
  capturedActive.push({ id: 'photo-later-2', driveFileId: 'drive-later-2' });
  capturedRemoved['photo-remove'] = 'drive-later';
  uploadGate.resolve();

  assert.deepEqual(await upload, {
    order: 1,
    coverPhotoId: 'photo-cover',
    removedDriveFileId: 'drive-remove'
  });
});

test('enhanced save uses captured Drive and photo subscription ownership', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  const start = source.indexOf('window.saveItem = async function');
  const end = source.indexOf('const originalAskDelete', start);
  const save = source.slice(start, end);

  assert.match(save, /createOwnedItemSavePhotoService/);
  assert.match(save, /deleteCapturedItemPhoto/);
  assert.match(save, /operation\.existingActivePhotos/);
  assert.match(save, /operation\.removedPhotoDriveFileIds/);
  assert.doesNotMatch(save, /activePhotosForItem/);
  assert.doesNotMatch(save, /state\.photoDocs/);
  assert.doesNotMatch(save, /drivePhotoService\.(?:uploadPhoto|deletePhoto|queueCleanup)/);
});

test('photo selection drops compression results after the editor generation changes', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function handlePhotoSelection');
  const end = source.indexOf('\n  function getCardItemId', start);
  const selection = source.slice(start, end);
  assert.match(selection, /const selectionGeneration = state\.modalGeneration/);
  assert.match(selection, /acceptCompressedPhoto/);
  assert.match(selection, /revoke: revokeCompressedImage/);
  assert.match(selection, /if \(selectionGeneration !== state\.modalGeneration\) break/);
});

test('enhanced item save commits through the high-level photo transaction', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  const start = source.indexOf('window.saveItem = async function');
  const end = source.indexOf('const originalAskDelete', start);
  const save = source.slice(start, end);
  assert.match(save, /runPhotoUploadTransaction/);
  assert.match(save, /persist:\s*async/);
  assert.match(save, /await batch\.commit\(\)/);
});

test('post-delete user switch still deletes captured metadata without queuing the deleted Drive file', async () => {
  let currentUserId = 'user-a';
  const queued = [];
  const metadataDeletes = [];
  const operation = createItemSaveOperation({ operationId: 'op-a', userId: 'user-a', itemId: 'item-a' });
  const photoService = createOwnedItemSavePhotoService(operation, {
    getCurrentUserId: () => currentUserId,
    createService: () => ({
      hasAccessToken: () => true,
      uploadPhoto: async () => ({ id: 'unused' }),
      deletePhoto: async () => { currentUserId = 'user-b'; },
      queueCleanup: (fileId) => { queued.push(fileId); }
    })
  });
  const capturedPhotoRef = { userId: operation.userId, photoId: 'photo-remove' };

  await deleteCapturedItemPhoto({
    driveFileId: 'drive-remove',
    photoService,
    deletePhotoMetadata: async () => { metadataDeletes.push(capturedPhotoRef); },
    shouldQueueCleanup: () => true
  });

  assert.deepEqual(queued, []);
  assert.deepEqual(metadataDeletes, [{ userId: 'user-a', photoId: 'photo-remove' }]);
});

test('pre-delete user switch still blocks the Drive deletion', async () => {
  let currentUserId = 'user-b';
  let driveDeletes = 0;
  let metadataDeletes = 0;
  const queued = [];
  const operation = createItemSaveOperation({ operationId: 'op-a', userId: 'user-a', itemId: 'item-a' });
  const photoService = createOwnedItemSavePhotoService(operation, {
    getCurrentUserId: () => currentUserId,
    createService: () => ({
      hasAccessToken: () => true,
      uploadPhoto: async () => ({ id: 'unused' }),
      deletePhoto: async () => { driveDeletes += 1; },
      queueCleanup: (fileId) => { queued.push(fileId); }
    })
  });

  const deleted = await deleteCapturedItemPhoto({
    driveFileId: 'drive-remove',
    photoService,
    deletePhotoMetadata: async () => { metadataDeletes += 1; }
  });

  assert.equal(deleted, false);
  assert.equal(driveDeletes, 0);
  assert.equal(metadataDeletes, 0);
  assert.deepEqual(queued, ['drive-remove']);
});

test('failed photo deletion queues its metadata id for durable retry', async () => {
  const queued = [];
  const operation = createItemSaveOperation({ operationId: 'op-a', userId: 'user-a', itemId: 'item-a' });
  const photoService = createOwnedItemSavePhotoService(operation, {
    getCurrentUserId: () => 'user-a',
    createService: () => ({
      hasAccessToken: () => true,
      uploadPhoto: async () => ({ id: 'unused' }),
      deletePhoto: async () => { throw new Error('authorization required'); },
      queueCleanup: (fileId, metadataId) => { queued.push({ fileId, metadataId }); }
    })
  });

  const deleted = await deleteCapturedItemPhoto({
    driveFileId: 'drive-remove',
    cleanupMetadataId: 'photo-remove',
    photoService,
    deletePhotoMetadata: async () => {}
  });

  assert.equal(deleted, false);
  assert.deepEqual(queued, [{ fileId: 'drive-remove', metadataId: 'photo-remove' }]);
});

test('Drive reconnect retries persisted deleting photo metadata after a reload', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  assert.match(source, /async function retryPendingPhotoDeletes/);
  assert.match(source, /photo\.status === ['"]deleting['"]/);
  assert.match(source, /queueCleanup\(photo\.driveFileId, photo\.id\)/);
  assert.match(source, /await retryPendingPhotoDeletes\(\)/);
});
