import {
  DEFAULT_COUNTRY,
  normalizeCountries,
  readCachedActiveCountry,
  resolveItemCountry,
  writeCachedActiveCountry
} from './travel-country.js';

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
        reject(new Error('等待國家篩選初始化逾時。'));
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
  const { collection, doc, onSnapshot } = firestoreSdk;

  const state = {
    userId: '',
    activeCountry: DEFAULT_COUNTRY,
    countries: [DEFAULT_COUNTRY],
    items: new Map(),
    settingsUnsub: null,
    itemsUnsub: null
  };

  function stopListeners() {
    state.settingsUnsub?.();
    state.itemsUnsub?.();
    state.settingsUnsub = null;
    state.itemsUnsub = null;
  }

  function itemIdForCard(card) {
    const clickable = card.querySelector?.('[onclick*="openEditModal"]');
    return resolveCardItemId({
      dataset: card.dataset || {},
      onclickSource: clickable?.getAttribute?.('onclick') || ''
    });
  }

  function applyCountryVisibility() {
    const loading = document.getElementById('loading-indicator');
    const empty = document.getElementById('empty-state');
    let visibleProducts = 0;

    for (const card of [...list.children]) {
      if (card.id === 'loading-indicator' || card.id === 'empty-state') continue;
      const itemId = itemIdForCard(card);
      if (!itemId) continue;
      const item = state.items.get(itemId);
      const visible = !item || itemMatchesActiveCountry(item, state.activeCountry);
      card.classList.toggle('country-filter-hidden', !visible);
      card.style.display = visible ? '' : 'none';
      if (visible) visibleProducts += 1;
    }

    if (!empty || (loading && !loading.classList.contains('hidden'))) return;
    empty.classList.toggle('hidden', visibleProducts > 0);
    empty.classList.toggle('flex', visibleProducts === 0);
  }

  function resetCoreFilters() {
    const categoryAll = document.querySelector('#category-filters [data-cat="all"]');
    const locationAll = document.querySelector('#location-filters [data-loc="all"]');
    if (categoryAll && !categoryAll.classList.contains('bg-pastelOrange')) categoryAll.click();
    if (locationAll && !locationAll.classList.contains('bg-pastelBlue')) locationAll.click();
  }

  function setActiveCountry(country, { resetFilters = false } = {}) {
    const normalized = String(country || '').trim() || DEFAULT_COUNTRY;
    const changed = normalized !== state.activeCountry;
    state.activeCountry = normalized;
    window.shoppingListActiveCountry = normalized;
    if (state.userId) writeCachedActiveCountry(window.localStorage, state.userId, normalized);
    if (changed && resetFilters) resetCoreFilters();
    queueMicrotask(applyCountryVisibility);
  }

  function subscribeUser(user) {
    stopListeners();
    state.userId = user?.uid || '';
    state.items = new Map();
    state.countries = [DEFAULT_COUNTRY];
    state.activeCountry = user?.uid
      ? readCachedActiveCountry(window.localStorage, user.uid)
      : DEFAULT_COUNTRY;
    window.shoppingListActiveCountry = state.activeCountry;
    applyCountryVisibility();
    if (!user) return;

    const settingsRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');

    state.settingsUnsub = onSnapshot(settingsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.countries = normalizeCountries(data.countries);
      const fromSettings = String(data.activeCountry || '').trim();
      const next = fromSettings || readCachedActiveCountry(window.localStorage, user.uid);
      if (next && !state.countries.includes(next)) state.countries.unshift(next);
      setActiveCountry(next || DEFAULT_COUNTRY, { resetFilters: true });
    }, (error) => console.error('Country settings listener failed:', error));

    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
      queueMicrotask(applyCountryVisibility);
    }, (error) => console.error('Country item listener failed:', error));
  }

  const observer = new MutationObserver(() => queueMicrotask(applyCountryVisibility));
  observer.observe(list, { childList: true });

  window.addEventListener('shopping-list:active-country-changed', (event) => {
    setActiveCountry(event?.detail?.country, { resetFilters: true });
  });

  authSdk.onAuthStateChanged(auth, subscribeUser);
  applyCountryVisibility();
}
