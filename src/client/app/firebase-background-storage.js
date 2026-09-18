import { normalizePersonalization } from './personalization-preferences.js';

const STORAGE_PREFIX = 'storage:';
const CLEANUP_KEY_PREFIX = 'shopping-list.firebase-background-cleanup.';

function clean(value) {
  return String(value ?? '').trim();
}

function safeFileName(value = 'background.bin') {
  const name = clean(value) || 'background.bin';
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const stem = (dot >= 0 ? name.slice(0, dot) : name)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'background';
  return `${stem}${ext.slice(0, 10)}`;
}

function kindFolder(kind = '') {
  switch (clean(kind)) {
    case 'header-background':
    case 'header':
      return 'header';
    case 'item-card-background':
    case 'item-card':
      return 'item-card';
    default:
      return 'page';
  }
}

export function firebaseBackgroundStoragePath({ userId, kind, token, fileName }) {
  const uid = clean(userId);
  if (!uid) throw new Error('Firebase Storage 背景缺少 userId。');
  const id = clean(token) || crypto?.randomUUID?.() || `${Date.now()}`;
  return `personalization/${uid}/${kindFolder(kind)}/${id}-${safeFileName(fileName)}`;
}

export function isFirebaseBackgroundId(fileId) {
  return clean(fileId).startsWith(STORAGE_PREFIX);
}

export function storagePathFromBackgroundId(fileId) {
  const id = clean(fileId);
  return isFirebaseBackgroundId(id) ? id.slice(STORAGE_PREFIX.length) : '';
}

function backgroundIdFromStoragePath(path) {
  return `${STORAGE_PREFIX}${clean(path)}`;
}

