import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  backgroundKindForMime,
  backgroundLoadKey,
  isSupportedBackgroundFile,
  resetBackgroundSessionUi,
  runBackgroundDownload,
  runBackgroundSaveTransaction,
  runBackgroundPlaylistSaveTransaction
} from '../../src/client/app/background-personalization.js';
import { createSessionOperationTracker } from '../../src/client/app/session-operation.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('background accepts common images, GIF, MP4 and WebM only', () => {
  assert.equal(isSupportedBackgroundFile({ type: 'image/jpeg', name: 'a.jpg' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'image/png', name: 'a.png' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'image/webp', name: 'a.webp' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'image/gif', name: 'a.gif' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'video/mp4', name: 'a.mp4' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'video/webm', name: 'a.webm' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'text/plain', name: 'a.txt' }), false);
  assert.equal(backgroundKindForMime('video/mp4'), 'video');
  assert.equal(backgroundKindForMime('image/gif'), 'image');
});

test('background load key changes only when the account or persisted file changes', () => {
  assert.equal(backgroundLoadKey('user-a', { backgroundFileId: 'file-1' }), 'user-a:file-1');
  assert.equal(backgroundLoadKey('user-a', { backgroundFileId: 'file-1', backgroundScale: 2 }), 'user-a:file-1');
  assert.notEqual(backgroundLoadKey('user-a', { backgroundFileId: 'file-1' }), backgroundLoadKey('user-a', { backgroundFileId: 'file-2' }));
  assert.notEqual(backgroundLoadKey('user-a', { backgroundFileId: 'file-1' }), backgroundLoadKey('user-b', { backgroundFileId: 'file-1' }));
});

test('background editor provides per-photo framing controls without pan controls', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /background-preview-viewport/);
  assert.match(source, /background-scale/);
  assert.match(source, /background-thumbnails/);
  assert.match(source, /data-background-index/);
  assert.match(source, /background-delete-current/);
  assert.match(source, /data-position-preset="center"/);
  assert.doesNotMatch(source, /background-pan-enabled/);
  assert.doesNotMatch(source, /background-pan-direction/);
  assert.doesNotMatch(source, /background-pan-iteration/);
  assert.doesNotMatch(source, /buildPanStyle/);
});

test('video backgrounds are muted inline and Drive replacement is saved before old cleanup', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /playsInline = true/);
  assert.match(source, /muted = true/);
  assert.match(source, /uploadFile/);
  assert.match(source, /setDoc/);
  assert.match(source, /deletePhoto/);
  assert.ok(source.indexOf('await setDoc') < source.lastIndexOf('deletePhoto'));
  assert.match(source, /shopping-list:open-page-background/);
  assert.doesNotMatch(source, /addEventListener\('shopping-list:open-personalization'/);
  assert.match(source, /shopping-list:drive-token-ready/);
});

test('background save can tag a distinct Drive file kind for header backgrounds', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const operation = tracker.capture('user-a');
  let uploadedOptions = null;

  const result = await runBackgroundSaveTransaction({
    tracker,
    operation,
    getCurrentUserId: () => 'user-a',
    capturedSettingsRef: { owner: 'user-a' },
    editorPreferences: {},
    pendingFile: { name: 'header.jpg', type: 'image/jpeg' },
    removeRequested: false,
    oldFileId: '',
    uploadKind: 'header-background',
    driveService: {
      hasAccessToken: () => true,
      uploadFile: async (options) => {
        uploadedOptions = options;
        return { id: 'header-file', name: 'header.jpg', mimeType: 'image/jpeg' };
      },
      deletePhoto: async () => {},
      queueCleanup: () => {}
    },
    connectDrive: async () => {},
    persistSettings: async () => {},
    afterCommit: async () => {},
    onError: () => {}
  });

  assert.equal(result.status, 'saved');
  assert.equal(uploadedOptions.appProperties.kind, 'header-background');
});

test('a stale download revokes its own URL without replacing or hiding the newer background', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const oldDownload = deferred();
  const revoked = [];
  let activeUrl = '';
  let hideCount = 0;
  const common = {
    tracker,
    userId: 'user-a',
    createObjectUrl: (blob) => `blob:${blob.name}`,
    revokeObjectUrl: (url) => revoked.push(url),
    clearBackground: () => { activeUrl = ''; hideCount += 1; },
    hideBackground: () => { hideCount += 1; },
    applyBackground: (url) => { activeUrl = url; }
  };

  const stale = runBackgroundDownload({
    ...common,
    preferences: { backgroundFileId: 'old-file' },
    driveService: {
      hasAccessToken: () => true,
      downloadPhoto: () => oldDownload.promise
    }
  });
  await runBackgroundDownload({
    ...common,
    preferences: { backgroundFileId: 'new-file' },
    driveService: {
      hasAccessToken: () => true,
      downloadPhoto: async () => ({ name: 'new' })
    }
  });
  oldDownload.resolve({ name: 'old' });
  await stale;

  assert.equal(activeUrl, 'blob:new');
  assert.deepEqual(revoked, ['blob:old']);
  assert.equal(hideCount, 0);
});

