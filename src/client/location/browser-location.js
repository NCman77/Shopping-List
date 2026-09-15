function geolocationOf(navigatorImpl) {
  const geolocation = navigatorImpl?.geolocation;
  if (!geolocation) throw new Error('此裝置或瀏覽器無法使用定位功能。');
  return geolocation;
}

function normalizePosition(position) {
  const lat = Number(position?.coords?.latitude);
  const lng = Number(position?.coords?.longitude);
  const accuracy = Number(position?.coords?.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('無法取得有效定位座標。');
  return { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : null };
}

function locationError(error) {
  if (Number(error?.code) === 1) return new Error('定位權限被拒絕，請允許位置權限後再試。');
  if (Number(error?.code) === 2) return new Error('目前無法取得定位資訊，請稍後再試。');
  if (Number(error?.code) === 3) return new Error('取得定位逾時，請重試。');
  return new Error(error?.message || '定位失敗，請稍後再試。');
}

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 30000
};

export function getCurrentPosition({ navigatorImpl = globalThis.navigator, options = {} } = {}) {
  let geolocation;
  try { geolocation = geolocationOf(navigatorImpl); }
  catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        try { resolve(normalizePosition(position)); }
        catch (error) { reject(error); }
      },
      (error) => reject(locationError(error)),
      { ...DEFAULT_OPTIONS, ...options }
    );
  });
}

export function watchPosition({
  navigatorImpl = globalThis.navigator,
  onPosition,
  onError = () => {},
  options = {}
} = {}) {
  const geolocation = geolocationOf(navigatorImpl);
  if (typeof onPosition !== 'function') throw new TypeError('缺少定位更新處理函式。');
  return geolocation.watchPosition(
    (position) => {
      try { onPosition(normalizePosition(position)); }
      catch (error) { onError(error); }
    },
    (error) => onError(locationError(error)),
    { ...DEFAULT_OPTIONS, ...options }
  );
}

export function clearPositionWatch(watchId, { navigatorImpl = globalThis.navigator } = {}) {
  if (watchId === null || watchId === undefined) return;
  const geolocation = navigatorImpl?.geolocation;
  if (typeof geolocation?.clearWatch === 'function') geolocation.clearWatch(watchId);
}
