import { moveOption } from '../filters/filter-management.js';
import { DEFAULT_COUNTRY } from './travel-country.js';
import { resolveLocationDisplayName } from './brand-location-resolver.js';
import {
  buildBrandDeletionLocationPlan,
  buildManagedLocationValues,
  mergeManagedLocationOrder
} from './location-management-core.js';

const APP_ID = 'japan-shopping-app';
const MAX_BRAND_DELETE_ITEM_WRITES = 498;

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
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
        reject(new Error('等待地點／品牌管理介面初始化逾時。'));
      }
    }, 40);
  });
}

function sameCountry(left, right) {
  return clean(left).toLocaleLowerCase().replace(/\s+/g, '') === clean(right).toLocaleLowerCase().replace(/\s+/g, '');
}

function activeCountry(windowRef) {
  return clean(windowRef.shoppingListActiveTrip?.country)
    || clean(windowRef.shoppingListActiveCountry)
    || DEFAULT_COUNTRY;
}

function notify(windowRef, title, message, type = 'error') {
  if (typeof windowRef.showMsg === 'function') windowRef.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function brandLabel(brand) {
  const fallback = clean(brand?.displayName)
    || clean((Array.isArray(brand?.aliases) ? brand.aliases : [])[0]?.value)
    || '未命名品牌';
  return resolveLocationDisplayName(fallback, [brand], brand?.country) || fallback;
}

function brandCountryFromUi(documentRef) {
  return clean(documentRef.getElementById('brand-country-title')?.textContent).replace(/品牌字典$/u, '').trim();
}

export async function initLocationManagementBrandSync({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !windowRef || !MutationObserverImpl) return () => {};
  if (windowRef.__shoppingListLocationManagementBrandSyncInitialized) return () => {};
  windowRef.__shoppingListLocationManagementBrandSyncInitialized = true;

  const manageList = await waitFor(() => documentRef.getElementById('manage-filter-list'));
  const manageModal = await waitFor(() => documentRef.getElementById('manage-filter-modal'));
  await waitFor(() => documentRef.getElementById('brand-list') && documentRef.getElementById('brand-editor-delete'));

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, setDoc, writeBatch } = firestoreSdk;

  const state = {
    userId: '',
    locations: [],
    items: [],
    brands: [],
    selectedBrandId: '',
    settingsLoaded: false,
    itemsLoaded: false,
    settingsUnsub: null,
    itemsUnsub: null,
    brandsUnsub: null
  };

  function preferencesRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences') : null;
  }

  function brandDictionaryRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'brandDictionary') : null;
  }

  function isLocationManagement() {
    return clean(documentRef.getElementById('manage-filter-title')?.textContent).includes('地點');
  }

  function managedValues() {
    return buildManagedLocationValues(state.items, state.locations);
  }

  function setLocationManagementCopy() {
    const help = documentRef.querySelector('#manage-filter-modal p');
    if (help && help.textContent !== '按住左側把手拖曳或用箭頭排序；名稱與刪除請至品牌字典管理') {
      help.textContent = '按住左側把手拖曳或用箭頭排序；名稱與刪除請至品牌字典管理';
    }
    const trigger = documentRef.getElementById('location-filters')?.parentElement?.firstElementChild;
    if (trigger) trigger.title = '管理地點：調整順序';
  }

  async function persistVisibleOrder(nextVisible) {
    if (!state.userId) return;
    const ref = preferencesRef();
    if (!ref) return;
    const previous = [...state.locations];
    const nextConfigured = mergeManagedLocationOrder(previous, nextVisible);
    if (nextConfigured.length === previous.length && nextConfigured.every((value, index) => value === previous[index])) return;
    state.locations = nextConfigured;
    renderManagedLocationRows();
    try {
      await setDoc(ref, { locations: nextConfigured }, { merge: true });
    } catch (error) {
      state.locations = previous;
      renderManagedLocationRows();
      console.error('Location order save failed:', error);
      notify(windowRef, '排序失敗', '無法儲存新的地點順序。');
    }
  }

  function moveVisible(fromIndex, toIndex) {
    const values = managedValues();
    const next = moveOption(values, fromIndex, toIndex);
    if (next.every((value, index) => value === values[index])) return;
    void persistVisibleOrder(next);
  }

  function renderManagedLocationRows() {
    if (!isLocationManagement() || !state.settingsLoaded || !state.itemsLoaded) return;
    setLocationManagementCopy();
    const values = managedValues();
    const currentRows = [...manageList.querySelectorAll('.manage-row')];
    const currentValues = currentRows.map((row) => clean(row.dataset?.manageValue));
    const alreadyManaged = currentRows.every((row) => row.dataset?.brandSyncRow === '1');
    if (alreadyManaged
      && currentValues.length === values.length
      && currentValues.every((value, index) => value === values[index])) return;

    manageList.replaceChildren();
    if (!values.length) {
      const empty = documentRef.createElement('div');
      empty.className = 'py-8 text-center text-sm font-bold text-gray-400';
      empty.textContent = '目前沒有商品使用任何地點';
      manageList.appendChild(empty);
      return;
    }

    const country = activeCountry(windowRef);
    values.forEach((raw, index) => {
      const row = documentRef.createElement('div');
      row.className = 'manage-row flex items-center gap-2 rounded-2xl border-2 border-warmBrown bg-shinBg px-2 py-2 transition-all';
      row.dataset.manageIndex = String(index);
      row.dataset.manageValue = raw;
      row.dataset.brandSyncRow = '1';
      row.innerHTML = `
        <button type="button" class="filter-drag-handle w-9 h-10 rounded-xl text-warmBrown hover:bg-pastelYellow" aria-label="拖曳調整順序"><i class="fas fa-grip-vertical"></i></button>
        <span class="manage-option-name flex-1 min-w-0 truncate font-bold text-warmBrown"></span>
        <button type="button" class="move-up w-8 h-8 rounded-full border border-warmBrown/40 text-warmBrown disabled:opacity-25" aria-label="往上移"><i class="fas fa-chevron-up text-xs"></i></button>
        <button type="button" class="move-down w-8 h-8 rounded-full border border-warmBrown/40 text-warmBrown disabled:opacity-25" aria-label="往下移"><i class="fas fa-chevron-down text-xs"></i></button>`;
      row.querySelector('.manage-option-name').textContent = resolveLocationDisplayName(raw, state.brands, country) || raw;

      const up = row.querySelector('.move-up');
      const down = row.querySelector('.move-down');
      up.disabled = index === 0;
      down.disabled = index === values.length - 1;
      up.addEventListener('click', () => moveVisible(index, index - 1));
      down.addEventListener('click', () => moveVisible(index, index + 1));

      const handle = row.querySelector('.filter-drag-handle');
      let dragTargetIndex = index;
      const clearTargets = () => manageList.querySelectorAll('.manage-row').forEach((entry) => entry.classList.remove('drop-target'));
      const markTarget = (targetIndex) => manageList.querySelectorAll('.manage-row').forEach((entry) => {
        entry.classList.toggle('drop-target', Number(entry.dataset.manageIndex) === targetIndex);
      });
      const finishDrag = (event) => {
        if (!handle.hasPointerCapture?.(event.pointerId)) return;
        handle.releasePointerCapture?.(event.pointerId);
        clearTargets();
        if (dragTargetIndex !== index) moveVisible(index, dragTargetIndex);
      };
      handle.addEventListener('pointerdown', (event) => {
        dragTargetIndex = index;
        handle.setPointerCapture?.(event.pointerId);
        markTarget(index);
        event.preventDefault();
      });
      handle.addEventListener('pointermove', (event) => {
        if (!handle.hasPointerCapture?.(event.pointerId)) return;
        const target = documentRef.elementFromPoint(event.clientX, event.clientY)?.closest?.('.manage-row');
        if (!target || !manageList.contains(target)) return;
        dragTargetIndex = Number(target.dataset.manageIndex);
        markTarget(dragTargetIndex);
        event.preventDefault();
      });
      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', (event) => {
        if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture?.(event.pointerId);
        clearTargets();
      });
      manageList.appendChild(row);
    });
  }

  function trackBrandCard(target) {
    const card = target?.closest?.('#brand-list > button');
    if (!card) return false;
    const country = brandCountryFromUi(documentRef);
    const cards = [...documentRef.querySelectorAll('#brand-list > button')];
    const index = cards.indexOf(card);
    const countryBrands = state.brands.filter((brand) => sameCountry(brand?.country, country));
    state.selectedBrandId = clean(countryBrands[index]?.id);
    return true;
  }

  async function deleteSelectedBrand(button) {
    const brand = state.brands.find((entry) => clean(entry?.id) === state.selectedBrandId);
    if (!brand || !state.userId) {
      notify(windowRef, '無法確認品牌', '請返回品牌清單後重新開啟要刪除的品牌。', 'warning');
      return;
    }

    const plan = buildBrandDeletionLocationPlan(state.items, state.locations, brand);
    if (plan.writeCount > MAX_BRAND_DELETE_ITEM_WRITES) {
      notify(windowRef, '無法刪除', `目前有 ${plan.writeCount} 個商品使用這個品牌，超過單次安全更新上限，未進行任何變更。`, 'warning');
      return;
    }

    const label = brandLabel(brand);
    const usageMessage = plan.writeCount
      ? `目前有 ${plan.writeCount} 個商品使用這個品牌。\n刪除後會從這些商品移除對應地點。`
      : '目前沒有商品使用這個品牌。';
    const confirmed = typeof windowRef.confirm !== 'function'
      || windowRef.confirm(`確定刪除「${label}」？\n${usageMessage}\n品牌字典資料會刪除；對應優惠券會依既有清理規則移除。`);
    if (!confirmed) return;

    const dictionary = brandDictionaryRef();
    const preferences = preferencesRef();
    if (!dictionary || !preferences) return;
    const nextBrands = state.brands.filter((entry) => clean(entry?.id) !== clean(brand.id));

    button.disabled = true;
    try {
      const batch = writeBatch(db);
      batch.set(dictionary, { brands: nextBrands }, { merge: true });
      batch.set(preferences, { locations: plan.nextConfiguredLocations }, { merge: true });
      for (const entry of plan.affected) {
        const itemRef = doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', entry.id);
        batch.update(itemRef, entry.patch);
      }
      await batch.commit();
      state.brands = nextBrands;
      state.locations = plan.nextConfiguredLocations;
      state.selectedBrandId = '';
      documentRef.getElementById('brand-editor-back')?.click();
      notify(windowRef, '品牌已刪除', `已刪除「${label}」，並同步移除商品中的對應地點。`, 'success');
    } catch (error) {
      console.error('Brand-driven location delete failed:', error);
      notify(windowRef, '刪除失敗', '品牌字典與商品地點都沒有完成變更，請稍後再試。');
    } finally {
      button.disabled = false;
    }
  }

  const captureBrandActions = (event) => {
    if (trackBrandCard(event.target)) return;
    if (event.target?.closest?.('#brand-add')) {
      state.selectedBrandId = '';
      return;
    }
    const deleteButton = event.target?.closest?.('#brand-editor-delete');
    if (!deleteButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void deleteSelectedBrand(deleteButton);
  };
  documentRef.addEventListener('click', captureBrandActions, true);

  let scheduled = false;
  const scheduleRender = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      renderManagedLocationRows();
    });
  };
  const observer = new MutationObserverImpl(scheduleRender);
  observer.observe(manageList, { childList: true, subtree: true });
  observer.observe(manageModal, { attributes: true, attributeFilter: ['class'] });

  function stopListeners() {
    state.settingsUnsub?.();
    state.itemsUnsub?.();
    state.brandsUnsub?.();
    state.settingsUnsub = null;
    state.itemsUnsub = null;
    state.brandsUnsub = null;
  }

  function subscribeUser(user) {
    stopListeners();
    state.userId = user?.uid || '';
    state.locations = [];
    state.items = [];
    state.brands = [];
    state.selectedBrandId = '';
    state.settingsLoaded = false;
    state.itemsLoaded = false;
    if (!user) return;

    const preferences = preferencesRef();
    const dictionary = brandDictionaryRef();
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.settingsUnsub = onSnapshot(preferences, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.locations = Array.isArray(snapshot.data()?.locations) ? [...snapshot.data().locations] : [];
      state.settingsLoaded = true;
      renderManagedLocationRows();
    }, (error) => console.error('Location management settings listener failed:', error));
    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
      state.itemsLoaded = true;
      renderManagedLocationRows();
    }, (error) => console.error('Location management item listener failed:', error));
    state.brandsUnsub = onSnapshot(dictionary, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.brands = Array.isArray(snapshot.data()?.brands) ? snapshot.data().brands.map((brand) => ({ ...brand })) : [];
      renderManagedLocationRows();
    }, (error) => console.error('Location management brand listener failed:', error));
  }

  const activeTripHandler = () => renderManagedLocationRows();
  windowRef.addEventListener('shopping-list:active-trip-changed', activeTripHandler);
  const authUnsub = authSdk.onAuthStateChanged(auth, subscribeUser);
  setLocationManagementCopy();
  renderManagedLocationRows();

  return () => {
    authUnsub?.();
    stopListeners();
    observer.disconnect();
    documentRef.removeEventListener('click', captureBrandActions, true);
    windowRef.removeEventListener('shopping-list:active-trip-changed', activeTripHandler);
    windowRef.__shoppingListLocationManagementBrandSyncInitialized = false;
  };
}
