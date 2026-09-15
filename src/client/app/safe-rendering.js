const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;

export function safePersistedImageSource(value) {
  const source = String(value ?? '').trim();
  if (!source) return '';
  if (SAFE_DATA_IMAGE.test(source)) return source;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' || url.protocol === 'blob:' ? source : '';
  } catch {
    return '';
  }
}
