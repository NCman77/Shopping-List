import { normalizeCountries } from './travel-country.js';
import { normalizeMapsApiKeys } from '../location/places-usage-policy.js';

const APP_ID = 'japan-shopping-app';

function waitFor(predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('等待帳號設定初始化逾時。'));
      }
    }, 40);
  });
}

function clean(value) {
  return String(value ?? '').trim();
}

function notify(title, message, type = 'error') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function installStyles() {
  if (document.getElementById('account-settings-styles')) return;
  const style = document.createElement('style');
  style.id = 'account-settings-styles';
  style.textContent = `
    #account-menu { display: none !important; }
    #user-panel { cursor: pointer; }
    .account-setting-row:active { transform: translateY(1px); }
  `;
  document.head.appendChild(style);
}

function ensureModal() {
  if (document.getElementById('account-settings-modal')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="account-settings-modal" class="fixed inset-0 z-[90] hidden bg-warmBrown/45 backdrop-blur-sm px-4 items-center justify-center">
      <div class="w-full max-w-sm max-h-[86vh] overflow-hidden bg-shinBg border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,0.28)]">
        <div class="bg-pastelPink border-b-4 border-warmBrown px-5 py-4 flex items-center justify-between">
          <div><h2 class="text-xl font-bold text-warmBrown">帳號設定</h2><p id="account-settings-email" class="text-[11px] text-warmBrown/60 font-bold mt-1 truncate max-w-[15rem]"></p></div>
          <button id="close-account-settings" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
        </div>
        <div id="account-settings-root" class="p-4 space-y-3 bg-white overflow-y-auto max-h-[68vh]">
          <button id="account-open-countries" type="button" class="account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelYellow/60 border-2 border-warmBrown text-warmBrown">
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-earth-asia"></i></span>
            <span class="flex-1 min-w-0"><span class="block font-bold">旅遊國家</span><span id="account-active-country" class="block text-xs opacity-60 mt-0.5 truncate">國家管理</span></span>
            <i class="fas fa-chevron-right text-xs"></i>
          </button>
          <button id="account-open-maps" type="button" class="account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelGreen/60 border-2 border-warmBrown text-warmBrown">
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-code"></i></span>
            <span class="flex-1 min-w-0"><span class="block font-bold">API 設定</span><span id="account-maps-status" class="block text-xs opacity-60 mt-0.5 truncate">Google Maps / Places · 尚未設定</span></span>
            <i class="fas fa-chevron-right text-xs"></i>
          </button>
          <button id="account-open-personalization" type="button" class="account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelBlue/60 border-2 border-warmBrown text-warmBrown">
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-wand-magic-sparkles"></i></span>
            <span class="flex-1"><span class="block font-bold">個人化</span><span class="block text-xs opacity-60 mt-0.5">背景照片與連播</span></span><i class="fas fa-chevron-right text-xs"></i>
          </button>
          <button id="account-settings-signout" type="button" class="account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelPink/60 border-2 border-warmBrown text-warmBrown">
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-right-from-bracket"></i></span><span class="font-bold flex-1">登出</span>
          </button>
        </div>
        <div id="account-country-view" class="hidden bg-white max-h-[68vh] overflow-y-auto">
          <div class="sticky top-0 z-10 px-4 py-3 bg-shinBg border-b-2 border-warmBrown/20 flex items-center gap-3">
            <button id="account-country-back" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
            <div><h3 class="font-bold text-warmBrown">旅遊國家</h3><p class="text-[11px] text-gray-500">國家管理 · 新旅程建立時可從這裡的清單選擇</p></div>
          </div>
          <div class="p-4">
            <div id="account-country-list" class="space-y-2"></div>
            <div class="mt-5 pt-4 border-t-2 border-warmBrown/15">
              <label id="account-country-input-label" for="account-country-input" class="block text-xs font-bold text-warmBrown mb-2">新增國家</label>
              <div class="flex gap-2">
                <input id="account-country-input" type="text" autocomplete="off" class="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-bold outline-none" placeholder="例如：韓國、泰國、美國">
                <button id="account-country-cancel" type="button" class="hidden px-3 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold">取消</button>
                <button id="account-country-add" type="button" class="px-4 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold">新增</button>
              </div>
            </div>
          </div>
        </div>
        <div id="account-maps-view" class="hidden bg-white max-h-[68vh] overflow-y-auto">
          <div class="sticky top-0 z-10 px-4 py-3 bg-shinBg border-b-2 border-warmBrown/20 flex items-center gap-3">
            <button id="account-maps-back" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
            <div><h3 class="font-bold text-warmBrown">API 設定</h3><p class="text-[11px] text-gray-500">Google Maps / Places</p></div>
          </div>
          <div class="p-4 space-y-4">
            <div>
              <label for="account-maps-primary-key" class="block text-xs font-bold text-warmBrown mb-2">主要 Browser API Key</label>
              <div class="flex gap-2">
                <input id="account-maps-primary-key" type="password" autocomplete="off" spellcheck="false" class="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-medium outline-none" placeholder="貼上主要 Browser API Key">
                <button id="account-maps-test-primary" type="button" class="px-3 py-2.5 rounded-xl bg-pastelBlue border-2 border-warmBrown text-warmBrown text-xs font-bold">測試</button>
              </div>
            </div>
            <div>
              <label for="account-maps-backup-key" class="block text-xs font-bold text-warmBrown mb-2">備用 Browser API Key <span class="font-medium text-gray-400">（選填）</span></label>
              <div class="flex gap-2">
                <input id="account-maps-backup-key" type="password" autocomplete="off" spellcheck="false" class="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-medium outline-none" placeholder="憑證失效時的備援 Key">
                <button id="account-maps-test-backup" type="button" class="px-3 py-2.5 rounded-xl bg-pastelBlue border-2 border-warmBrown text-warmBrown text-xs font-bold">測試</button>
              </div>
              <p class="text-[10px] text-gray-500 mt-1">備用 Key 只用於主要 Key 撤銷／失效等憑證故障；配額或計費問題不會自動切換。</p>
            </div>
            <div class="rounded-2xl bg-pastelYellow/40 border-2 border-warmBrown/20 p-3 text-[11px] leading-relaxed text-warmBrown">
              <p class="font-bold mb-1">Browser Key 會在瀏覽器執行時可見，請務必限制來源</p>
              <p>在 Google Cloud Console 對每把 Key 設定 <b>HTTP referrer</b>，只允許你的 GitHub Pages / Vercel 網域；API restriction 只允許 <b>Maps JavaScript API</b> 與 <b>Places API (New)</b>。</p>
              <p class="mt-2"><b>不要</b>在這裡貼 Service Account／服務帳戶或任何伺服器管理憑證。</p>
            </div>
            <div class="rounded-2xl bg-pastelBlue/30 border-2 border-warmBrown/20 p-3 text-[11px] leading-relaxed text-warmBrown">
              <p class="font-bold mb-1">用量保護：請在 Google Cloud Console 設定 quota／配額</p>
              <p>Budget alert 只負責通知；真正要避免超額請求，請另外設定 API quota。網站不會保存 Cloud IAM 管理憑證，也不會用備用 Key 繞過 quota。</p>
            </div>
            <div class="flex gap-2">
              <button id="account-maps-save" type="button" class="flex-1 px-4 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold">儲存設定</button>
              <button id="account-maps-remove-backup" type="button" class="px-4 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold">移除備用</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper.firstElementChild);
}

