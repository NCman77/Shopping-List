import {
  groupUnassignedItemsByCountry,
  legacyTripIdForCountry,
  normalizeTrip,
  readCachedActiveTripId,
  resolveActiveTrip,
  writeCachedActiveTripId
} from './travel-trip.js';
import { writeCachedActiveCountry } from './travel-country.js';

const APP_ID = 'japan-shopping-app';

function customEvent(windowRef, name, detail) {
  const EventCtor = windowRef?.CustomEvent || globalThis.CustomEvent;
  return typeof EventCtor === 'function' ? new EventCtor(name, { detail }) : null;
}

function dispatch(windowRef, name, detail) {
  const event = customEvent(windowRef, name, detail);
  if (event) windowRef.dispatchEvent(event);
}

export function buildLegacyMigrationPlan(items = []) {
  const grouped = groupUnassignedItemsByCountry(items);
  return [...grouped.entries()].map(([country, countryItems]) => {
    const tripId = legacyTripIdForCountry(country);
    return {
      country,
      tripId,
      itemIds: countryItems.map((item) => item.id).filter(Boolean),
      trip: {
        id: tripId,
        title: `${country} · 既有清單`,
        country,
        startDate: null,
        endDate: null,
        kind: 'legacy'
      }
    };
  });
}

export function hasUnassignedItems(items = []) {
  return (Array.isArray(items) ? items : []).some((item) => item && !String(item.tripId || '').trim());
}

export function resolveTripForReconcile({
  trips = [],
  persistedTripId = '',
  sessionSelectedTripId = '',
  today
} = {}) {
  const normalizedTrips = (Array.isArray(trips) ? trips : [])
    .map(normalizeTrip)
    .filter((trip) => trip.id);
  const manualId = String(sessionSelectedTripId || '').trim();
  if (manualId) {
    const manualTrip = normalizedTrips.find((trip) => trip.id === manualId);
    if (manualTrip) return manualTrip;
  }
  return resolveActiveTrip({ trips: normalizedTrips, persistedTripId, today });
}

