import { loadPlacesLibrary, loadPlacesLibraryWithFailover } from '../location/google-places-loader.js';
import { getCurrentPosition } from '../location/browser-location.js';
import { fetchStoreSuggestions, resolveStoreSuggestion, searchStoresByText } from '../location/store-places.js';
import { formatDistance } from '../location/distance.js';
import {
  AUTOCOMPLETE_DEBOUNCE_MS,
  NearbySearchCache,
  autocompleteMode,
  classifyMapsError,
  makeNearbyCacheKey
} from '../location/places-usage-policy.js';
import { registerItemSaveSnapshotProvider } from './item-save-operation.js';

const APP_ID = 'japan-shopping-app';
const nearbyCache = new NearbySearchCache();
let branchSearchInFlight = null;

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
        reject(new Error('等待商店距離功能初始化逾時。'));
      }
    }, 40);
  });
}

function clean(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'warn'](`${title}: ${message}`);
}

export function createPlaceMapsUrl(place = {}) {
  const query = clean(place.displayName || place.address);
  if (!query) return '';
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  if (clean(place.placeId)) url.searchParams.set('query_place_id', clean(place.placeId));
  return url.toString();
}

function emptyPlacePatch() {
  return {
    storePlaceId: '',
    storeDisplayName: '',
    storeAddress: '',
    storeLat: null,
    storeLng: null,
    storeResolvedAt: null
  };
}

export function buildSelectedStorePatch({ storeName = '', place = null, resolvedAt = Date.now() } = {}) {
  if (!place) return { storeName: clean(storeName), ...emptyPlacePatch() };
  return {
    storeName: clean(storeName) || clean(place.displayName),
    storePlaceId: clean(place.placeId),
    storeDisplayName: clean(place.displayName),
    storeAddress: clean(place.address),
    storeLat: Number(place.lat),
    storeLng: Number(place.lng),
    storeResolvedAt: resolvedAt
  };
}

export function branchSearchQuery(item = {}) {
  return clean(item?.storeName) || clean(item?.storeDisplayName);
}

