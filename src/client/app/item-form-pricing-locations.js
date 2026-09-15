import { buildLocationWritePatch, normalizeItemLocations } from './item-locations.js';
import { buildReferencePricePatch, readReferencePriceFields } from './item-pricing.js';
import { currencyForCountry, currencyMeta } from './currency.js';

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
        reject(new Error('等待商品價格與地點介面初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function tripForItem(item) {
  const tripId = clean(item?.tripId);
  const trips = Array.isArray(window.shoppingListTrips) ? window.shoppingListTrips : [];
  return trips.find((trip) => clean(trip?.id) === tripId) || window.shoppingListActiveTrip || null;
}

export async function initItemFormPricingLocations() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListItemFormPricingLocationsInitialized) return;
  window.__shoppingListItemFormPricingLocationsInitialized = true;

  const [locationSelect, description, modalContent, appSdk, authSdk, firestoreSdk] = await Promise.all([
    waitFor(() => document.getElementById('item-location')),
    waitFor(() => document.getElementById('item-desc')),
    waitFor(() => document.getElementById('add-modal-content')),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, getDoc, onSnapshot, updateDoc } = firestoreSdk;

  const state = {
    userId: '',
    items: new Map(),
    selectedLocations: [],
    readonly: false,
    itemsUnsub: null
  };

  locationSelect.classList.add('hidden');
  locationSelect.setAttribute('aria-hidden', 'true');
  locationSelect.parentElement?.querySelector('.fa-chevron-down')?.classList.add('hidden');

  const multiButton = document.createElement('button');
  multiButton.id = 'item-location-multi';
  multiButton.type = 'button';
  multiButton.className = 'w-full min-h-[3rem] bg-shinBg border-2 border-warmBrown rounded-2xl px-3 py-2 text-left font-medium text-warmBrown flex flex-wrap items-center gap-1.5';
  locationSelect.insertAdjacentElement('afterend', multiButton);

  const picker = document.createElement('div');
  picker.id = 'location-multi-picker';
  picker.className = 'fixed inset-0 z-[110] hidden bg-warmBrown/50 backdrop-blur-sm px-4 items-center justify-center';
  picker.innerHTML = `
    <div class="w-full max-w-sm max-h-[78vh] bg-white border-4 border-warmBrown rounded-[2rem] overflow-hidden shadow-[8px_8px_0_rgba(92,64,51,.25)]">
      <div class="p-4 border-b-2 border-warmBrown/15 bg-pastelBlue/40">
        <div class="flex items-center justify-between gap-3"><h3 class="font-bold text-warmBrown">選擇「哪裡買」</h3><button id="location-multi-close" type="button" class="w-8 h-8 rounded-full bg-white border-2 border-warmBrown"><i class="fas fa-times"></i></button></div>
        <input id="location-multi-search" type="search" class="mt-3 w-full px-3 py-2 rounded-xl border-2 border-warmBrown bg-shinBg outline-none text-sm" placeholder="搜尋地點…">
      </div>
      <div id="location-multi-options" class="p-4 space-y-2 overflow-y-auto max-h-[50vh]"></div>
      <div class="p-4 border-t-2 border-warmBrown/15"><button id="location-multi-done" type="button" class="w-full py-2.5 rounded-xl bg-pastelBlue border-2 border-warmBrown text-warmBrown font-bold">完成</button></div>
    </div>`;
  document.body.appendChild(picker);

  const priceSection = document.createElement('div');
  priceSection.id = 'item-reference-prices';
  priceSection.className = 'rounded-2xl bg-pastelYellow/25 border-2 border-warmBrown/15 p-3 space-y-3';
  priceSection.innerHTML = `
    <div class="flex items-center justify-between"><h3 class="text-sm font-bold text-warmBrown">價格參考</h3><span class="text-[10px] text-gray-400">選填</span></div>
    <div class="space-y-1.5">
      <div class="flex items-center justify-between"><label for="price-twd-min" class="text-xs font-bold text-warmBrown">台灣價 <span class="opacity-60">NT$</span></label><button id="price-twd-range-toggle" type="button" class="text-[10px] font-bold px-2 py-1 rounded-full border border-warmBrown bg-white">範圍</button></div>
      <div class="flex items-center gap-2"><input id="price-twd-min" type="number" min="0" step="1" inputmode="decimal" class="min-w-0 flex-1 px-3 py-2.5 rounded-xl border-2 border-warmBrown bg-shinBg outline-none" placeholder="例如 399"><span id="price-twd-range-separator" class="hidden text-warmBrown">～</span><div id="price-twd-max-wrapper" class="hidden min-w-0 flex-1"><input id="price-twd-max" type="number" min="0" step="1" inputmode="decimal" class="w-full px-3 py-2.5 rounded-xl border-2 border-warmBrown bg-shinBg outline-none" placeholder="699"></div></div>
    </div>
    <div class="space-y-1.5">
      <div class="flex items-center justify-between"><label for="price-local-min" id="price-local-label" class="text-xs font-bold text-warmBrown">旅遊地價</label><button id="price-local-range-toggle" type="button" class="text-[10px] font-bold px-2 py-1 rounded-full border border-warmBrown bg-white">範圍</button></div>
      <div class="flex items-center gap-2"><input id="price-local-min" type="number" min="0" inputmode="decimal" class="min-w-0 flex-1 px-3 py-2.5 rounded-xl border-2 border-warmBrown bg-shinBg outline-none"><span id="price-local-range-separator" class="hidden text-warmBrown">～</span><div id="price-local-max-wrapper" class="hidden min-w-0 flex-1"><input id="price-local-max" type="number" min="0" inputmode="decimal" class="w-full px-3 py-2.5 rounded-xl border-2 border-warmBrown bg-shinBg outline-none"></div></div>
      <input id="price-local-currency" type="hidden">
    </div>`;
  const descriptionBlock = description.closest('div');
  descriptionBlock?.insertAdjacentElement('beforebegin', priceSection);

  const optionRoot = picker.querySelector('#location-multi-options');
  const searchInput = picker.querySelector('#location-multi-search');
  const twdMin = document.getElementById('price-twd-min');
  const twdMax = document.getElementById('price-twd-max');
  const localMin = document.getElementById('price-local-min');
  const localMax = document.getElementById('price-local-max');
  const localCurrency = document.getElementById('price-local-currency');

  function locationOptions() {
    const values = [...locationSelect.options].map((option) => clean(option.value)).filter(Boolean);
    return [...new Set([...values, ...state.selectedLocations])];
  }

  function syncNativeLocation() {
    const first = state.selectedLocations[0] || '';
    locationSelect.value = first;
  }

  function renderLocationButton() {
    multiButton.replaceChildren();
    if (!state.selectedLocations.length) {
      const placeholder = document.createElement('span');
      placeholder.className = 'text-gray-400 text-sm';
      placeholder.textContent = '可複選地點';
      multiButton.appendChild(placeholder);
      return;
    }
    state.selectedLocations.forEach((location) => {
      const chip = document.createElement('span');
      chip.className = 'text-[11px] font-bold bg-pastelBlue px-2 py-1 rounded-full border border-warmBrown';
      chip.textContent = location;
      multiButton.appendChild(chip);
    });
  }

  function renderLocationOptions() {
    const query = clean(searchInput.value).toLocaleLowerCase();
    optionRoot.replaceChildren();
    const values = locationOptions().filter((value) => !query || value.toLocaleLowerCase().includes(query));
    if (!values.length) {
      const empty = document.createElement('p');
      empty.className = 'text-center text-sm text-gray-400 py-4';
      empty.textContent = '沒有符合的地點';
      optionRoot.appendChild(empty);
      return;
    }
    values.forEach((value) => {
      const label = document.createElement('label');
      label.className = 'flex items-center gap-3 p-3 rounded-xl border-2 border-warmBrown/20 bg-shinBg cursor-pointer';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.selectedLocations.includes(value);
      checkbox.className = 'w-5 h-5 accent-current';
      const text = document.createElement('span');
      text.className = 'font-bold text-sm text-warmBrown';
      text.textContent = value;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selectedLocations = [...new Set([...state.selectedLocations, value])];
        else state.selectedLocations = state.selectedLocations.filter((entry) => entry !== value);
        syncNativeLocation();
        renderLocationButton();
      });
      label.append(checkbox, text);
      optionRoot.appendChild(label);
    });
  }

  function openPicker() {
    if (state.readonly) return;
    searchInput.value = '';
    renderLocationOptions();
    picker.classList.remove('hidden');
    picker.classList.add('flex');
    searchInput.focus();
  }

  function closePicker() {
    picker.classList.add('hidden');
    picker.classList.remove('flex');
  }

  function toggleRange(kind, force = null) {
    const wrapper = document.getElementById(`price-${kind}-max-wrapper`);
    const separator = document.getElementById(`price-${kind}-range-separator`);
    const show = force === null ? wrapper.classList.contains('hidden') : Boolean(force);
    wrapper.classList.toggle('hidden', !show);
    separator.classList.toggle('hidden', !show);
    if (!show) document.getElementById(`price-${kind}-max`).value = '';
  }

  function configureLocalTrip(trip) {
    const country = clean(trip?.country) || '旅遊地';
    const code = clean(trip?.currencyCode).toUpperCase() || currencyForCountry(country);
    const meta = currencyMeta(code);
    localCurrency.value = code;
    document.getElementById('price-local-label').textContent = `${country}價${meta ? ` ${meta.symbol}` : ''}`;
    const step = meta?.digits === 0 ? '1' : '0.01';
    localMin.step = step;
    localMax.step = step;
    localMin.placeholder = meta?.digits === 0 ? '例如 1280' : '例如 18.99';
  }

  function setReadonly(view) {
    state.readonly = Boolean(view);
    multiButton.disabled = state.readonly;
    [twdMin, twdMax, localMin, localMax, document.getElementById('price-twd-range-toggle'), document.getElementById('price-local-range-toggle')]
      .forEach((control) => { if (control) control.disabled = state.readonly; });
    if (state.readonly) closePicker();
  }

  function reset(trip = window.shoppingListActiveTrip) {
    state.selectedLocations = [];
    syncNativeLocation();
    renderLocationButton();
    [twdMin, twdMax, localMin, localMax].forEach((input) => { input.value = ''; });
    toggleRange('twd', false);
    toggleRange('local', false);
    configureLocalTrip(trip);
  }

  function populate(item = {}, trip = tripForItem(item)) {
    state.selectedLocations = normalizeItemLocations(item);
    syncNativeLocation();
    renderLocationButton();
    const prices = readReferencePriceFields(item);
    twdMin.value = prices.priceTwdMin ?? '';
    twdMax.value = prices.priceTwdMax ?? '';
    localMin.value = prices.priceLocalMin ?? '';
    localMax.value = prices.priceLocalMax ?? '';
    toggleRange('twd', prices.priceTwdMax !== null);
    toggleRange('local', prices.priceLocalMax !== null);
    configureLocalTrip({
      ...trip,
      currencyCode: prices.priceLocalCurrency || trip?.currencyCode
    });
  }

  function read() {
    const locationPatch = buildLocationWritePatch(state.selectedLocations);
    syncNativeLocation();
    return {
      ...locationPatch,
      ...buildReferencePricePatch({
        twdMin: twdMin.value,
        twdMax: twdMax.value,
        localMin: localMin.value,
        localMax: localMax.value,
        localCurrency: localCurrency.value
      })
    };
  }

  window.shoppingListItemFormFields = { read, populate, reset, setReadonly };

  multiButton.addEventListener('click', openPicker);
  picker.querySelector('#location-multi-close').addEventListener('click', closePicker);
  picker.querySelector('#location-multi-done').addEventListener('click', closePicker);
  picker.addEventListener('click', (event) => { if (event.target === picker) closePicker(); });
  searchInput.addEventListener('input', renderLocationOptions);
  document.getElementById('price-twd-range-toggle').addEventListener('click', () => toggleRange('twd'));
  document.getElementById('price-local-range-toggle').addEventListener('click', () => toggleRange('local'));

  const originalAdd = window.openAddModal;
  if (typeof originalAdd === 'function') {
    window.openAddModal = function (...args) {
      const result = originalAdd.apply(this, args);
      queueMicrotask(() => reset(window.shoppingListActiveTrip));
      return result;
    };
  }

  const originalEdit = window.openEditModal;
  if (typeof originalEdit === 'function') {
    window.openEditModal = function (itemId, ...args) {
      const result = originalEdit.call(this, itemId, ...args);
      const requestedId = clean(itemId);
      const userId = state.userId;
      queueMicrotask(async () => {
        let item = state.items.get(requestedId) || null;
        if (!item && userId) {
          try {
            const snapshot = await getDoc(doc(db, 'artifacts', APP_ID, 'users', userId, 'items', requestedId));
            if (state.userId !== userId || clean(document.getElementById('item-id')?.value) !== requestedId) return;
            item = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
          } catch (error) {
            console.error('Load item form pricing data failed:', error);
          }
        }
        if (item) populate(item, tripForItem(item));
      });
      return result;
    };
  }

  const originalSave = window.saveItem;
  if (typeof originalSave === 'function') {
    window.saveItem = async function (...args) {
      let patch;
      try {
        patch = read();
      } catch (error) {
        notify('價格資料有誤', error?.message || '請檢查價格欄位。');
        return;
      }
      const savingUserId = state.userId;
      const result = await originalSave.apply(this, args);
      const save = window.shoppingListLastItemSave || {};
      if (!save.succeeded || !save.itemId || save.userId !== savingUserId) return result;
      if (state.userId !== savingUserId || auth.currentUser?.uid !== savingUserId) return result;
      try {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', savingUserId, 'items', save.itemId), patch);
      } catch (error) {
        console.error('Save item location/pricing fields failed:', error);
        notify('部分資料更新失敗', '商品已儲存，但複選地點或參考價格未能同步，請重新開啟後再試。', 'error');
      }
      return result;
    };
  }

  const readonlyObserver = new MutationObserver(() => {
    setReadonly(modalContent.classList.contains('workflow-view-mode'));
  });
  readonlyObserver.observe(modalContent, { attributes: true, attributeFilter: ['class'] });

  authSdk.onAuthStateChanged(auth, (user) => {
    state.itemsUnsub?.();
    state.itemsUnsub = null;
    state.userId = user?.uid || '';
    state.items.clear();
    if (!user) return;
    state.itemsUnsub = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items'), (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items.clear();
      snapshot.forEach((entry) => state.items.set(entry.id, { id: entry.id, ...entry.data() }));
    }, (error) => console.error('Item form pricing listener failed:', error));
  });

  reset(window.shoppingListActiveTrip);
}
