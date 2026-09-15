const loadsByWindow = new WeakMap();

function clean(value) {
  return String(value ?? '').trim();
}

export function buildMapsScriptUrl(apiKey) {
  const key = clean(apiKey);
  if (!key) throw new Error('缺少 Google Maps API Key。');
  const url = new URL('https://maps.googleapis.com/maps/api/js');
  url.searchParams.set('key', key);
  url.searchParams.set('loading', 'async');
  url.searchParams.set('libraries', 'places');
  url.searchParams.set('v', 'weekly');
  return url.toString();
}

function cacheFor(windowImpl) {
  let cache = loadsByWindow.get(windowImpl);
  if (!cache) {
    cache = new Map();
    loadsByWindow.set(windowImpl, cache);
  }
  return cache;
}

async function importPlaces(windowImpl) {
  const importer = windowImpl?.google?.maps?.importLibrary;
  if (typeof importer !== 'function') throw new Error('Google Maps / Places 載入不完整。');
  return importer.call(windowImpl.google.maps, 'places');
}

export async function loadPlacesLibrary({
  apiKey,
  documentImpl = globalThis.document,
  windowImpl = globalThis.window
} = {}) {
  const key = clean(apiKey);
  if (!key) throw new Error('缺少 Google Maps API Key。');
  if (!windowImpl || !documentImpl) throw new Error('目前環境無法載入 Google Maps / Places。');

  if (windowImpl.google?.maps?.importLibrary) return importPlaces(windowImpl);
  if (typeof documentImpl.createElement !== 'function' || !documentImpl.head?.appendChild) {
    throw new Error('目前頁面無法載入 Google Maps / Places。');
  }

  const cache = cacheFor(windowImpl);
  if (cache.has(key)) return cache.get(key);

  const loading = new Promise((resolve, reject) => {
    const script = documentImpl.createElement('script');
    script.src = buildMapsScriptUrl(key);
    script.async = true;
    script.dataset.shoppingListPlaces = 'true';
    script.onload = async () => {
      try {
        resolve(await importPlaces(windowImpl));
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error('Google Maps / Places 載入失敗，請檢查 API Key 與網域限制。'));
    documentImpl.head.appendChild(script);
  });

  cache.set(key, loading);
  try {
    return await loading;
  } catch (error) {
    if (cache.get(key) === loading) cache.delete(key);
    throw error;
  }
}
