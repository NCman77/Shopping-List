import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reorderBackgroundFiles,
  runBackgroundPlaylistSaveTransaction
} from '../../src/client/app/background-playlist.js';
import { createSessionOperationTracker } from '../../src/client/app/session-operation.js';

test('reorderBackgroundFiles moves one entry without changing the others', () => {
  const source = [
    { fileId: 'a' },
    { fileId: 'b' },
    { fileId: 'c' },
    { fileId: 'd' }
  ];
  assert.deepEqual(
    reorderBackgroundFiles(source, 3, 1).map((item) => item.fileId),
    ['a', 'd', 'b', 'c']
  );
  assert.deepEqual(source.map((item) => item.fileId), ['a', 'b', 'c', 'd']);
});

test('playlist save can append pending files while retaining old files and chosen order', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const operation = tracker.capture('user-a');
  const persisted = [];

  const result = await runBackgroundPlaylistSaveTransaction({
    tracker,
    operation,
    getCurrentUserId: () => 'user-a',
    capturedSettingsRef: { owner: 'user-a' },
    editorPreferences: {
      rotationIntervalSeconds: 7,
      backgroundFiles: [
        { fileId: 'old-2', fileName: '2.jpg', mimeType: 'image/jpeg', positionX: 20, positionY: 30, scale: 1.2 },
        { fileId: 'pending:new-1', fileName: '5.jpg', mimeType: 'image/jpeg', positionX: 60, positionY: 70, scale: 1.4 },
        { fileId: 'old-1', fileName: '1.jpg', mimeType: 'image/jpeg', positionX: 40, positionY: 50, scale: 1.1 }
      ]
    },
    pendingEntries: [
      { key: 'pending:new-1', file: { name: '5.jpg', type: 'image/jpeg' } }
    ],
    removeRequested: false,
    oldFiles: [
      { fileId: 'old-1' },
      { fileId: 'old-2' }
    ],
    uploadKind: 'header-background',
    driveService: {
      hasAccessToken: () => true,
      uploadFile: async () => ({ id: 'new-5', name: '5.jpg', mimeType: 'image/jpeg' }),
      deletePhoto: async () => {},
      queueCleanup: () => {}
    },
    connectDrive: async () => {},
    persistSettings: async (_ref, next) => persisted.push(next),
    afterCommit: async () => {},
    onError: () => {}
  });

  assert.equal(result.status, 'saved');
  assert.deepEqual(
    persisted[0].backgroundFiles.map((item) => item.fileId),
    ['old-2', 'new-5', 'old-1']
  );
  assert.equal(persisted[0].backgroundFiles[1].positionX, 60);
  assert.equal(persisted[0].rotationIntervalSeconds, 7);
});
