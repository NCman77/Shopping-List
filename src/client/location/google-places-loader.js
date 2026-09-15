import { classifyMapsError } from './places-usage-policy.js';

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
    const previousAuthFailure = windowImpl.gm_authFailure;
    const previousGoogle = windowImpl.google;
    let settled = false;

    const restoreAuthFailure = () => {
      if (windowImpl.gm_authFailure !== authFailure) return;
      if (typeof previousAuthFailure === 'function') windowImpl.gm_authFailure = previousAuthFailure;
      else {
        try { delete windowImpl.gm_authFailure; }
        catch { windowImpl.gm_authFailure = undefined; }
      }
    };
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      restoreAuthFailure();
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      restoreAuthFailure();
      reject(error);
    };
    const authFailure = () => {
      if (previousGoogle === undefined && windowImpl.google !== undefined) {
        try { delete windowImpl.google; }
        catch { windowImpl.google = undefined; }
      }
      try { previousAuthFailure?.(); }
      catch (error) { console.error('Previous gm_authFailure callback failed:', error); }
      finishReject(new Error('Google Maps API Key 驗證失敗 (InvalidKeyMapError / gm_authFailure)。'));
    };

    windowImpl.gm_authFailure = authFailure;
    script.src = buildMapsScriptUrl(key);
    script.async = true;
    script.dataset.shoppingListPlaces = 'true';
    script.onload = async () => {
      try {
        finishResolve(await importPlaces(windowImpl));
      } catch (error) {
        finishReject(error);
      }
    };
    script.onerror = () => finishReject(new TypeError('Google Maps / Places script 載入失敗，請檢查網路與 API Key 網域限制。'));
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

export async function loadPlacesLibraryWithFailover({
  primaryKey,
  backupKey = '',
  documentImpl = globalThis.document,
  windowImpl = globalThis.window,
  loadLibrary = loadPlacesLibrary
} = {}) {
  const primary = clean(primaryKey);
  const backup = clean(backupKey);
  if (!primary) throw new Error('缺少主要 Google Maps API Key。');

  try {
    const library = await loadLibrary({ apiKey: primary, documentImpl, windowImpl });
    return { library, keySlot: 'primary' };
  } catch (primaryError) {
    if (classifyMapsError(primaryError) !== 'credential' || !backup || backup === primary) throw primaryError;

    if (windowImpl?.google?.maps?.importLibrary) {
      const error = new Error('主要 Google Maps Key 驗證失敗，而且 Maps 已在本頁初始化；請重新載入頁面後再嘗試備用 Key。');
      error.cause = primaryError;
      throw error;
    }

    const library = await loadLibrary({ apiKey: backup, documentImpl, windowImpl });
    return { library, keySlot: 'backup' };
  }
}
