import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  backgroundKindForMime,
  isSupportedBackgroundFile,
  resetBackgroundSessionUi,
  runBackgroundDownload,
  runBackgroundSaveTransaction
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

test('background editor contains non-destructive framing and pan controls', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /background-preview-viewport/);
  assert.match(source, /background-scale/);
  assert.match(source, /data-position-preset="center"/);
  assert.match(source, /data-position-preset="left"/);
  assert.match(source, /data-position-preset="right"/);
  assert.match(source, /data-position-preset="top"/);
  assert.match(source, /data-position-preset="bottom"/);
  assert.match(source, /background-pan-enabled/);
  assert.match(source, /background-pan-direction/);
  assert.match(source, /background-pan-iteration/);
});

test('video backgrounds are muted inline and Drive replacement is saved before old cleanup', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /playsInline = true/);
  assert.match(source, /muted = true/);
  assert.match(source, /uploadFile/);
  assert.match(source, /setDoc/);
  assert.match(source, /deletePhoto/);
  assert.ok(source.indexOf('await setDoc') < source.lastIndexOf('deletePhoto'));
  assert.match(source, /shopping-list:open-personalization/);
  assert.match(source, /shopping-list:drive-token-ready/);
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

test('browser handlers delegate download, save, and auth reset to the tested orchestrators', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  const init = source.slice(source.indexOf('export async function initBackgroundPersonalization'));
  assert.match(init, /runBackgroundDownload\(\{/);
  assert.match(init, /runBackgroundSaveTransaction\(\{/);
  assert.match(init, /resetBackgroundSessionUi\(\{/);
});
