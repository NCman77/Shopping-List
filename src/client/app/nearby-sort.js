import { getCurrentPosition, watchPosition, clearPositionWatch } from '../location/browser-location.js';
import { distanceForItem, movedBeyondThreshold } from '../location/distance.js';
import { loadPlacesLibraryWithFailover } from '../location/google-places-loader.js';
import { isCoordinateCacheFresh } from '../location/places-usage-policy.js';
import { resolveAddressPlace } from '../location/store-places.js';
import { itemMatchesActiveTrip } from './travel-trip.js';

const APP_ID = 'japan-shopping-app';
const MOVEMENT_THRESHOLD_METERS = 150;

function clean(value) {
  return String(value ?? '').trim();
}

function waitFor(predicate, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('等待附近排序初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'warn'](`${title}: ${message}`);
}

export function freshStoreCoordinate(item = {}, now = Date.now()) {
  if (!isCoordinateCacheFresh(item?.storeResolvedAt, now)) return null;
  if (item?.storeLat === null || item?.storeLat === undefined || item?.storeLat === '') return null;
  if (item?.storeLng === null || item?.storeLng === undefined || item?.storeLng === '') return null;
  const lat = Number(item.storeLat);
  const lng = Number(item.storeLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function nearbySortStateChanged(previous, next) {
  const previousEnabled = Boolean(previous?.enabled);
  const nextEnabled = Boolean(next?.enabled);
  if (!previous) return nextEnabled;
  if (previousEnabled !== nextEnabled) return true;
  if (!nextEnabled) return false;

  const previousOrigin = previous?.origin || null;
  const nextOrigin = next?.origin || null;
  if (!previousOrigin || !nextOrigin) return previousOrigin !== nextOrigin;
  if (Number(previousOrigin.lat) !== Number(nextOrigin.lat) || Number(previousOrigin.lng) !== Number(nextOrigin.lng)) {
    return true;
  }

  const previousDistances = previous?.distancesByItemId || {};
  const nextDistances = next?.distancesByItemId || {};
  const previousKeys = Object.keys(previousDistances).sort();
  const nextKeys = Object.keys(nextDistances).sort();
  if (previousKeys.length !== nextKeys.length) return true;
  for (let index = 0; index < previousKeys.length; index += 1) {
    const previousKey = previousKeys[index];
    const nextKey = nextKeys[index];
    if (previousKey !== nextKey || Number(previousDistances[previousKey]) !== Number(nextDistances[nextKey])) return true;
  }
  return false;
}

export function trackingAttemptIsCurrent({ userId, generation } = {}, currentState = {}) {
  return Boolean(
    userId
    && currentState.userId === userId
    && Number(currentState.trackingGeneration) === Number(generation)
  );
}

export async function initNearbySort() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListNearbySortInitialized) return;
  window.__shoppingListNearbySortInitialized = true;

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, setDoc, updateDoc } = firestoreSdk;

  const state = {
    userId: '',
    enabledPreference: false,
    enabled: false,
    origin: null,
    watchId: null,
    permissionBlocked: false,
    settingsUnsub: null,
    itemsUnsub: null,
    items: new Map(),
    attemptedResolution: new Set(),
    resolving: false,
    starting: false,
    trackingGeneration: 0,
    lastPublishedState: null
  };

  function settingsRef(userId = state.userId) {
    return userId ? doc(db, 'artifacts', APP_ID, 'users', userId, 'settings', 'preferences') : null;
  }

  function itemRef(itemId, userId = state.userId) {
    return doc(db, 'artifacts', APP_ID, 'users', userId, 'items', itemId);
  }

  function distancesForOrigin() {
    const distances = {};
    if (!state.origin) return distances;
    for (const [itemId, item] of state.items) {
      const coordinate = freshStoreCoordinate(item);
      if (!coordinate) continue;
      const distance = distanceForItem({ ...item, storeLat: coordinate.lat, storeLng: coordinate.lng }, state.origin);
      if (Number.isFinite(distance)) distances[itemId] = distance;
    }
    return distances;
  }

  function publish() {
    const nextPublicState = {
      enabled: Boolean(state.enabled && state.origin),
      origin: state.origin ? { ...state.origin } : null,
      distancesByItemId: distancesForOrigin()
    };
    const changed = nearbySortStateChanged(state.lastPublishedState, nextPublicState);
    state.lastPublishedState = nextPublicState;
    window.shoppingListNearbySort = nextPublicState;
    renderControl();
    if (!changed) return;
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') {
      window.dispatchEvent(new EventCtor('shopping-list:nearby-sort-changed', {
        detail: window.shoppingListNearbySort
      }));
    }
  }

  function stopWatcher() {
    if (state.watchId !== null) clearPositionWatch(state.watchId);
    state.watchId = null;
  }

  function cancelTrackingAttempt() {
    state.trackingGeneration += 1;
    state.starting = false;
  }

  function disableSession({ clearOrigin = true } = {}) {
    cancelTrackingAttempt();
    stopWatcher();
    state.enabled = false;
    if (clearOrigin) state.origin = null;
    publish();
  }

  async function persistEnabled(enabled, userId = state.userId) {
    const ref = settingsRef(userId);
    if (!userId || !ref) return;
    await setDoc(ref, { nearbySortEnabled: Boolean(enabled) }, { merge: true });
  }

  function acceptPosition(position, attempt = null) {
    if (attempt && !trackingAttemptIsCurrent(attempt, state)) return;
    const next = { lat: position.lat, lng: position.lng, accuracy: position.accuracy ?? null };
    if (!movedBeyondThreshold(state.origin, next, MOVEMENT_THRESHOLD_METERS)) return;
    state.origin = next;
    state.enabled = true;
    publish();
    void backfillMissingStoreCoordinates();
  }

  async function startTracking({ persist = false } = {}) {
    if (!state.userId || state.starting || state.permissionBlocked) return false;
    const trackingUserId = state.userId;
    const trackingGeneration = ++state.trackingGeneration;
    const attempt = { userId: trackingUserId, generation: trackingGeneration };
    state.starting = true;
    try {
      const first = await getCurrentPosition();
      if (!trackingAttemptIsCurrent({ userId: trackingUserId, generation: trackingGeneration }, state)) return false;
      state.origin = { lat: first.lat, lng: first.lng, accuracy: first.accuracy ?? null };
      state.enabled = true;
      stopWatcher();
      state.watchId = watchPosition({
        onPosition(position) {
          if (!trackingAttemptIsCurrent({ userId: trackingUserId, generation: trackingGeneration }, state)) return;
          acceptPosition(position, attempt);
        },
        onError(error) {
          if (!trackingAttemptIsCurrent({ userId: trackingUserId, generation: trackingGeneration }, state)) return;
          console.warn('Nearby sort location watch failed:', error);
          if (/權限/.test(error?.message || '')) state.permissionBlocked = true;
          disableSession();
          notify('附近排序已暫停', error?.message || '目前無法持續取得定位。');
        }
      });
      if (persist) {
        await persistEnabled(true, trackingUserId);
        if (!trackingAttemptIsCurrent({ userId: trackingUserId, generation: trackingGeneration }, state)) return false;
      }
      publish();
      void backfillMissingStoreCoordinates();
      return true;
    } catch (error) {
      if (!trackingAttemptIsCurrent({ userId: trackingUserId, generation: trackingGeneration }, state)) return false;
      console.warn('Nearby sort start failed:', error);
      if (/權限/.test(error?.message || '')) state.permissionBlocked = true;
      disableSession();
      notify('無法開啟附近排序', error?.message || '定位暫時無法使用。');
      return false;
    } finally {
      if (trackingAttemptIsCurrent({ userId: trackingUserId, generation: trackingGeneration }, state)) state.starting = false;
    }
  }

  async function toggleNearbySort() {
    if (state.starting) {
      const userId = state.userId;
      state.enabledPreference = false;
      state.permissionBlocked = false;
      disableSession();
      try { await persistEnabled(false, userId); }
      catch (error) {
        console.error('Persist nearby sort preference failed:', error);
        notify('設定儲存失敗', '附近排序已在本次使用中關閉，但偏好無法同步。');
      }
      return;
    }
    if (state.enabled || state.enabledPreference) {
      const userId = state.userId;
      state.enabledPreference = false;
      state.permissionBlocked = false;
      disableSession();
      try { await persistEnabled(false, userId); }
      catch (error) {
        console.error('Persist nearby sort preference failed:', error);
        notify('設定儲存失敗', '附近排序已在本次使用中關閉，但偏好無法同步。');
      }
      return;
    }
    state.permissionBlocked = false;
    const started = await startTracking({ persist: true });
    if (started) state.enabledPreference = true;
  }

  function ensureControl() {
    if (document.getElementById('nearby-sort-shell')) return;
    const shell = document.createElement('div');
    shell.id = 'nearby-sort-shell';
    shell.className = 'px-4 pb-2 flex justify-end';
    shell.innerHTML = `
      <button id="nearby-sort-toggle" type="button" class="px-3 py-1.5 rounded-full border-2 border-warmBrown bg-white text-warmBrown text-xs font-bold shadow-[2px_2px_0_rgba(92,64,51,.14)]" aria-pressed="false">
        <i class="fas fa-location-crosshairs mr-1"></i><span>附近排序</span>
      </button>`;
    const tripShell = document.getElementById('active-trip-shell');
    const statusFilters = document.getElementById('status-filters');
    if (tripShell?.parentElement) tripShell.insertAdjacentElement('afterend', shell);
    else if (statusFilters?.parentElement) statusFilters.insertAdjacentElement('beforebegin', shell);
    else document.getElementById('item-list')?.insertAdjacentElement('beforebegin', shell);
    shell.querySelector('#nearby-sort-toggle')?.addEventListener('click', () => void toggleNearbySort());
  }

  function renderControl() {
    ensureControl();
    const button = document.getElementById('nearby-sort-toggle');
    if (!button) return;
    const active = Boolean(state.enabled && state.origin);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle('bg-pastelGreen', active);
    button.classList.toggle('bg-white', !active);
    const label = button.querySelector('span');
    if (label) label.textContent = active ? '附近排序：開' : '附近排序';
  }

  async function backfillMissingStoreCoordinates() {
    if (!state.enabled || !state.userId || state.resolving) return;
    const trip = window.shoppingListActiveTrip;
    const userId = state.userId;
    const tripId = clean(trip?.id);
    const runtimeKeys = window.shoppingListMapsApiKeys || {};
    const primaryKey = clean(runtimeKeys.primary || window.shoppingListMapsBrowserApiKey);
    const backupKey = clean(runtimeKeys.backup);
    if (!tripId || !primaryKey) return;

    const candidates = [...state.items.values()].filter((item) => (
      itemMatchesActiveTrip(item, trip)
      && clean(item.address)
      && !freshStoreCoordinate(item)
      && !state.attemptedResolution.has(`${item.id}:${clean(item.address)}`)
    ));
    if (!candidates.length) return;

    state.resolving = true;
    try {
      const { library } = await loadPlacesLibraryWithFailover({ primaryKey, backupKey });
      if (state.userId !== userId || !state.enabled || clean(window.shoppingListActiveTrip?.id) !== tripId) return;
      for (const item of candidates) {
        if (state.userId !== userId || !state.enabled || clean(window.shoppingListActiveTrip?.id) !== tripId) break;
        const attemptKey = `${item.id}:${clean(item.address)}`;
        state.attemptedResolution.add(attemptKey);
        try {
          const place = await resolveAddressPlace({
            address: item.address,
            country: item.country || trip.country,
            placesLibrary: library
          });
          if (!place || state.userId !== userId || clean(window.shoppingListActiveTrip?.id) !== tripId) continue;
          await updateDoc(itemRef(item.id, userId), {
            storePlaceId: place.placeId,
            storeDisplayName: place.displayName,
            storeAddress: place.address,
            storeLat: place.lat,
            storeLng: place.lng,
            storeResolvedAt: Date.now()
          });
        } catch (error) {
          console.warn(`Store coordinate resolution failed for ${item.id}:`, error);
        }
      }
    } catch (error) {
      console.warn('Legacy address coordinate backfill unavailable:', error);
    } finally {
      state.resolving = false;
    }
  }

  function subscribeItems(user) {
    state.itemsUnsub?.();
    state.itemsUnsub = null;
    state.items.clear();
    if (!user) return;
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((entry) => [entry.id, { id: entry.id, ...entry.data() }]));
      publish();
      void backfillMissingStoreCoordinates();
    }, (error) => console.error('Nearby sort item listener failed:', error));
  }

  function subscribeSettings(user) {
    state.settingsUnsub?.();
    state.settingsUnsub = null;
    if (!user) return;
    state.settingsUnsub = onSnapshot(settingsRef(user.uid), (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      const requested = Boolean(data.nearbySortEnabled);
      state.enabledPreference = requested;
      if (requested && !state.enabled && !state.starting && !state.permissionBlocked) {
        void startTracking({ persist: false });
      } else if (!requested && (state.enabled || state.watchId !== null || state.starting)) {
        disableSession();
      } else {
        renderControl();
      }
    }, (error) => console.error('Nearby sort settings listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, (user) => {
    cancelTrackingAttempt();
    stopWatcher();
    state.settingsUnsub?.();
    state.itemsUnsub?.();
    state.settingsUnsub = null;
    state.itemsUnsub = null;
    state.userId = user?.uid || '';
    state.enabledPreference = false;
    state.enabled = false;
    state.origin = null;
    state.permissionBlocked = false;
    state.attemptedResolution.clear();
    state.items.clear();
    publish();
    if (!user) return;
    subscribeItems(user);
    subscribeSettings(user);
  });

  window.addEventListener('shopping-list:active-trip-changed', () => {
    state.attemptedResolution.clear();
    publish();
    void backfillMissingStoreCoordinates();
  });
  window.addEventListener('shopping-list:maps-settings-changed', () => {
    state.attemptedResolution.clear();
    publish();
    void backfillMissingStoreCoordinates();
  });

  await waitFor(() => document.getElementById('item-list'));
  ensureControl();
  publish();
}
