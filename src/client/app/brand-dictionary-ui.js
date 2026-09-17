import { DEFAULT_COUNTRY, normalizeCountries } from './travel-country.js';
import {
  defaultLanguageFieldsForCountry,
  effectiveLanguageFields,
  findBrandAliasConflict,
  normalizeBrandAliases,
  parseAliasValues
} from './brand-dictionary-core.js';

const APP_ID = 'japan-shopping-app';

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
        reject(new Error('等待品牌字典初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'error') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function sameCountry(left, right) {
  return clean(left).toLocaleLowerCase() === clean(right).toLocaleLowerCase();
}

function ensureSettingsEntry(documentRef) {
  const root = documentRef.getElementById('account-settings-root');
  if (!root || documentRef.getElementById('account-open-brand-dictionary')) return;
  const button = documentRef.createElement('button');
  button.id = 'account-open-brand-dictionary';
  button.type = 'button';
  button.className = 'account-setting-row w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelOrange/40 border-2 border-warmBrown text-warmBrown';
  button.innerHTML = `
    <span class="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-book-open"></i></span>
    <span class="flex-1 min-w-0"><span class="block font-bold">品牌字典</span><span class="block text-xs opacity-60 mt-0.5">依旅遊國家管理品牌名稱與別名</span></span>
    <i class="fas fa-chevron-right text-xs"></i>`;
  const mapsButton = documentRef.getElementById('account-open-maps');
  if (mapsButton?.parentElement === root) root.insertBefore(button, mapsButton);
  else root.appendChild(button);
}

function ensureModal(documentRef) {
  if (documentRef.getElementById('brand-dictionary-modal')) return;
  const modal = documentRef.createElement('div');
  modal.id = 'brand-dictionary-modal';
  modal.className = 'fixed inset-0 z-[96] hidden bg-warmBrown/45 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-md max-h-[88vh] overflow-hidden bg-white border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,0.28)]">
      <div id="brand-country-view" class="flex flex-col max-h-[84vh]">
        <div class="px-4 py-3 bg-pastelOrange/60 border-b-4 border-warmBrown flex items-center gap-3">
          <button id="brand-back-settings" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
          <div class="flex-1 min-w-0"><h3 class="font-bold text-warmBrown text-lg">品牌字典</h3><p class="text-[11px] text-warmBrown/60">每個旅遊國家分開管理，不會混成同一份清單</p></div>
          <button id="brand-close" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
        </div>
        <div id="brand-country-list" class="p-4 space-y-2 overflow-y-auto bg-white"></div>
      </div>

      <div id="brand-list-view" class="hidden flex-col max-h-[84vh]">
        <div class="px-4 py-3 bg-pastelYellow border-b-4 border-warmBrown flex items-center gap-3">
          <button id="brand-country-back" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
          <div class="flex-1 min-w-0"><h3 id="brand-country-title" class="font-bold text-warmBrown text-lg truncate">品牌字典</h3><p class="text-[11px] text-warmBrown/60">名稱只會套用到這個國家的判重</p></div>
          <button id="brand-add" type="button" class="px-3 py-2 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown text-xs font-bold"><i class="fas fa-plus mr-1"></i>新增品牌</button>
        </div>
        <div class="p-4 overflow-y-auto bg-white">
          <div class="rounded-2xl border-2 border-warmBrown/30 bg-shinBg p-3 mb-4">
            <div class="flex items-center justify-between gap-2 mb-2"><div><p class="text-xs font-bold text-warmBrown">語言欄位</p><p class="text-[10px] text-gray-500">各國預設不同，也可以自行新增語言</p></div></div>
            <div id="brand-language-fields" class="flex flex-wrap gap-2 mb-3"></div>
            <div class="flex gap-2">
              <input id="brand-language-input" type="text" autocomplete="off" class="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-warmBrown bg-white text-sm text-warmBrown font-bold outline-none" placeholder="例如：德文">
              <button id="brand-language-add" type="button" class="px-3 py-2 rounded-xl bg-pastelBlue border-2 border-warmBrown text-warmBrown text-xs font-bold">＋新增語言</button>
            </div>
          </div>
          <div id="brand-list" class="space-y-3"></div>
          <div id="brand-empty" class="hidden py-8 text-center text-sm font-bold text-gray-400">這個國家還沒有品牌資料</div>
        </div>
      </div>

      <div id="brand-editor-view" class="hidden flex-col max-h-[84vh]">
        <div class="px-4 py-3 bg-pastelBlue border-b-4 border-warmBrown flex items-center gap-3">
          <button id="brand-editor-back" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
          <div class="flex-1 min-w-0"><h3 id="brand-editor-title" class="font-bold text-warmBrown text-lg">新增品牌</h3><p id="brand-editor-country" class="text-[11px] text-warmBrown/60"></p></div>
          <button id="brand-editor-save" type="button" class="px-4 py-2 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown text-xs font-bold">儲存</button>
        </div>
        <div class="p-4 overflow-y-auto bg-white space-y-4">
          <div>
            <label for="brand-display-name" class="block text-xs font-bold text-warmBrown mb-1.5">主要顯示名稱 <span class="font-medium text-gray-400">（選填）</span></label>
            <input id="brand-display-name" type="text" autocomplete="off" class="w-full px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-bold outline-none" placeholder="留空會使用第一個已填名稱">
          </div>
          <div id="brand-alias-fields" class="space-y-3"></div>
          <p class="text-[10px] text-gray-500 leading-relaxed">「其他」可用逗號、頓號、分號或換行輸入多個別名。至少要填一個名稱。</p>
        </div>
      </div>
    </div>`;
  documentRef.body.appendChild(modal);
}

export async function initBrandDictionaryUi({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  if (!documentRef || !windowRef) return () => {};
  if (windowRef.__shoppingListBrandDictionaryInitialized) return () => {};
  windowRef.__shoppingListBrandDictionaryInitialized = true;

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
  const { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } = firestoreSdk;

  const modal = documentRef.getElementById('brand-dictionary-modal');
  const accountModal = documentRef.getElementById('account-settings-modal');
  const countryView = documentRef.getElementById('brand-country-view');
  const listView = documentRef.getElementById('brand-list-view');
  const editorView = documentRef.getElementById('brand-editor-view');
  const languageInput = documentRef.getElementById('brand-language-input');
  const displayNameInput = documentRef.getElementById('brand-display-name');
  const saveButton = documentRef.getElementById('brand-editor-save');

  const state = {
    userId: '',
    countries: [DEFAULT_COUNTRY],
    languageFieldsByCountry: {},
    brands: [],
    selectedCountry: '',
    editingBrandId: '',
    settingsUnsub: null,
    brandsUnsub: null
  };

  function settingsRef() {
    return state.userId ? doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences') : null;
  }

  function brandsRef() {
    return state.userId ? collection(db, 'artifacts', APP_ID, 'users', state.userId, 'brands') : null;
  }

  function brandRef(brandId) {
    return doc(db, 'artifacts', APP_ID, 'users', state.userId, 'brands', brandId);
  }

  function showOnly(view) {
    for (const node of [countryView, listView, editorView]) {
      node.classList.toggle('hidden', node !== view);
      node.classList.toggle('flex', node === view);
    }
  }

  function closeDictionary({ returnToSettings = false } = {}) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    state.selectedCountry = '';
    state.editingBrandId = '';
    showOnly(countryView);
    if (returnToSettings) {
      accountModal.classList.remove('hidden');
      accountModal.classList.add('flex');
    }
  }

  function openDictionary() {
    accountModal.classList.add('hidden');
    accountModal.classList.remove('flex');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    showOnly(countryView);
    renderCountries();
  }

  function countryBrands(country = state.selectedCountry) {
    return state.brands.filter((brand) => sameCountry(brand.country, country));
  }

  function fieldsFor(country = state.selectedCountry) {
    return effectiveLanguageFields(country, state.languageFieldsByCountry?.[country]);
  }

  function renderCountries() {
    const root = documentRef.getElementById('brand-country-list');
    if (!root) return;
    root.replaceChildren();
    for (const country of state.countries) {
      const count = countryBrands(country).length;
      const active = sameCountry(country, windowRef.shoppingListActiveTrip?.country || windowRef.shoppingListActiveCountry || '');
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-warmBrown bg-shinBg text-left text-warmBrown';
      button.innerHTML = `<span class="w-9 h-9 rounded-full bg-pastelYellow border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-store text-sm"></i></span><span class="flex-1 min-w-0"><span class="block font-bold"></span><span class="block text-[10px] opacity-55 mt-0.5">${count} 個品牌${active ? ' · 目前旅程' : ''}</span></span><i class="fas fa-chevron-right text-xs"></i>`;
      button.querySelector('.font-bold').textContent = country;
      button.addEventListener('click', () => openCountry(country));
      root.appendChild(button);
    }
  }

  function renderLanguageFields() {
    const root = documentRef.getElementById('brand-language-fields');
    if (!root || !state.selectedCountry) return;
    root.replaceChildren();
    const defaults = new Set(defaultLanguageFieldsForCountry(state.selectedCountry));
    for (const label of fieldsFor()) {
      const chip = documentRef.createElement('span');
      chip.className = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white border-2 border-warmBrown text-[11px] font-bold text-warmBrown';
      chip.append(documentRef.createTextNode(label));
      if (!defaults.has(label) && label !== '其他') {
        const remove = documentRef.createElement('button');
        remove.type = 'button';
        remove.className = 'w-4 h-4 rounded-full bg-pastelPink border border-warmBrown flex items-center justify-center';
        remove.setAttribute('aria-label', `移除${label}`);
        remove.innerHTML = '<i class="fas fa-times text-[7px]"></i>';
        remove.addEventListener('click', () => void removeLanguage(label));
        chip.appendChild(remove);
      }
      root.appendChild(chip);
    }
  }

  function renderBrandList() {
    const root = documentRef.getElementById('brand-list');
    const empty = documentRef.getElementById('brand-empty');
    if (!root || !empty) return;
    root.replaceChildren();
    const brands = countryBrands();
    empty.classList.toggle('hidden', brands.length > 0);
    for (const brand of brands) {
      const card = documentRef.createElement('div');
      card.className = 'rounded-2xl border-2 border-warmBrown bg-white p-3 text-warmBrown';
      const aliases = (Array.isArray(brand.aliases) ? brand.aliases : [])
        .map((alias) => `${clean(alias.language) || '其他'}：${clean(alias.value)}`)
        .filter(Boolean);
      card.innerHTML = `
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0"><h4 class="font-bold break-words"></h4><p class="brand-alias-summary text-[11px] text-gray-500 mt-1 leading-relaxed break-words"></p></div>
          <button type="button" class="brand-edit w-8 h-8 rounded-full bg-pastelBlue border-2 border-warmBrown"><i class="fas fa-pen text-xs"></i></button>
          <button type="button" class="brand-delete w-8 h-8 rounded-full bg-pastelPink border-2 border-warmBrown"><i class="fas fa-trash text-xs"></i></button>
        </div>`;
      card.querySelector('h4').textContent = clean(brand.displayName) || aliases[0] || '未命名品牌';
      card.querySelector('.brand-alias-summary').textContent = aliases.join(' · ');
      card.querySelector('.brand-edit').addEventListener('click', () => openEditor(brand));
      card.querySelector('.brand-delete').addEventListener('click', () => void removeBrand(brand));
      root.appendChild(card);
    }
  }

  function renderCountry() {
    documentRef.getElementById('brand-country-title').textContent = `${state.selectedCountry}品牌字典`;
    renderLanguageFields();
    renderBrandList();
  }

  function openCountry(country) {
    state.selectedCountry = clean(country);
    state.editingBrandId = '';
    if (!state.selectedCountry) return;
    showOnly(listView);
    renderCountry();
  }

  function aliasesByLanguage(brand) {
    const grouped = new Map();
    for (const alias of Array.isArray(brand?.aliases) ? brand.aliases : []) {
      const language = clean(alias?.language) || '其他';
      const value = clean(alias?.value);
      if (!value) continue;
      const values = grouped.get(language) || [];
      values.push(value);
      grouped.set(language, values);
    }
    return grouped;
  }

  function renderEditorFields(brand = null) {
    const root = documentRef.getElementById('brand-alias-fields');
    root.replaceChildren();
    const grouped = aliasesByLanguage(brand);
    for (const label of fieldsFor()) {
      const row = documentRef.createElement('div');
      const values = grouped.get(label) || [];
      row.innerHTML = `
        <label class="block text-xs font-bold text-warmBrown mb-1.5"></label>
        <textarea rows="1" class="brand-alias-input w-full px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-medium outline-none resize-y" data-language=""></textarea>`;
      row.querySelector('label').textContent = `${label}名稱`;
      const input = row.querySelector('.brand-alias-input');
      input.dataset.language = label;
      input.value = values.join(', ');
      root.appendChild(row);
    }
  }

  function openEditor(brand = null) {
    state.editingBrandId = clean(brand?.id);
    documentRef.getElementById('brand-editor-title').textContent = state.editingBrandId ? '編輯品牌' : '新增品牌';
    documentRef.getElementById('brand-editor-country').textContent = state.selectedCountry;
    displayNameInput.value = clean(brand?.displayName);
    renderEditorFields(brand);
    showOnly(editorView);
    setTimeout(() => documentRef.querySelector('.brand-alias-input')?.focus(), 50);
  }

  function collectAliases() {
    const entries = [];
    documentRef.querySelectorAll('#brand-alias-fields .brand-alias-input').forEach((input) => {
      const language = clean(input.dataset.language) || '其他';
      for (const value of parseAliasValues(input.value)) entries.push({ language, value });
    });
    return normalizeBrandAliases(entries);
  }

  async function saveBrand() {
    if (!state.userId || !state.selectedCountry) return notify('尚未登入', '請先登入後再管理品牌字典。', 'warning');
    const aliases = collectAliases();
    const displayName = clean(displayNameInput.value) || clean(aliases[0]?.value);
    if (!displayName && !aliases.length) return notify('缺少品牌名稱', '至少輸入一個品牌名稱。', 'warning');
    const candidateNames = [displayName, ...aliases.map((alias) => alias.value)].filter(Boolean);
    const conflict = findBrandAliasConflict(state.brands, candidateNames, state.editingBrandId, state.selectedCountry);
    if (conflict) {
      notify('名稱已被其他品牌使用', `「${clean(conflict.displayName) || '另一個品牌'}」已使用相同名稱或別名，請先檢查品牌字典。`, 'warning');
      return;
    }

    saveButton.disabled = true;
    try {
      const ref = state.editingBrandId ? brandRef(state.editingBrandId) : doc(brandsRef());
      const data = {
        country: state.selectedCountry,
        displayName,
        aliases,
        updatedAt: serverTimestamp()
      };
      if (!state.editingBrandId) data.createdAt = serverTimestamp();
      await setDoc(ref, data, { merge: Boolean(state.editingBrandId) });
      state.editingBrandId = '';
      showOnly(listView);
      notify('品牌已儲存', `「${displayName}」已加入${state.selectedCountry}品牌字典。`, 'success');
    } catch (error) {
      console.error('Save brand dictionary entry failed:', error);
      notify('儲存失敗', '品牌字典沒有完成變更，請稍後再試。');
    } finally {
      saveButton.disabled = false;
    }
  }

  async function removeBrand(brand) {
    if (!state.userId || !brand?.id) return;
    const label = clean(brand.displayName) || '這個品牌';
    if (typeof windowRef.confirm === 'function' && !windowRef.confirm(`確定刪除「${label}」？\n這不會刪除已存在的地點或商品。`)) return;
    try {
      await deleteDoc(brandRef(brand.id));
      notify('品牌已刪除', `已從${state.selectedCountry}品牌字典移除「${label}」。`, 'success');
    } catch (error) {
      console.error('Delete brand dictionary entry failed:', error);
      notify('刪除失敗', '無法刪除這筆品牌資料，請稍後再試。');
    }
  }

  async function persistLanguageFields(fields) {
    if (!state.userId || !state.selectedCountry) return;
    const nextMap = { ...state.languageFieldsByCountry, [state.selectedCountry]: effectiveLanguageFields(state.selectedCountry, fields) };
    try {
      await setDoc(settingsRef(), { brandLanguageFields: nextMap }, { merge: true });
      state.languageFieldsByCountry = nextMap;
      renderLanguageFields();
    } catch (error) {
      console.error('Save brand language fields failed:', error);
      notify('儲存失敗', '無法更新這個國家的品牌語言欄位。');
    }
  }

  async function addLanguage() {
    const label = clean(languageInput.value);
    if (!label) return notify('缺少語言名稱', '請輸入要新增的語言，例如「德文」。', 'warning');
    const current = fieldsFor();
    if (current.some((field) => field.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      return notify('語言已存在', `「${label}」已經在這個國家的欄位中。`, 'warning');
    }
    languageInput.value = '';
    await persistLanguageFields([...current.filter((field) => field !== '其他'), label, '其他']);
  }

  async function removeLanguage(label) {
    const next = fieldsFor().filter((field) => field !== label);
    await persistLanguageFields(next);
  }

  function subscribeUser(user) {
    state.settingsUnsub?.();
    state.brandsUnsub?.();
    state.settingsUnsub = null;
    state.brandsUnsub = null;
    state.userId = user?.uid || '';
    state.countries = [DEFAULT_COUNTRY];
    state.languageFieldsByCountry = {};
    state.brands = [];
    state.selectedCountry = '';
    state.editingBrandId = '';
    renderCountries();
    if (!user) {
      closeDictionary();
      return;
    }

    const ref = settingsRef();
    state.settingsUnsub = onSnapshot(ref, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.countries = normalizeCountries(data.countries);
      state.languageFieldsByCountry = data.brandLanguageFields && typeof data.brandLanguageFields === 'object' ? { ...data.brandLanguageFields } : {};
      renderCountries();
      if (state.selectedCountry) renderCountry();
    }, (error) => console.error('Brand dictionary settings listener failed:', error));

    state.brandsUnsub = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', state.userId, 'brands'), (snapshot) => {
      if (state.userId !== user.uid) return;
      state.brands = snapshot.docs.map((brandDoc) => ({ id: brandDoc.id, ...brandDoc.data() }));
      renderCountries();
      if (state.selectedCountry) renderBrandList();
    }, (error) => console.error('Brand dictionary listener failed:', error));
  }

  documentRef.getElementById('account-open-brand-dictionary')?.addEventListener('click', openDictionary);
  documentRef.getElementById('brand-back-settings')?.addEventListener('click', () => closeDictionary({ returnToSettings: true }));
  documentRef.getElementById('brand-close')?.addEventListener('click', () => closeDictionary());
  documentRef.getElementById('brand-country-back')?.addEventListener('click', () => {
    state.selectedCountry = '';
    showOnly(countryView);
    renderCountries();
  });
  documentRef.getElementById('brand-add')?.addEventListener('click', () => openEditor());
  documentRef.getElementById('brand-editor-back')?.addEventListener('click', () => {
    state.editingBrandId = '';
    showOnly(listView);
    renderCountry();
  });
  documentRef.getElementById('brand-editor-save')?.addEventListener('click', () => void saveBrand());
  documentRef.getElementById('brand-language-add')?.addEventListener('click', () => void addLanguage());
  languageInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void addLanguage();
    }
  });
  modal.addEventListener('click', (event) => { if (event.target === modal) closeDictionary(); });
  documentRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeDictionary({ returnToSettings: true });
  });
  windowRef.addEventListener('shopping-list:active-trip-changed', renderCountries);

  authSdk.onAuthStateChanged(auth, subscribeUser);
  return () => {
    state.settingsUnsub?.();
    state.brandsUnsub?.();
  };
}
