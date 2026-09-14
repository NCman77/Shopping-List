import test from 'node:test';
import assert from 'node:assert/strict';
import { installDriveUploadRollbackFetch } from './drive-upload-rollback-fetch.js';

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

function uploadBody(itemId) {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ appProperties: { itemId } })], { type: 'application/json' }));
  form.append('file', new Blob(['x'], { type: 'image/webp' }), 'x.webp');
  return form;
}

const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

test('rolls back successful files when another upload in the same burst fails', async () => {
  const calls = [];
  let uploadCount = 0;
  const fakeWindow = {
    sessionStorage: memoryStorage({ 'shopping-list:drive-token:uid-1': 'token-1' }),
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method === 'DELETE') return new Response(null, { status: 204 });
      uploadCount += 1;
      if (uploadCount === 1) return new Response(JSON.stringify({ id: 'drive-one' }), { status: 200 });
      return new Response(JSON.stringify({ error: { message: 'upload failed' } }), { status: 500 });
    }
  };

  installDriveUploadRollbackFetch(fakeWindow);
  const headers = { Authorization: 'Bearer token-1' };
  await Promise.all([
    fakeWindow.fetch(uploadUrl, { method: 'POST', headers, body: uploadBody('item-1') }),
    fakeWindow.fetch(uploadUrl, { method: 'POST', headers, body: uploadBody('item-1') })
  ]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(calls.some((call) => call.url.endsWith('/drive/v3/files/drive-one') && call.options.method === 'DELETE'));
});

test('queues cleanup for the matching user when rollback deletion fails', async () => {
  let uploadCount = 0;
  const storage = memoryStorage({ 'shopping-list:drive-token:uid-1': 'token-1' });
  const fakeWindow = {
    sessionStorage: storage,
    fetch: async (_url, options = {}) => {
      if (options.method === 'DELETE') return new Response(JSON.stringify({ error: { message: 'delete failed' } }), { status: 500 });
      uploadCount += 1;
      if (uploadCount === 1) return new Response(JSON.stringify({ id: 'drive-one' }), { status: 200 });
      return new Response(JSON.stringify({ error: { message: 'upload failed' } }), { status: 500 });
    }
  };

  installDriveUploadRollbackFetch(fakeWindow);
  const headers = { Authorization: 'Bearer token-1' };
  await Promise.all([
    fakeWindow.fetch(uploadUrl, { method: 'POST', headers, body: uploadBody('item-1') }),
    fakeWindow.fetch(uploadUrl, { method: 'POST', headers, body: uploadBody('item-1') })
  ]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(JSON.parse(storage.getItem('shopping-list:drive-cleanup:uid-1')), ['drive-one']);
});
