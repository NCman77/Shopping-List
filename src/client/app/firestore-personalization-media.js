import { compressImage, revokeCompressedImage } from './image-compression.js';

export const PERSONALIZATION_MEDIA_MAX_BYTES = 900_000;
export const PERSONALIZATION_MEDIA_MAX_SOURCE_BYTES = 25 * 1024 * 1024;

const APP_ID = 'japan-shopping-app';
const ID_PREFIX = 'firestore:';
const CLEANUP_KEY_PREFIX = 'shopping-list.firestore-personalization-cleanup.';
const MEDIA_CACHE_NAME = 'shopping-list-personalization-media-v1';
const MEDIA_CACHE_PATH = '/__shopping-list-personalization-media__/';
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MEDIA_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const COMPRESS_ATTEMPTS = [
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1280, quality: 0.74 },
  { maxEdge: 1024, quality: 0.66 },
  { maxEdge: 768, quality: 0.58 },
  { maxEdge: 640, quality: 0.5 }
];

function clean(value) {
  return String(value ?? '').trim();
}

function normalizedMimeType(value) {
  return clean(value).toLowerCase();
}

function assertSupportedInput(file) {
  const mimeType = normalizedMimeType(file?.type);
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new TypeError('請選擇 JPEG、PNG 或 WebP 靜態照片。');
  }
  if (Number.isFinite(file?.size) && file.size > PERSONALIZATION_MEDIA_MAX_SOURCE_BYTES) {
    throw new RangeError('個人化背景照片不可超過 25 MB。');
  }
}

function encodedResult(result) {
  const blob = result?.blob || result;
  if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isFinite(blob.size)) {
    throw new TypeError('無法輸出壓縮圖片。');
  }

  const blobMimeType = normalizedMimeType(blob.type);
  const mimeType = normalizedMimeType(result?.mimeType || blobMimeType);
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new TypeError('壓縮圖片的格式必須是 JPEG、PNG 或 WebP。');
  }
  if (blobMimeType && blobMimeType !== mimeType) {
    throw new TypeError('壓縮圖片的 MIME 類型與內容不一致。');
  }
  return {
    ...result,
    blob,
    mimeType,
    size: blob.size
  };
}

