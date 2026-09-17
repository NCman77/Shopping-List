import { DEFAULT_COUNTRY } from './travel-country.js';
import { createGoogleMapsUrl } from '../utils/url-utils.js';
import {
  resolveLocationDisplayName,
  resolveLocationMapQuery
} from './brand-location-resolver.js';

const APP_ID = 'japan-shopping-app';

function clean(value) {
  return String(value ?? '').trim();
}

function activeCountry(windowRef) {
  return clean(windowRef.shoppingListActiveTrip?.country)
    || clean(windowRef.shoppingListActiveCountry)
    || DEFAULT_COUNTRY;
}

function rawLocationFromMapsLink(link) {
  const saved = clean(link?.dataset?.brandLocationRaw);
  if (saved) return saved;
  try {
    const url = new URL(link?.getAttribute?.('href') || link?.href || '', 'https://www.google.com');
    const value = clean(url.searchParams.get('query'));
    if (value) return value;
  } catch {
    // Fall back to visible label below.
  }
  return clean(link?.querySelector?.('span')?.textContent || link?.textContent);
}

function updateLocationFilters(documentRef, brands, country) {
  documentRef.querySelectorAll('#location-filters .loc-btn[data-loc]').forEach((button) => {
    const raw = clean(button.dataset?.loc);
    if (!raw || raw === 'all') return;
    const display = resolveLocationDisplayName(raw, brands, country) || raw;
    button.dataset.brandLocationRaw = raw;
    button.dataset.filterPickerLabel = display;
    if (clean(button.textContent) !== display) button.textContent = display;
  });
}

function updateItemLocationLinks(documentRef, brands, country) {
  documentRef.querySelectorAll('#item-list a[href*="google.com/maps/search"]').forEach((link) => {
    const raw = rawLocationFromMapsLink(link);
    if (!raw) return;
    link.dataset.brandLocationRaw = raw;
    const display = resolveLocationDisplayName(raw, brands, country) || raw;
    const mapQuery = resolveLocationMapQuery(raw, brands, country) || raw;
    const nextHref = createGoogleMapsUrl(mapQuery);
    if (nextHref && link.getAttribute('href') !== nextHref) link.setAttribute('href', nextHref);
    const label = link.querySelector('span');
    if (label && clean(label.textContent) !== display) label.textContent = display;
    link.setAttribute('aria-label', `在 Google 地圖搜尋${display}`);
  });
}

export function applyBrandLocationDisplay({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  brands = []
} = {}) {
  if (!documentRef || !windowRef) return;
  const country = activeCountry(windowRef);
  updateLocationFilters(documentRef, brands, country);
  updateItemLocationLinks(documentRef, brands, country);
}

export async function initBrandLocationDisplay({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !windowRef) return () => {};
  if (windowRef.__shoppingListBrandLocationDisplayInitialized) return () => {};
  windowRef.__shoppingListBrandLocationDisplayInitialized = true;

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
    dictionaryUnsub: null,
    scheduled: false
  };

  function apply() {
    state.scheduled = false;
    applyBrandLocationDisplay({ documentRef, windowRef, brands: state.brands });
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(apply);
  }

  const roots = [
    documentRef.getElementById('location-filters'),
    documentRef.getElementById('item-list')
  ].filter(Boolean);
  const observers = [];
  if (MutationObserverImpl) {
    for (const root of roots) {
      const observer = new MutationObserverImpl(schedule);
      observer.observe(root, { childList: true, subtree: true });
      observers.push(observer);
    }
  }

  windowRef.addEventListener('shopping-list:active-trip-changed', schedule);
  windowRef.addEventListener('shopping-list:trips-changed', schedule);

  function subscribeUser(user) {
    state.dictionaryUnsub?.();
    state.dictionaryUnsub = null;
    state.userId = user?.uid || '';
    state.brands = [];
    schedule();
    if (!user) return;
    const dictionary = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'brandDictionary');
    state.dictionaryUnsub = onSnapshot(dictionary, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.brands = Array.isArray(data.brands) ? data.brands.map((brand) => ({ ...brand })) : [];
      schedule();
    }, (error) => console.error('Brand location display listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  schedule();
  return () => {
    state.dictionaryUnsub?.();
    observers.forEach((observer) => observer.disconnect());
    windowRef.removeEventListener('shopping-list:active-trip-changed', schedule);
    windowRef.removeEventListener('shopping-list:trips-changed', schedule);
  };
}
