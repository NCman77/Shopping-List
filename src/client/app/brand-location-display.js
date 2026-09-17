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

function displayLocation(raw, brands, country) {
  return resolveLocationDisplayName(raw, brands, country) || raw;
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
    const display = displayLocation(raw, brands, country);
    button.dataset.brandLocationRaw = raw;
    button.dataset.filterPickerLabel = display;
    if (clean(button.textContent) !== display) button.textContent = display;
  });
}

function updateManagementLocations(documentRef, brands, country) {
  const title = clean(documentRef.getElementById('manage-filter-title')?.textContent);
  if (!title.includes('地點')) return;
  documentRef.querySelectorAll('#manage-filter-list .manage-row').forEach((row) => {
    const label = row.querySelector('.manage-option-name');
    if (!label) return;
    const raw = clean(row.dataset?.manageValue || label.textContent);
    if (!raw) return;
    row.dataset.manageValue = raw;
    const display = displayLocation(raw, brands, country);
    label.textContent = display;
    const renameButton = row.querySelector('.rename-option');
    if (renameButton) renameButton.setAttribute('aria-label', `重新命名地點${display}`);
  });
}

function findLocationChoice(documentRef, raw) {
  return [...documentRef.querySelectorAll('#item-multi-location-options .multi-location-choice[data-location]')]
    .find((button) => clean(button.dataset?.location) === raw) || null;
}

function updateVisibleLocationPicker(documentRef, brands, country) {
  documentRef.querySelectorAll('#item-multi-location-select option[value]').forEach((option) => {
    const raw = clean(option.value);
    if (!raw) return;
    option.textContent = displayLocation(raw, brands, country);
  });

  documentRef.querySelectorAll('#item-multi-location-chips .multi-location-remove[data-location]').forEach((removeButton) => {
    const raw = clean(removeButton.dataset?.location);
    const chip = removeButton.parentElement;
    const label = chip?.querySelector('span');
    if (!raw || !label) return;
    const sourceChoice = findLocationChoice(documentRef, raw);
    const isOld = sourceChoice && clean(sourceChoice.textContent) === `${raw}（舊）`;
    const display = displayLocation(raw, brands, country);
    label.textContent = isOld ? `${display}（舊）` : display;
    removeButton.setAttribute('aria-label', `移除${display}`);
  });
}

function updateItemLocationLinks(documentRef, brands, country) {
  documentRef.querySelectorAll('#item-list a[href*="google.com/maps/search"]').forEach((link) => {
    const raw = rawLocationFromMapsLink(link);
    if (!raw) return;
    link.dataset.brandLocationRaw = raw;
    const display = displayLocation(raw, brands, country);
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
    const display = displayLocation(raw, brands, country);
    const mapQuery = resolveLocationMapQuery(raw, brands, country) || raw;
    button.dataset.brandLocationRaw = raw;
    button.dataset.brandLocationMapQuery = mapQuery;
    button.setAttribute('aria-label', `在 Google 地圖搜尋${display}附近分店`);
    if (clean(button.textContent) !== display) setButtonLabel(button, display);
  });
}

function updateItemDetailLocations(documentRef, brands, country) {
  documentRef.querySelectorAll('#item-detail-view button').forEach((button) => {
    const icon = button.querySelector('i.fa-location-dot');
    const label = button.querySelector('span.flex-1');
    if (!icon || !label) return;
    const raw = clean(button.dataset?.brandLocationRaw || label.textContent);
    if (!raw) return;
    const display = displayLocation(raw, brands, country);
    const mapQuery = resolveLocationMapQuery(raw, brands, country) || raw;
    button.dataset.brandLocationRaw = raw;
    button.dataset.brandLocationMapQuery = mapQuery;
    label.textContent = display;
  });
}

function updateFilterDeleteWarning(documentRef, brands, country) {
  const modal = documentRef.getElementById('filter-delete-warning-modal');
  const title = modal?.querySelector('#filter-delete-title');
  if (!modal || !title) return;
  const current = clean(title.textContent);
  const priorDisplay = clean(title.dataset?.brandLocationDisplay);
  let raw = clean(title.dataset?.brandLocationRaw);
  const expectedPrior = priorDisplay ? `刪除地點「${priorDisplay}」？` : '';
  if (!raw || (current && current !== expectedPrior)) {
    const match = current.match(/^刪除地點「(.+)」？$/u);
    raw = clean(match?.[1]);
  }
  if (!raw) return;
  const display = displayLocation(raw, brands, country);
  title.dataset.brandLocationRaw = raw;
  title.dataset.brandLocationDisplay = display;
  title.textContent = `刪除地點「${display}」？`;
  const note = modal.querySelector('#filter-delete-retain-note');
  if (note && raw !== display) note.textContent = note.textContent.replaceAll(raw, display);
}

function updateRenameSummary(documentRef, brands, country) {
  const title = clean(documentRef.getElementById('filter-rename-title')?.textContent);
  if (!title.includes('地點')) return;
  const input = documentRef.getElementById('filter-rename-input');
  const summary = documentRef.getElementById('filter-rename-summary');
  const raw = clean(input?.value);
  if (!raw || !summary) return;
  const display = displayLocation(raw, brands, country);
  summary.textContent = `「${display}」會同步更新所有已新增商品。`;
}

function updateDuplicateWarning(documentRef, brands, country) {
  const modal = documentRef.getElementById('location-duplicate-confirm-modal');
  const title = documentRef.getElementById('location-duplicate-title');
  if (!modal || !title) return;
  const raw = clean(title.dataset?.brandLocationRaw);
  if (!raw) return;
  title.textContent = `可能已存在「${displayLocation(raw, brands, country)}」`;
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
    const button = target?.closest?.('#item-list button[data-brand-location-map-query], #item-detail-view button[data-brand-location-map-query]');
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
  updateManagementLocations(documentRef, brands, country);
  updateVisibleLocationPicker(documentRef, brands, country);
  updateItemLocationLinks(documentRef, brands, country);
  updateItemLocationButtons(documentRef, brands, country);
  updateItemDetailLocations(documentRef, brands, country);
  updateFilterDeleteWarning(documentRef, brands, country);
  updateRenameSummary(documentRef, brands, country);
  updateDuplicateWarning(documentRef, brands, country);
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

  const roots = [
    documentRef.getElementById('location-filters'),
    documentRef.getElementById('item-list'),
    documentRef.getElementById('manage-filter-modal'),
    documentRef.getElementById('add-modal-content')
  ].filter(Boolean);
  const observers = [];
  if (MutationObserverImpl) {
    for (const root of roots) {
      const observer = new MutationObserverImpl(schedule);
      observer.observe(root, { childList: true, subtree: true, characterData: true });
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
    removeMapButtonHandler();
    windowRef.removeEventListener('shopping-list:active-trip-changed', schedule);
    windowRef.removeEventListener('shopping-list:trips-changed', schedule);
  };
}