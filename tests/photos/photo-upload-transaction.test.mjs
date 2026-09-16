import test from 'node:test';
import assert from 'node:assert/strict';
import { runPhotoUploadTransaction, uploadPhotosWithRollback } from './photo-upload-transaction.js';

test('rolls back files uploaded earlier in the same save when a later upload fails', async () => {
  const deleted = [];
  const queued = [];
  const photos = [{ id: 'one' }, { id: 'two' }];

  await assert.rejects(
    () => uploadPhotosWithRollback({
      photos,
      concurrency: 1,
      uploadPhoto: async (photo) => {
        if (photo.id === 'two') throw new Error('upload failed');
        return { id: 'drive-one', name: 'one.webp' };
      },
      deletePhoto: async (fileId) => { deleted.push(fileId); },
      queueCleanup: (fileId) => { queued.push(fileId); }
    }),
    /upload failed/
  );

  assert.deepEqual(deleted, ['drive-one']);
  assert.deepEqual(queued, []);
});

test('queues cleanup when rollback deletion itself fails', async () => {
  const queued = [];

  await assert.rejects(
    () => uploadPhotosWithRollback({
      photos: [{ id: 'one' }, { id: 'two' }],
      concurrency: 1,
      uploadPhoto: async (photo) => {
        if (photo.id === 'two') throw new Error('upload failed');
        return { id: 'drive-one', name: 'one.webp' };
      },
      deletePhoto: async () => { throw new Error('delete failed'); },
      queueCleanup: (fileId) => { queued.push(fileId); }
    }),
    /upload failed/
  );

  assert.deepEqual(queued, ['drive-one']);
});

test('returns upload results in input order on success', async () => {
  const result = await uploadPhotosWithRollback({
    photos: [{ id: 'one' }, { id: 'two' }],
    concurrency: 2,
    uploadPhoto: async (photo) => ({ id: `drive-${photo.id}` }),
    deletePhoto: async () => {},
    queueCleanup: () => {}
  });

  assert.deepEqual(result.map((entry) => entry.id), ['drive-one', 'drive-two']);
});

test('rolls back every new Drive file when persistence fails after uploads', async () => {
  const deleted = [];
  await assert.rejects(() => runPhotoUploadTransaction({
    photos: [{ id: 'one' }, { id: 'two' }],
    uploadPhoto: async (photo) => ({ id: `drive-${photo.id}` }),
    persist: async () => { throw new Error('firestore failed'); },
    deletePhoto: async (id) => { deleted.push(id); },
    queueCleanup: () => {}
  }), /firestore failed/);
  assert.deepEqual(deleted.sort(), ['drive-one', 'drive-two']);
});

test('queues rollback IDs when deletion needs authorization', async () => {
  const queued = [];
  await assert.rejects(() => runPhotoUploadTransaction({
    photos: [{ id: 'one' }],
    uploadPhoto: async () => ({ id: 'drive-one' }),
    persist: async () => { throw new Error('firestore failed'); },
    deletePhoto: async () => { throw new Error('authorization required'); },
    queueCleanup: (id) => { queued.push(id); }
  }), /firestore failed/);
  assert.deepEqual(queued, ['drive-one']);
});

test('preserves the persistence error and continues rollback when cleanup queuing fails', async () => {
  const queued = [];
  await assert.rejects(() => runPhotoUploadTransaction({
    photos: [{ id: 'one' }, { id: 'two' }],
    concurrency: 1,
    uploadPhoto: async (photo) => ({ id: `drive-${photo.id}` }),
    persist: async () => { throw new Error('firestore failed'); },
    deletePhoto: async () => { throw new Error('authorization required'); },
    queueCleanup: async (id) => {
      queued.push(id);
      if (id === 'drive-one') throw new Error('cleanup storage failed');
    }
  }), /firestore failed/);
  assert.deepEqual(queued, ['drive-one', 'drive-two']);
});

test('retains uploaded files after successful persistence', async () => {
  const deleted = [];
  const value = await runPhotoUploadTransaction({
    photos: [{ id: 'one' }],
    uploadPhoto: async () => ({ id: 'drive-one' }),
    persist: async (uploads) => uploads[0].id,
    deletePhoto: async (id) => { deleted.push(id); },
    queueCleanup: () => {}
  });
  assert.equal(value, 'drive-one');
  assert.deepEqual(deleted, []);
});