export async function initAccountSettings() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListAccountSettingsInitialized) return;
  window.__shoppingListAccountSettingsInitialized = true;

  const [panel, appSdk, authSdk, firestoreSdk] = await Promise.all([
    waitFor(() => document.getElementById('user-panel')),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  installStyles();
  ensureModal();

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, onSnapshot, setDoc } = firestoreSdk;
  const modal = document.getElementById('account-settings-modal');
  const rootView = document.getElementById('account-settings-root');
  const countryView = document.getElementById('account-country-view');
  const mapsView = document.getElementById('account-maps-view');
  const countryList = document.getElementById('account-country-list');
  const countryInput = document.getElementById('account-country-input');

  const accountMenuOrder = [
    'account-open-personalization',
    'account-open-countries',
    'account-open-trips',
    'account-open-brand-dictionary',
    'account-open-coupon-management',
    'account-open-maps',
    'account-settings-signout'
  ];

  function enforceAccountMenuOrder() {
    const ordered = accountMenuOrder
      .map((id) => document.getElementById(id))
      .filter((element) => element?.parentElement === rootView);
    const current = [...rootView.children].filter((element) => accountMenuOrder.includes(element.id));
    if (current.length === ordered.length && current.every((element, index) => element === ordered[index])) return;
    ordered.forEach((element) => rootView.appendChild(element));
  }

  const accountMenuObserver = new MutationObserver(enforceAccountMenuOrder);
  accountMenuObserver.observe(rootView, { childList: true });
  enforceAccountMenuOrder();

  const mapsPrimaryInput = document.getElementById('account-maps-primary-key');
  const mapsBackupInput = document.getElementById('account-maps-backup-key');
  const state = {
    userId: '',
    countries: [],
    activeCountry: '',
    mapsApiKeys: { primary: '', backup: '' },
    mapsKeyGeneration: 0,
    editingCountry: '',
    settingsUnsub: null
  };

  function settingsRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences') : null;
  }

  function dispatchMapsSettings() {
    window.shoppingListMapsApiKeys = {
      primary: state.mapsApiKeys.primary,
      backup: state.mapsApiKeys.backup,
      generation: state.mapsKeyGeneration
    };
    window.shoppingListMapsBrowserApiKey = state.mapsApiKeys.primary;
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') {
      window.dispatchEvent(new EventCtor('shopping-list:maps-settings-changed', {
        detail: { mapsApiKeys: { ...state.mapsApiKeys }, generation: state.mapsKeyGeneration }
      }));
    }
    const status = document.getElementById('account-maps-status');
    if (!status) return;
    if (!state.mapsApiKeys.primary) status.textContent = 'Google Maps / Places · 尚未設定';
    else if (state.mapsApiKeys.backup) status.textContent = 'Google Maps / Places · 主要 + 備用已設定';
    else status.textContent = 'Google Maps / Places · 主要 Key 已設定';
  }

  function applyMapsApiKeys(nextKeys = {}) {
    const normalized = {
      primary: clean(nextKeys.primary),
      backup: clean(nextKeys.backup)
    };
    const changed = normalized.primary !== state.mapsApiKeys.primary || normalized.backup !== state.mapsApiKeys.backup;
    state.mapsApiKeys = normalized;
    if (changed) state.mapsKeyGeneration += 1;
    mapsPrimaryInput.value = normalized.primary;
    mapsBackupInput.value = normalized.backup;
    dispatchMapsSettings();
  }

  function clearMapsRuntime() {
    state.mapsApiKeys = { primary: '', backup: '' };
    state.mapsKeyGeneration += 1;
    window.shoppingListMapsApiKeys = { primary: '', backup: '', generation: state.mapsKeyGeneration };
    window.shoppingListMapsBrowserApiKey = '';
    mapsPrimaryInput.value = '';
    mapsBackupInput.value = '';
    dispatchMapsSettings();
  }

  function showRootView() {
    rootView.classList.remove('hidden');
    countryView.classList.add('hidden');
    mapsView.classList.add('hidden');
  }
  function showCountryView() {
    rootView.classList.add('hidden');
    mapsView.classList.add('hidden');
    countryView.classList.remove('hidden');
    renderCountries();
    setTimeout(() => countryInput?.focus(), 80);
  }
  function showMapsView() {
    rootView.classList.add('hidden');
    countryView.classList.add('hidden');
    mapsView.classList.remove('hidden');
    mapsPrimaryInput.value = state.mapsApiKeys.primary;
    mapsBackupInput.value = state.mapsApiKeys.backup;
    setTimeout(() => mapsPrimaryInput?.focus(), 80);
  }
  function openModal() { showRootView(); modal.classList.remove('hidden'); modal.classList.add('flex'); }
  function closeModal() { modal.classList.add('hidden'); modal.classList.remove('flex'); }

  function countryLockedReason(country) {
    if (country === state.activeCountry) return '目前旅程正在使用這個國家，請先切換到其他旅程。';
    return '';
  }

  function syncCountryEditor() {
    const editing = Boolean(state.editingCountry);
    const label = document.getElementById('account-country-input-label');
    const addButton = document.getElementById('account-country-add');
    const cancelButton = document.getElementById('account-country-cancel');
    if (label) label.textContent = editing ? `編輯「${state.editingCountry}」` : '新增國家';
    if (addButton) addButton.textContent = editing ? '儲存' : '新增';
    cancelButton?.classList.toggle('hidden', !editing);
  }

  function cancelCountryEdit() {
    state.editingCountry = '';
    countryInput.value = '';
    syncCountryEditor();
  }

  function beginCountryEdit(country) {
    const reason = countryLockedReason(country);
    if (reason) return notify('目前不能編輯', reason, 'warning');
    state.editingCountry = country;
    countryInput.value = country;
    syncCountryEditor();
    countryInput.focus();
    countryInput.select?.();
  }

  async function deleteCountry(country) {
    const reason = countryLockedReason(country);
    if (reason) return notify('目前不能刪除', reason, 'warning');
    if (!window.confirm?.(`確定刪除旅遊國家「${country}」？既有旅遊紀錄不會被改寫。`)) return;
    const nextCountries = state.countries.filter((value) => value !== country);
    try {
      await setDoc(settingsRef(), { countries: nextCountries }, { merge: true });
      state.countries = nextCountries;
      if (state.editingCountry === country) cancelCountryEdit();
      renderCountries();
    } catch (error) {
      console.error('Delete country failed:', error);
      notify('刪除失敗', '無法刪除這個國家，請稍後再試。');
    }
  }

  function renderCountries() {
    state.activeCountry = String(window.shoppingListActiveTrip?.country || window.shoppingListActiveCountry || state.activeCountry || '').trim();
    document.getElementById('account-active-country').textContent = state.activeCountry ? `國家管理 · 目前 ${state.activeCountry}` : '國家管理';
    countryList.innerHTML = '';
    for (const country of state.countries) {
      const row = document.createElement('div');
      row.className = 'w-full flex items-center gap-2 px-3 py-3 rounded-2xl border-2 border-warmBrown text-warmBrown bg-shinBg font-bold';
      const label = document.createElement('span');
      label.className = 'flex-1 min-w-0 truncate';
      label.textContent = country;
      const note = document.createElement('span');
      note.className = 'text-[10px] opacity-50 shrink-0';
      note.textContent = country === state.activeCountry ? '目前旅程' : '可選';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'w-8 h-8 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown disabled:opacity-30';
      edit.innerHTML = '<i class="fas fa-pen text-xs"></i>';
      edit.setAttribute('aria-label', `編輯${country}`);
      edit.title = countryLockedReason(country) || '編輯國家';
      edit.addEventListener('click', () => beginCountryEdit(country));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'w-8 h-8 shrink-0 rounded-full bg-white border-2 border-warmBrown text-red-500 disabled:opacity-30';
      remove.innerHTML = '<i class="fas fa-trash text-xs"></i>';
      remove.setAttribute('aria-label', `刪除${country}`);
      remove.title = countryLockedReason(country) || '刪除國家';
      remove.addEventListener('click', () => void deleteCountry(country));

      row.append(label, note, edit, remove);
      countryList.appendChild(row);
    }
    syncCountryEditor();
  }

  async function addCountry() {
    const country = String(countryInput.value || '').trim();
    if (!country) return notify('缺少國家', '請輸入國家名稱。', 'warning');

    const editingCountry = state.editingCountry;
    if (editingCountry && country !== editingCountry && state.countries.includes(country)) {
      return notify('國家已存在', `「${country}」已經在旅遊國家清單中。`, 'warning');
    }

    const nextCountries = editingCountry
      ? state.countries.map((value) => value === editingCountry ? country : value)
      : normalizeCountries([...state.countries, country]);

    try {
      await setDoc(settingsRef(), { countries: nextCountries }, { merge: true });
      state.countries = nextCountries;
      cancelCountryEdit();
      renderCountries();
    } catch (error) {
      console.error(editingCountry ? 'Edit country failed:' : 'Add country failed:', error);
      notify(editingCountry ? '編輯失敗' : '新增失敗', `無法${editingCountry ? '編輯' : '新增'}這個國家，請稍後再試。`);
    }
  }

  async function saveMapsKeys() {
    if (!state.userId) return notify('尚未登入', '請先登入後再儲存 API 設定。', 'warning');
    const savingUserId = state.userId;
    const ref = settingsRef();
    const mapsApiKeys = {
      primary: clean(mapsPrimaryInput?.value),
      backup: clean(mapsBackupInput?.value)
    };
    try {
      await setDoc(ref, { mapsApiKeys, mapsBrowserApiKey: '' }, { merge: true });
      if (state.userId !== savingUserId || auth.currentUser?.uid !== savingUserId) return;
      applyMapsApiKeys(mapsApiKeys);
      notify(mapsApiKeys.primary ? 'API 設定已儲存' : '主要 Key 尚未設定', mapsApiKeys.primary ? 'Google Maps / Places 設定已更新。請使用「測試」確認 Key 權限。' : '商店自動完成與附近分店搜尋需要主要 Browser API Key。', mapsApiKeys.primary ? 'success' : 'warning');
    } catch (error) {
      console.error('Save Maps settings failed:', error);
      if (state.userId !== savingUserId || auth.currentUser?.uid !== savingUserId) return;
      notify('儲存失敗', '無法儲存 Google Maps API 設定，請稍後再試。');
    }
  }

  async function removeBackupKey() {
    mapsBackupInput.value = '';
    await saveMapsKeys();
  }

  function requestMapsKeyTest(slot) {
    const key = clean(slot === 'backup' ? mapsBackupInput?.value : mapsPrimaryInput?.value);
    if (!key) return notify('缺少 API Key', `請先輸入${slot === 'backup' ? '備用' : '主要'} Browser API Key。`, 'warning');
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor !== 'function') return;
    window.dispatchEvent(new EventCtor('shopping-list:maps-key-test-requested', {
      detail: { slot, apiKey: key, generation: state.mapsKeyGeneration }
    }));
  }

  function subscribeUser(user) {
    state.settingsUnsub?.();
    state.settingsUnsub = null;
    state.userId = user?.uid || '';
    state.countries = [];
    clearMapsRuntime();
    state.activeCountry = String(window.shoppingListActiveTrip?.country || window.shoppingListActiveCountry || '').trim();
    document.getElementById('account-settings-email').textContent = user?.email || user?.displayName || '';
    renderCountries();
    if (!user) { closeModal(); return; }
    state.settingsUnsub = onSnapshot(settingsRef(), (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.countries = normalizeCountries(data.countries);
      const normalized = normalizeMapsApiKeys(data);
      applyMapsApiKeys({ primary: normalized.primary, backup: normalized.backup });
      renderCountries();
    }, (error) => console.error('Account settings listener failed:', error));
  }

  panel.setAttribute('role', 'button');
  panel.setAttribute('tabindex', '0');
  panel.setAttribute('aria-label', '開啟帳號設定');
  const interceptAvatar = (event) => {
    if (!auth.currentUser) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openModal();
  };
  panel.addEventListener('click', interceptAvatar, true);
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    interceptAvatar(event);
  }, true);

  document.getElementById('close-account-settings').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.getElementById('account-open-countries').addEventListener('click', showCountryView);
  document.getElementById('account-country-back').addEventListener('click', showRootView);
  document.getElementById('account-country-add').addEventListener('click', addCountry);
  document.getElementById('account-country-cancel').addEventListener('click', cancelCountryEdit);
  countryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addCountry(); }
    if (event.key === 'Escape' && state.editingCountry) { event.preventDefault(); cancelCountryEdit(); }
  });
  document.getElementById('account-open-maps').addEventListener('click', showMapsView);
  document.getElementById('account-maps-back').addEventListener('click', showRootView);
  document.getElementById('account-maps-save').addEventListener('click', saveMapsKeys);
  document.getElementById('account-maps-remove-backup').addEventListener('click', removeBackupKey);
  document.getElementById('account-maps-test-primary').addEventListener('click', () => requestMapsKeyTest('primary'));
  document.getElementById('account-maps-test-backup').addEventListener('click', () => requestMapsKeyTest('backup'));
  mapsPrimaryInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveMapsKeys(); } });
  mapsBackupInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveMapsKeys(); } });
  window.addEventListener('shopping-list:active-trip-changed', (event) => {
    state.activeCountry = String(event?.detail?.trip?.country || '').trim();
    renderCountries();
  });
  document.getElementById('account-open-personalization').addEventListener('click', () => {
    closeModal();
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') window.dispatchEvent(new EventCtor('shopping-list:open-personalization'));
  });
  document.getElementById('account-settings-signout').addEventListener('click', async () => {
    closeModal();
    try { await authSdk.signOut(auth); }
    catch (error) { console.error('Account settings sign out failed:', error); notify('登出失敗', '無法登出，請稍後再試。'); }
  });
  window.addEventListener('shopping-list:open-account-settings', () => openModal());
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
  authSdk.onAuthStateChanged(auth, subscribeUser);
}
