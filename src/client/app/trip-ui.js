import { DEFAULT_COUNTRY, normalizeCountries } from './travel-country.js';
import { classifyTrip, normalizeTrip, sortTripsForPicker, tripDisplayTitle, validateTripDraft } from './travel-trip.js';

const APP_ID = 'japan-shopping-app';

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
        reject(new Error('等待旅程介面初始化逾時。'));
      }
    }, 40);
  });
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function groupTripsForUi(trips = [], today = todayIso()) {
  const groups = { ongoing: [], upcoming: [], past: [], legacy: [] };
  for (const trip of sortTripsForPicker(trips, today)) {
    const type = classifyTrip(trip, today);
    if (groups[type]) groups[type].push(trip);
  }
  return groups;
}

function compactDate(date) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  return year && month && day ? { year, month, day } : null;
}

export function formatTripDateRange(trip = {}) {
  const normalized = normalizeTrip(trip);
  if (normalized.kind === 'legacy') return '既有清單';
  const start = compactDate(normalized.startDate);
  const end = compactDate(normalized.endDate);
  if (!start || !end) return '';
  if (start.year === end.year) return `${start.month}/${start.day} – ${end.month}/${end.day}`;
  return `${start.year}/${start.month}/${start.day} – ${end.year}/${end.month}/${end.day}`;
}

export function canChangeTripCountry(trip, itemCount) {
  return normalizeTrip(trip).kind === 'trip' && Number(itemCount || 0) === 0;
}

export function canDeleteTrip(trip, itemCount) {
  return normalizeTrip(trip).kind === 'trip' && Number(itemCount || 0) === 0;
}

