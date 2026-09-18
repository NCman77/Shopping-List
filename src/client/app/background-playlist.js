import { normalizePersonalization } from './personalization-preferences.js';

export function reorderBackgroundFiles(files = [], fromIndex, toIndex) {
  const source = Array.isArray(files) ? files.slice() : [];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return source;
  if (from < 0 || to < 0 || from >= source.length || to >= source.length || from === to) return source;
  const [moved] = source.splice(from, 1);
  source.splice(to, 0, moved);
  return source;
}

function defaultYieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => resolve(), { timeout: 300 });
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function cleanupDriveFile(driveService, fileId) {
  if (!fileId) return;
  try {
    await driveService.deletePhoto(fileId);
  } catch {
    try { await driveService.queueCleanup(fileId); } catch {}
  }
}

export async function runBackgroundPlaylistDownload({
  tracker,
  userId,
  preferences,
  driveService,
  createObjectUrl,
  revokeObjectUrl,
  clearBackground,
  hideBackground,
  applyBackgrounds,
  onError = () => {},
  yieldToBrowser = defaultYieldToBrowser
}) {
  const operation = tracker.nextRequest('background-playlist-load', userId);
  const capturedPreferences = normalizePersonalization(preferences);
  const files = capturedPreferences.backgroundFiles;

  if (!operation.userId || !files.length) {
    if (tracker.isLatestRequest(operation, userId)) clearBackground();
    return Object.freeze({ status: 'empty', operation, items: [] });
  }
  if (!driveService.hasAccessToken()) {
    if (tracker.isLatestRequest(operation, userId)) hideBackground();
    return Object.freeze({ status: 'authorization-required', operation, items: [] });
  }

  const items = [];
  try {
    const firstFile = files[0];
    const firstBlob = await driveService.downloadPhoto(firstFile.fileId);
    items.push({ ...firstFile, objectUrl: createObjectUrl(firstBlob) });
    if (!tracker.isLatestRequest(operation, userId)) {
      items.forEach((item) => revokeObjectUrl(item.objectUrl));
      return Object.freeze({ status: 'stale', operation, items: [] });
    }

    applyBackgrounds(items.slice(), capturedPreferences);

    if (files.length > 1) await yieldToBrowser();

    for (const file of files.slice(1)) {
      const blob = await driveService.downloadPhoto(file.fileId);
      const objectUrl = createObjectUrl(blob);
      items.push({ ...file, objectUrl });
      if (!tracker.isLatestRequest(operation, userId)) {
        items.forEach((item) => revokeObjectUrl(item.objectUrl));
        return Object.freeze({ status: 'stale', operation, items: [] });
      }
    }

    if (items.length > 1) applyBackgrounds(items, capturedPreferences);
    return Object.freeze({ status: 'applied', operation, items });
  } catch (error) {
    if (!tracker.isLatestRequest(operation, userId)) {
      items.forEach((item) => revokeObjectUrl(item.objectUrl));
      return Object.freeze({ status: 'stale', operation, items: [] });
    }
    onError(error);
    if (items.length) {
      applyBackgrounds(items, capturedPreferences);
      return Object.freeze({ status: 'applied', operation, items, partial: true, error });
    }
    hideBackground();
    return Object.freeze({ status: 'error', operation, error, items: [] });
  }
}