export async function compressPersonalizationImage(file, options = {}) {
  assertSupportedInput(file);
  const encode = options.compressImage || compressImage;
  const attempts = Array.isArray(options.attempts) && options.attempts.length
    ? options.attempts
    : COMPRESS_ATTEMPTS;
  const requestedMaxBytes = options.maxBytes ?? PERSONALIZATION_MEDIA_MAX_BYTES;
  const maxBytes = Math.min(
    PERSONALIZATION_MEDIA_MAX_BYTES,
    Number.isFinite(requestedMaxBytes) && requestedMaxBytes > 0
      ? requestedMaxBytes
      : PERSONALIZATION_MEDIA_MAX_BYTES
  );
  let lastError = null;

  for (const attempt of attempts) {
    let result;
    try {
      result = await encode(file, { ...attempt, maxBytes });
      const normalized = encodedResult(result);
      if (normalized.size <= maxBytes) return normalized;
      revokeCompressedImage(normalized);
      lastError = new RangeError(`圖片壓縮後仍超過 ${maxBytes.toLocaleString()} 位元組。`);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof TypeError && /格式|輸出/.test(lastError.message)) throw lastError;
  throw new RangeError(`圖片壓縮後仍超過 ${maxBytes.toLocaleString()} 位元組。`);
}

function mediaIdFromInput(value) {
  const input = clean(value);
  const mediaId = input.startsWith(ID_PREFIX) ? input.slice(ID_PREFIX.length) : input;
  return MEDIA_ID_PATTERN.test(mediaId) ? mediaId : '';
}

function userIdFromInput(value) {
  const userId = clean(value);
  return userId && !userId.includes('/') && userId !== '.' && userId !== '..' ? userId : '';
}

function personalizationMediaCacheKey(userId, fileId) {
  const uid = userIdFromInput(userId);
  const mediaId = mediaIdFromInput(fileId);
  if (!uid || !mediaId) return '';
  const origin = typeof globalThis.location?.origin === 'string' && /^https?:\/\//.test(globalThis.location.origin)
    ? globalThis.location.origin
    : 'https://shopping-list.invalid';
  return `${origin}${MEDIA_CACHE_PATH}${encodeURIComponent(uid)}/${encodeURIComponent(mediaId)}`;
}

export function isFirestorePersonalizationId(id) {
  const value = clean(id);
  return value.startsWith(ID_PREFIX) && Boolean(mediaIdFromInput(value));
}

export function personalizationMediaPath({ userId, mediaId }) {
  const uid = userIdFromInput(userId);
  const id = mediaIdFromInput(mediaId);
  if (!uid || !id) throw new Error('無效的個人化圖片 ID 或使用者。');
  return `artifacts/${APP_ID}/users/${uid}/personalizationMedia/${id}`;
}

function mediaKind(value) {
  switch (clean(value)) {
    case 'header':
    case 'header-background':
      return 'header';
    case 'item-card':
    case 'item-card-background':
      return 'item-card';
    case 'page':
    case 'background':
    case 'page-background':
    case '':
      return 'page';
    default:
      throw new TypeError('無效的個人化圖片種類。');
  }
}

function createMediaId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toUint8Array(bytes) {
  if (bytes && typeof bytes.toUint8Array === 'function') return bytes.toUint8Array();
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return null;
}

export function createFirestorePersonalizationMediaService({
  firestoreSdk,
  db,
  userId,
  compress = compressPersonalizationImage,
  localStorageImpl = typeof localStorage !== 'undefined' ? localStorage : null,
  cacheStorageImpl = typeof caches !== 'undefined' ? caches : null,
  ResponseImpl = typeof Response !== 'undefined' ? Response : null
}) {
  if (!firestoreSdk || !db) throw new Error('Firestore 尚未初始化。');
  const uid = userIdFromInput(userId);
  if (!uid) throw new Error('Firestore 個人化圖片缺少 userId。');
  const { Bytes, deleteDoc, doc, getDoc, setDoc } = firestoreSdk;
  if (!Bytes?.fromUint8Array || typeof deleteDoc !== 'function' || typeof doc !== 'function'
    || typeof getDoc !== 'function' || typeof setDoc !== 'function') {
    throw new Error('Firestore 個人化圖片服務缺少必要的 SDK 方法。');
  }
  const cleanupKey = `${CLEANUP_KEY_PREFIX}${uid}`;

  const refFor = (fileId) => doc(db, ...personalizationMediaPath({ userId: uid, mediaId: fileId }).split('/'));
  const cacheKeyFor = (fileId) => personalizationMediaCacheKey(uid, fileId);
  const openMediaCache = async () => {
    if (!cacheStorageImpl?.open || !ResponseImpl) return null;
    try {
      return await cacheStorageImpl.open(MEDIA_CACHE_NAME);
    } catch {
      return null;
    }
  };
  const readCachedPhoto = async (fileId) => {
    const key = cacheKeyFor(fileId);
    if (!key) return null;
    const cache = await openMediaCache();
    if (!cache) return null;
    try {
      const response = await cache.match(key);
      return response ? await response.blob() : null;
    } catch {
      return null;
    }
  };
  const cachePhoto = async (fileId, blob) => {
    const key = cacheKeyFor(fileId);
    if (!key || !blob) return;
    const cache = await openMediaCache();
    if (!cache) return;
    try {
      await cache.put(key, new ResponseImpl(blob, {
        headers: { 'Content-Type': normalizedMimeType(blob.type) || 'application/octet-stream' }
      }));
    } catch {}
  };
  const evictCachedPhoto = async (fileId) => {
    const key = cacheKeyFor(fileId);
    if (!key) return;
    const cache = await openMediaCache();
    if (!cache) return;
    try { await cache.delete(key); } catch {}
  };
  const readCleanupQueue = () => {
    try {
      const parsed = JSON.parse(localStorageImpl?.getItem?.(cleanupKey) || '[]');
      return Array.isArray(parsed) ? [...new Set(parsed.filter(isFirestorePersonalizationId))] : [];
    } catch {
      return [];
    }
  };
  const writeCleanupQueue = (ids) => {
    try {
      const unique = [...new Set(ids.filter(isFirestorePersonalizationId))];
      if (unique.length) localStorageImpl?.setItem?.(cleanupKey, JSON.stringify(unique));
      else localStorageImpl?.removeItem?.(cleanupKey);
    } catch {}
  };

  async function deletePhoto(fileId) {
    if (!isFirestorePersonalizationId(fileId)) return;
    await deleteDoc(refFor(fileId));
    await evictCachedPhoto(fileId);
  }

  return Object.freeze({
    hasAccessToken: () => true,

    async uploadFile({ blob, fileName, appProperties = {} }) {
      if (!blob) throw new Error('沒有可上傳的個人化背景照片。');
      const compressed = encodedResult(await compress(blob));
      if (compressed.size > PERSONALIZATION_MEDIA_MAX_BYTES) {
        throw new RangeError('圖片壓縮後仍超過 900,000 位元組。');
      }
      const bytes = new Uint8Array(await compressed.blob.arrayBuffer());
      const mimeType = normalizedMimeType(compressed.mimeType || compressed.blob.type);
      const mediaId = createMediaId();
      const kind = mediaKind(appProperties.kind);
      const ref = refFor(`${ID_PREFIX}${mediaId}`);
      await setDoc(ref, {
        bytes: Bytes.fromUint8Array(bytes),
        mimeType,
        kind,
        fileName: clean(fileName) || 'background',
        createdAt: typeof firestoreSdk.serverTimestamp === 'function'
          ? firestoreSdk.serverTimestamp()
          : new Date()
      });
      await cachePhoto(`${ID_PREFIX}${mediaId}`, compressed.blob);
      return {
        id: `${ID_PREFIX}${mediaId}`,
        name: clean(fileName) || 'background',
        mimeType
      };
    },

    async downloadPhoto(fileId) {
      if (!isFirestorePersonalizationId(fileId)) throw new Error('不是 Firestore 個人化圖片 ID。');
      const cached = await readCachedPhoto(fileId);
      if (cached) return cached;

      const snapshot = await getDoc(refFor(fileId));
      if (!snapshot?.exists?.()) throw new Error('找不到 Firestore 個人化圖片。');
      const data = snapshot.data?.() || {};
      const bytes = toUint8Array(data.bytes);
      if (!bytes) throw new Error('Firestore 個人化圖片內容無效。');
      const blob = new Blob([bytes], { type: normalizedMimeType(data.mimeType) || 'application/octet-stream' });
      await cachePhoto(fileId, blob);
      return blob;
    },

    deletePhoto,

    async queueCleanup(fileId) {
      if (!isFirestorePersonalizationId(fileId)) return;
      writeCleanupQueue([...readCleanupQueue(), fileId]);
    },

    async retryQueuedCleanup() {
      const remaining = [];
      for (const id of readCleanupQueue()) {
        try {
          await deletePhoto(id);
        } catch {
          remaining.push(id);
        }
      }
      writeCleanupQueue(remaining);
      return remaining.length;
    }
  });
}
