export function normalizeWebsiteUrl(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new TypeError('請輸入有效的網站網址。');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new TypeError('網站網址只能使用 http 或 https。');
  }

  return parsed.href;
}

export function createGoogleMapsUrl(address) {
  const trimmed = String(address ?? '').trim();
  return trimmed ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}` : '';
}