test('a stale upload stops before Firestore and rolls back through the originating user service', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const operation = tracker.capture('user-a');
  let currentUserId = 'user-a';
  const deleted = [];
  const queued = [];
  const persisted = [];
  const reported = [];
  const driveService = {
    owner: 'user-a',
    hasAccessToken: () => true,
    uploadFile: async () => {
      currentUserId = 'user-b';
      tracker.advance('user-b');
      return { id: 'uploaded-a', name: 'a.png', mimeType: 'image/png' };
    },
    deletePhoto: async (id) => {
      deleted.push(`${driveService.owner}:${id}`);
      throw new Error('delete unavailable');
    },
    queueCleanup: (id) => queued.push(`${driveService.owner}:${id}`)
  };

  const result = await runBackgroundSaveTransaction({
    tracker,
    operation,
    getCurrentUserId: () => currentUserId,
    capturedSettingsRef: { owner: 'user-a' },
    editorPreferences: {},
    pendingFile: { name: 'a.png', type: 'image/png' },
    removeRequested: false,
    oldFileId: '',
    driveService,
    connectDrive: async () => {},
    persistSettings: async (...args) => persisted.push(args),
    afterCommit: async () => {},
    onError: (error) => reported.push(error)
  });

  assert.equal(result.status, 'stale');
  assert.equal(result.persistenceCommitted, false);
  assert.deepEqual(persisted, []);
  assert.deepEqual(deleted, ['user-a:uploaded-a']);
  assert.deepEqual(queued, ['user-a:uploaded-a']);
  assert.deepEqual(reported, []);
});

test('background persistence uses the settings reference captured before upload', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const operation = tracker.capture('user-a');
  const capturedSettingsRef = { owner: 'user-a' };
  let mutableSettingsRef = capturedSettingsRef;
  const persistedRefs = [];

  const result = await runBackgroundSaveTransaction({
    tracker,
    operation,
    getCurrentUserId: () => 'user-a',
    capturedSettingsRef,
    editorPreferences: {},
    pendingFile: { name: 'a.png', type: 'image/png' },
    removeRequested: false,
    oldFileId: '',
    driveService: {
      hasAccessToken: () => true,
      uploadFile: async () => {
        mutableSettingsRef = { owner: 'user-b' };
        return { id: 'uploaded-a', name: 'a.png', mimeType: 'image/png' };
      },
      deletePhoto: async () => {},
      queueCleanup: () => {}
    },
    connectDrive: async () => {},
    persistSettings: async (ref) => persistedRefs.push(ref),
    afterCommit: async () => {},
    onError: () => {}
  });

  assert.equal(result.status, 'saved');
  assert.equal(mutableSettingsRef.owner, 'user-b');
  assert.deepEqual(persistedRefs, [capturedSettingsRef]);
});

test('a post-persistence UI or reload failure is reported without deleting the committed upload', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const operation = tracker.capture('user-a');
  const deleted = [];
  const reported = [];
  const reloadError = new Error('background reload failed');

  const result = await runBackgroundSaveTransaction({
    tracker,
    operation,
    getCurrentUserId: () => 'user-a',
    capturedSettingsRef: { owner: 'user-a' },
    editorPreferences: {},
    pendingFile: { name: 'a.png', type: 'image/png' },
    removeRequested: false,
    oldFileId: '',
    driveService: {
      hasAccessToken: () => true,
      uploadFile: async () => ({ id: 'uploaded-a', name: 'a.png', mimeType: 'image/png' }),
      deletePhoto: async (id) => deleted.push(id),
      queueCleanup: () => {}
    },
    connectDrive: async () => {},
    persistSettings: async () => {},
    afterCommit: async () => { throw reloadError; },
    onError: (error) => reported.push(error)
  });

  assert.equal(result.status, 'error');
  assert.equal(result.persistenceCommitted, true);
  assert.deepEqual(deleted, []);
  assert.deepEqual(reported, [reloadError]);
});

test('auth reset advances generation and restores the editor, layer, and save button', () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const oldOperation = tracker.capture('user-a');
  const saveButton = { disabled: true };
  let editorOpen = true;
  let layerVisible = true;

  const operation = resetBackgroundSessionUi({
    tracker,
    userId: 'user-a',
    closeEditor: () => { editorOpen = false; },
    hideBackground: () => { layerVisible = false; },
    saveButton
  });

  assert.equal(tracker.isSessionCurrent(oldOperation, 'user-a'), false);
  assert.equal(tracker.isSessionCurrent(operation, 'user-a'), true);
  assert.equal(saveButton.disabled, false);
  assert.equal(editorOpen, false);
  assert.equal(layerVisible, false);
});

