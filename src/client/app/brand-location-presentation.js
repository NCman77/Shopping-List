import { DEFAULT_COUNTRY } from './travel-country.js';
import {
  findBrandForLocationInput,
  preferredBrandDisplayName,
  preferredBrandMapSearchName
} from './brand-dictionary-core.js';

const APP_ID = 'japan-shopping-app';

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function mapsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export async function initBrandLocationPresentation({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !windowRef || !MutationObserverImpl) return () => {};
  if (windowRef.__shoppingListBrandLocationPresentationInitialized) return () => {};
  windowRef.__shoppingListBrandLocationPresentationInitialized = true;

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, onSnapshot } = firestoreSdk;

  const state = {
    userId: '',
    brands: [],
    languageFieldsByCountry: {},
    brandsUnsub: null,
    settingsUnsub: null,
    scheduled: false
  };

  function activeCountry() {
    return clean(windowRef.shoppingListActiveTrip?.country)
      || clean(windowRef.shoppingListActiveCountry)
      || DEFAULT_COUNTRY;
  }

  function savedFields(country) {
    return Array.isArray(state.languageFieldsByCountry?.[country])
      ? state.languageFieldsByCountry[country]
      : [];
  }

  function resolve(raw) {
    const country = activeCountry();
    const brand = findBrandForLocationInput(state.brands, raw, country);
    if (!brand) return { display: raw, mapSearch: raw };
    const fields = savedFields(country);
    return {
      display: preferredBrandDisplayName(brand, country, raw, fields) || raw,
      mapSearch: preferredBrandMapSearchName(brand, country, raw, fields) || raw
    };
  }

  function applyFilterLabels() {
    documentRef.querySelectorAll('#location-filters .loc-btn[data-loc]').forEach((button) => {
      const raw = clean(button.dataset.loc);
      if (!raw || raw === 'all') return;
      const { display } = resolve(raw);
      button.dataset.filterPickerLabel = display;
      if (button.textContent !== display) button.textContent = display;
    });
  }

  function applyItemCardLocations() {
    documentRef.querySelectorAll('#item-list a[target="_blank"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!/google\.com\/maps\/search/i.test(href)) return;
      const label = link.querySelector('span') || link;
      const raw = clean(link.dataset.brandRawLocation || label.textContent);
      if (!raw) return;
      link.dataset.brandRawLocation = raw;
      const { display, mapSearch } = resolve(raw);
      if (label.textContent !== display) label.textContent = display;
      link.href = mapsUrl(mapSearch);
      link.setAttribute('aria-label', `在 Google 地圖搜尋 ${mapSearch}`);
    });
  }

  function applyMapButtons() {
    documentRef.querySelectorAll('button[aria-label^="在 Google 地圖搜尋"]').forEach((button) => {
      const raw = clean(button.dataset.brandRawLocation || button.getAttribute('aria-label')?.replace(/^在 Google 地圖搜尋\s*/, ''));
      if (!raw) return;
      button.dataset.brandRawLocation = raw;
      const { mapSearch } = resolve(raw);
      button.setAttribute('aria-label', `在 Google 地圖搜尋 ${mapSearch}`);
      button.dataset.brandMapSearch = mapSearch;
    });
  }

  function apply() {
    state.scheduled = false;
    applyFilterLabels();
    applyItemCardLocations();
    applyMapButtons();
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(apply);
  }

  const observer = new MutationObserverImpl(schedule);
  observer.observe(documentRef.body, { childList: true, subtree: true });
  windowRef.addEventListener('shopping-list:active-trip-changed', schedule);
  windowRef.addEventListener('shopping-list:active-country-changed', schedule);

  function subscribeUser(user) {
    state.brandsUnsub?.();
    state.settingsUnsub?.();
    state.brandsUnsub = null;
    state.settingsUnsub = null;
    state.userId = user?.uid || '';
    state.brands = [];
    state.languageFieldsByCountry = {};
    schedule();
    if (!user) return;

    const dictionaryRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'brandDictionary');
    const settingsRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');
    state.brandsUnsub = onSnapshot(dictionaryRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.brands = Array.isArray(data.brands) ? data.brands.map((brand) => ({ ...brand })) : [];
      schedule();
    }, (error) => console.error('Brand location presentation dictionary listener failed:', error));
    state.settingsUnsub = onSnapshot(settingsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.languageFieldsByCountry = data.brandLanguageFields && typeof data.brandLanguageFields === 'object'
        ? { ...data.brandLanguageFields }
        : {};
      schedule();
    }, (error) => console.error('Brand location presentation settings listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  schedule();
  return () => {
    observer.disconnect();
    state.brandsUnsub?.();
    state.settingsUnsub?.();
  };
}
