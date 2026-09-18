export const DEFAULT_PERSONALIZATION = Object.freeze({
  mode: 'color',
  color: '#FFFFFF',
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

export function normalizeBackgroundColor(value, fallback = '#FFFFFF') {
  const fallbackColor = String(fallback || '#FFFFFF').trim().toUpperCase();
  const safeFallback = /^#[0-9A-F]{6}$/.test(fallbackColor) ? fallbackColor : '#FFFFFF';
  const color = String(value || '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : safeFallback;
}

export function backgroundDefaultColor(kind) {
  if (String(kind || '').trim() === 'header') return '#FCD5CE';
  return '#FFFFFF';
}

export function normalizeBackgroundColorPresets(values = []) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const color = String(value || '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(color) || result.includes(color)) continue;
    result.push(color);
    if (result.length >= 6) break;
  }
  return result;
}

export function addBackgroundColorPreset(values = [], value) {
  const color = String(value || '').trim().toUpperCase();
  const current = normalizeBackgroundColorPresets(values);
  if (!/^#[0-9A-F]{6}$/.test(color)) return current;
  const next = current.filter((item) => item !== color);
  next.push(color);
  return next.slice(-6);
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

export function normalizeRotationIntervalDraft(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return Math.min(60, Math.max(2, number));
}

export function normalizePersonalization(value = {}, { defaultColor = '#FFFFFF' } = {}) {
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
  const requestedMode = ['color', 'media'].includes(source.mode) ? source.mode : '';
  const mode = requestedMode === 'media' && !backgroundFiles.length
    ? 'color'
    : (requestedMode || (backgroundFiles.length ? 'media' : 'color'));
  return {
    mode,
    color: normalizeBackgroundColor(source.color, defaultColor),
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