export async function initTripContext() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListTripContextInitialized) return;
  window.__shoppingListTripContextInitialized = true;
  window.shoppingListActiveTrip = null;
  window.shoppingListTrips = [];
  window.shoppingListTripContextReady = false;

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, setDoc, writeBatch } = firestoreSdk;

  const state = {
    userId: '',
    trips: new Map(),
    items: new Map(),
    settings: {},
    loaded: { trips: false, items: false, settings: false },
    activeTrip: null,
    sessionSelectedTripId: '',
    migrating: false,
    initialMigrationComplete: false,
    reconcileScheduled: false,
    unsubs: []
  };

  function resetPublicState() {
    window.shoppingListActiveTrip = null;
    window.shoppingListTrips = [];
    window.shoppingListTripContextReady = false;
  }

  function stopSubscriptions() {
    state.unsubs.splice(0).forEach((unsubscribe) => {
      try { unsubscribe?.(); } catch {}
    });
  }

  function userRootDoc(...parts) {
    return doc(db, 'artifacts', APP_ID, 'users', state.userId, ...parts);
  }

  function settingsRef() {
    return doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences');
  }

  function publicTrips() {
    return [...state.trips.values()].map(normalizeTrip);
  }

  function publishTrips() {
    window.shoppingListTrips = publicTrips();
    dispatch(window, 'shopping-list:trips-changed', { trips: window.shoppingListTrips });
  }

  async function activateTrip(trip, { persist = true } = {}) {
    const normalized = trip ? normalizeTrip(trip) : null;
    const previousId = state.activeTrip?.id || '';
    const nextId = normalized?.id || '';
    state.activeTrip = normalized;
    window.shoppingListActiveTrip = normalized;

    if (state.userId) writeCachedActiveTripId(window.localStorage, state.userId, nextId);

    if (normalized) {
      window.shoppingListActiveCountry = normalized.country;
      if (state.userId) writeCachedActiveCountry(window.localStorage, state.userId, normalized.country);
      if (persist && state.userId) {
        await setDoc(settingsRef(), {
          activeTripId: normalized.id,
          activeCountry: normalized.country
        }, { merge: true });
      }
    }

    if (previousId !== nextId) {
      dispatch(window, 'shopping-list:active-trip-changed', { trip: normalized });
      if (normalized) {
        dispatch(window, 'shopping-list:active-country-changed', { country: normalized.country, source: 'trip' });
      }
    }
    window.shoppingListTripContextReady = true;
  }

  async function migrateLegacyItems() {
    if (!state.userId || state.migrating || state.initialMigrationComplete) return;
    const items = [...state.items.values()];
    const plan = buildLegacyMigrationPlan(items);
    if (!plan.length) {
      state.initialMigrationComplete = true;
      return;
    }

    state.migrating = true;
    window.shoppingListTripContextReady = false;
    try {
      const now = Date.now();
      const batch = writeBatch(db);
      for (const entry of plan) {
        const tripRef = userRootDoc('trips', entry.tripId);
        batch.set(tripRef, {
          title: entry.trip.title,
          country: entry.country,
          startDate: null,
          endDate: null,
          kind: 'legacy',
          createdAt: now,
          updatedAt: now
        }, { merge: true });
        for (const itemId of entry.itemIds) {
          const current = state.items.get(itemId);
          if (!current || String(current.tripId || '').trim()) continue;
          batch.update(userRootDoc('items', itemId), { tripId: entry.tripId });
        }
      }
      await batch.commit();
    } catch (error) {
      console.error('Legacy trip migration failed:', error);
      dispatch(window, 'shopping-list:trip-context-error', { stage: 'migration', error });
      throw error;
    } finally {
      state.migrating = false;
    }
  }

  function scheduleReconcile() {
    if (state.reconcileScheduled) return;
    state.reconcileScheduled = true;
    queueMicrotask(async () => {
      state.reconcileScheduled = false;
      if (!state.userId || !state.loaded.trips || !state.loaded.items || !state.loaded.settings || state.migrating) return;

      const items = [...state.items.values()];
      if (hasUnassignedItems(items)) {
        window.shoppingListTripContextReady = false;
        if (!state.initialMigrationComplete) {
          try { await migrateLegacyItems(); } catch {}
        } else {
          const error = new Error('偵測到沒有旅程歸屬的商品，已停止顯示以避免跨旅程資料混用。');
          console.error('Unassigned item detected after trip context initialization:', error);
          dispatch(window, 'shopping-list:trip-context-error', { stage: 'unassigned-item', error });
        }
        return;
      }

      state.initialMigrationComplete = true;
      const trips = publicTrips();
      publishTrips();
      const persistedTripId = String(state.settings.activeTripId || '').trim()
        || readCachedActiveTripId(window.localStorage, state.userId);
      const selected = resolveTripForReconcile({
        trips,
        persistedTripId,
        sessionSelectedTripId: state.sessionSelectedTripId
      });
      const shouldPersist = Boolean(selected && state.settings.activeTripId !== selected.id);
      try {
        await activateTrip(selected, { persist: shouldPersist });
      } catch (error) {
        console.error('Active trip persistence failed:', error);
        if (selected) {
          state.activeTrip = selected;
          window.shoppingListActiveTrip = selected;
          window.shoppingListTripContextReady = true;
          dispatch(window, 'shopping-list:active-trip-changed', { trip: selected });
        }
        dispatch(window, 'shopping-list:trip-context-error', { stage: 'active-trip', error });
      }
    });
  }

  window.shoppingListSelectTrip = async (tripId) => {
    if (!state.userId) throw new Error('尚未登入。');
    const selected = state.trips.get(String(tripId || '').trim());
    if (!selected) throw new Error('找不到這趟旅程。');
    state.sessionSelectedTripId = selected.id;
    await activateTrip(selected, { persist: true });
    return normalizeTrip(selected);
  };

  function subscribeUser(user) {
    stopSubscriptions();
    state.userId = user?.uid || '';
    state.trips = new Map();
    state.items = new Map();
    state.settings = {};
    state.loaded = { trips: false, items: false, settings: false };
    state.activeTrip = null;
    state.sessionSelectedTripId = '';
    state.migrating = false;
    state.initialMigrationComplete = false;
    resetPublicState();
    if (!user) return;

    const tripsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'trips');
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    const preferencesRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');

    state.unsubs.push(onSnapshot(tripsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.trips = new Map(snapshot.docs.map((tripDoc) => [tripDoc.id, normalizeTrip({ id: tripDoc.id, ...tripDoc.data() })]));
      state.loaded.trips = true;
      publishTrips();
      scheduleReconcile();
    }, (error) => {
      console.error('Trip listener failed:', error);
      window.shoppingListTripContextReady = false;
      dispatch(window, 'shopping-list:trip-context-error', { stage: 'trips', error });
    }));

    state.unsubs.push(onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
      state.loaded.items = true;
      scheduleReconcile();
    }, (error) => {
      console.error('Trip item listener failed:', error);
      window.shoppingListTripContextReady = false;
      dispatch(window, 'shopping-list:trip-context-error', { stage: 'items', error });
    }));

    state.unsubs.push(onSnapshot(preferencesRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.settings = snapshot.exists() ? snapshot.data() : {};
      state.loaded.settings = true;
      scheduleReconcile();
    }, (error) => {
      console.error('Trip settings listener failed:', error);
      window.shoppingListTripContextReady = false;
      dispatch(window, 'shopping-list:trip-context-error', { stage: 'settings', error });
    }));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
}
