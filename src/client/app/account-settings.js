import { DEFAULT_COUNTRY, normalizeCountries } from './travel-country.js';

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
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-map-location-dot"></i></span>
            <span class="flex-1 min-w-0"><span class="block font-bold">Google Maps / Places</span><span id="account-maps-status" class="block text-xs opacity-60 mt-0.5 truncate">分店搜尋與附近排序設定</span></span>
            <i class="fas fa-chevron-right text-xs"></i>
          </button>
          <button id="account-open-personalization" type="button" class="account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelBlue/60 border-2 border-warmBrown text-warmBrown">
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-wand-magic-sparkles"></i></span>
            <span class="flex-1"><span class="block font-bold">個人化</span><span class="block text-xs opacity-60 mt-0.5">背景圖片、GIF、影片與連播</span></span><i class="fas fa-chevron-right text-xs"></i>
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
              <label for="account-country-input" class="block text-xs font-bold text-warmBrown mb-2">新增國家</label>
              <div class="flex gap-2"><input id="account-country-input" type="text" autocomplete="off" class="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-bold outline-none" placeholder="例如：韓國、泰國、美國"><button id="account-country-add" type="button" class="px-4 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold">新增</button></div>
            </div>
          </div>
        </div>
        <div id="account-maps-view" class="hidden bg-white max-h-[68vh] overflow-y-auto">
          <div class="sticky top-0 z-10 px-4 py-3 bg-shinBg border-b-2 border-warmBrown/20 flex items-center gap-3">
            <button id="account-maps-back" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
            <div><h3 class="font-bold text-warmBrown">Google Maps / Places</h3><p class="text-[11px] text-gray-500">分店搜尋與附近距離功能</p></div>
          </div>
          <div class="p-4 space-y-4">
            <div>
              <label for="account-maps-api-key" class="block text-xs font-bold text-warmBrown mb-2">Google Maps Browser API Key</label>
              <input id="account-maps-api-key" type="password" autocomplete="off" spellcheck="false" class="w-full px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-medium outline-none" placeholder="貼上受限制的 Browser API Key">
            </div>
            <div class="rounded-2xl bg-pastelYellow/40 border-2 border-warmBrown/20 p-3 text-[11px] leading-relaxed text-warmBrown">
              <p class="font-bold mb-1">公開網頁的 Browser Key 必須限制使用來源</p>
              <p>請在 Google Cloud 設定 <b>HTTP referrer</b> 限制，只允許你的 GitHub Pages / Vercel 網域，並將 API restriction 限制為 <b>Maps JavaScript API</b> 與 <b>Places API (New)</b>。Key 會在瀏覽器執行時可見，因此網域與 API 限制是必要保護。</p>
            </div>
            <div class="flex gap-2">
              <button id="account-maps-save" type="button" class="flex-1 px-4 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold">儲存</button>
              <button id="account-maps-remove" type="button" class="px-4 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold">移除</button>
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
  const mapsInput = document.getElementById('account-maps-api-key');
  const state = {
    userId: '',
    countries: [DEFAULT_COUNTRY],
    activeCountry: DEFAULT_COUNTRY,
    mapsBrowserApiKey: '',
    settingsUnsub: null
  };

  function settingsRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences') : null;
  }

  function dispatchMapsSettings() {
    window.shoppingListMapsBrowserApiKey = state.mapsBrowserApiKey;
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') {
      window.dispatchEvent(new EventCtor('shopping-list:maps-settings-changed', {
        detail: { mapsBrowserApiKey: state.mapsBrowserApiKey }
      }));
    }
    const status = document.getElementById('account-maps-status');
    if (status) status.textContent = state.mapsBrowserApiKey ? '已設定 · 分店搜尋可使用' : '尚未設定 · 原購物功能不受影響';
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
    mapsInput.value = state.mapsBrowserApiKey;
    setTimeout(() => mapsInput?.focus(), 80);
  }
  function openModal() { showRootView(); modal.classList.remove('hidden'); modal.classList.add('flex'); }
  function closeModal() { modal.classList.add('hidden'); modal.classList.remove('flex'); }

  function renderCountries() {
    state.activeCountry = String(window.shoppingListActiveTrip?.country || window.shoppingListActiveCountry || state.activeCountry || DEFAULT_COUNTRY).trim() || DEFAULT_COUNTRY;
    document.getElementById('account-active-country').textContent = `國家管理 · 目前 ${state.activeCountry}`;
    countryList.innerHTML = '';
    for (const country of state.countries) {
      const row = document.createElement('div');
      row.className = 'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-warmBrown text-warmBrown bg-shinBg font-bold';
      const label = document.createElement('span');
      label.className = 'flex-1';
      label.textContent = country;
      const note = document.createElement('span');
      note.className = 'text-[10px] opacity-50';
      note.textContent = country === state.activeCountry ? '目前旅程' : '可選';
      row.append(label, note);
      countryList.appendChild(row);
    }
  }

  async function addCountry() {
    const country = String(countryInput.value || '').trim();
    if (!country) return notify('缺少國家', '請輸入國家名稱。', 'warning');
    const nextCountries = normalizeCountries([...state.countries, country]);
    countryInput.value = '';
    try {
      await setDoc(settingsRef(), { countries: nextCountries }, { merge: true });
      state.countries = nextCountries;
      renderCountries();
    } catch (error) {
      console.error('Add country failed:', error);
      notify('新增失敗', '無法新增這個國家，請稍後再試。');
    }
  }

  async function saveMapsKey(nextKey = String(mapsInput?.value || '').trim()) {
    if (!state.userId) return notify('尚未登入', '請先登入後再儲存 Maps 設定。', 'warning');
    try {
      await setDoc(settingsRef(), { mapsBrowserApiKey: nextKey }, { merge: true });
      state.mapsBrowserApiKey = nextKey;
      mapsInput.value = nextKey;
      dispatchMapsSettings();
      notify(nextKey ? 'Maps 設定已儲存' : 'Maps 設定已移除', nextKey ? '附近分店與距離功能現在可以使用。' : '已移除 Browser API Key；其他購物功能不受影響。', 'success');
    } catch (error) {
      console.error('Save Maps settings failed:', error);
      notify('儲存失敗', '無法儲存 Google Maps 設定，請稍後再試。');
    }
  }

  function subscribeUser(user) {
    state.settingsUnsub?.();
    state.settingsUnsub = null;
    state.userId = user?.uid || '';
    state.countries = [DEFAULT_COUNTRY];
    state.mapsBrowserApiKey = '';
    window.shoppingListMapsBrowserApiKey = '';
    state.activeCountry = String(window.shoppingListActiveTrip?.country || window.shoppingListActiveCountry || DEFAULT_COUNTRY).trim() || DEFAULT_COUNTRY;
    document.getElementById('account-settings-email').textContent = user?.email || user?.displayName || '';
    renderCountries();
    dispatchMapsSettings();
    if (!user) { closeModal(); return; }
    state.settingsUnsub = onSnapshot(settingsRef(), (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.countries = normalizeCountries(data.countries);
      state.mapsBrowserApiKey = String(data.mapsBrowserApiKey || '').trim();
      renderCountries();
      dispatchMapsSettings();
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
  countryInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addCountry(); } });
  document.getElementById('account-open-maps').addEventListener('click', showMapsView);
  document.getElementById('account-maps-back').addEventListener('click', showRootView);
  document.getElementById('account-maps-save').addEventListener('click', () => saveMapsKey());
  document.getElementById('account-maps-remove').addEventListener('click', () => saveMapsKey(''));
  mapsInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveMapsKey(); } });
  window.addEventListener('shopping-list:active-trip-changed', (event) => {
    state.activeCountry = String(event?.detail?.trip?.country || DEFAULT_COUNTRY).trim() || DEFAULT_COUNTRY;
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
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
  authSdk.onAuthStateChanged(auth, subscribeUser);
}
