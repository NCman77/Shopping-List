import {
  createFirestorePersonalizationMediaService,
  isFirestorePersonalizationId,
  personalizationMediaPath,
  compressPersonalizationImage
} from './firestore-personalization-media.js';
import { normalizePersonalization } from './personalization-preferences.js';

export {
  compressPersonalizationImage,
  isFirestorePersonalizationId,
  personalizationMediaPath
};

export const isFirebaseBackgroundId = isFirestorePersonalizationId;
export const firebaseBackgroundStoragePath = personalizationMediaPath;

export function createFirebaseBackgroundStorageService(options) {
  return createFirestorePersonalizationMediaService(options);
}
export function createBackgroundMediaService({ firebaseService, driveService }) {
  if (!firebaseService) throw new Error('缺少 Firestore 個人化圖片服務。');

  return Object.freeze({
    hasAccessToken: () => true,
    hasLegacyDriveAccess: () => Boolean(driveService?.hasAccessToken?.()),
    uploadFile: (args) => firebaseService.uploadFile(args),
    downloadPhoto(fileId) {
      return isFirestorePersonalizationId(fileId)
        ? firebaseService.downloadPhoto(fileId)
        : driveService.downloadPhoto(fileId);
    },
    deletePhoto(fileId) {
      return isFirestorePersonalizationId(fileId)
        ? firebaseService.deletePhoto(fileId)
        : driveService.deletePhoto(fileId);
    },
    queueCleanup(fileId) {
      return isFirestorePersonalizationId(fileId)
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
  const legacyFiles = normalized.backgroundFiles.filter((file) => !isFirestorePersonalizationId(file.fileId));
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
  const oldId = String(source.backgroundFileId || '').trim();
  if (!oldId || isFirestorePersonalizationId(oldId)) {
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
