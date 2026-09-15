import { resolveItemLocations } from '../pricing/location-selection.js';

const APP_ID = 'japan-shopping-app';

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
        reject(new Error('等待旅程篩選選項初始化逾時。'));
      }
    }, 40);
  });
}

export function valuesUsedByTrip(items = [], tripId = '', field = '') {
  const id = clean(tripId);
  if (!id || !['category', 'location'].includes(field)) return [];
  const values = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (clean(item?.tripId) !== id) continue;
    const itemValues = field === 'location'
      ? resolveItemLocations(item)
      : [clean(item?.category)].filter(Boolean);
    for (const value of itemValues) {
      if (!value || seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

export async function initTripFilterOptions() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListTripFilterOptionsInitialized) return;
  window.__shoppingListTripFilterOptionsInitialized = true;

  const [categoryRoot, locationRoot, appSdk, authSdk, firestoreSdk] = await Promise.all([
    waitFor(() => document.getElementById('category-filters')),
    waitFor(() => document.getElementById('location-filters')),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, onSnapshot } = firestoreSdk;

  const state = {
    userId: '',
    items: [],
    itemsLoaded: false,
    itemUnsub: null,
    scheduled: false
  };

  function applyButtons(selector, dataKey, usedValues) {
    const used = new Set(usedValues);
    document.querySelectorAll(selector).forEach((button) => {
      const value = clean(button.dataset?.[dataKey]);
      const isAll = value === 'all';
      const shouldHide = !isAll && (!window.shoppingListTripContextReady || !used.has(value));
      button.classList.toggle('hidden', shouldHide);
    });
  }

  function applyOptions() {
    state.scheduled = false;
    const tripId = clean(window.shoppingListActiveTrip?.id);
    const categories = state.itemsLoaded && tripId ? valuesUsedByTrip(state.items, tripId, 'category') : [];
    const locations = state.itemsLoaded && tripId ? valuesUsedByTrip(state.items, tripId, 'location') : [];
    applyButtons('#category-filters .cat-btn', 'cat', categories);
    applyButtons('#location-filters .loc-btn', 'loc', locations);
  }

  function scheduleApply() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(applyOptions);
  }

  window.addEventListener('shopping-list:active-trip-changed', () => {
    document.querySelector('#category-filters [data-cat="all"]')?.click();
    document.querySelector('#location-filters [data-loc="all"]')?.click();
    scheduleApply();
  });

  window.addEventListener('shopping-list:trips-changed', scheduleApply);

  const observer = new MutationObserver(scheduleApply);
  observer.observe(categoryRoot, { childList: true, subtree: false });
  observer.observe(locationRoot, { childList: true, subtree: false });

  function subscribeUser(user) {
    state.itemUnsub?.();
    state.itemUnsub = null;
    state.userId = user?.uid || '';
    state.items = [];
    state.itemsLoaded = false;
    scheduleApply();
    if (!user) return;

    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
      state.itemsLoaded = true;
      scheduleApply();
    }, (error) => {
      console.error('Trip filter option listener failed:', error);
      state.itemsLoaded = false;
      scheduleApply();
    });
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  scheduleApply();
}
