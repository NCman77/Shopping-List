import { DEFAULT_COUNTRY } from './travel-country.js';
import { ensureBrandLocationDefinitions } from './brand-driven-location-management.js';
import { findBrandForLocation } from './brand-location-resolver.js';

const APP_ID = 'japan-shopping-app';

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function sameCountry(left, right) {
  return clean(left).toLocaleLowerCase() === clean(right).toLocaleLowerCase();
}

function sameValues(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
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
        reject(new Error('等待品牌商店同步功能初始化逾時。'));
      }
    }, 40);
  });
}

function notify(windowRef, title, message, type = 'warning') {
  if (typeof windowRef?.showMsg === 'function') windowRef.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'warn'](`${title}: ${message}`);
}

export function brandLocationValuesForCountry(locations = [], brands = [], country = DEFAULT_COUNTRY) {
  const countryBrands = (Array.isArray(brands) ? brands : [])
    .filter((brand) => sameCountry(brand?.country, country));
  if (!countryBrands.length) return [];

  return (Array.isArray(locations) ? locations : []).filter((location) => {
    const raw = clean(location);
    if (!raw) return false;
    return Boolean(findBrandForLocation(countryBrands, raw, country));
  });
}

export async function initBrandStoreSync({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !windowRef) return () => {};
  if (windowRef.__shoppingListBrandStoreSyncInitialized) return () => {};
  windowRef.__shoppingListBrandStoreSyncInitialized = true;

  await waitFor(() => documentRef.body && documentRef.getElementById('location-filters'));

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, onSnapshot, setDoc } = firestoreSdk;

  const state = {
    userId: '',
    locations: [],
    brands: [],
    settingsLoaded: false,
    brandsLoaded: false,
    syncInFlight: false,
    settingsUnsub: null,
    brandsUnsub: null,
    externalContext: '',
    externalEditorOpened: false,
    couponWasVisible: false,
    priorMsgZIndex: '',
    pickerScheduled: false
  };

  function activeCountry() {
    return clean(windowRef.shoppingListActiveTrip?.country)
      || clean(windowRef.shoppingListActiveCountry)
      || DEFAULT_COUNTRY;
  }

  function settingsRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences') : null;
  }

  function dictionaryRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'brandDictionary') : null;
  }

  async function synchronizeLocationDefinitions() {
    if (!state.userId || !state.settingsLoaded || !state.brandsLoaded || state.syncInFlight) return;
    const next = ensureBrandLocationDefinitions(state.locations, state.brands);
    if (sameValues(next, state.locations)) return;

    const ref = settingsRef();
    if (!ref) return;
    state.syncInFlight = true;
    state.locations = next;
    try {
      await setDoc(ref, { locations: next }, { merge: true });
    } catch (error) {
      console.error('Brand store location synchronization failed:', error);
      notify(windowRef, '商店同步失敗', '品牌字典已保留，但「哪裡買」清單暫時無法同步。', 'error');
    } finally {
      state.syncInFlight = false;
    }
  }

  function filterVisibleLocationPicker() {
    state.pickerScheduled = false;
    const select = documentRef.getElementById('item-multi-location-select');
    if (!select) return;
    const allowed = new Set(brandLocationValuesForCountry(state.locations, state.brands, activeCountry()));
    select.querySelectorAll('option[value]').forEach((option) => {
      const raw = clean(option.value);
      if (!raw) return;
      const enabled = allowed.has(raw);
      option.hidden = !enabled;
      option.disabled = !enabled;
    });
  }

  function schedulePickerFilter() {
    if (state.pickerScheduled) return;
    state.pickerScheduled = true;
    queueMicrotask(filterVisibleLocationPicker);
  }

  function removeHomepageLegacyAddButton() {
    const row = documentRef.getElementById('location-filters')?.parentElement;
    if (!row) return;
    [...row.querySelectorAll('button')].forEach((button) => {
      const source = clean(button.getAttribute('onclick'));
      if (source.includes('handleAddLocation')) button.remove();
    });
  }

  function applyAlertLayer() {
    const dictionaryModal = documentRef.getElementById('brand-dictionary-modal');
    const messageModal = documentRef.getElementById('msg-modal');
    if (!dictionaryModal || !messageModal) return;
    const dictionaryOpen = !dictionaryModal.classList.contains('hidden');
    if (dictionaryOpen) {
      if (!state.priorMsgZIndex) state.priorMsgZIndex = messageModal.style.zIndex || '';
      messageModal.style.zIndex = '180';
    } else {
      restoreAlertLayer();
    }
  }

  function restoreAlertLayer() {
    const messageModal = documentRef.getElementById('msg-modal');
    if (messageModal) messageModal.style.zIndex = state.priorMsgZIndex;
    state.priorMsgZIndex = '';
  }

  function countryButton(country) {
    const expected = clean(country);
    return [...documentRef.querySelectorAll('#brand-country-list button')].find((button) => {
      return clean(button.querySelector('.font-bold')?.textContent) === expected;
    }) || null;
  }

  function restoreExternalContext() {
    const context = state.externalContext;
    state.externalContext = '';
    state.externalEditorOpened = false;
    if (context === 'coupon' && state.couponWasVisible) {
      const couponModal = documentRef.getElementById('coupon-management-modal');
      couponModal?.classList.remove('hidden');
      couponModal?.classList.add('flex');
      state.couponWasVisible = false;
      queueMicrotask(() => documentRef.getElementById('coupon-brand-search')?.focus());
    } else {
      state.couponWasVisible = false;
    }
  }

  function closeExternalDictionaryAndReturn() {
    documentRef.getElementById('brand-close')?.click();
    restoreExternalContext();
  }

  function openBrandCreate({ country = activeCountry(), context = 'item' } = {}) {
    const trigger = documentRef.getElementById('account-open-brand-dictionary');
    if (!trigger) {
      notify(windowRef, '品牌字典尚未準備完成', '請稍後再新增商店。');
      return false;
    }

    state.externalContext = context;
    state.externalEditorOpened = false;
    if (context === 'coupon') {
      const couponModal = documentRef.getElementById('coupon-management-modal');
      state.couponWasVisible = Boolean(couponModal && !couponModal.classList.contains('hidden'));
      couponModal?.classList.add('hidden');
      couponModal?.classList.remove('flex');
    }

    trigger.click();
    const targetCountry = clean(country) || activeCountry();
    const button = countryButton(targetCountry);
    if (!button) {
      documentRef.getElementById('brand-close')?.click();
      restoreExternalContext();
      notify(windowRef, '找不到旅遊國家', `品牌字典目前沒有「${targetCountry}」設定。`);
      return false;
    }
    button.click();
    const addButton = documentRef.getElementById('brand-add');
    if (!addButton) {
      documentRef.getElementById('brand-close')?.click();
      restoreExternalContext();
      return false;
    }
    addButton.click();
    state.externalEditorOpened = true;
    applyAlertLayer();
    return true;
  }

  function handleBrandModalState() {
    applyAlertLayer();
    if (!state.externalContext) return;
    const dictionaryModal = documentRef.getElementById('brand-dictionary-modal');
    if (!dictionaryModal || dictionaryModal.classList.contains('hidden')) {
      restoreExternalContext();
      return;
    }
    if (!state.externalEditorOpened) return;
    const editor = documentRef.getElementById('brand-editor-view');
    const list = documentRef.getElementById('brand-list-view');
    const editorVisible = Boolean(editor && !editor.classList.contains('hidden') && editor.classList.contains('flex'));
    const listVisible = Boolean(list && !list.classList.contains('hidden') && list.classList.contains('flex'));
    if (!editorVisible && listVisible) closeExternalDictionaryAndReturn();
  }

  function ensureCouponAddBrandButton() {
    const results = documentRef.getElementById('coupon-brand-results');
    if (!results || documentRef.getElementById('coupon-add-brand-from-search')) return;
    const button = documentRef.createElement('button');
    button.id = 'coupon-add-brand-from-search';
    button.type = 'button';
    button.className = 'hidden mt-2 w-full px-3 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown text-xs font-bold';
    button.textContent = '＋新增到品牌字典';
    button.addEventListener('click', () => {
      const country = clean(documentRef.getElementById('coupon-editor-country')?.textContent) || activeCountry();
      openBrandCreate({ country, context: 'coupon' });
    });
    results.insertAdjacentElement('afterend', button);
  }

  function updateCouponAddBrandButton() {
    ensureCouponAddBrandButton();
    const button = documentRef.getElementById('coupon-add-brand-from-search');
    const input = documentRef.getElementById('coupon-brand-search');
    const results = documentRef.getElementById('coupon-brand-results');
    const selected = documentRef.getElementById('coupon-selected-brand');
    const editor = documentRef.getElementById('coupon-editor-view');
    if (!button || !input || !results || !editor) return;
    const editorVisible = !editor.classList.contains('hidden') && editor.classList.contains('flex');
    const query = clean(input.value);
    const hasMatches = Boolean(results.querySelector('button'));
    const hasSelected = Boolean(selected && !selected.classList.contains('hidden'));
    button.classList.toggle('hidden', !editorVisible || !query || hasMatches || hasSelected);
  }

  const captureItemAdd = (event) => {
    const button = event.target?.closest?.('#item-inline-add-location');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openBrandCreate({ country: activeCountry(), context: 'item' });
  };
  documentRef.addEventListener('click', captureItemAdd, true);

  const couponInputHandler = () => queueMicrotask(updateCouponAddBrandButton);
  documentRef.addEventListener('input', (event) => {
    if (event.target?.id === 'coupon-brand-search') couponInputHandler();
  });
  documentRef.addEventListener('focusin', (event) => {
    if (event.target?.id === 'coupon-brand-search') couponInputHandler();
  });

  removeHomepageLegacyAddButton();
  ensureCouponAddBrandButton();

  const observers = [];
  if (MutationObserverImpl) {
    const bodyObserver = new MutationObserverImpl(() => {
      removeHomepageLegacyAddButton();
      ensureCouponAddBrandButton();
      updateCouponAddBrandButton();
      schedulePickerFilter();
      handleBrandModalState();
    });
    bodyObserver.observe(documentRef.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    observers.push(bodyObserver);
  }

  const activeContextChanged = () => {
    schedulePickerFilter();
    updateCouponAddBrandButton();
  };
  windowRef.addEventListener('shopping-list:active-trip-changed', activeContextChanged);
  windowRef.addEventListener('shopping-list:active-country-changed', activeContextChanged);

  function stopListeners() {
    state.settingsUnsub?.();
    state.brandsUnsub?.();
    state.settingsUnsub = null;
    state.brandsUnsub = null;
  }

  function subscribeUser(user) {
    stopListeners();
    state.userId = user?.uid || '';
    state.locations = [];
    state.brands = [];
    state.settingsLoaded = false;
    state.brandsLoaded = false;
    schedulePickerFilter();
    if (!user) return;

    state.settingsUnsub = onSnapshot(settingsRef(), (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.locations = Array.isArray(data.locations) ? [...data.locations] : [];
      state.settingsLoaded = true;
      void synchronizeLocationDefinitions();
      schedulePickerFilter();
    }, (error) => {
      console.error('Brand store preference listener failed:', error);
      state.settingsLoaded = true;
    });

    state.brandsUnsub = onSnapshot(dictionaryRef(), (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.brands = Array.isArray(data.brands) ? data.brands.map((brand) => ({ ...brand })) : [];
      state.brandsLoaded = true;
      void synchronizeLocationDefinitions();
      schedulePickerFilter();
      updateCouponAddBrandButton();
    }, (error) => {
      console.error('Brand store dictionary listener failed:', error);
      state.brandsLoaded = true;
    });
  }

  const authUnsub = authSdk.onAuthStateChanged(auth, subscribeUser);
  schedulePickerFilter();
  updateCouponAddBrandButton();
  applyAlertLayer();

  return () => {
    authUnsub?.();
    stopListeners();
    observers.forEach((observer) => observer.disconnect());
    documentRef.removeEventListener('click', captureItemAdd, true);
    windowRef.removeEventListener('shopping-list:active-trip-changed', activeContextChanged);
    windowRef.removeEventListener('shopping-list:active-country-changed', activeContextChanged);
    restoreAlertLayer();
    windowRef.__shoppingListBrandStoreSyncInitialized = false;
  };
}
