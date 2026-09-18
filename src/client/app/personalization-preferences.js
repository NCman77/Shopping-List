export const DEFAULT_PERSONALIZATION = Object.freeze({
  backgroundFileId: '',
  backgroundFileName: '',
  backgroundMimeType: '',
  backgroundFiles: [],
  rotationIntervalSeconds: 8,
  positionX: 50,
  positionY: 50,
  scale: 1,
  panEnabled: false,
  panDirection: 'left',
  panIteration: 'infinite'
});

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeBackgroundFiles(source = {}) {
  const files = Array.isArray(source.backgroundFiles)
    ? source.backgroundFiles.map((item) => ({
        fileId: String(item?.fileId ?? '').trim(),
        fileName: String(item?.fileName ?? '').trim(),
        mimeType: String(item?.mimeType ?? '').trim().toLowerCase()
      })).filter((item) => item.fileId)
    : [];

  if (files.length) return files;

  const legacyId = String(source.backgroundFileId ?? '').trim();
  if (!legacyId) return [];
  return [{
    fileId: legacyId,
    fileName: String(source.backgroundFileName ?? '').trim(),
    mimeType: String(source.backgroundMimeType ?? '').trim().toLowerCase()
  }];
}

export function normalizePersonalization(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const backgroundFiles = normalizeBackgroundFiles(source);
  const primary = backgroundFiles[0] || { fileId: '', fileName: '', mimeType: '' };
  return {
    backgroundFileId: primary.fileId,
    backgroundFileName: primary.fileName,
    backgroundMimeType: primary.mimeType,
    backgroundFiles,
    rotationIntervalSeconds: clampNumber(source.rotationIntervalSeconds, 2, 60, DEFAULT_PERSONALIZATION.rotationIntervalSeconds),
    positionX: clampNumber(source.positionX, 0, 100, DEFAULT_PERSONALIZATION.positionX),
    positionY: clampNumber(source.positionY, 0, 100, DEFAULT_PERSONALIZATION.positionY),
    scale: clampNumber(source.scale, 1, 3, DEFAULT_PERSONALIZATION.scale),
    panEnabled: source.panEnabled === true,
    panDirection: source.panDirection === 'right' ? 'right' : 'left',
    panIteration: source.panIteration === 'once' ? 'once' : 'infinite'
  };
}

export function positionPreset(name) {
  switch (String(name || '').toLowerCase()) {
    case 'left': return { positionX: 0, positionY: 50 };
    case 'right': return { positionX: 100, positionY: 50 };
    case 'top': return { positionX: 50, positionY: 0 };
    case 'bottom': return { positionX: 50, positionY: 100 };
    default: return { positionX: 50, positionY: 50 };
  }
}

export function buildPanStyle(value = {}) {
  const preferences = normalizePersonalization(value);
  if (!preferences.panEnabled) {
    return { animationName: 'none', animationIterationCount: '1' };
  }
  return {
    animationName: preferences.panDirection === 'right' ? 'shopping-bg-pan-right' : 'shopping-bg-pan-left',
    animationIterationCount: preferences.panIteration === 'once' ? '1' : 'infinite'
  };
}
