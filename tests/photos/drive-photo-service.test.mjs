import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrivePhotoService, DriveAuthorizationError } from './drive-photo-service.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

test('uploads multipart metadata into appDataFolder', async () => {
  const calls = [];
  const service = createDrivePhotoService({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 'drive-1', name: 'photo.webp' }), { status: 200 });
    },
    sessionStorageImpl: memoryStorage(),
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('token-1');
  const result = await service.uploadPhoto({ blob: new Blob(['x'], { type: 'image/webp' }), fileName: 'photo.webp', itemId: 'item-1' });
  assert.equal(result.id, 'drive-1');
  assert.match(calls[0].url, /upload\/drive\/v3\/files\?uploadType=multipart/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1');
  assert.match(await calls[0].options.body.get('metadata').text(), /"parents":\["appDataFolder"\]/);
});

test('uploads generic app-data files with caller supplied app properties', async () => {
  const calls = [];
  const service = createDrivePhotoService({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 'bg-1', name: 'background.mp4', mimeType: 'video/mp4' }), { status: 200 });
    },
    sessionStorageImpl: memoryStorage(),
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('token-1');
  const result = await service.uploadFile({
    blob: new Blob(['video'], { type: 'video/mp4' }),
    fileName: 'background.mp4',
    appProperties: { kind: 'background', owner: 'uid-1' }
  });
  assert.equal(result.id, 'bg-1');
  const metadata = JSON.parse(await calls[0].options.body.get('metadata').text());
  assert.deepEqual(metadata.parents, ['appDataFolder']);
  assert.deepEqual(metadata.appProperties, { kind: 'background', owner: 'uid-1' });
});

test('turns 401 into an authorization error and clears the token', async () => {
  const service = createDrivePhotoService({
    fetchImpl: async () => new Response('', { status: 401 }),
    sessionStorageImpl: memoryStorage(),
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('expired');
  await assert.rejects(() => service.downloadPhoto('file-1'), DriveAuthorizationError);
  assert.equal(service.hasAccessToken(), false);
});

test('download and delete use Drive file endpoints', async () => {
  const calls = [];
  const service = createDrivePhotoService({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if ((options.method || 'GET') === 'DELETE') return new Response(null, { status: 204 });
      return new Response(new Blob(['x'], { type: 'image/webp' }), { status: 200 });
    },
    sessionStorageImpl: memoryStorage(),
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('token');
  await service.downloadPhoto('file-1');
  await service.deletePhoto('file-1');
  assert.match(calls[0].url, /files\/file-1\?alt=media$/);
  assert.equal(calls[1].options.method, 'DELETE');
});

test('keeps cleanup IDs per user and retries them', async () => {
  const deleted = [];
  const storage = memoryStorage();
  const service = createDrivePhotoService({
    fetchImpl: async (url) => { deleted.push(url); return new Response(null, { status: 204 }); },
    sessionStorageImpl: storage,
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('token');
  service.queueCleanup('orphan-1');
  await service.retryQueuedCleanup();
  assert.equal(deleted.length, 1);
  assert.deepEqual(service.getQueuedCleanup(), []);
});

test('403 also requires Drive authorization', async () => {
  const service = createDrivePhotoService({
    fetchImpl: async () => new Response('', { status: 403 }),
    sessionStorageImpl: memoryStorage(),
    getUserId: () => 'uid-1'
  });
  service.setAccessToken('expired');
  await assert.rejects(() => service.deletePhoto('file-1'), DriveAuthorizationError);
});
