import { createGoogleMapsUrl } from '../utils/url-utils.js';
import { normalizeMapsApiKeys, resolveMapsPlacesEnabled } from '../location/places-usage-policy.js';

const APP_ID = 'japan-shopping-app';
let runtimeGuardInstalled = false;
let runtimeSettingsHandler = null;

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
        reject(new Error('等待 Maps 模式設定初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function redactRuntimeKeys(generation = 0) {
  if (typeof window === 'undefined') return;
  window.shoppingListMapsPlacesEnabled = false;
  window.shoppingListMapsApiKeys = { primary: '', backup: '', generation: Number(generation) || 0 };
  window.shoppingListMapsBrowserApiKey = '';
}

export function installMapsSettingsRuntimeGuard() {
  if (typeof window === 'undefined' || runtimeGuardInstalled) return;
  runtimeGuardInstalled = true;
  redactRuntimeKeys(Number(window.shoppingListMapsApiKeys?.generation) || 0);
  window.addEventListener('shopping-list:maps-settings-changed', (event) => {
    if (typeof runtimeSettingsHandler === 'function') {
      runtimeSettingsHandler(event);
      return;
    }
    redactRuntimeKeys(Number(event?.detail?.generation) || 0);
  }, { capture: true });
}

function ensureModeToggle() {
  if (document.getElementById('account-maps-mode-panel')) return;
  const content = document.querySelector('#account-maps-view > .p-4.space-y-4');
  if (!content) return;
  const panel = document.createElement('div');
  panel.id = 'account-maps-mode-panel';
  panel.className = 'rounded-2xl bg-pastelGreen/35 border-2 border-warmBrown/20 p-3 text-warmBrown';
  panel.innerHTML = `
    <label class="flex items-center justify-between gap-4 cursor-pointer" for="account-maps-places-enabled">
      <span class="min-w-0"><span class="block text-sm font-bold">Google Maps / Places</span><span id="account-maps-mode-description" class="block text-[10px] text-gray-500 mt-1">載入設定中…</span></span>
      <input id="account-maps-places-enabled" type="checkbox" class="w-5 h-5 shrink-0 accent-current">
    </label>`;
  content.prepend(panel);
}

export async function initMapsModeEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListMapsModeEnhancementsInitialized) return;
  window.__shoppingListMapsModeEnhancementsInitialized = true;
  installMapsSettingsRuntimeGuard();

  const state = {
    userId: '',
    mapsPlacesEnabled: false,
    mapsApiKeys: { primary: '', backup: '' },
    generation: Number(window.shoppingListMapsApiKeys?.generation) || 0,
    settingsUnsub: null,
    itemsUnsub: null,
    items: new Map(),
    suggestionsObserver: null
  };
  let toggle = null;
  let description = null;

  function renderMode() {
    if (toggle) toggle.checked = Boolean(state.mapsPlacesEnabled);
    if (description) {
      description.textContent = state.mapsPlacesEnabled
        ? '開啟：使用 Places API、自動完成與網站內附近分店距離搜尋。'
        : '關閉：不使用 Places API；點「距離」直接用商店名稱開啟 Google Maps。';
    }
    const status = document.getElementById('account-maps-status');
    if (!status) return;
    if (!state.mapsPlacesEnabled) status.textContent = 'Google Maps / Places · 已關閉（距離使用 Google Maps）';
    else if (!state.mapsApiKeys.primary) status.textContent = 'Google Maps / Places · 已開啟 · 尚未設定 Key';
    else if (state.mapsApiKeys.backup) status.textContent = 'Google Maps / Places · 已開啟 · 主要 + 備用已設定';
    else status.textContent = 'Google Maps / Places · 已開啟 · 主要 Key 已設定';
  }

  function publishRuntime() {
    window.shoppingListMapsPlacesEnabled = Boolean(state.mapsPlacesEnabled);
    const generation = Number(state.generation) || 0;
    if (state.mapsPlacesEnabled) {
      window.shoppingListMapsApiKeys = {
        primary: state.mapsApiKeys.primary,
        backup: state.mapsApiKeys.backup,
        generation
      };
      window.shoppingListMapsBrowserApiKey = state.mapsApiKeys.primary;
    } else {
      redactRuntimeKeys(generation);
    }
    renderMode();
  }

  runtimeSettingsHandler = (event) => {
    const detailKeys = event?.detail?.mapsApiKeys || {};
    state.mapsApiKeys = {
      primary: clean(detailKeys.primary),
      backup: clean(detailKeys.backup)
    };
    state.generation = Number(event?.detail?.generation) || state.generation;
    if (!state.mapsPlacesEnabled) redactRuntimeKeys(state.generation);
    queueMicrotask(renderMode);
  };

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'),
    waitFor(() => document.getElementById('account-maps-view')).then(() => {
      ensureModeToggle();
      toggle = document.getElementById('account-maps-places-enabled');
      description = document.getElementById('account-maps-mode-description');
      renderMode();
    })
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, setDoc } = firestoreSdk;

  function settingsRef(userId = state.userId) {
    return userId ? doc(db, 'artifacts', APP_ID, 'users', userId, 'settings', 'preferences') : null;
  }

  function hidePlacesSuggestionsWhenDisabled() {
    if (state.mapsPlacesEnabled) return;
    const box = document.getElementById('store-suggestions');
    if (!box || box.classList.contains('hidden')) return;
    box.classList.add('hidden');
  }

  function observeSuggestionBox() {
    const box = document.getElementById('store-suggestions');
    if (!box || state.suggestionsObserver) return;
    state.suggestionsObserver = new MutationObserver(hidePlacesSuggestionsWhenDisabled);
    state.suggestionsObserver.observe(box, { attributes: true, childList: true, subtree: true });
    hidePlacesSuggestionsWhenDisabled();
  }

  function queryForItem(item = {}) {
    return clean(item.storeName || item.storeDisplayName || item.address);
  }

  function openGoogleMapsForItem(item) {
    const query = queryForItem(item);
    const url = createGoogleMapsUrl(query);
    if (!url) {
      notify('缺少商店名稱', '請先在商品的「商店」欄輸入商店名稱。');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleDistanceClick(event) {
    if (state.mapsPlacesEnabled) return;
    const button = event.target?.closest?.('.nearby-distance-action');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = button.closest('[data-enhanced-item-id]');
    const itemId = clean(card?.dataset?.enhancedItemId);
    const item = state.items.get(itemId);
    if (!item) {
      notify('商品資料尚未同步', '請稍後再點一次「距離」。');
      return;
    }
    openGoogleMapsForItem(item);
  }

  async function saveMode(nextEnabled) {
    if (!state.userId || !auth.currentUser) return;
    const savingUserId = state.userId;
    const previous = state.mapsPlacesEnabled;
    state.mapsPlacesEnabled = Boolean(nextEnabled);
    publishRuntime();
    hidePlacesSuggestionsWhenDisabled();
    try {
      const ref = settingsRef(savingUserId);
      await setDoc(ref, { mapsPlacesEnabled: Boolean(nextEnabled) }, { merge: true });
      if (state.userId !== savingUserId || auth.currentUser?.uid !== savingUserId) return;
      notify(
        nextEnabled ? 'Places API 已開啟' : 'Places API 已關閉',
        nextEnabled ? '「距離」會使用網站內附近分店搜尋。' : '「距離」現在會直接開啟 Google Maps 搜尋商店。',
        'success'
      );
    } catch (error) {
      console.error('Save Maps mode failed:', error);
      if (state.userId !== savingUserId || auth.currentUser?.uid !== savingUserId) return;
      state.mapsPlacesEnabled = previous;
      publishRuntime();
      notify('設定儲存失敗', '無法更新 Google Maps / Places 開關，已恢復原設定。', 'error');
    }
  }

  function applyPreferences(data = {}) {
    const normalized = normalizeMapsApiKeys(data);
    state.mapsApiKeys = { primary: normalized.primary, backup: normalized.backup };
    state.mapsPlacesEnabled = resolveMapsPlacesEnabled(data);
    state.generation = Number(window.shoppingListMapsApiKeys?.generation) || state.generation;
    publishRuntime();
    hidePlacesSuggestionsWhenDisabled();
  }

  function subscribeUser(user) {
    state.settingsUnsub?.();
    state.itemsUnsub?.();
    state.settingsUnsub = null;
    state.itemsUnsub = null;
    state.userId = user?.uid || '';
    state.mapsApiKeys = { primary: '', backup: '' };
    state.mapsPlacesEnabled = false;
    state.items.clear();
    publishRuntime();
    if (!user) return;

    state.settingsUnsub = onSnapshot(settingsRef(user.uid), (snapshot) => {
      if (state.userId !== user.uid) return;
      applyPreferences(snapshot.exists() ? snapshot.data() : {});
    }, (error) => console.error('Maps mode settings listener failed:', error));

    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items.clear();
      snapshot.forEach((entry) => state.items.set(entry.id, { id: entry.id, ...entry.data() }));
    }, (error) => console.error('Maps mode items listener failed:', error));
  }

  toggle?.addEventListener('change', () => void saveMode(Boolean(toggle.checked)));
  document.addEventListener('click', handleDistanceClick, true);
  document.addEventListener('focusin', observeSuggestionBox, true);
  document.addEventListener('input', hidePlacesSuggestionsWhenDisabled);

  authSdk.onAuthStateChanged(auth, subscribeUser);
  observeSuggestionBox();
}
