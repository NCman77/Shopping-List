import { DEFAULT_COUNTRY, resolveItemCountry } from './travel-country.js';

const APP_ID = 'japan-shopping-app';

function waitFor(predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('等待國家相容功能初始化逾時。'));
      }
    }, 40);
  });
}

export function resolveCardItemId({ dataset = {}, onclickSource = '' } = {}) {
  const enhanced = String(dataset?.enhancedItemId || '').trim();
  if (enhanced) return enhanced;
  const match = String(onclickSource || '').match(/openEditModal\(['"]([^'"]+)['"]\)/);
  return match?.[1] || '';
}

export function itemMatchesActiveCountry(item, activeCountry) {
  const country = String(activeCountry || '').trim() || DEFAULT_COUNTRY;
  return resolveItemCountry(item) === country;
}

export function shouldShowItemForCountry({ item, activeCountry, itemsLoaded } = {}) {
  if (!itemsLoaded || !item) return false;
  return itemMatchesActiveCountry(item, activeCountry);
}

export function createCountryMapsSearchUrl(location, item) {
  const place = String(location || '').trim();
  if (!place) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place} ${resolveItemCountry(item)}`)}`;
}

export async function initCountryIsolation() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListCountryIsolationInitialized) return;
  window.__shoppingListCountryIsolationInitialized = true;

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const list = await waitFor(() => document.getElementById('item-list'));
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, onSnapshot } = firestoreSdk;

  const state = {
    userId: '',
    items: new Map(),
    itemsUnsub: null,
    scheduled: false
  };

  function itemIdForCard(card) {
    const clickable = card.querySelector?.('[onclick*="openEditModal"]');
    return resolveCardItemId({
      dataset: card.dataset || {},
      onclickSource: clickable?.getAttribute?.('onclick') || ''
    });
  }

  function applyCountryAwareMaps() {
    state.scheduled = false;
    for (const card of [...list.children]) {
      if (card.id) continue;
      const item = state.items.get(itemIdForCard(card));
      if (!item?.location) continue;
      const mapAnchor = card.querySelector('a[href*="google.com/maps/search"]');
      const countryAwareUrl = createCountryMapsSearchUrl(item.location, item);
      if (mapAnchor && countryAwareUrl) mapAnchor.href = countryAwareUrl;
    }
  }

  function scheduleMaps() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(applyCountryAwareMaps);
  }

  function subscribeUser(user) {
    state.itemsUnsub?.();
    state.itemsUnsub = null;
    state.userId = user?.uid || '';
    state.items = new Map();
    if (!user) return scheduleMaps();

    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
      scheduleMaps();
    }, (error) => console.error('Country compatibility item listener failed:', error));
  }

  const observer = new MutationObserver(scheduleMaps);
  observer.observe(list, { childList: true, subtree: false });
  window.addEventListener('shopping-list:active-country-changed', scheduleMaps);
  window.addEventListener('shopping-list:active-trip-changed', scheduleMaps);

  authSdk.onAuthStateChanged(auth, subscribeUser);
  scheduleMaps();
}
