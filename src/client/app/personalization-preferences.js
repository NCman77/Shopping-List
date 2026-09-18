export const DEFAULT_PERSONALIZATION = Object.freeze({
  backgroundFileId: '',
  backgroundFileName: '',
  backgroundMimeType: '',
  backgroundFiles: [],
  rotationIntervalSeconds: 8,
  positionX: 50,
  positionY: 50,
  scale: 1
});

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeFrame(source = {}, fallback = DEFAULT_PERSONALIZATION) {
  return {
    positionX: clampNumber(source.positionX, 0, 100, fallback.positionX),
    positionY: clampNumber(source.positionY, 0, 100, fallback.positionY),
    scale: clampNumber(source.scale, 1, 3, fallback.scale)
  };
}

function normalizeBackgroundFiles(source = {}) {
  const legacyFrame = normalizeFrame(source, DEFAULT_PERSONALIZATION);
  const files = Array.isArray(source.backgroundFiles)
    ? source.backgroundFiles.map((item) => ({
        fileId: String(item?.fileId ?? '').trim(),
        fileName: String(item?.fileName ?? '').trim(),
        mimeType: String(item?.mimeType ?? '').trim().toLowerCase(),
        ...normalizeFrame(item, legacyFrame)
      })).filter((item) => item.fileId)
    : [];

  if (files.length) return files;

  const legacyId = String(source.backgroundFileId ?? '').trim();
  if (!legacyId) return [];
  return [{
    fileId: legacyId,
    fileName: String(source.backgroundFileName ?? '').trim(),
    mimeType: String(source.backgroundMimeType ?? '').trim().toLowerCase(),
    ...legacyFrame
  }];
}

export function normalizePersonalization(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const backgroundFiles = normalizeBackgroundFiles(source);
  const primary = backgroundFiles[0] || {
    fileId: '',
    fileName: '',
    mimeType: '',
    positionX: DEFAULT_PERSONALIZATION.positionX,
    positionY: DEFAULT_PERSONALIZATION.positionY,
    scale: DEFAULT_PERSONALIZATION.scale
  };
  return {
    backgroundFileId: primary.fileId,
    backgroundFileName: primary.fileName,
    backgroundMimeType: primary.mimeType,
    backgroundFiles,
    rotationIntervalSeconds: clampNumber(source.rotationIntervalSeconds, 2, 60, DEFAULT_PERSONALIZATION.rotationIntervalSeconds),
    positionX: primary.positionX,
    positionY: primary.positionY,
    scale: primary.scale
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