function notify(title, message, type = 'error') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function installStyles() {
  if (document.getElementById('trip-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'trip-ui-styles';
  style.textContent = `
    #active-trip-shell {
      position: absolute;
      top: 1rem;
      left: 1rem;
      margin: 0;
      z-index: 30;
      max-width: 10.75rem;
    }
    #active-trip-selector {
      width: auto;
      max-width: 10.75rem;
      min-height: 2.5rem;
      padding: .35rem .6rem;
      gap: .45rem;
      border-radius: 9999px;
    }
    #active-trip-selector > span:first-child {
      width: 2rem;
      height: 2rem;
    }
    #active-trip-title {
      font-size: .75rem;
      line-height: 1rem;
    }
    #active-trip-dates { display: none; }
    .trip-section-title { font-size: .7rem; font-weight: 800; color: rgba(92,64,51,.58); margin: .85rem .2rem .35rem; }
    .trip-picker-row:active { transform: translateY(1px); }
  `;
  document.head.appendChild(style);
}

function ensureHomepageSelector(statusFilters) {
  let shell = document.getElementById('active-trip-shell');
  if (shell) return shell;
  const header = document.querySelector('header');
  if (!header) return null;
  shell = document.createElement('div');
  shell.id = 'active-trip-shell';
  shell.innerHTML = `
    <button id="active-trip-selector" type="button" class="flex items-center text-left bg-white border-2 border-warmBrown text-warmBrown shadow-[2px_2px_0_rgba(92,64,51,.16)]">
      <span class="shrink-0 rounded-full bg-pastelBlue border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-suitcase-rolling text-xs"></i></span>
      <span class="flex-1 min-w-0"><span id="active-trip-title" class="block font-bold truncate">新增第一趟旅程</span><span id="active-trip-dates" class="block text-xs opacity-60 mt-0.5">建立獨立購物清單</span></span>
      <i class="fas fa-chevron-down text-[10px] shrink-0"></i>
    </button>`;
  header.appendChild(shell);
  return shell;
}

function ensureAccountEntry(accountRoot) {
  let button = document.getElementById('account-open-trips');
  if (button) return button;
  button = document.createElement('button');
  button.id = 'account-open-trips';
  button.type = 'button';
  button.className = 'account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelGreen/60 border-2 border-warmBrown text-warmBrown';
  button.innerHTML = `
    <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-suitcase"></i></span>
    <span class="flex-1 min-w-0"><span class="block font-bold">旅遊紀錄</span><span class="block text-xs opacity-60 mt-0.5">新增、切換與管理每一趟購物清單</span></span>
    <i class="fas fa-chevron-right text-xs"></i>`;
  const personalization = document.getElementById('account-open-personalization');
  accountRoot.insertBefore(button, personalization || accountRoot.firstChild);
  return button;
}

function ensureModal() {
  let modal = document.getElementById('trip-manager-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'trip-manager-modal';
  modal.className = 'fixed inset-0 z-[96] hidden bg-warmBrown/50 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-md max-h-[88vh] overflow-hidden bg-shinBg border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,.28)]">
      <div class="bg-pastelGreen border-b-4 border-warmBrown px-5 py-4 flex items-center justify-between">
        <button id="trip-modal-back" type="button" class="hidden w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
        <div class="flex-1 px-3"><h2 id="trip-modal-title" class="text-lg font-bold text-warmBrown">選擇旅程</h2><p id="trip-modal-subtitle" class="text-[11px] text-warmBrown/60 font-bold mt-0.5"></p></div>
        <button id="trip-modal-close" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
      </div>
      <div id="trip-picker-view" class="p-4 bg-white overflow-y-auto max-h-[70vh]"></div>
      <div id="trip-manage-view" class="hidden p-4 bg-white overflow-y-auto max-h-[70vh]"></div>
      <div id="trip-form-view" class="hidden p-4 bg-white overflow-y-auto max-h-[70vh] space-y-4">
        <input id="trip-form-id" type="hidden">
        <div><label class="block text-xs font-bold text-warmBrown mb-1.5">旅程名稱（可留空）</label><input id="trip-form-title" type="text" class="w-full px-4 py-2.5 rounded-xl border-2 border-warmBrown bg-shinBg outline-none" placeholder="例如：東京生日旅行"></div>
        <div><label class="block text-xs font-bold text-warmBrown mb-1.5">國家</label><select id="trip-form-country" class="w-full px-4 py-2.5 rounded-xl border-2 border-warmBrown bg-shinBg outline-none"></select><p id="trip-country-lock-note" class="hidden text-[11px] text-gray-500 mt-1">這趟旅程已有商品，因此國家不能更改。</p></div>
        <div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-bold text-warmBrown mb-1.5">開始日期</label><input id="trip-form-start" type="date" class="w-full px-3 py-2.5 rounded-xl border-2 border-warmBrown bg-shinBg outline-none"></div><div><label class="block text-xs font-bold text-warmBrown mb-1.5">結束日期</label><input id="trip-form-end" type="date" class="w-full px-3 py-2.5 rounded-xl border-2 border-warmBrown bg-shinBg outline-none"></div></div>
        <button id="trip-form-save" type="button" class="w-full py-3 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,.18)]">儲存旅程</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

export async function initTripUi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListTripUiInitialized) return;
  window.__shoppingListTripUiInitialized = true;

  const [statusFilters, accountRoot, appSdk, authSdk, firestoreSdk] = await Promise.all([
    waitFor(() => document.getElementById('status-filters')),
    waitFor(() => document.getElementById('account-settings-root')),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  installStyles();
  ensureHomepageSelector(statusFilters);
  const accountEntry = ensureAccountEntry(accountRoot);
  const modal = ensureModal();

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, getDocsFromServer, limit, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where } = firestoreSdk;

  const state = {
    userId: '',
    trips: [],
    activeTrip: null,
    countries: [DEFAULT_COUNTRY],
    itemCounts: new Map(),
    editingTripId: '',
    settingsUnsub: null,
    itemsUnsub: null,
    view: 'picker'
  };

  const pickerView = document.getElementById('trip-picker-view');
  const manageView = document.getElementById('trip-manage-view');
  const formView = document.getElementById('trip-form-view');
  const backButton = document.getElementById('trip-modal-back');
  const countrySelect = document.getElementById('trip-form-country');

  function tripCount(tripId) {
    return state.itemCounts.get(tripId) || 0;
  }

  function setView(view) {
    state.view = view;
    pickerView.classList.toggle('hidden', view !== 'picker');
    manageView.classList.toggle('hidden', view !== 'manage');
    formView.classList.toggle('hidden', view !== 'form');
    backButton.classList.toggle('hidden', view === 'picker');
    document.getElementById('trip-modal-title').textContent = view === 'picker' ? '選擇旅程' : view === 'manage' ? '旅遊紀錄' : (state.editingTripId ? '編輯旅程' : '新增旅程');
    document.getElementById('trip-modal-subtitle').textContent = view === 'picker' ? '目前商品只會顯示在選定的這一趟' : '';
  }

  function openModal(view = 'picker') {
    setView(view);
    if (view === 'picker') renderPicker();
    if (view === 'manage') renderManage();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function renderSelector() {
    const title = document.getElementById('active-trip-title');
    const dates = document.getElementById('active-trip-dates');
    if (!state.activeTrip) {
      title.textContent = '新增第一趟旅程';
      dates.textContent = '建立獨立購物清單';
      return;
    }
    title.textContent = `${state.activeTrip.country} · ${tripDisplayTitle(state.activeTrip)}`.replace(`${state.activeTrip.country} · ${state.activeTrip.country} · `, `${state.activeTrip.country} · `);
    dates.textContent = formatTripDateRange(state.activeTrip);
  }

  function makeTripRow(trip, { manage = false } = {}) {
    const row = document.createElement('div');
    row.className = 'trip-picker-row flex items-center gap-2 p-3 rounded-2xl border-2 border-warmBrown bg-shinBg';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'flex-1 text-left min-w-0';
    select.innerHTML = `<span class="block font-bold text-warmBrown truncate"></span><span class="block text-[11px] text-gray-500 mt-0.5"></span>`;
    select.firstElementChild.textContent = tripDisplayTitle(trip);
    select.lastElementChild.textContent = `${trip.country}${trip.kind === 'legacy' ? ' · 既有清單' : ` · ${formatTripDateRange(trip)}`}`;
    select.addEventListener('click', async () => {
      try {
        await window.shoppingListSelectTrip?.(trip.id);
        closeModal();
      } catch (error) {
        console.error('Trip selection failed:', error);
        notify('切換失敗', '無法切換這趟旅程，請稍後再試。');
      }
    });
    row.appendChild(select);

    if (manage && trip.kind !== 'legacy') {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'w-8 h-8 rounded-full bg-white border-2 border-warmBrown text-warmBrown';
      edit.innerHTML = '<i class="fas fa-pen text-xs"></i>';
      edit.addEventListener('click', () => openForm(trip));
      row.appendChild(edit);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'w-8 h-8 rounded-full bg-white border-2 border-warmBrown text-red-500';
      remove.innerHTML = '<i class="fas fa-trash text-xs"></i>';
      remove.disabled = !canDeleteTrip(trip, tripCount(trip.id));
      remove.title = remove.disabled ? '這趟旅程仍有商品，不能刪除' : '刪除旅程';
      remove.addEventListener('click', () => void deleteTrip(trip));
      row.appendChild(remove);
    }
    return row;
  }

  function appendSection(root, label, trips) {
    if (!trips.length) return;
    const heading = document.createElement('div');
    heading.className = 'trip-section-title';
    heading.textContent = label;
    root.appendChild(heading);
    trips.forEach((trip) => root.appendChild(makeTripRow(trip)));
  }

  function renderPicker() {
    pickerView.innerHTML = '';
    const groups = groupTripsForUi(state.trips);
    appendSection(pickerView, '旅行中', groups.ongoing);
    appendSection(pickerView, '即將出發', groups.upcoming);
    appendSection(pickerView, '過去旅程', groups.past);
    appendSection(pickerView, '既有清單', groups.legacy);

    if (!state.trips.length) {
      const empty = document.createElement('p');
      empty.className = 'text-center text-sm text-gray-500 font-bold py-6';
      empty.textContent = '還沒有旅程，先建立第一趟吧！';
      pickerView.appendChild(empty);
    }

    const actions = document.createElement('div');
    actions.className = 'grid grid-cols-2 gap-2 mt-4 pt-4 border-t-2 border-warmBrown/10';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown text-sm font-bold';
    add.textContent = '＋ 新增旅程';
    add.addEventListener('click', () => openForm(null));
    const manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'py-2.5 rounded-xl bg-pastelBlue border-2 border-warmBrown text-warmBrown text-sm font-bold';
    manage.textContent = '管理旅遊紀錄';
    manage.addEventListener('click', () => { setView('manage'); renderManage(); });
    actions.append(add, manage);
    pickerView.appendChild(actions);
  }

  function renderManage() {
    manageView.innerHTML = '';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'w-full py-2.5 mb-3 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown text-sm font-bold';
    add.textContent = '＋ 新增旅程';
    add.addEventListener('click', () => openForm(null));
    manageView.appendChild(add);
    for (const trip of sortTripsForPicker(state.trips)) {
      const wrapper = document.createElement('div');
      wrapper.className = 'mb-2';
      wrapper.appendChild(makeTripRow(trip, { manage: true }));
      const count = document.createElement('p');
      count.className = 'text-[10px] text-gray-400 font-bold ml-3 mt-1';
      count.textContent = `${tripCount(trip.id)} 件商品${trip.kind === 'legacy' ? ' · 系統保留既有清單' : ''}`;
      wrapper.appendChild(count);
      manageView.appendChild(wrapper);
    }
  }

  function renderCountryOptions(selectedCountry) {
    countrySelect.innerHTML = '';
    const countries = normalizeCountries([...state.countries, selectedCountry || DEFAULT_COUNTRY]);
    for (const country of countries) {
      const option = document.createElement('option');
      option.value = country;
      option.textContent = country;
      option.selected = country === selectedCountry;
      countrySelect.appendChild(option);
    }
  }

  function openForm(trip) {
    const normalized = trip ? normalizeTrip(trip) : null;
    state.editingTripId = normalized?.id || '';
    document.getElementById('trip-form-id').value = state.editingTripId;
    document.getElementById('trip-form-title').value = normalized?.title || '';
    document.getElementById('trip-form-start').value = normalized?.startDate || '';
    document.getElementById('trip-form-end').value = normalized?.endDate || '';
    const selectedCountry = normalized?.country || state.activeTrip?.country || window.shoppingListActiveCountry || DEFAULT_COUNTRY;
    renderCountryOptions(selectedCountry);
    const countryEditable = normalized ? canChangeTripCountry(normalized, tripCount(normalized.id)) : true;
    countrySelect.disabled = !countryEditable;
    document.getElementById('trip-country-lock-note').classList.toggle('hidden', countryEditable);
    setView('form');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  async function saveTrip() {
    const user = auth.currentUser;
    if (!user) return;
    const existing = state.trips.find((trip) => trip.id === state.editingTripId) || null;
    const draft = {
      title: document.getElementById('trip-form-title').value.trim(),
      country: countrySelect.value,
      startDate: document.getElementById('trip-form-start').value,
      endDate: document.getElementById('trip-form-end').value
    };
    const validation = validateTripDraft(draft);
    if (!validation.valid) return notify('旅程資料有誤', validation.error, 'warning');
    if (existing && !canChangeTripCountry(existing, tripCount(existing.id))) draft.country = existing.country;

    const tripRef = existing
      ? doc(db, 'artifacts', APP_ID, 'users', user.uid, 'trips', existing.id)
      : doc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'trips'));
    const now = Date.now();
    try {
      await setDoc(tripRef, {
        title: draft.title,
        country: draft.country,
        startDate: draft.startDate,
        endDate: draft.endDate,
        kind: 'trip',
        createdAt: existing?.createdAt || now,
        updatedAt: now
      }, { merge: true });
      if (!existing) {
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences'), {
          activeTripId: tripRef.id,
          activeCountry: draft.country
        }, { merge: true });
      }
      setView('manage');
      renderManage();
    } catch (error) {
      console.error('Save trip failed:', error);
      notify('儲存失敗', '無法儲存旅程，請稍後再試。');
    }
  }

  async function deleteTrip(trip) {
    const user = auth.currentUser;
    if (!user) return;
    const count = tripCount(trip.id);
    if (!canDeleteTrip(trip, count)) {
      return notify('不能刪除', count ? `這趟旅程還有 ${count} 件商品，請先處理商品後再刪除。` : '既有清單不能刪除。', 'warning');
    }
    if (!window.confirm?.(`確定刪除「${tripDisplayTitle(trip)}」？`)) return;
    const tripRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'trips', trip.id);
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    const deletionToken = crypto.randomUUID();
    let locked = false;
    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(tripRef);
        if (!snapshot.exists()) throw Object.assign(new Error('trip-missing'), { code: 'trip-missing' });
        const data = snapshot.data();
        const lockAge = Date.now() - (data.deletingAt?.toMillis?.() || 0);
        if (data.deleting && lockAge < 60000) {
          throw Object.assign(new Error('trip-deletion-in-progress'), { code: 'trip-deletion-in-progress' });
        }
        transaction.update(tripRef, { deleting: true, deletingToken: deletionToken, deletingAt: serverTimestamp() });
      });
      locked = true;
      const occupied = await getDocsFromServer(query(itemsRef, where('tripId', '==', trip.id), limit(1)));
      if (!occupied.empty) throw Object.assign(new Error('trip-not-empty'), { code: 'trip-not-empty' });
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(tripRef);
        if (!snapshot.exists() || snapshot.data().deletingToken !== deletionToken) {
          throw Object.assign(new Error('trip-deletion-changed'), { code: 'trip-deletion-changed' });
        }
        transaction.delete(tripRef);
      });
      locked = false;
      renderManage();
    } catch (error) {
      if (locked) {
        try {
          await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(tripRef);
            if (snapshot.exists() && snapshot.data().deletingToken === deletionToken) {
              transaction.update(tripRef, { deleting: false, deletingToken: '', deletingAt: null });
            }
          });
        } catch (unlockError) {
          console.error('Unlock trip after failed deletion:', unlockError);
        }
      }
      if (error?.code === 'trip-not-empty') {
        notify('不能刪除', '這趟旅程剛剛新增了商品，請先處理商品後再刪除。', 'warning');
        return;
      }
      if (error?.code === 'trip-deletion-in-progress') {
        notify('正在刪除', '這趟旅程正在另一個視窗刪除，請稍後再試。', 'warning');
        return;
      }
      console.error('Delete trip failed:', error);
      notify('刪除失敗', '無法刪除旅程，請稍後再試。');
    }
  }

  document.getElementById('active-trip-selector').addEventListener('click', () => {
    if (!state.trips.length) openForm(null);
    else openModal('picker');
  });
  accountEntry.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('account-settings-modal')?.classList.add('hidden');
    openModal('manage');
  });
  document.getElementById('trip-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  backButton.addEventListener('click', () => {
    if (state.view === 'form') { setView('manage'); renderManage(); }
    else { setView('picker'); renderPicker(); }
  });
  document.getElementById('trip-form-save').addEventListener('click', () => void saveTrip());

  window.addEventListener('shopping-list:trips-changed', (event) => {
    state.trips = Array.isArray(event?.detail?.trips) ? event.detail.trips.map(normalizeTrip) : [];
    renderSelector();
    if (!modal.classList.contains('hidden')) {
      if (state.view === 'picker') renderPicker();
      if (state.view === 'manage') renderManage();
    }
  });
  window.addEventListener('shopping-list:active-trip-changed', (event) => {
    state.activeTrip = event?.detail?.trip ? normalizeTrip(event.detail.trip) : null;
    renderSelector();
  });

  authSdk.onAuthStateChanged(auth, (user) => {
    state.settingsUnsub?.();
    state.itemsUnsub?.();
    state.settingsUnsub = state.itemsUnsub = null;
    state.userId = user?.uid || '';
    state.trips = Array.isArray(window.shoppingListTrips) ? window.shoppingListTrips.map(normalizeTrip) : [];
    state.activeTrip = window.shoppingListActiveTrip ? normalizeTrip(window.shoppingListActiveTrip) : null;
    state.itemCounts = new Map();
    renderSelector();
    if (!user) return;

    const preferencesRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');
    state.settingsUnsub = onSnapshot(preferencesRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      state.countries = normalizeCountries(data.countries);
    });

    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      const counts = new Map();
      snapshot.docs.forEach((itemDoc) => {
        const tripId = String(itemDoc.data()?.tripId || '').trim();
        if (tripId) counts.set(tripId, (counts.get(tripId) || 0) + 1);
      });
      state.itemCounts = counts;
      if (!modal.classList.contains('hidden') && state.view === 'manage') renderManage();
    });
  });

  renderSelector();
}
