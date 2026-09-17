import { DEFAULT_COUNTRY } from './travel-country.js';
import { createGoogleMapsUrl } from '../utils/url-utils.js';
import {
  resolveLocationDisplayName,
  resolveLocationMapQuery
} from './brand-location-resolver.js';

const APP_ID = 'japan-shopping-app';
const mapButtonHandlers = new WeakMap();

function clean(value) {
  return String(value ?? '').trim();
}

function activeCountry(windowRef) {
  return clean(windowRef.shoppingListActiveTrip?.country)
    || clean(windowRef.shoppingListActiveCountry)
    || DEFAULT_COUNTRY;
}

function displayName(raw, brands, country) {
  const value = clean(raw);
  if (!value) return '';
  return resolveLocationDisplayName(value, brands, country) || value;
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

function rawLocationFromMapButton(button) {
  const saved = clean(button?.dataset?.brandLocationRaw);
  if (saved) return saved;
  const aria = clean(button?.getAttribute?.('aria-label'));
  const match = aria.match(/^在 Google 地圖搜尋(.+?)附近分店$/u);
  if (match?.[1]) return clean(match[1]);
  return clean(button?.textContent);
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

function setButtonLabel(button, display) {
  const icon = button.querySelector('i');
  if (icon) button.replaceChildren(icon, document.createTextNode(display));
  else button.textContent = display;
}

function updateItemLocationButtons(documentRef, brands, country) {
  documentRef.querySelectorAll('#item-list button[aria-label^="在 Google 地圖搜尋"][aria-label$="附近分店"]').forEach((button) => {
    const raw = rawLocationFromMapButton(button);
    if (!raw) return;
    const display = resolveLocationDisplayName(raw, brands, country) || raw;
    const mapQuery = resolveLocationMapQuery(raw, brands, country) || raw;
    button.dataset.brandLocationRaw = raw;
    button.dataset.brandLocationMapQuery = mapQuery;
    button.setAttribute('aria-label', `在 Google 地圖搜尋${display}附近分店`);
    if (clean(button.textContent) !== display) setButtonLabel(button, display);
  });
}

function updateManagementLocationRows(documentRef, brands, country) {
  const title = clean(documentRef.getElementById('manage-filter-title')?.textContent);
  if (!title.includes('地點')) return;

  documentRef.querySelectorAll('#manage-filter-list .manage-row').forEach((row) => {
    const label = row.querySelector?.('.manage-option-name');
    if (!label) return;
    const raw = clean(row.dataset?.brandLocationRaw) || clean(label.textContent);
    if (!raw) return;
    row.dataset.brandLocationRaw = raw;
    row.dataset.brandLocationIndex = clean(row.dataset?.manageIndex);
    const display = displayName(raw, brands, country);
    if (clean(label.textContent) !== display) label.textContent = display;
    const rename = row.querySelector?.('.rename-option');
    if (rename) rename.setAttribute('aria-label', `重新命名地點${display}`);
  });
}

function updateItemLocationPicker(documentRef, brands, country) {
  documentRef.querySelectorAll('#item-multi-location-select option').forEach((option) => {
    const raw = clean(option.value);
    if (!raw) return;
    const display = displayName(raw, brands, country);
    if (clean(option.textContent) !== display) option.textContent = display;
  });

  documentRef.querySelectorAll('#item-multi-location-chips .multi-location-remove[data-location]').forEach((remove) => {
    const raw = clean(remove.dataset?.location);
    const label = remove.parentElement?.querySelector?.('span');
    if (!raw || !label) return;
    const legacy = clean(label.textContent).endsWith('（舊）');
    const display = `${displayName(raw, brands, country)}${legacy ? '（舊）' : ''}`;
    if (clean(label.textContent) !== display) label.textContent = display;
  });
}

function updateItemDetailLocationLabels(documentRef, brands, country) {
  documentRef.querySelectorAll('#item-detail-view [data-brand-location-raw]').forEach((button) => {
    const raw = clean(button.dataset?.brandLocationRaw);
    const label = button.querySelector?.('.brand-location-label');
    if (!raw || !label) return;
    const display = displayName(raw, brands, country);
    if (clean(label.textContent) !== display) label.textContent = display;
  });
}

function updateFilterDeleteWarning(documentRef, brands, country) {
  const modal = documentRef.getElementById('filter-delete-warning-modal');
  const title = documentRef.getElementById('filter-delete-title');
  const note = documentRef.getElementById('filter-delete-retain-note');
  const titleText = clean(title?.textContent);
  const match = titleText.match(/^刪除地點「(.+)」？$/u);
  if (!modal || !title || !match?.[1]) {
    if (modal?.dataset) {
      delete modal.dataset.brandLocationRaw;
      delete modal.dataset.brandLocationDisplay;
    }
    return;
  }

  const visibleValue = clean(match[1]);
  const previousRaw = clean(modal.dataset?.brandLocationRaw);
  const previousDisplay = clean(modal.dataset?.brandLocationDisplay);
  const raw = previousRaw && (visibleValue === previousRaw || visibleValue === previousDisplay)
    ? previousRaw
    : visibleValue;
  const display = displayName(raw, brands, country);
  modal.dataset.brandLocationRaw = raw;

  const replaceVisibleName = (node) => {
    if (!node) return;
    const current = String(node.textContent ?? '');
    let next = current;
    if (previousDisplay && previousDisplay !== display) next = next.replaceAll(previousDisplay, display);
    if (raw !== display) next = next.replaceAll(raw, display);
    if (next !== current) node.textContent = next;
  };

  replaceVisibleName(title);
  replaceVisibleName(note);
  modal.dataset.brandLocationDisplay = display;
}

export function installBrandLocationMapButtonHandler({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  if (!documentRef || !windowRef) return () => {};
  const existing = mapButtonHandlers.get(documentRef);
  if (existing) return existing.cleanup;

  const handler = (event) => {
    const target = event.target;
    const button = target?.closest?.('#item-list button[data-brand-location-map-query]');
    if (!button) return;
    const query = clean(button.dataset?.brandLocationMapQuery);
    if (!query) return;
    const url = createGoogleMapsUrl(query);
    if (!url) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    windowRef.open(url, '_blank', 'noopener,noreferrer');
  };

  const cleanup = () => {
    documentRef.removeEventListener('click', handler, true);
    mapButtonHandlers.delete(documentRef);
  };
  documentRef.addEventListener('click', handler, true);
  mapButtonHandlers.set(documentRef, { handler, cleanup });
  return cleanup;
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
  updateItemLocationButtons(documentRef, brands, country);
  updateManagementLocationRows(documentRef, brands, country);
  updateItemLocationPicker(documentRef, brands, country);
  updateItemDetailLocationLabels(documentRef, brands, country);
  updateFilterDeleteWarning(documentRef, brands, country);
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
  const removeMapButtonHandler = installBrandLocationMapButtonHandler({ documentRef, windowRef });

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

  const observers = [];
  const observedRoots = new WeakSet();
  function observeRoot(root) {
    if (!MutationObserverImpl || !root || observedRoots.has(root)) return;
    const observer = new MutationObserverImpl(schedule);
    observer.observe(root, { childList: true, subtree: true });
    observedRoots.add(root);
    observers.push(observer);
  }

  function observeKnownRoots() {
    [
      documentRef.getElementById('location-filters'),
      documentRef.getElementById('item-list'),
      documentRef.getElementById('add-modal-content'),
      documentRef.getElementById('manage-filter-modal'),
      documentRef.getElementById('filter-delete-warning-modal')
    ].forEach(observeRoot);
  }

  observeKnownRoots();
  let bodyObserver = null;
  if (MutationObserverImpl && documentRef.body) {
    bodyObserver = new MutationObserverImpl(() => {
      observeKnownRoots();
      schedule();
    });
    bodyObserver.observe(documentRef.body, { childList: true, subtree: false });
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
    bodyObserver?.disconnect();
    removeMapButtonHandler();
    windowRef.removeEventListener('shopping-list:active-trip-changed', schedule);
    windowRef.removeEventListener('shopping-list:trips-changed', schedule);
  };
}