export function createFirebaseBackgroundStorageService({
  storageSdk,
  storage,
  userId,
  localStorageImpl = typeof localStorage !== 'undefined' ? localStorage : null
}) {
  if (!storageSdk || !storage) throw new Error('Firebase Storage 尚未初始化。');
  const uid = clean(userId);
  const cleanupKey = `${CLEANUP_KEY_PREFIX}${uid}`;

  const readCleanupQueue = () => {
    try {
      const parsed = JSON.parse(localStorageImpl?.getItem?.(cleanupKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter(isFirebaseBackgroundId) : [];
    } catch {
      return [];
    }
  };
  const writeCleanupQueue = (ids) => {
    try {
      const unique = [...new Set(ids.filter(isFirebaseBackgroundId))];
      if (!unique.length) localStorageImpl?.removeItem?.(cleanupKey);
      else localStorageImpl?.setItem?.(cleanupKey, JSON.stringify(unique));
    } catch {}
  };

  async function deletePhoto(fileId) {
    const path = storagePathFromBackgroundId(fileId);
    if (!path) return;
    await storageSdk.deleteObject(storageSdk.ref(storage, path));
  }

  return Object.freeze({
    hasAccessToken: () => true,

    async uploadFile({ blob, fileName, appProperties = {} }) {
      if (!blob) throw new Error('沒有可上傳的背景檔案。');
      const token = typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const path = firebaseBackgroundStoragePath({
        userId: uid,
        kind: appProperties.kind,
        token,
        fileName
      });
      const metadata = {
        contentType: clean(blob.type) || 'application/octet-stream',
        customMetadata: {
          owner: uid,
          kind: kindFolder(appProperties.kind)
        }
      };
      const snapshot = await storageSdk.uploadBytes(storageSdk.ref(storage, path), blob, metadata);
      return {
        id: backgroundIdFromStoragePath(path),
        name: fileName || safeFileName(path),
        mimeType: snapshot?.metadata?.contentType || metadata.contentType
      };
    },

    async downloadPhoto(fileId) {
      const path = storagePathFromBackgroundId(fileId);
      if (!path) throw new Error('不是 Firebase Storage 背景 ID。');
      return storageSdk.getBlob(storageSdk.ref(storage, path));
    },

    deletePhoto,

    async queueCleanup(fileId) {
      if (!isFirebaseBackgroundId(fileId)) return;
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

export function createBackgroundMediaService({ firebaseService, driveService }) {
  if (!firebaseService) throw new Error('缺少 Firebase 背景儲存服務。');

  return Object.freeze({
    hasAccessToken: () => true,
    hasLegacyDriveAccess: () => Boolean(driveService?.hasAccessToken?.()),

    uploadFile: (args) => firebaseService.uploadFile(args),

    downloadPhoto(fileId) {
      return isFirebaseBackgroundId(fileId)
        ? firebaseService.downloadPhoto(fileId)
        : driveService.downloadPhoto(fileId);
    },

    deletePhoto(fileId) {
      return isFirebaseBackgroundId(fileId)
        ? firebaseService.deletePhoto(fileId)
        : driveService.deletePhoto(fileId);
    },

    queueCleanup(fileId) {
      return isFirebaseBackgroundId(fileId)
        ? firebaseService.queueCleanup(fileId)
        : driveService.queueCleanup(fileId);
    },

    async retryQueuedCleanup() {
      await firebaseService.retryQueuedCleanup?.();
      if (driveService?.hasAccessToken?.()) {
        try { await driveService.retryQueuedCleanup?.(); } catch {}
      }
    }
  });
}

async function cleanupUploaded(mediaService, ids) {
  for (const id of ids) {
    try {
      await mediaService.deletePhoto(id);
    } catch {
      try { await mediaService.queueCleanup?.(id); } catch {}
    }
  }
}

async function cleanupLegacyDrive(driveService, ids) {
  for (const id of ids) {
    try {
      await driveService.deletePhoto(id);
    } catch {
      try { await driveService.queueCleanup?.(id); } catch {}
    }
  }
}

export async function migrateLegacyPlaylistToFirebase({
  preferences,
  driveService,
  mediaService,
  uploadKind = 'background',
  persistPreferences
}) {
  const normalized = normalizePersonalization(preferences);
  const legacyFiles = normalized.backgroundFiles.filter((file) => !isFirebaseBackgroundId(file.fileId));
  if (!legacyFiles.length) return Object.freeze({ status: 'not-needed', nextPreferences: normalized });
  if (!driveService?.hasAccessToken?.()) {
    return Object.freeze({ status: 'authorization-required', nextPreferences: normalized });
  }

  const uploadedIds = [];
  const replacements = new Map();
  try {
    for (const file of legacyFiles) {
      const blob = await driveService.downloadPhoto(file.fileId);
      const uploaded = await mediaService.uploadFile({
        blob,
        fileName: file.fileName || `background-${Date.now()}`,
        appProperties: { kind: uploadKind }
      });
      uploadedIds.push(uploaded.id);
      replacements.set(file.fileId, {
        ...file,
        fileId: uploaded.id,
        fileName: uploaded.name || file.fileName,
        mimeType: uploaded.mimeType || file.mimeType
      });
    }

    const nextPreferences = normalizePersonalization({
      ...normalized,
      backgroundFiles: normalized.backgroundFiles.map((file) => replacements.get(file.fileId) || file)
    });
    await persistPreferences(nextPreferences);
    await cleanupLegacyDrive(driveService, legacyFiles.map((file) => file.fileId));
    return Object.freeze({ status: 'migrated', nextPreferences });
  } catch (error) {
    await cleanupUploaded(mediaService, uploadedIds);
    throw error;
  }
}

export async function migrateLegacySingleToFirebase({
  preferences,
  driveService,
  mediaService,
  uploadKind = 'item-card-background',
  persistPreferences
}) {
  const source = preferences && typeof preferences === 'object' ? { ...preferences } : {};
  const oldId = clean(source.backgroundFileId);
  if (!oldId || isFirebaseBackgroundId(oldId)) {
    return Object.freeze({ status: 'not-needed', nextPreferences: source });
  }
  if (!driveService?.hasAccessToken?.()) {
    return Object.freeze({ status: 'authorization-required', nextPreferences: source });
  }

  let uploadedId = '';
  try {
    const blob = await driveService.downloadPhoto(oldId);
    const uploaded = await mediaService.uploadFile({
      blob,
      fileName: source.backgroundFileName || `background-${Date.now()}`,
      appProperties: { kind: uploadKind }
    });
    uploadedId = uploaded.id;
    const nextPreferences = {
      ...source,
      backgroundFileId: uploaded.id,
      backgroundFileName: uploaded.name || source.backgroundFileName || '',
      backgroundMimeType: uploaded.mimeType || source.backgroundMimeType || ''
    };
    await persistPreferences(nextPreferences);
    await cleanupLegacyDrive(driveService, [oldId]);
    return Object.freeze({ status: 'migrated', nextPreferences });
  } catch (error) {
    if (uploadedId) await cleanupUploaded(mediaService, [uploadedId]);
    throw error;
  }
}
