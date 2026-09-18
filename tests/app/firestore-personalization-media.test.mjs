import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compressPersonalizationImage,
  createFirestorePersonalizationMediaService,
  isFirestorePersonalizationId,
  personalizationMediaPath
} from '../../src/client/app/firestore-personalization-media.js';

const CAP = 900_000;

function makeLocalStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    valueFor: (key) => values.get(key)
  };
}

function makeFirestoreSdk({ onSet, onDelete, onGet } = {}) {
  return {
    Bytes: {
      fromUint8Array: (value) => ({ kind: 'bytes', value })
    },
    doc: (db, ...segments) => ({ db, path: segments.join('/') }),
    setDoc: async (ref, data) => onSet?.(ref, data),
    getDoc: async (ref) => onGet?.(ref),
    deleteDoc: async (ref) => onDelete?.(ref),
    serverTimestamp: () => 'server-timestamp'
  };
}

test('compressPersonalizationImage accepts static photos and enforces the encoded byte cap', async () => {
  const attempts = [];
  const compressed = await compressPersonalizationImage(
    { type: 'image/jpeg', size: 12, name: 'source.jpg' },
    {
      compressImage: async (_file, options) => {
        attempts.push(options);
        const size = attempts.length === 1 ? CAP + 1 : CAP;
        return {
          blob: new Blob([new Uint8Array(size)], { type: 'image/webp' }),
          mimeType: 'image/webp',
          previewUrl: `blob:${attempts.length}`
        };
      }
    }
  );

  assert.equal(compressed.size, CAP);
  assert.equal(compressed.mimeType, 'image/webp');
  assert.equal(compressed.blob.type, 'image/webp');
  assert.equal(attempts.length, 2);
  assert.notDeepEqual(attempts[0], attempts[1]);
});

test('compressPersonalizationImage rejects unsupported media and oversized sources', async () => {
  await assert.rejects(
    compressPersonalizationImage({ type: 'image/gif', size: 10, name: 'animated.gif' }, {
      compressImage: async () => { throw new Error('must not encode'); }
    }),
    /JPEG、PNG 或 WebP/
  );
  await assert.rejects(
    compressPersonalizationImage({ type: 'video/mp4', size: 10, name: 'movie.mp4' }),
    /JPEG、PNG 或 WebP/
  );
  await assert.rejects(
    compressPersonalizationImage({ type: 'image/png', size: 25 * 1024 * 1024 + 1, name: 'huge.png' }),
    /25 MB/
  );
});

test('Firestore media upload stores only compressed bytes as Bytes under the owner path', async () => {
  let written;
  const firestoreSdk = makeFirestoreSdk({ onSet: (ref, data) => { written = { ref, data }; } });
  const service = createFirestorePersonalizationMediaService({
    firestoreSdk,
    db: { name: 'db' },
    userId: 'alice',
    compress: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' })
  });

  const result = await service.uploadFile({
    blob: new Blob(['original bytes'], { type: 'image/jpeg' }),
    fileName: 'background.webp',
    appProperties: { kind: 'header-background' }
  });

  assert.match(result.id, /^firestore:[A-Za-z0-9_-]+$/);
  assert.equal(written.ref.path, personalizationMediaPath({ userId: 'alice', mediaId: result.id }));
  assert.deepEqual([...written.data.bytes.value], [1, 2, 3]);
  assert.equal(written.data.mimeType, 'image/webp');
  assert.equal(written.data.kind, 'header');
  assert.equal(written.data.fileName, 'background.webp');
  assert.equal(written.data.createdAt, 'server-timestamp');
});

test('Firestore personalization IDs and paths are owner scoped', () => {
  assert.equal(isFirestorePersonalizationId('firestore:photo-1'), true);
  assert.equal(isFirestorePersonalizationId('firestore:'), false);
  assert.equal(isFirestorePersonalizationId('storage:photo-1'), false);
  assert.equal(
    personalizationMediaPath({ userId: 'alice', mediaId: 'firestore:photo-1' }),
    'artifacts/japan-shopping-app/users/alice/personalizationMedia/photo-1'
  );
  assert.throws(
    () => personalizationMediaPath({ userId: 'alice', mediaId: 'firestore:../bob' }),
    /無效的個人化圖片 ID/
  );
});

