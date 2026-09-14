import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadPhotosWithRollback } from './photo-upload-transaction.js';

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