export async function initStoreLocationEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListStoreLocationInitialized) return;
  window.__shoppingListStoreLocationInitialized = true;

  await waitFor(() => (
    typeof window.saveItem === 'function'
    && typeof window.openAddModal === 'function'
    && typeof window.openEditModal === 'function'
    && document.getElementById('item-address')
  ));

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, updateDoc } = firestoreSdk;

  const state = {
    userId: auth.currentUser?.uid || '',
    items: new Map(),
    itemsUnsub: null,
    selectedPlace: null,
    storeTouched: false,
    addressTouched: false,
    suggestionTimer: null,
    suggestionRequest: 0,
    sessionToken: null,
    resolvedStoreValue: '',
    branchItemId: '',
    branchOrigin: null,
    branchRequest: 0,
    credentialGeneration: Number(window.shoppingListMapsApiKeys?.generation) || 0,
    activeKeySlot: '',
    listObserver: null
  };

  function itemRef(itemId, userId = state.userId) {
    return doc(db, 'artifacts', APP_ID, 'users', userId, 'items', itemId);
  }

  function runtimeMapsKeys() {
    const runtime = window.shoppingListMapsApiKeys || {};
    return {
      primary: clean(runtime.primary || window.shoppingListMapsBrowserApiKey),
      backup: clean(runtime.backup),
      generation: Number(runtime.generation) || state.credentialGeneration || 0
    };
  }

  async function placesLibrary() {
    const keys = runtimeMapsKeys();
    if (!keys.primary) throw new Error('尚未設定 Google Maps / Places API Key，請到帳號設定 → API 設定完成設定。');
    const loaded = await loadPlacesLibraryWithFailover({
      primaryKey: keys.primary,
      backupKey: keys.backup
    });
    state.activeKeySlot = loaded.keySlot;
    return loaded.library;
  }

  function resetSuggestionSession({ invalidate = true } = {}) {
    clearTimeout(state.suggestionTimer);
    state.suggestionTimer = null;
    state.sessionToken = null;
    if (invalidate) state.suggestionRequest += 1;
  }

  function ensureStoreField() {
    if (document.getElementById('item-store-name')) return;
    const addressInput = document.getElementById('item-address');
    const addressField = addressInput?.parentElement?.parentElement;
    const purchaseMetaRow = document.getElementById('item-location')?.closest('.flex-1')?.parentElement;
    if (!addressField) return;

    if (purchaseMetaRow) {
      purchaseMetaRow.id = 'item-purchase-meta-row';
      purchaseMetaRow.className = 'grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] gap-3 items-start';
      for (const child of purchaseMetaRow.children) child.classList.add('min-w-0');
    }

    const field = document.createElement('div');
    field.id = 'item-store-field';
    field.className = 'relative min-w-0';
    field.innerHTML = `
      <label class="block text-sm font-bold text-warmBrown mb-2 ml-1">商店</label>
      <input type="text" id="item-store-name" autocomplete="off" class="w-full bg-shinBg border-2 border-warmBrown rounded-2xl px-3 py-3 focus:outline-none focus:bg-white focus:border-4 transition-all font-medium text-warmBrown placeholder-gray-300 min-w-0" placeholder="例如：松本清">
      <div id="store-suggestions" class="hidden absolute z-[120] right-0 w-[min(92vw,24rem)] mt-1 max-h-52 overflow-y-auto bg-white border-2 border-warmBrown rounded-2xl shadow-lg"></div>`;

    if (purchaseMetaRow) purchaseMetaRow.appendChild(field);
    else addressField.insertAdjacentElement('beforebegin', field);

    const input = field.querySelector('#item-store-name');
    input.addEventListener('input', () => {
      state.storeTouched = true;
      state.selectedPlace = null;
      state.resolvedStoreValue = '';
      scheduleSuggestions(input.value);
    });
    input.addEventListener('focus', () => {
      const value = clean(input.value);
      if (value && value !== state.resolvedStoreValue) scheduleSuggestions(value);
    });
    document.getElementById('item-address')?.addEventListener('input', () => {
      state.addressTouched = true;
      if (!state.selectedPlace) return;
      state.selectedPlace = null;
    });
  }

  function hideSuggestions() {
    const box = document.getElementById('store-suggestions');
    if (!box) return;
    box.replaceChildren();
    box.classList.add('hidden');
  }

  function showManualSuggestionSearch(query) {
    const box = document.getElementById('store-suggestions');
    const value = clean(query);
    if (!box || !value) return hideSuggestions();
    box.replaceChildren();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'w-full text-left px-4 py-3 text-sm font-bold text-warmBrown hover:bg-shinBg';
    button.textContent = `搜尋「${value}」`;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => void runManualSuggestionSearch(value));
    box.appendChild(button);
    box.classList.remove('hidden');
  }

  async function runManualSuggestionSearch(value = document.getElementById('item-store-name')?.value) {
    const query = clean(value);
    if (!query) return hideSuggestions();
    clearTimeout(state.suggestionTimer);
    state.suggestionTimer = null;
    state.suggestionRequest += 1;
    const requestId = state.suggestionRequest;
    await renderSuggestions(query, requestId, { force: true });
  }

  async function renderSuggestions(input, requestId, { force = false } = {}) {
    const box = document.getElementById('store-suggestions');
    if (!box || requestId !== state.suggestionRequest) return;
    const query = clean(input);
    const mode = autocompleteMode(query);
    if (mode === 'none') return hideSuggestions();
    if (mode === 'manual' && !force) return showManualSuggestionSearch(query);

    try {
      const library = await placesLibrary();
      if (requestId !== state.suggestionRequest) return;
      if (!state.sessionToken && typeof library.AutocompleteSessionToken === 'function') {
        state.sessionToken = new library.AutocompleteSessionToken();
      }
      const suggestions = await fetchStoreSuggestions({
        input: query,
        origin: window.shoppingListNearbySort?.origin || null,
        placesLibrary: library,
        sessionToken: state.sessionToken
      });
      if (requestId !== state.suggestionRequest) return;
      box.replaceChildren();
      if (!suggestions.length) {
        box.innerHTML = '<div class="p-3 text-xs text-gray-400">找不到符合的店家，可繼續手動輸入。</div>';
        box.classList.remove('hidden');
        return;
      }
      for (const suggestion of suggestions.slice(0, 8)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'w-full text-left px-4 py-3 border-b border-warmBrown/10 last:border-b-0 text-sm text-warmBrown hover:bg-shinBg';
        button.textContent = suggestion.label;
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const place = await resolveStoreSuggestion(suggestion);
            if (!place) throw new Error('無法取得這間店的詳細資料。');
            if (requestId !== state.suggestionRequest) return;
            state.selectedPlace = place;
            state.storeTouched = true;
            state.addressTouched = false;
            state.resolvedStoreValue = query;
            document.getElementById('item-store-name').value = query;
            document.getElementById('item-address').value = place.address || '';
            resetSuggestionSession({ invalidate: false });
            hideSuggestions();
          } catch (error) {
            notify('店家資料讀取失敗', error.message || '請稍後再試。');
          } finally {
            button.disabled = false;
          }
        });
        box.appendChild(button);
      }
      box.classList.remove('hidden');
    } catch (error) {
      if (requestId !== state.suggestionRequest) return;
      const kind = classifyMapsError(error);
      let message = error?.message || 'Google Maps / Places 暫時無法使用。';
      if (kind === 'quota') message = 'Google Maps 配額已達限制，請到 Google Cloud Console 檢查 quota；網站不會自動切換備用 Key。';
      if (kind === 'billing') message = 'Google Maps 計費目前不可用，請到 Google Cloud Console 檢查 Billing；網站不會自動切換備用 Key。';
      box.innerHTML = `<div class="p-3 text-xs text-gray-500">${escapeHtml(message)}</div>`;
      box.classList.remove('hidden');
    }
  }

  function scheduleSuggestions(value) {
    clearTimeout(state.suggestionTimer);
    state.suggestionTimer = null;
    state.suggestionRequest += 1;
    const requestId = state.suggestionRequest;
    const mode = autocompleteMode(value);
    if (mode === 'none') return hideSuggestions();
    if (mode === 'manual') return showManualSuggestionSearch(value);
    state.suggestionTimer = setTimeout(() => void renderSuggestions(value, requestId), AUTOCOMPLETE_DEBOUNCE_MS);
  }

  function resetFormStore() {
    ensureStoreField();
    resetSuggestionSession();
    state.selectedPlace = null;
    state.storeTouched = false;
    state.addressTouched = false;
    state.resolvedStoreValue = '';
    const input = document.getElementById('item-store-name');
    if (input) input.value = '';
    hideSuggestions();
  }

  function populateFormStore(item) {
    ensureStoreField();
    resetSuggestionSession();
    state.selectedPlace = null;
    state.storeTouched = false;
    state.addressTouched = false;
    const input = document.getElementById('item-store-name');
    const value = branchSearchQuery(item);
    if (input) input.value = value;
    state.resolvedStoreValue = clean(item?.storePlaceId) ? value : '';
    hideSuggestions();
  }

  function buildStorePatch() {
    const storeName = clean(document.getElementById('item-store-name')?.value);
    if (state.selectedPlace) {
      return buildSelectedStorePatch({ storeName, place: state.selectedPlace, resolvedAt: Date.now() });
    }
    if (state.storeTouched) return { storeName, ...emptyPlacePatch() };
    if (state.addressTouched) return emptyPlacePatch();
    return null;
  }

  registerItemSaveSnapshotProvider('store-location', () => buildStorePatch());

  const originalOpenAdd = window.openAddModal;
  window.openAddModal = function(...args) {
    const result = originalOpenAdd.apply(this, args);
    resetFormStore();
    return result;
  };

  const originalOpenEdit = window.openEditModal;
  window.openEditModal = function(id, ...args) {
    const result = originalOpenEdit.call(this, id, ...args);
    populateFormStore(state.items.get(clean(id)) || null);
    return result;
  };

  const originalSave = window.saveItem;
  window.saveItem = async function(...args) {
    const operation = args[0]?.operationId
      ? args[0]
      : window.beginShoppingListSaveOperation();
    if (!operation) return null;
    const patch = operation.extensions?.['store-location'];
    const result = await originalSave.apply(this, [operation, ...args.slice(1)]);
    if (!patch) return result;
    const baseSaveSucceeded = Boolean(
      result?.succeeded
      && result.operationId === operation.operationId
      && result.itemId === operation.itemId
      && result.userId === operation.userId
      && auth.currentUser?.uid === operation.userId
      && state.userId === operation.userId
    );
    if (!baseSaveSucceeded) return result;
    try {
      await updateDoc(itemRef(operation.itemId, operation.userId), patch);
      const current = state.items.get(operation.itemId) || {};
      state.items.set(operation.itemId, { ...current, ...patch });
    } catch (error) {
      console.error('Store metadata save failed:', error);
      notify('商品已儲存，但店家位置未同步', '商品本身已安全儲存；Google 店家資料沒有寫入，可稍後重新編輯再試。');
    }
    return result;
  };

  function ensureBranchModal() {
    if (document.getElementById('nearby-branch-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'nearby-branch-modal';
    modal.className = 'fixed inset-0 z-[130] hidden bg-warmBrown/45 backdrop-blur-sm px-4 items-end sm:items-center justify-center';
    modal.innerHTML = `
      <div class="w-full max-w-md max-h-[82vh] bg-white border-4 border-warmBrown rounded-t-[2rem] sm:rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,0.25)] overflow-hidden">
        <div class="px-5 py-4 bg-pastelBlue border-b-4 border-warmBrown flex items-center justify-between gap-3">
          <div><h3 class="font-bold text-warmBrown text-lg">附近分店</h3><p class="text-[11px] text-warmBrown/60">依目前位置由近到遠</p></div>
          <button id="nearby-branch-close" type="button" class="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-4 bg-shinBg border-b-2 border-warmBrown/20">
          <div class="flex gap-2"><input id="nearby-branch-query" type="text" autocomplete="off" class="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold outline-none" placeholder="輸入商店名稱，例如：松本清"><button id="nearby-branch-search" type="button" class="px-4 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold">搜尋</button></div>
          <p id="nearby-branch-status" class="text-[11px] text-gray-500 mt-2 min-h-4"></p>
        </div>
        <div id="nearby-branch-results" class="max-h-[55vh] overflow-y-auto divide-y divide-warmBrown/10"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#nearby-branch-close').addEventListener('click', closeBranchModal);
    modal.addEventListener('click', (event) => { if (event.target === modal) closeBranchModal(); });
    modal.querySelector('#nearby-branch-search').addEventListener('click', () => void runBranchSearch());
    modal.querySelector('#nearby-branch-query').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); void runBranchSearch(); }
    });
  }

  function closeBranchModal() {
    const modal = document.getElementById('nearby-branch-modal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    state.branchItemId = '';
    state.branchOrigin = null;
    state.branchRequest += 1;
    branchSearchInFlight = null;
  }

  function openBranchModal(item) {
    ensureBranchModal();
    state.branchItemId = clean(item?.id);
    state.branchOrigin = null;
    state.branchRequest += 1;
    branchSearchInFlight = null;
    const modal = document.getElementById('nearby-branch-modal');
    const query = document.getElementById('nearby-branch-query');
    const results = document.getElementById('nearby-branch-results');
    const status = document.getElementById('nearby-branch-status');
    query.value = branchSearchQuery(item);
    results.replaceChildren();
    status.textContent = query.value ? '已帶入商店名稱，按搜尋取得附近分店。' : '請先輸入商店名稱，再按搜尋。';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (!query.value) setTimeout(() => query.focus(), 60);
  }

  function renderBranchResults(branches, query, { cached = false } = {}) {
    const status = document.getElementById('nearby-branch-status');
    const results = document.getElementById('nearby-branch-results');
    if (!status || !results) return;
    results.replaceChildren();
    if (!branches.length) {
      status.textContent = '附近找不到符合的分店；可換關鍵字再試。';
      return;
    }
    status.textContent = `找到 ${branches.length} 間，已依直線距離由近到遠排列。${cached ? '（使用短暫快取）' : ''}`;
    for (const branch of branches) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'w-full text-left p-4 bg-white hover:bg-shinBg flex gap-3 items-start';
      row.innerHTML = `<span class="shrink-0 min-w-[4rem] text-sm font-black text-warmBrown">${escapeHtml(formatDistance(branch.distanceMeters))}</span><span class="min-w-0"><span class="block font-bold text-warmBrown">${escapeHtml(branch.displayName || query)}</span><span class="block text-xs text-gray-500 mt-1">${escapeHtml(branch.address)}</span><span class="block text-[10px] text-blue-500 mt-1">點一下在 Google Maps 開啟</span></span>`;
      row.addEventListener('click', () => {
        const url = createPlaceMapsUrl(branch);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      });
      results.appendChild(row);
    }
  }

  function branchErrorMessage(error) {
    const kind = classifyMapsError(error);
    if (kind === 'quota') return { kind, title: 'Google Maps 配額已達限制', message: '請到 Google Cloud Console 檢查 quota／配額；網站不會自動切換備用 Key。' };
    if (kind === 'billing') return { kind, title: 'Google Maps 計費不可用', message: '請到 Google Cloud Console 檢查 Billing；網站不會自動切換備用 Key。' };
    if (kind === 'credential') return { kind, title: 'Google Maps API Key 無法使用', message: '請到帳號設定 → API 設定檢查 Browser Key、HTTP referrer 與 API restrictions。' };
    const message = error?.message || 'Google Maps / Places 或定位暫時無法使用。';
    if (/定位|權限/.test(message)) return { kind: 'location', title: '無法使用定位', message };
    return { kind, title: '附近分店搜尋失敗', message };
  }

  async function runBranchSearch() {
    const itemId = clean(state.branchItemId);
    const item = state.items.get(itemId);
    if (!item) return;
    const query = clean(document.getElementById('nearby-branch-query')?.value);
    const status = document.getElementById('nearby-branch-status');
    const results = document.getElementById('nearby-branch-results');
    if (!query) {
      if (status) status.textContent = '請輸入商店名稱。';
      return;
    }

    const userId = state.userId;
    const earlyKey = `${userId}|${itemId}|${query.toLocaleLowerCase()}`;
    if (branchSearchInFlight?.earlyKey === earlyKey) return branchSearchInFlight.promise;
    const requestId = ++state.branchRequest;

    if (results) results.replaceChildren();
    if (status) status.textContent = '正在取得定位並搜尋附近分店…';

    const promise = (async () => {
      try {
        const origin = await getCurrentPosition();
        if (requestId !== state.branchRequest || state.userId !== userId || state.branchItemId !== itemId) return;
        state.branchOrigin = origin;

        const keys = runtimeMapsKeys();
        const credentialGeneration = keys.generation;
        state.credentialGeneration = credentialGeneration;
        const cacheKey = makeNearbyCacheKey({ query, origin, credentialGeneration });
        const cached = nearbyCache.get(cacheKey);
        if (cached !== undefined) {
          renderBranchResults(cached, query, { cached: true });
          return cached;
        }

        const library = await placesLibrary();
        if (requestId !== state.branchRequest || state.userId !== userId || state.branchItemId !== itemId) return;
        const branches = await searchStoresByText({ query, origin, placesLibrary: library });
        if (requestId !== state.branchRequest || state.userId !== userId || state.branchItemId !== itemId) return;
        nearbyCache.set(cacheKey, branches);
        renderBranchResults(branches, query);
        return branches;
      } catch (error) {
        if (requestId !== state.branchRequest) return;
        console.error('Nearby branch search failed:', error);
        const details = branchErrorMessage(error);
        if (status) status.textContent = details.message;
        notify(details.title, details.message);
      }
    })();

    branchSearchInFlight = { earlyKey, promise };
    try {
      return await promise;
    } finally {
      if (branchSearchInFlight?.promise === promise) branchSearchInFlight = null;
    }
  }

  async function testMapsKey(event) {
    const slot = clean(event?.detail?.slot) === 'backup' ? 'backup' : 'primary';
    const apiKey = clean(event?.detail?.apiKey);
    if (!apiKey) return;
    if (window.google?.maps?.importLibrary) {
      notify('重新載入後再測試', 'Google Maps 已在這個頁面載入；為避免把目前 Key 誤認成另一把 Key，請重新載入頁面後再測試指定 Key。');
      return;
    }
    try {
      await loadPlacesLibrary({ apiKey });
      notify(`${slot === 'backup' ? '備用' : '主要'} Key 測試成功`, 'Maps JavaScript API 與 Places library 已成功載入。', 'success');
    } catch (error) {
      const details = branchErrorMessage(error);
      notify(`${slot === 'backup' ? '備用' : '主要'} Key 測試失敗`, details.message, 'error');
    }
  }

  function enhanceDistanceActions() {
    for (const card of document.querySelectorAll('#item-list [data-enhanced-item-id]')) {
      const itemId = clean(card.dataset.enhancedItemId);
      const item = state.items.get(itemId);
      if (!item || card.querySelector('.nearby-distance-action')) continue;
      const actions = card.querySelector('.enhanced-item-actions');
      if (!actions || (!clean(item.address) && !branchSearchQuery(item))) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nearby-distance-action text-[10px] font-bold bg-pastelYellow text-warmBrown px-2.5 py-1 rounded-full border border-warmBrown hover:brightness-95';
      button.innerHTML = '<i class="fas fa-location-arrow mr-1"></i>距離';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openBranchModal(item);
      });
      actions.appendChild(button);
    }
  }

  function scheduleDistanceEnhancement() {
    queueMicrotask(() => queueMicrotask(enhanceDistanceActions));
  }

  function invalidatePlacesSession() {
    resetSuggestionSession();
    state.resolvedStoreValue = '';
    state.branchRequest += 1;
    branchSearchInFlight = null;
    nearbyCache.clear();
  }

  function subscribeUser(user) {
    state.itemsUnsub?.();
    state.itemsUnsub = null;
    invalidatePlacesSession();
    closeBranchModal();
    state.userId = user?.uid || '';
    state.items.clear();
    if (!user) return;
    const ref = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemsUnsub = onSnapshot(ref, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items.clear();
      snapshot.forEach((entry) => state.items.set(entry.id, { id: entry.id, ...entry.data() }));
      scheduleDistanceEnhancement();
    }, (error) => console.error('Store location item listener failed:', error));
  }

  ensureStoreField();
  ensureBranchModal();
  const list = document.getElementById('item-list');
  if (list) {
    state.listObserver = new MutationObserver(scheduleDistanceEnhancement);
    state.listObserver.observe(list, { childList: true, subtree: true });
  }
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#item-store-field')) hideSuggestions();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { resetSuggestionSession(); hideSuggestions(); } });
  window.addEventListener('shopping-list:active-trip-changed', scheduleDistanceEnhancement);
  window.addEventListener('shopping-list:maps-settings-changed', (event) => {
    state.credentialGeneration = Number(event?.detail?.generation) || runtimeMapsKeys().generation;
    state.activeKeySlot = '';
    invalidatePlacesSession();
  });
  window.addEventListener('shopping-list:maps-key-test-requested', (event) => void testMapsKey(event));
  authSdk.onAuthStateChanged(auth, subscribeUser);
  scheduleDistanceEnhancement();
}