test('browser handlers delegate playlist download, playlist save, and auth reset to the tested orchestrators', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  const init = source.slice(source.indexOf('export async function initBackgroundPersonalization'));
  assert.match(init, /runBackgroundPlaylistDownload\(\{/);
  assert.match(init, /runBackgroundPlaylistSaveTransaction\(\{/);
  assert.match(init, /resetBackgroundSessionUi\(\{/);
});


test('page background editor accepts multiple files and exposes a slideshow interval', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /id="background-file-input"[^>]*multiple/);
  assert.match(source, /id="background-rotation-interval"/);
  assert.match(source, /rotationIntervalSeconds/);
  assert.match(source, /setInterval/);
});

test('playlist save uploads multiple files and persists a backward-compatible first file', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const operation = tracker.capture('user-a');
  const persisted = [];
  let sequence = 0;

  const result = await runBackgroundPlaylistSaveTransaction({
    tracker,
    operation,
    getCurrentUserId: () => 'user-a',
    capturedSettingsRef: { owner: 'user-a' },
    editorPreferences: { rotationIntervalSeconds: 6 },
    pendingFiles: [
      { name: 'one.jpg', type: 'image/jpeg' },
      { name: 'two.jpg', type: 'image/jpeg' }
    ],
    removeRequested: false,
    oldFiles: [],
    uploadKind: 'background',
    driveService: {
      hasAccessToken: () => true,
      uploadFile: async ({ blob }) => ({ id: `file-${++sequence}`, name: blob.name, mimeType: blob.type }),
      deletePhoto: async () => {},
      queueCleanup: () => {}
    },
    connectDrive: async () => {},
    persistSettings: async (_ref, next) => persisted.push(next),
    afterCommit: async () => {},
    onError: () => {}
  });

  assert.equal(result.status, 'saved');
  assert.equal(persisted[0].backgroundFiles.length, 2);
  assert.equal(persisted[0].backgroundFileId, 'file-1');
  assert.equal(persisted[0].rotationIntervalSeconds, 6);
});


test('page slideshow interval can be cleared temporarily without immediately restoring a number', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /normalizeRotationIntervalDraft/);
  assert.match(source, /background-rotation-interval/);
  assert.match(source, /if \(nextInterval === null\) return/);
});


test('removing a persisted page background deletes its Google Drive file after preferences persist', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-page');
  const operation = tracker.capture('user-page');
  const events = [];

  const result = await runBackgroundPlaylistSaveTransaction({
    tracker,
    operation,
    getCurrentUserId: () => 'user-page',
    capturedSettingsRef: { owner: 'user-page' },
    editorPreferences: { backgroundFiles: [] },
    pendingFiles: [],
    pendingEntries: [],
    removeRequested: true,
    oldFiles: [{ fileId: 'page-bg-1' }],
    uploadKind: 'background',
    driveService: {
      hasAccessToken: () => true,
      deletePhoto: async (id) => events.push('delete:' + id),
      queueCleanup: () => {}
    },
    connectDrive: async () => {},
    persistSettings: async () => events.push('persist'),
    afterCommit: async () => events.push('after'),
    onError: () => {}
  });

  assert.equal(result.status, 'saved');
  assert.deepEqual(events, ['persist', 'delete:page-bg-1', 'after']);
});

test('removing a persisted item-card media background deletes its Google Drive file after preferences persist', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-card');
  const operation = tracker.capture('user-card');
  const events = [];

  const result = await runBackgroundSaveTransaction({
    tracker,
    operation,
    getCurrentUserId: () => 'user-card',
    capturedSettingsRef: { owner: 'user-card' },
    editorPreferences: { backgroundFileId: 'card-bg-1', backgroundFileName: 'card.jpg', backgroundMimeType: 'image/jpeg' },
    pendingFile: null,
    removeRequested: true,
    oldFileId: 'card-bg-1',
    uploadKind: 'item-card-background',
    driveService: {
      hasAccessToken: () => true,
      deletePhoto: async (id) => events.push('delete:' + id),
      queueCleanup: () => {}
    },
    connectDrive: async () => {},
    persistSettings: async () => events.push('persist'),
    afterCommit: async () => events.push('after'),
    onError: () => {}
  });

  assert.equal(result.status, 'saved');
  assert.deepEqual(events, ['persist', 'delete:card-bg-1', 'after']);
});
