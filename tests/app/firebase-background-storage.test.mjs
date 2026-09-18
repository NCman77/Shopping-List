import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackgroundMediaService,
  isFirebaseBackgroundId,
  personalizationMediaPath,
  migrateLegacyPlaylistToFirebase,
  migrateLegacySingleToFirebase
} from '../../src/client/app/firebase-background-storage.js';

test('Firestore personalization IDs are namespaced by user documents', () => {
  assert.equal(isFirebaseBackgroundId('firestore:abc123'), true);
  assert.equal(isFirebaseBackgroundId('legacy-drive-id'), false);
  assert.equal(
    personalizationMediaPath({ userId: 'alice', mediaId: 'firestore:abc123' }),
    'artifacts/japan-shopping-app/users/alice/personalizationMedia/abc123'
  );
});
test('hybrid media service stores new uploads in Firestore and routes legacy IDs to Drive', async () => {
  const calls = [];
  const firebaseService = {
    uploadFile: async ({ fileName }) => {
      calls.push('firestore-upload:' + fileName);
      return { id: 'firestore:new-id', name: fileName, mimeType: 'image/jpeg' };
    },
    downloadPhoto: async (id) => { calls.push('firestore-download:' + id); return new Blob(['x']); },
    deletePhoto: async (id) => { calls.push('firestore-delete:' + id); },
    queueCleanup: async (id) => { calls.push('firestore-queue:' + id); },
    retryQueuedCleanup: async () => {}
  };
  const driveService = {
    hasAccessToken: () => true,
    downloadPhoto: async (id) => { calls.push('drive-download:' + id); return new Blob(['old']); },
    deletePhoto: async (id) => { calls.push('drive-delete:' + id); },
    queueCleanup: async (id) => { calls.push('drive-queue:' + id); },
    retryQueuedCleanup: async () => {}
  };
  const media = createBackgroundMediaService({ firebaseService, driveService });
  const uploaded = await media.uploadFile({ blob: new Blob(['new']), fileName: 'new.jpg', appProperties: { kind: 'header' } });
  assert.equal(uploaded.id.startsWith('firestore:'), true);
  await media.downloadPhoto(uploaded.id);
  await media.deletePhoto(uploaded.id);
  await media.downloadPhoto('legacy-drive-id');
  assert.deepEqual(calls, [
    'firestore-upload:new.jpg',
    'firestore-download:' + uploaded.id,
    'firestore-delete:' + uploaded.id,
    'drive-download:legacy-drive-id'
  ]);
});

test('legacy playlist migration persists Firestore IDs before deleting Drive originals', async () => {
  const events = [];
  const preferences = {
    backgroundFiles: [
      { fileId: 'drive-a', fileName: 'a.jpg', mimeType: 'image/jpeg', positionX: 10, positionY: 20, scale: 1.2 },
      { fileId: 'drive-b', fileName: 'b.jpg', mimeType: 'image/jpeg', positionX: 80, positionY: 70, scale: 1.4 }
    ],
    rotationIntervalSeconds: 5
  };
  const driveService = {
    hasAccessToken: () => true,
    downloadPhoto: async (id) => new Blob([id], { type: 'image/jpeg' }),
    deletePhoto: async (id) => events.push('drive-delete:' + id),
    queueCleanup: async () => {}
  };
  let seq = 0;
  const mediaService = {
    uploadFile: async ({ fileName }) => ({ id: 'firestore:p' + (++seq), name: fileName, mimeType: 'image/jpeg' }),
    deletePhoto: async (id) => events.push('firestore-delete:' + id)
  };
  const result = await migrateLegacyPlaylistToFirebase({
    preferences,
    driveService,
    mediaService,
    persistPreferences: async (next) => events.push('persist:' + next.backgroundFiles.map((f) => f.fileId).join(','))
  });
  assert.equal(result.status, 'migrated');
  assert.deepEqual(events, [
    'persist:firestore:p1,firestore:p2',
    'drive-delete:drive-a',
    'drive-delete:drive-b'
  ]);
});

test('legacy single background migration preserves framing and deletes Drive original after persist', async () => {
  const events = [];
  const result = await migrateLegacySingleToFirebase({
    preferences: {
      mode: 'media',
      backgroundFileId: 'drive-card',
      backgroundFileName: 'card.jpg',
      backgroundMimeType: 'image/jpeg',
      positionX: 75,
      positionY: 30,
      scale: 1.5
    },
    driveService: {
      hasAccessToken: () => true,
      downloadPhoto: async () => new Blob(['photo'], { type: 'image/jpeg' }),
      deletePhoto: async (id) => events.push('drive-delete:' + id),
      queueCleanup: async () => {}
    },
    mediaService: {
      uploadFile: async () => ({ id: 'firestore:cardnew', name: 'card.jpg', mimeType: 'image/jpeg' }),
      deletePhoto: async (id) => events.push('firestore-delete:' + id)
    },
    persistPreferences: async (next) => events.push('persist:' + next.backgroundFileId)
  });
  assert.equal(result.status, 'migrated');
  assert.deepEqual(events, ['persist:firestore:cardnew', 'drive-delete:drive-card']);
});