export async function runBackgroundPlaylistSaveTransaction({
  tracker,
  operation,
  getCurrentUserId,
  capturedSettingsRef,
  editorPreferences,
  pendingFiles = [],
  pendingEntries = [],
  removeRequested,
  oldFiles = [],
  uploadKind = 'background',
  driveService,
  connectDrive,
  persistSettings,
  afterCommit,
  onError = () => {}
}) {
  const uploadedFiles = [];
  let persistenceCommitted = false;
  let nextPreferences = normalizePersonalization(editorPreferences);
  const isCurrent = () => tracker.isSessionCurrent(operation, getCurrentUserId());

  const cleanupUploaded = async () => {
    for (const file of uploadedFiles) await cleanupDriveFile(driveService, file.fileId);
  };
  const staleResult = async () => {
    if (!persistenceCommitted) await cleanupUploaded();
    return Object.freeze({ status: 'stale', persistenceCommitted, nextPreferences });
  };

  try {
    if (pendingEntries.length) {
      if (!driveService.hasAccessToken()) await connectDrive(operation, driveService);
      if (!isCurrent()) return staleResult();

      const replacements = new Map();
      for (const entry of pendingEntries) {
        const pendingFile = entry?.file;
        const key = String(entry?.key || '').trim();
        if (!pendingFile || !key) continue;
        const uploaded = await driveService.uploadFile({
          blob: pendingFile,
          fileName: pendingFile.name || `background-${Date.now()}`,
          appProperties: { kind: uploadKind, owner: operation.userId }
        });
        const frame = nextPreferences.backgroundFiles.find((file) => file.fileId === key) || {};
        const saved = {
          fileId: uploaded.id,
          fileName: uploaded.name || pendingFile.name || '',
          mimeType: uploaded.mimeType || pendingFile.type || '',
          positionX: frame.positionX,
          positionY: frame.positionY,
          scale: frame.scale
        };
        replacements.set(key, saved);
        uploadedFiles.push(saved);
        if (!isCurrent()) return staleResult();
      }

      nextPreferences = normalizePersonalization({
        ...nextPreferences,
        backgroundFiles: nextPreferences.backgroundFiles
          .map((file) => replacements.get(file.fileId) || file)
          .filter((file) => !String(file.fileId || '').startsWith('pending:'))
      });
    } else if (pendingFiles.length) {
      if (!driveService.hasAccessToken()) await connectDrive(operation, driveService);
      if (!isCurrent()) return staleResult();

      for (const pendingFile of pendingFiles) {
        const uploaded = await driveService.uploadFile({
          blob: pendingFile,
          fileName: pendingFile.name || `background-${Date.now()}`,
          appProperties: { kind: uploadKind, owner: operation.userId }
        });
        const frame = nextPreferences.backgroundFiles[uploadedFiles.length] || {};
        const saved = {
          fileId: uploaded.id,
          fileName: uploaded.name || pendingFile.name || '',
          mimeType: uploaded.mimeType || pendingFile.type || '',
          positionX: frame.positionX,
          positionY: frame.positionY,
          scale: frame.scale
        };
        uploadedFiles.push(saved);
        if (!isCurrent()) return staleResult();
      }

      nextPreferences = normalizePersonalization({
        ...nextPreferences,
        backgroundFiles: uploadedFiles
      });
    } else if (removeRequested) {
      nextPreferences = normalizePersonalization({
        ...nextPreferences,
        backgroundFiles: [],
        backgroundFileId: '',
        backgroundFileName: '',
        backgroundMimeType: ''
      });
    }

    if (!isCurrent()) return staleResult();
    await persistSettings(capturedSettingsRef, nextPreferences);
    persistenceCommitted = true;

    const keepIds = new Set(nextPreferences.backgroundFiles.map((file) => file.fileId));
    for (const file of Array.isArray(oldFiles) ? oldFiles : []) {
      const fileId = String(file?.fileId || '').trim();
      if (fileId && !keepIds.has(fileId)) await cleanupDriveFile(driveService, fileId);
    }

    if (!isCurrent()) return staleResult();
    await afterCommit(nextPreferences);
    return Object.freeze({ status: 'saved', persistenceCommitted, nextPreferences });
  } catch (error) {
    if (!persistenceCommitted) await cleanupUploaded();
    if (isCurrent()) onError(error);
    return Object.freeze({ status: 'error', persistenceCommitted, nextPreferences, error });
  }
}

export function createBackgroundSlideshowController({
  render,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval
}) {
  let items = [];
  let index = 0;
  let timer = null;

  const stop = () => {
    if (timer !== null) clearIntervalImpl(timer);
    timer = null;
  };

  const start = (nextItems, preferences) => {
    stop();
    items = Array.isArray(nextItems) ? nextItems.slice() : [];
    index = 0;
    if (!items.length) return;
    render(items[0], 0);
    if (items.length < 2) return;
    const seconds = normalizePersonalization(preferences).rotationIntervalSeconds;
    timer = setIntervalImpl(() => {
      index = (index + 1) % items.length;
      render(items[index], index);
    }, seconds * 1000);
  };

  return Object.freeze({ start, stop });
}
