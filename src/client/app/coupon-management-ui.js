import { DEFAULT_COUNTRY, normalizeCountries } from './travel-country.js';
import { cleanupCoupons, couponDateStatus, searchBrandsByAlias, validateCouponDraft } from './coupon-core.js';
import { resolveLocationDisplayName } from './brand-location-resolver.js';

const APP_ID = 'japan-shopping-app';

function clean(value) {
  return String(value ?? '').trim();
}

function sameCountry(left, right) {
  return clean(left).normalize('NFKC').toLocaleLowerCase() === clean(right).normalize('NFKC').toLocaleLowerCase();
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
        reject(new Error('等待優惠券管理初始化逾時。'));
      }
    }, 40);
  });
}

function notify(windowRef, title, message, type = 'error') {
  if (typeof windowRef?.showMsg === 'function') windowRef.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function localTodayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureSettingsEntry(documentRef) {
  const root = documentRef.getElementById('account-settings-root');
  if (!root || documentRef.getElementById('account-open-coupon-management')) return;
  const button = documentRef.createElement('button');
  button.id = 'account-open-coupon-management';
  button.type = 'button';
  button.className = 'account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelPink/35 border-2 border-warmBrown text-warmBrown';
  button.innerHTML = `
    <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-ticket"></i></span>
    <span class="flex-1 min-w-0"><span class="block font-bold">優惠券管理</span><span class="block text-xs opacity-60 mt-0.5">依品牌管理觀光客優惠券與有效日期</span></span>
    <i class="fas fa-chevron-right text-xs"></i>`;
  const personalizationButton = documentRef.getElementById('account-open-personalization');
  if (personalizationButton?.parentElement === root) root.insertBefore(button, personalizationButton);
  else root.appendChild(button);
}

function ensureModal(documentRef) {
  if (documentRef.getElementById('coupon-management-modal')) return;
  const modal = documentRef.createElement('div');
  modal.id = 'coupon-management-modal';
  modal.className = 'fixed inset-0 z-[97] hidden bg-warmBrown/45 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-md max-h-[88vh] overflow-hidden bg-white border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,0.28)]">
      <div id="coupon-country-view" class="flex flex-col max-h-[84vh]">
        <div class="px-4 py-3 bg-pastelPink/60 border-b-4 border-warmBrown flex items-center gap-3">
          <button id="coupon-back-settings" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
          <div class="flex-1 min-w-0"><h3 class="font-bold text-warmBrown text-lg">優惠券管理</h3><p class="text-[11px] text-warmBrown/60">每個旅遊國家分開管理，一個品牌最多一張優惠券</p></div>
          <button id="coupon-close" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
        </div>
        <div id="coupon-country-list" class="p-4 space-y-2 overflow-y-auto bg-white"></div>
      </div>

      <div id="coupon-list-view" class="hidden flex-col max-h-[84vh]">
        <div class="px-4 py-3 bg-pastelYellow border-b-4 border-warmBrown flex items-center gap-3">
          <button id="coupon-country-back" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
          <div class="flex-1 min-w-0"><h3 id="coupon-country-title" class="font-bold text-warmBrown text-lg truncate">優惠券</h3><p class="text-[11px] text-warmBrown/60">點選優惠券可編輯網址與有效期間</p></div>
          <button id="coupon-add" type="button" class="px-3 py-2 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown text-xs font-bold"><i class="fas fa-plus mr-1"></i>新增</button>
        </div>
        <div class="p-4 overflow-y-auto bg-white">
          <div id="coupon-list" class="space-y-3"></div>
          <div id="coupon-empty" class="hidden py-8 text-center text-sm font-bold text-gray-400">這個國家目前沒有優惠券</div>
        </div>
      </div>

      <div id="coupon-editor-view" class="hidden flex-col max-h-[84vh]">
        <div class="px-4 py-3 bg-pastelBlue border-b-4 border-warmBrown flex items-center gap-3">
          <button id="coupon-editor-back" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
          <div class="flex-1 min-w-0"><h3 id="coupon-editor-title" class="font-bold text-warmBrown text-lg">新增優惠券</h3><p id="coupon-editor-country" class="text-[11px] text-warmBrown/60"></p></div>
          <button id="coupon-editor-save" type="button" class="px-4 py-2 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown text-xs font-bold">儲存</button>
        </div>
        <div class="p-4 overflow-y-auto bg-white space-y-4">
          <div>
            <label for="coupon-brand-search" class="block text-xs font-bold text-warmBrown mb-1.5">商店名稱</label>
            <input id="coupon-brand-search" type="search" autocomplete="off" class="w-full px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-bold outline-none" placeholder="搜尋中文、當地語言或英文品牌名稱">
            <div id="coupon-brand-results" class="hidden mt-2 max-h-44 overflow-y-auto space-y-1.5 rounded-2xl border-2 border-warmBrown/20 bg-white p-2"></div>
            <div id="coupon-selected-brand" class="hidden mt-2 rounded-2xl bg-pastelYellow/35 border-2 border-warmBrown/25 px-3 py-2 text-sm font-bold text-warmBrown"></div>
          </div>
          <div>
            <label for="coupon-url" class="block text-xs font-bold text-warmBrown mb-1.5">優惠券網址</label>
            <input id="coupon-url" type="url" inputmode="url" autocomplete="off" class="w-full px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown outline-none" placeholder="https://...">
          </div>
          <div>
            <label class="block text-xs font-bold text-warmBrown mb-1.5">使用日期</label>
            <div class="grid grid-cols-2 gap-3">
              <div><span class="block text-[10px] text-gray-500 mb-1">開始日期</span><input id="coupon-valid-from" type="date" class="w-full px-3 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown outline-none"></div>
              <div><span class="block text-[10px] text-gray-500 mb-1">截止日期</span><input id="coupon-valid-until" type="date" class="w-full px-3 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown outline-none"></div>
            </div>
          </div>
          <p class="text-[10px] text-gray-500 leading-relaxed">優惠券會以品牌字典的品牌 ID 關聯；之後補中文名稱時，這裡會自動改用中文顯示。</p>
          <button id="coupon-editor-delete" type="button" class="hidden w-full py-2.5 rounded-xl bg-pastelPink border-2 border-warmBrown text-warmBrown text-sm font-bold"><i class="fas fa-trash mr-2"></i>刪除優惠券</button>
        </div>
      </div>
    </div>`;
  documentRef.body.appendChild(modal);
}

export async function initCouponManagementUi({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  if (!documentRef || !windowRef) return () => {};
  if (windowRef.__shoppingListCouponManagementInitialized) return () => {};
  windowRef.__shoppingListCouponManagementInitialized = true;

  await waitFor(() => documentRef.getElementById('account-settings-root') && documentRef.getElementById('account-settings-modal'));
  ensureSettingsEntry(documentRef);
  ensureModal(documentRef);

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, onSnapshot, runTransaction } = firestoreSdk;

  const modal = documentRef.getElementById('coupon-management-modal');
  const accountModal = documentRef.getElementById('account-settings-modal');
  const countryView = documentRef.getElementById('coupon-country-view');
  const listView = documentRef.getElementById('coupon-list-view');
  const editorView = documentRef.getElementById('coupon-editor-view');
  const brandSearch = documentRef.getElementById('coupon-brand-search');
  const brandResults = documentRef.getElementById('coupon-brand-results');
  const selectedBrand = documentRef.getElementById('coupon-selected-brand');
  const urlInput = documentRef.getElementById('coupon-url');
  const validFromInput = documentRef.getElementById('coupon-valid-from');
  const validUntilInput = documentRef.getElementById('coupon-valid-until');
  const saveButton = documentRef.getElementById('coupon-editor-save');
  const deleteButton = documentRef.getElementById('coupon-editor-delete');

  const subscribers = new Set();
  const state = {
    userId: '',
    countries: [DEFAULT_COUNTRY],
    brands: [],
    coupons: [],
    selectedCountry: '',
    selectedBrandId: '',
    editingBrandId: '',
    returnContext: null,
    openedFromSettings: false,
    brandsLoaded: false,
    couponsLoaded: false,
    cleanupInFlight: false,
    settingsUnsub: null,
    brandsUnsub: null,
    couponsUnsub: null
  };

  function settingsRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences') : null;
  }

  function brandDictionaryRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'brandDictionary') : null;
  }

  function couponDictionaryRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'couponDictionary') : null;
  }

  function todayKey() {
    return localTodayKey(new Date());
  }

  function emit() {
    const snapshot = { coupons: [...state.coupons], brands: [...state.brands] };
    for (const listener of subscribers) {
      try { listener(snapshot); } catch (error) { console.error('Coupon subscriber failed:', error); }
    }
  }

  function showOnly(view) {
    for (const node of [countryView, listView, editorView]) {
      node.classList.toggle('hidden', node !== view);
      node.classList.toggle('flex', node === view);
    }
  }

  function brandById(brandId) {
    return state.brands.find((brand) => clean(brand?.id) === clean(brandId)) || null;
  }

  function brandDisplayName(brand) {
    if (!brand) return '未命名品牌';
    const seed = (Array.isArray(brand.aliases) ? brand.aliases : []).find((alias) => clean(alias?.value))?.value || brand.displayName || '';
    return resolveLocationDisplayName(seed, state.brands, brand.country) || clean(brand.displayName) || clean(seed) || '未命名品牌';
  }

  function couponForBrand(brandId) {
    return state.coupons.find((coupon) => clean(coupon?.brandId) === clean(brandId)) || null;
  }

  function closeManager({ returnToSettings = false } = {}) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showOnly(countryView);
    state.selectedCountry = '';
    state.selectedBrandId = '';
    state.editingBrandId = '';
    state.returnContext = null;
    const shouldReturn = returnToSettings || state.openedFromSettings;
    state.openedFromSettings = false;
    if (shouldReturn) {
      accountModal.classList.remove('hidden');
      accountModal.classList.add('flex');
    }
  }

  function openModal() {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function openFromSettings() {
    state.openedFromSettings = true;
    state.returnContext = null;
    accountModal.classList.add('hidden');
    accountModal.classList.remove('flex');
    openModal();
    showOnly(countryView);
    renderCountries();
  }

  function countryBrands(country = state.selectedCountry) {
    return state.brands.filter((brand) => sameCountry(brand?.country, country));
  }

  function countryCoupons(country = state.selectedCountry) {
    return state.coupons.filter((coupon) => sameCountry(coupon?.country, country));
  }

  function renderCountries() {
    const root = documentRef.getElementById('coupon-country-list');
    root.replaceChildren();
    for (const country of state.countries) {
      const count = countryCoupons(country).length;
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-warmBrown bg-shinBg text-left text-warmBrown';
      const name = documentRef.createElement('span');
      name.className = 'flex-1 min-w-0 font-bold';
      name.textContent = country;
      const countLabel = documentRef.createElement('span');
      countLabel.className = 'text-[10px] opacity-55';
      countLabel.textContent = `${count} 張優惠券`;
      const chevron = documentRef.createElement('i');
      chevron.className = 'fas fa-chevron-right text-xs';
      button.append(name, countLabel, chevron);
      button.addEventListener('click', () => openCountry(country));
      root.appendChild(button);
    }
  }

  function renderCouponList() {
    const root = documentRef.getElementById('coupon-list');
    const empty = documentRef.getElementById('coupon-empty');
    root.replaceChildren();
    const coupons = countryCoupons();
    empty.classList.toggle('hidden', coupons.length > 0);
    documentRef.getElementById('coupon-country-title').textContent = `${state.selectedCountry}優惠券`;
    for (const coupon of coupons) {
      const brand = brandById(coupon.brandId);
      if (!brand) continue;
      const card = documentRef.createElement('button');
      card.type = 'button';
      card.className = 'w-full rounded-2xl border-2 border-warmBrown bg-white p-3 text-left text-warmBrown';
      const status = couponDateStatus(coupon, todayKey());
      const heading = documentRef.createElement('div');
      heading.className = 'font-bold break-words';
      heading.textContent = brandDisplayName(brand);
      const dates = documentRef.createElement('div');
      dates.className = 'text-[11px] text-gray-500 mt-1';
      dates.textContent = `${coupon.validFrom} ～ ${coupon.validUntil}${status === 'future' ? ' · 尚未生效' : ''}`;
      card.append(heading, dates);
      card.addEventListener('click', () => openEditor({ country: state.selectedCountry, brandId: coupon.brandId }));
      root.appendChild(card);
    }
  }

  function openCountry(country) {
    state.selectedCountry = clean(country) || DEFAULT_COUNTRY;
    state.selectedBrandId = '';
    state.editingBrandId = '';
    showOnly(listView);
    renderCouponList();
  }

  function renderSelectedBrand() {
    const brand = brandById(state.selectedBrandId);
    selectedBrand.classList.toggle('hidden', !brand);
    selectedBrand.textContent = brand ? `已選擇：${brandDisplayName(brand)}` : '';
  }

  function chooseBrand(brand) {
    state.selectedBrandId = clean(brand?.id);
    brandSearch.value = brandDisplayName(brand);
    brandResults.classList.add('hidden');
    brandResults.replaceChildren();
    renderSelectedBrand();
    const existing = couponForBrand(state.selectedBrandId);
    if (existing) {
      state.editingBrandId = existing.brandId;
      urlInput.value = existing.couponUrl || '';
      validFromInput.value = existing.validFrom || '';
      validUntilInput.value = existing.validUntil || '';
      deleteButton.classList.remove('hidden');
      documentRef.getElementById('coupon-editor-title').textContent = '編輯優惠券';
    } else {
      state.editingBrandId = '';
      deleteButton.classList.add('hidden');
      documentRef.getElementById('coupon-editor-title').textContent = '新增優惠券';
    }
  }

  function renderBrandSearch() {
    const query = brandSearch.value;
    const matches = searchBrandsByAlias(state.brands, query, state.selectedCountry);
    brandResults.replaceChildren();
    brandResults.classList.toggle('hidden', matches.length === 0);
    for (const brand of matches) {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'w-full px-3 py-2 rounded-xl bg-shinBg border border-warmBrown/25 text-left';
      const label = documentRef.createElement('span');
      label.className = 'block text-sm font-bold text-warmBrown';
      label.textContent = brandDisplayName(brand);
      const aliases = documentRef.createElement('span');
      aliases.className = 'block text-[10px] text-gray-500 mt-0.5 break-words';
      aliases.textContent = (brand.aliases || []).map((alias) => clean(alias?.value)).filter(Boolean).join(' · ');
      button.append(label, aliases);
      button.addEventListener('click', () => chooseBrand(brand));
      brandResults.appendChild(button);
    }
  }

  function resetEditor() {
    state.selectedBrandId = '';
    state.editingBrandId = '';
    brandSearch.value = '';
    brandResults.replaceChildren();
    brandResults.classList.add('hidden');
    selectedBrand.textContent = '';
    selectedBrand.classList.add('hidden');
    urlInput.value = '';
    validFromInput.value = '';
    validUntilInput.value = '';
    deleteButton.classList.add('hidden');
    documentRef.getElementById('coupon-editor-title').textContent = '新增優惠券';
  }

  function openEditor({ country, brandId = '', returnContext = null } = {}) {
    state.selectedCountry = clean(country) || windowRef.shoppingListActiveTrip?.country || windowRef.shoppingListActiveCountry || DEFAULT_COUNTRY;
    state.returnContext = returnContext;
    resetEditor();
    documentRef.getElementById('coupon-editor-country').textContent = state.selectedCountry;
    openModal();
    showOnly(editorView);
    if (brandId) {
      const brand = brandById(brandId);
      if (brand && sameCountry(brand.country, state.selectedCountry)) chooseBrand(brand);
    }
  }

  async function transactCoupon(mutator) {
    const ref = couponDictionaryRef();
    if (!ref) throw new Error('請先登入 Google 帳號。');
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = Array.isArray(snapshot.data()?.coupons) ? snapshot.data().coupons.map((coupon) => ({ ...coupon })) : [];
      const next = mutator(current);
      transaction.set(ref, { coupons: next }, { merge: true });
    });
  }

  async function saveCoupon() {
    const result = validateCouponDraft({
      brandId: state.selectedBrandId,
      country: state.selectedCountry,
      couponUrl: urlInput.value,
      validFrom: validFromInput.value,
      validUntil: validUntilInput.value
    });
    if (!result.ok) {
      notify(windowRef, '無法儲存優惠券', result.error);
      return;
    }
    saveButton.disabled = true;
    try {
      const now = Date.now();
      await transactCoupon((coupons) => {
        const index = coupons.findIndex((coupon) => clean(coupon?.brandId) === result.value.brandId);
        const previous = index >= 0 ? coupons[index] : null;
        const nextCoupon = {
          ...result.value,
          createdAt: Number(previous?.createdAt) || now,
          updatedAt: now
        };
        if (index >= 0) coupons[index] = nextCoupon;
        else coupons.push(nextCoupon);
        return coupons;
      });
      notify(windowRef, '優惠券已儲存', '所有對應商品會自動使用這張優惠券。', 'success');
      if (state.returnContext) closeManager();
      else openCountry(state.selectedCountry);
    } catch (error) {
      console.error('Coupon save failed:', error);
      notify(windowRef, '儲存失敗', '無法儲存優惠券，請稍後再試。');
    } finally {
      saveButton.disabled = false;
    }
  }

  async function deleteCoupon() {
    const brandId = state.editingBrandId || state.selectedBrandId;
    if (!brandId) return;
    if (typeof windowRef.confirm === 'function' && !windowRef.confirm('確定要刪除這張優惠券嗎？')) return;
    deleteButton.disabled = true;
    try {
      await transactCoupon((coupons) => coupons.filter((coupon) => clean(coupon?.brandId) !== brandId));
      notify(windowRef, '優惠券已刪除', '對應商品不會再顯示這張優惠券。', 'success');
      if (state.returnContext) closeManager();
      else openCountry(state.selectedCountry);
    } catch (error) {
      console.error('Coupon delete failed:', error);
      notify(windowRef, '刪除失敗', '無法刪除優惠券，請稍後再試。');
    } finally {
      deleteButton.disabled = false;
    }
  }

  async function persistCleanupIfNeeded() {
    if (!state.userId || !state.brandsLoaded || !state.couponsLoaded || state.cleanupInFlight) return;
    const local = cleanupCoupons(state.coupons, state.brands, todayKey());
    if (!local.removed.length) return;
    state.coupons = local.kept;
    emit();
    state.cleanupInFlight = true;
    try {
      const ref = couponDictionaryRef();
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = Array.isArray(snapshot.data()?.coupons) ? snapshot.data().coupons : [];
        const fresh = cleanupCoupons(current, state.brands, todayKey());
        if (fresh.removed.length) transaction.set(ref, { coupons: fresh.kept }, { merge: true });
      });
    } catch (error) {
      console.error('Coupon cleanup failed:', error);
    } finally {
      state.cleanupInFlight = false;
    }
  }

  function stopListeners() {
    state.settingsUnsub?.();
    state.brandsUnsub?.();
    state.couponsUnsub?.();
    state.settingsUnsub = null;
    state.brandsUnsub = null;
    state.couponsUnsub = null;
  }

  function subscribeUser(user) {
    stopListeners();
    state.userId = user?.uid || '';
    state.countries = [DEFAULT_COUNTRY];
    state.brands = [];
    state.coupons = [];
    state.brandsLoaded = false;
    state.couponsLoaded = false;
    emit();
    if (!user) return;

    state.settingsUnsub = onSnapshot(settingsRef(), (snapshot) => {
      if (state.userId !== user.uid) return;
      state.countries = normalizeCountries(snapshot.data()?.countries);
      renderCountries();
    });
    state.brandsUnsub = onSnapshot(brandDictionaryRef(), (snapshot) => {
      if (state.userId !== user.uid) return;
      state.brands = Array.isArray(snapshot.data()?.brands) ? snapshot.data().brands : [];
      state.brandsLoaded = true;
      renderCountries();
      if (state.selectedCountry && !editorView.classList.contains('flex')) renderCouponList();
      emit();
      void persistCleanupIfNeeded();
    });
    state.couponsUnsub = onSnapshot(couponDictionaryRef(), (snapshot) => {
      if (state.userId !== user.uid) return;
      state.coupons = Array.isArray(snapshot.data()?.coupons) ? snapshot.data().coupons : [];
      state.couponsLoaded = true;
      if (state.brandsLoaded) {
        const cleaned = cleanupCoupons(state.coupons, state.brands, todayKey());
        state.coupons = cleaned.kept;
      }
      renderCountries();
      if (state.selectedCountry && !editorView.classList.contains('flex')) renderCouponList();
      emit();
      void persistCleanupIfNeeded();
    });
  }

  documentRef.getElementById('account-open-coupon-management')?.addEventListener('click', openFromSettings);
  documentRef.getElementById('coupon-back-settings')?.addEventListener('click', () => closeManager({ returnToSettings: true }));
  documentRef.getElementById('coupon-close')?.addEventListener('click', () => closeManager());
  documentRef.getElementById('coupon-country-back')?.addEventListener('click', () => { showOnly(countryView); renderCountries(); });
  documentRef.getElementById('coupon-editor-back')?.addEventListener('click', () => {
    if (state.returnContext) closeManager();
    else openCountry(state.selectedCountry);
  });
  documentRef.getElementById('coupon-add')?.addEventListener('click', () => openEditor({ country: state.selectedCountry }));
  brandSearch.addEventListener('input', () => {
    state.selectedBrandId = '';
    state.editingBrandId = '';
    renderSelectedBrand();
    renderBrandSearch();
  });
  brandSearch.addEventListener('focus', renderBrandSearch);
  saveButton.addEventListener('click', () => { void saveCoupon(); });
  deleteButton.addEventListener('click', () => { void deleteCoupon(); });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeManager();
  });

  windowRef.shoppingListCouponManager = {
    open: openEditor,
    coupons: () => [...state.coupons],
    brands: () => [...state.brands],
    todayKey,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      subscribers.add(listener);
      listener({ coupons: [...state.coupons], brands: [...state.brands] });
      return () => subscribers.delete(listener);
    }
  };

  const authUnsub = authSdk.onAuthStateChanged(auth, subscribeUser);
  return () => {
    authUnsub?.();
    stopListeners();
    subscribers.clear();
    if (windowRef.shoppingListCouponManager) delete windowRef.shoppingListCouponManager;
    windowRef.__shoppingListCouponManagementInitialized = false;
  };
}
