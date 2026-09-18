import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackgroundMediaService,
  isFirebaseBackgroundId,
  firebaseBackgroundStoragePath,
  migrateLegacyPlaylistToFirebase,
  migrateLegacySingleToFirebase
} from '../../src/client/app/firebase-background-storage.js';

test('Firebase personalization IDs are namespaced by user and kind', () => {
  const path = firebaseBackgroundStoragePath({
    userId: 'alice',
    kind: 'header',
    token: 'abc123',
    fileName: '東京 夜景.jpg'
  });
  assert.match(path, /^personalization\/alice\/header\/abc123-/);
  assert.match(path, /\.jpg$/);
  assert.equal(isFirebaseBackgroundId('storage:' + path), true);
  assert.equal(isFirebaseBackgroundId('legacy-drive-id'), false);
});

test('hybrid media service stores new uploads in Firebase and routes Firebase delete/download there', async () => {
  const calls = [];
  const firebaseService = {
    uploadFile: async ({ fileName }) => {
      calls.push('firebase-upload:' + fileName);
      return { id: 'storage:personalization/alice/header/new.jpg', name: fileName, mimeType: 'image/jpeg' };
    },
    downloadPhoto: async (id) => { calls.push('firebase-download:' + id); return new Blob(['x']); },
    deletePhoto: async (id) => { calls.push('firebase-delete:' + id); },
    queueCleanup: async (id) => { calls.push('firebase-queue:' + id); }
  };
  const driveService = {
    hasAccessToken: () => true,
    downloadPhoto: async (id) => { calls.push('drive-download:' + id); return new Blob(['old']); },
    deletePhoto: async (id) => { calls.push('drive-delete:' + id); },
    queueCleanup: async (id) => { calls.push('drive-queue:' + id); }
  };
  const media = createBackgroundMediaService({ firebaseService, driveService });
  const uploaded = await media.uploadFile({ blob: new Blob(['new']), fileName: 'new.jpg', appProperties: { kind: 'header' } });
  assert.equal(uploaded.id.startsWith('storage:'), true);
  await media.downloadPhoto(uploaded.id);
  await media.deletePhoto(uploaded.id);
  await media.downloadPhoto('legacy-drive-id');
  assert.deepEqual(calls, [
    'firebase-upload:new.jpg',
    'firebase-download:' + uploaded.id,
    'firebase-delete:' + uploaded.id,
    'drive-download:legacy-drive-id'
  ]);
});

test('legacy playlist migration persists Firebase IDs before deleting Drive originals', async () => {
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
    uploadFile: async ({ fileName }) => ({ id: 'storage:p/' + (++seq), name: fileName, mimeType: 'image/jpeg' }),
    deletePhoto: async (id) => events.push('storage-delete:' + id)
  };
  const result = await migrateLegacyPlaylistToFirebase({
    preferences,
    driveService,
    mediaService,
    persistPreferences: async (next) => events.push('persist:' + next.backgroundFiles.map((f) => f.fileId).join(','))
  });
  assert.equal(result.status, 'migrated');
  assert.deepEqual(events, [
    'persist:storage:p/1,storage:p/2',
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
      backgroundFileName: 'card.gif',
      backgroundMimeType: 'image/gif',
      positionX: 75,
      positionY: 30,
      scale: 1.5
    },
    driveService: {
      hasAccessToken: () => true,
      downloadPhoto: async () => new Blob(['gif'], { type: 'image/gif' }),
      deletePhoto: async (id) => events.push('drive-delete:' + id),
      queueCleanup: async () => {}
    },
    mediaService: {
      uploadFile: async () => ({ id: 'storage:card/new', name: 'card.gif', mimeType: 'image/gif' }),
      deletePhoto: async (id) => events.push('storage-delete:' + id)
    },
    persistPreferences: async (next) => events.push('persist:' + next.backgroundFileId)
  });
  assert.equal(result.status, 'migrated');
  assert.deepEqual(events, ['persist:storage:card/new', 'drive-delete:drive-card']);
});
