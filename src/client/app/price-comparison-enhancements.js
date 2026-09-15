import { currencyCodeForCountry } from '../pricing/country-rules.js';
import { resolveItemLocations, locationWritePatch, normalizeLocations } from '../pricing/location-selection.js';
import { normalizePriceResearch } from '../pricing/price-range.js';

const APP_ID = 'japan-shopping-app';

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
        reject(new Error('等待商品比價功能初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'warn'](`${title}: ${message}`);
}

function installStyles() {
  if (document.getElementById('price-comparison-styles')) return;
  const style = document.createElement('style');
  style.id = 'price-comparison-styles';
  style.textContent = `
    #item-location-pricing-legacy { display: none !important; }
    .multi-location-choice[aria-pressed="true"] { background: #D5E5F2; box-shadow: 2px 2px 0 rgba(92,64,51,.22); }
    #location-filters .loc-btn.multi-location-filter-selected { background: #D5E5F2 !important; color: #5C4033 !important; box-shadow: 2px 2px 0 rgba(92,64,51,1) !important; }
    #location-filters .loc-btn.multi-location-filter-unselected { background: white !important; color: #6b7280 !important; box-shadow: none !important; }
    .workflow-view-mode .multi-location-choice:disabled { opacity: .65; cursor: default; }
  `;
  document.head.appendChild(style);
}

function ensureResearchFields() {
  let section = document.getElementById('price-research-section');
  if (section) return section;
  const row = document.getElementById('item-purchase-meta-row')
    || document.getElementById('item-location')?.closest('.flex-1')?.parentElement;
  if (!row) return null;
  section = document.createElement('section');
  section.id = 'price-research-section';
  section.className = 'border-2 border-warmBrown/25 bg-pastelYellow/20 rounded-2xl p-4 space-y-3';
  section.innerHTML = `
    <div>
      <h3 class="text-sm font-bold text-warmBrown">價格功課</h3>
      <p class="text-[11px] text-gray-400 mt-1">先記台灣與旅遊地參考價；現場售價與優惠券到「比價」再輸入。</p>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <label class="text-xs font-bold text-warmBrown">台灣最低價 NT$
        <input id="item-price-tw-min" class="price-edit-control mt-1 w-full bg-white border-2 border-warmBrown rounded-xl px-3 py-2 font-medium" inputmode="decimal" type="number" min="0" step="any" placeholder="399">
      </label>
      <label class="text-xs font-bold text-warmBrown">台灣最高價 NT$
        <input id="item-price-tw-max" class="price-edit-control mt-1 w-full bg-white border-2 border-warmBrown rounded-xl px-3 py-2 font-medium" inputmode="decimal" type="number" min="0" step="any" placeholder="699">
      </label>
      <label class="text-xs font-bold text-warmBrown">當地最低價
        <input id="item-price-local-min" class="price-edit-control mt-1 w-full bg-white border-2 border-warmBrown rounded-xl px-3 py-2 font-medium" inputmode="decimal" type="number" min="0" step="any" placeholder="1280">
      </label>
      <label class="text-xs font-bold text-warmBrown">當地最高價
        <input id="item-price-local-max" class="price-edit-control mt-1 w-full bg-white border-2 border-warmBrown rounded-xl px-3 py-2 font-medium" inputmode="decimal" type="number" min="0" step="any" placeholder="1680">
      </label>
    </div>`;
  row.insertAdjacentElement('afterend', section);
  return section;
}

function ensureMultiLocationField() {
  const legacy = document.getElementById('item-location');
  if (!legacy) return null;
  const legacyField = legacy.closest('.flex-1') || legacy.parentElement?.parentElement;
  if (legacyField) legacyField.id = 'item-location-pricing-legacy';

  let field = document.getElementById('item-multi-location-field');
  if (field) return field;
  field = document.createElement('div');
  field.id = 'item-multi-location-field';
  field.className = 'min-w-0';
  field.innerHTML = `
    <label class="block text-sm font-bold text-warmBrown mb-2 ml-1">哪裡買</label>
    <div id="item-multi-location-options" class="flex flex-wrap gap-2 min-h-11 rounded-2xl border-2 border-warmBrown bg-shinBg p-2"></div>`;
  const row = document.getElementById('item-purchase-meta-row') || legacyField?.parentElement;
  const storeField = document.getElementById('item-store-field');
  if (row) {
    if (storeField?.parentElement === row) row.insertBefore(field, storeField);
    else row.appendChild(field);
  } else legacyField?.insertAdjacentElement('afterend', field);
  return field;
}

function inputValue(id) {
  return document.getElementById(id)?.value ?? '';
}

export async function initPriceComparisonEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListPriceComparisonInitialized) return;
  window.__shoppingListPriceComparisonInitialized = true;

  installStyles();
  await waitFor(() => (
    window.__shoppingListTripSaveGuardReady === true
    && typeof window.saveItem === 'function'
    && typeof window.openAddModal === 'function'
    && typeof window.openEditModal === 'function'
    && document.getElementById('item-location')
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
    itemUnsub: null,
    selectedLocations: [],
    locationFilter: 'all',
    normalizingBaseFilter: false
  };

  ensureMultiLocationField();
  ensureResearchFields();

  function availableLocations() {
    const select = document.getElementById('item-location');
    return normalizeLocations([...(select?.options || [])].map((option) => option.value));
  }

  function ensureLegacyOption(value) {
    const select = document.getElementById('item-location');
    const location = clean(value);
    if (!select || !location) return;
    if ([...select.options].some((option) => option.value === location)) return;
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    option.dataset.pricingTemporary = 'true';
    select.appendChild(option);
  }

  function syncLegacyLocation() {
    const select = document.getElementById('item-location');
    if (!select) return;
    const first = state.selectedLocations[0] || '';
    if (first) ensureLegacyOption(first);
    select.value = first;
  }

  function renderLocationChoices() {
    ensureMultiLocationField();
    const root = document.getElementById('item-multi-location-options');
    if (!root) return;
    const choices = normalizeLocations([...availableLocations(), ...state.selectedLocations]);
    root.replaceChildren();
    if (!choices.length) {
      root.innerHTML = '<span class="px-2 py-1 text-xs text-gray-400">請先新增地點</span>';
      return;
    }
    const activeDefinitions = new Set(availableLocations());
    for (const location of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'multi-location-control multi-location-choice px-3 py-1.5 rounded-full border-2 border-warmBrown text-xs font-bold text-warmBrown bg-white';
      button.dataset.location = location;
      button.setAttribute('aria-pressed', state.selectedLocations.includes(location) ? 'true' : 'false');
      button.textContent = activeDefinitions.has(location) ? location : `${location}（舊）`;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const selected = state.selectedLocations.includes(location);
        state.selectedLocations = selected
          ? state.selectedLocations.filter((value) => value !== location)
          : normalizeLocations([...state.selectedLocations, location]);
        syncLegacyLocation();
        renderLocationChoices();
      });
      root.appendChild(button);
    }
  }

  function setInput(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value == null ? '' : String(value);
  }

  function clearFormPricing() {
    state.selectedLocations = [];
    setInput('item-price-tw-min', '');
    setInput('item-price-tw-max', '');
    setInput('item-price-local-min', '');
    setInput('item-price-local-max', '');
    syncLegacyLocation();
    renderLocationChoices();
  }

  function populateFormPricing(item = {}) {
    state.selectedLocations = resolveItemLocations(item);
    const research = item?.priceResearch || {};
    setInput('item-price-tw-min', research.taiwanMinTwd);
    setInput('item-price-tw-max', research.taiwanMaxTwd);
    setInput('item-price-local-min', research.localMin);
    setInput('item-price-local-max', research.localMax);
    syncLegacyLocation();
    renderLocationChoices();
  }

  function buildFormPatch() {
    const locationPatch = locationWritePatch(state.selectedLocations);
    const country = clean(window.shoppingListActiveTrip?.country);
    const priceResearch = normalizePriceResearch({
      taiwanMinTwd: inputValue('item-price-tw-min'),
      taiwanMaxTwd: inputValue('item-price-tw-max'),
      localMin: inputValue('item-price-local-min'),
      localMax: inputValue('item-price-local-max'),
      currencyCode: currencyCodeForCountry(country),
      updatedAt: Date.now()
    });
    return { ...locationPatch, priceResearch };
  }

  const legacySelect = document.getElementById('item-location');
  if (legacySelect) {
    new MutationObserver(() => renderLocationChoices()).observe(legacySelect, { childList: true });
  }

  const originalOpenAdd = window.openAddModal;
  window.openAddModal = function(...args) {
    const result = originalOpenAdd.apply(this, args);
    ensureMultiLocationField();
    ensureResearchFields();
    clearFormPricing();
    return result;
  };

  const originalOpenEdit = window.openEditModal;
  window.openEditModal = function(itemId, ...args) {
    const result = originalOpenEdit.call(this, itemId, ...args);
    ensureMultiLocationField();
    ensureResearchFields();
    populateFormPricing(state.items.get(clean(itemId)) || {});
    return result;
  };

  const originalSave = window.saveItem;
  window.saveItem = async function(...args) {
    syncLegacyLocation();
    const patch = buildFormPatch();
    const savingUserId = clean(auth.currentUser?.uid || state.userId);
    const result = await originalSave.apply(this, args);
    const lastSave = window.shoppingListLastItemSave;
    const itemId = clean(lastSave?.itemId);
    const succeeded = Boolean(
      lastSave?.succeeded
      && itemId
      && savingUserId
      && lastSave?.userId === savingUserId
      && auth.currentUser?.uid === savingUserId
    );
    if (!succeeded) return result;
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'users', savingUserId, 'items', itemId), patch);
    } catch (error) {
      console.error('Price research / multi-location save failed:', error);
      notify('價格資料儲存失敗', '商品本身已儲存，但價格功課或多地點沒有成功同步，請再編輯一次。', 'error');
    }
    return result;
  };

  function styleLocationFilterButtons() {
    document.querySelectorAll('#location-filters .loc-btn').forEach((button) => {
      const active = clean(button.dataset.loc) === state.locationFilter;
      button.classList.toggle('multi-location-filter-selected', active);
      button.classList.toggle('multi-location-filter-unselected', !active);
    });
  }

  function publishLocationFilter(value) {
    state.locationFilter = clean(value) || 'all';
    window.shoppingListMultiLocationFilter = state.locationFilter;
    styleLocationFilterButtons();
    window.dispatchEvent(new CustomEvent('shopping-list:multi-location-filter-changed', {
      detail: { location: state.locationFilter }
    }));
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#location-filters .loc-btn');
    if (!button || state.normalizingBaseFilter) return;
    const selected = clean(button.dataset.loc) || 'all';
    publishLocationFilter(selected);
    queueMicrotask(() => {
      if (selected !== 'all') {
        const allButton = document.querySelector('#location-filters .loc-btn[data-loc="all"]');
        if (allButton) {
          state.normalizingBaseFilter = true;
          try { allButton.click(); } finally { state.normalizingBaseFilter = false; }
        }
      }
      publishLocationFilter(selected);
    });
  }, true);

  const locationFilterRoot = document.getElementById('location-filters');
  if (locationFilterRoot) {
    new MutationObserver(() => queueMicrotask(styleLocationFilterButtons)).observe(locationFilterRoot, { childList: true });
  }

  window.addEventListener('shopping-list:active-trip-changed', () => publishLocationFilter('all'));
  publishLocationFilter('all');

  function subscribeUser(user) {
    state.itemUnsub?.();
    state.itemUnsub = null;
    state.userId = user?.uid || '';
    state.items = new Map();
    if (!user) return;
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
    }, (error) => console.error('Price comparison item listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  renderLocationChoices();
}
