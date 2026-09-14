import {
  DEFAULT_COUNTRY,
  normalizeCountries,
  readCachedActiveCountry,
  writeCachedActiveCountry
} from './travel-country.js';

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
          <div>
            <h2 class="text-xl font-bold text-warmBrown">帳號設定</h2>
            <p id="account-settings-email" class="text-[11px] text-warmBrown/60 font-bold mt-1 truncate max-w-[15rem]"></p>
          </div>
          <button id="close-account-settings" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
        </div>

        <div id="account-settings-root" class="p-4 space-y-3 bg-white overflow-y-auto max-h-[68vh]">
          <button id="account-open-countries" type="button" class="account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelYellow/60 border-2 border-warmBrown text-warmBrown">
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-earth-asia"></i></span>
            <span class="flex-1 min-w-0"><span class="block font-bold">旅遊國家</span><span id="account-active-country" class="block text-xs opacity-60 mt-0.5 truncate">日本</span></span>
            <i class="fas fa-chevron-right text-xs"></i>
          </button>

          <button id="account-open-personalization" type="button" class="account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelBlue/60 border-2 border-warmBrown text-warmBrown">
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-wand-magic-sparkles"></i></span>
            <span class="flex-1"><span class="block font-bold">個人化</span><span class="block text-xs opacity-60 mt-0.5">背景圖片、GIF、影片與連播</span></span>
            <i class="fas fa-chevron-right text-xs"></i>
          </button>

          <button id="account-settings-signout" type="button" class="account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelPink/60 border-2 border-warmBrown text-warmBrown">
            <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-right-from-bracket"></i></span>
            <span class="font-bold flex-1">登出</span>
          </button>
        </div>

        <div id="account-country-view" class="hidden bg-white max-h-[68vh] overflow-y-auto">
          <div class="sticky top-0 z-10 px-4 py-3 bg-shinBg border-b-2 border-warmBrown/20 flex items-center gap-3">
            <button id="account-country-back" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
            <div><h3 class="font-bold text-warmBrown">旅遊國家</h3><p class="text-[11px] text-gray-500">首頁只顯示目前國家的購物商品</p></div>
          </div>
          <div class="p-4">
            <div id="account-country-list" class="space-y-2"></div>
            <div class="mt-5 pt-4 border-t-2 border-warmBrown/15">
              <label for="account-country-input" class="block text-xs font-bold text-warmBrown mb-2">新增國家</label>
              <div class="flex gap-2">
                <input id="account-country-input" type="text" autocomplete="off" class="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-bold outline-none" placeholder="例如：韓國、泰國、美國">
                <button id="account-country-add" type="button" class="px-4 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold">新增</button>
              </div>
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
  const countryList = document.getElementById('account-country-list');
  const countryInput = document.getElementById('account-country-input');

  const state = {
    userId: '',
    countries: [DEFAULT_COUNTRY],
    activeCountry: DEFAULT_COUNTRY,
    settingsUnsub: null
  };

  function settingsRef() {
    if (!state.userId) return null;
    return doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences');
  }

  function showRootView() {
    rootView.classList.remove('hidden');
    countryView.classList.add('hidden');
  }

  function showCountryView() {
    rootView.classList.add('hidden');
    countryView.classList.remove('hidden');
    renderCountries();
    setTimeout(() => countryInput?.focus(), 80);
  }

  function openModal() {
    showRootView();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function dispatchCountryChanged(country) {
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') {
      window.dispatchEvent(new EventCtor('shopping-list:active-country-changed', { detail: { country } }));
    }
  }

  async function selectCountry(country) {
    if (!state.userId) return;
    const nextCountry = String(country || '').trim() || DEFAULT_COUNTRY;
    const nextCountries = normalizeCountries([...state.countries, nextCountry]);
    const ref = settingsRef();
    await setDoc(ref, { countries: nextCountries, activeCountry: nextCountry }, { merge: true });
    state.countries = nextCountries;
    state.activeCountry = nextCountry;
    writeCachedActiveCountry(window.localStorage, state.userId, nextCountry);
    window.shoppingListActiveCountry = nextCountry;
    renderCountries();
    dispatchCountryChanged(nextCountry);
  }

  function renderCountries() {
    document.getElementById('account-active-country').textContent = state.activeCountry;
    countryList.innerHTML = '';
    for (const country of state.countries) {
      const active = country === state.activeCountry;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-warmBrown text-warmBrown text-left font-bold ${active ? 'bg-pastelYellow shadow-[2px_2px_0_rgba(92,64,51,0.18)]' : 'bg-shinBg'}`;
      const label = document.createElement('span');
      label.className = 'flex-1';
      label.textContent = country;
      const icon = document.createElement('i');
      icon.className = active ? 'fas fa-circle-check text-pastelOrange' : 'far fa-circle text-gray-300';
      button.append(label, icon);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await selectCountry(country);
          closeModal();
        } catch (error) {
          console.error('Country selection failed:', error);
          notify('儲存失敗', '無法切換旅遊國家，請稍後再試。');
        } finally {
          button.disabled = false;
        }
      });
      countryList.appendChild(button);
    }
  }

  async function addCountry() {
    const country = String(countryInput.value || '').trim();
    if (!country) return notify('缺少國家', '請輸入國家名稱。', 'warning');
    const nextCountries = normalizeCountries([...state.countries, country]);
    countryInput.value = '';
    try {
      await selectCountry(country);
      state.countries = nextCountries;
      renderCountries();
      closeModal();
    } catch (error) {
      console.error('Add country failed:', error);
      notify('新增失敗', '無法新增這個國家，請稍後再試。');
    }
  }

  function subscribeUser(user) {
    state.settingsUnsub?.();
    state.settingsUnsub = null;
    state.userId = user?.uid || '';
    state.countries = [DEFAULT_COUNTRY];
    state.activeCountry = user?.uid ? readCachedActiveCountry(window.localStorage, user.uid) : DEFAULT_COUNTRY;
    document.getElementById('account-settings-email').textContent = user?.email || user?.displayName || '';
    renderCountries();
    if (!user) {
      closeModal();
      return;
    }

    const ref = settingsRef();
    state.settingsUnsub = onSnapshot(ref, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      const countries = normalizeCountries(data.countries);
      const activeCountry = String(data.activeCountry || '').trim() || readCachedActiveCountry(window.localStorage, user.uid);
      if (!countries.includes(activeCountry)) countries.unshift(activeCountry);
      state.countries = countries;
      state.activeCountry = activeCountry || DEFAULT_COUNTRY;
      writeCachedActiveCountry(window.localStorage, user.uid, state.activeCountry);
      window.shoppingListActiveCountry = state.activeCountry;
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
  countryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCountry();
    }
  });
  document.getElementById('account-open-personalization').addEventListener('click', () => {
    closeModal();
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') window.dispatchEvent(new EventCtor('shopping-list:open-personalization'));
  });
  document.getElementById('account-settings-signout').addEventListener('click', async () => {
    closeModal();
    try {
      await authSdk.signOut(auth);
    } catch (error) {
      console.error('Account settings sign out failed:', error);
      notify('登出失敗', '無法登出，請稍後再試。');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });

  authSdk.onAuthStateChanged(auth, subscribeUser);
}
