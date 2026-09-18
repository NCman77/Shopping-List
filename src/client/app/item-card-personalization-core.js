export const DEFAULT_ITEM_CARD_PERSONALIZATION = Object.freeze({
  mode: 'default',
  color: '#FFFFFF',
  backgroundFileId: '',
  backgroundFileName: '',
  backgroundMimeType: '',
  positionX: 50,
  positionY: 50,
  scale: 1
});

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeColor(value) {
  const color = String(value || '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_ITEM_CARD_PERSONALIZATION.color;
}

export function normalizeItemCardPersonalization(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const requestedMode = ['default', 'color', 'media'].includes(source.mode) ? source.mode : 'default';
  const fileId = String(source.backgroundFileId || '').trim();
  const mode = requestedMode === 'media' && !fileId ? 'default' : requestedMode;

  return {
    mode,
    color: normalizeColor(source.color),
    backgroundFileId: mode === 'media' ? fileId : '',
    backgroundFileName: mode === 'media' ? String(source.backgroundFileName || '').trim() : '',
    backgroundMimeType: mode === 'media' ? String(source.backgroundMimeType || '').trim().toLowerCase() : '',
    positionX: clampNumber(source.positionX, 0, 100, DEFAULT_ITEM_CARD_PERSONALIZATION.positionX),
    positionY: clampNumber(source.positionY, 0, 100, DEFAULT_ITEM_CARD_PERSONALIZATION.positionY),
    scale: clampNumber(source.scale, 1, 3, DEFAULT_ITEM_CARD_PERSONALIZATION.scale)
  };
}