test('cleanup queue retries failed owner-scoped deletions and removes completed entries', async () => {
  const localStorageImpl = makeLocalStorage();
  const deleted = [];
  let failNext = true;
  const service = createFirestorePersonalizationMediaService({
    firestoreSdk: makeFirestoreSdk({
      onDelete: async (ref) => {
        deleted.push(ref.path);
        if (failNext) {
          failNext = false;
          throw new Error('temporarily unavailable');
        }
      }
    }),
    db: { name: 'db' },
    userId: 'alice',
    localStorageImpl,
    compress: async (blob) => blob
  });

  await service.queueCleanup('firestore:photo-1');
  await service.queueCleanup('firestore:photo-1');
  await service.queueCleanup('storage:old-photo');
  assert.match(localStorageImpl.valueFor('shopping-list.firestore-personalization-cleanup.alice'), /photo-1/);

  assert.equal(await service.retryQueuedCleanup(), 1);
  assert.equal(await service.retryQueuedCleanup(), 0);
  assert.equal(localStorageImpl.valueFor('shopping-list.firestore-personalization-cleanup.alice'), undefined);
  assert.deepEqual(deleted, [
    personalizationMediaPath({ userId: 'alice', mediaId: 'firestore:photo-1' }),
    personalizationMediaPath({ userId: 'alice', mediaId: 'firestore:photo-1' })
  ]);
});


function makeCacheStorage() {
  const stores = new Map();
  return {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(key) {
          const response = store.get(String(key));
          return response ? response.clone() : undefined;
        },
        async put(key, response) {
          store.set(String(key), response.clone());
        },
        async delete(key) {
          return store.delete(String(key));
        }
      };
    }
  };
}

test('Firestore personalization media uses a persistent owner-scoped cache before reading Firestore again', async () => {
  const cacheStorageImpl = makeCacheStorage();
  let aliceReads = 0;
  let bobReads = 0;

  const alice = createFirestorePersonalizationMediaService({
    firestoreSdk: makeFirestoreSdk({
      onGet: async () => {
        aliceReads += 1;
        return { exists: () => true, data: () => ({ bytes: new TextEncoder().encode('alice'), mimeType: 'image/webp' }) };
      }
    }),
    db: { name: 'db' },
    userId: 'alice',
    cacheStorageImpl
  });
  const bob = createFirestorePersonalizationMediaService({
    firestoreSdk: makeFirestoreSdk({
      onGet: async () => {
        bobReads += 1;
        return { exists: () => true, data: () => ({ bytes: new TextEncoder().encode('bob'), mimeType: 'image/webp' }) };
      }
    }),
    db: { name: 'db' },
    userId: 'bob',
    cacheStorageImpl
  });

  assert.equal(await (await alice.downloadPhoto('firestore:shared-id')).text(), 'alice');
  assert.equal(await (await alice.downloadPhoto('firestore:shared-id')).text(), 'alice');
  assert.equal(await (await bob.downloadPhoto('firestore:shared-id')).text(), 'bob');
  assert.equal(aliceReads, 1);
  assert.equal(bobReads, 1);
});

test('deleting Firestore personalization media evicts its persistent cached copy', async () => {
  const cacheStorageImpl = makeCacheStorage();
  let reads = 0;
  const service = createFirestorePersonalizationMediaService({
    firestoreSdk: makeFirestoreSdk({
      onGet: async () => {
        reads += 1;
        return { exists: () => true, data: () => ({ bytes: new TextEncoder().encode(String(reads)), mimeType: 'image/webp' }) };
      }
    }),
    db: { name: 'db' },
    userId: 'alice',
    cacheStorageImpl
  });

  assert.equal(await (await service.downloadPhoto('firestore:photo-1')).text(), '1');
  assert.equal(await (await service.downloadPhoto('firestore:photo-1')).text(), '1');
  await service.deletePhoto('firestore:photo-1');
  assert.equal(await (await service.downloadPhoto('firestore:photo-1')).text(), '2');
  assert.equal(reads, 2);
});
