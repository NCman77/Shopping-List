import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackgroundPlaylistDownload } from '../../src/client/app/background-playlist.js';
import { createSessionOperationTracker } from '../../src/client/app/session-operation.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('playlist applies the first visible background before the remaining images finish preloading', async () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('alice');
  const second = deferred();
  const downloads = [];
  const applied = [];
  const appliedUrls = [];
  const revoked = [];
  let urlSequence = 0;

  const run = runBackgroundPlaylistDownload({
    tracker,
    userId: 'alice',
    preferences: {
      backgroundFiles: [
        { fileId: 'first', mimeType: 'image/webp' },
        { fileId: 'second', mimeType: 'image/webp' }
      ]
    },
    driveService: {
      hasAccessToken: () => true,
      downloadPhoto: async (fileId) => {
        downloads.push(fileId);
        if (fileId === 'second') return second.promise;
        return { name: fileId };
      }
    },
    createObjectUrl: (blob) => `blob:${blob.name}:${++urlSequence}`,
    revokeObjectUrl: (url) => revoked.push(url),
    clearBackground: () => {},
    hideBackground: () => {},
    applyBackgrounds: (items) => {
      applied.push(items.map((item) => item.fileId));
      appliedUrls.push(items.map((item) => item.objectUrl));
    },
    yieldToBrowser: async () => {}
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(downloads, ['first', 'second']);
  assert.deepEqual(applied, [['first']]);

  second.resolve({ name: 'second' });
  const result = await run;
  assert.equal(result.status, 'applied');
  assert.deepEqual(applied, [['first'], ['first', 'second']]);
  assert.notEqual(appliedUrls[0][0], appliedUrls[1][0]);
  assert.deepEqual(revoked, [appliedUrls[0][0]]);
});
