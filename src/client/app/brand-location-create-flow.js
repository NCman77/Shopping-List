import { DEFAULT_COUNTRY } from './travel-country.js';
import {
  effectiveLanguageFields,
  findBrandAliasConflict,
  normalizeBrandAliases,
  parseAliasValues
} from './brand-dictionary-core.js';
import {
  findBrandForLocation,
  inferAliasesFromLocation,
  mergeInferredAliases,
  resolveLocationDisplayName
} from './brand-location-resolver.js';

const APP_ID = 'japan-shopping-app';

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function raw(value) {
  return String(value ?? '').trim();
}

function sameCountry(left, right) {
  return clean(left).toLocaleLowerCase() === clean(right).toLocaleLowerCase();
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
        reject(new Error('等待地點品牌流程初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function createBrandId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `brand-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureModal(documentRef) {
  if (documentRef.getElementById('location-brand-editor-modal')) return;
  const modal = documentRef.createElement('div');
  modal.id = 'location-brand-editor-modal';
  modal.className = 'fixed inset-0 z-[145] hidden bg-warmBrown/55 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-md max-h-[88vh] overflow-hidden bg-white border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,0.3)] flex flex-col">
      <div class="px-4 py-3 bg-pastelBlue border-b-4 border-warmBrown flex items-center gap-3 shrink-0">
        <div class="flex-1 min-w-0">
          <h3 id="location-brand-editor-title" class="font-bold text-warmBrown text-lg">新增品牌字典</h3>
          <p id="location-brand-editor-subtitle" class="text-[11px] text-warmBrown/60 mt-0.5"></p>
        </div>
        <button id="location-brand-editor-close" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
      </div>
      <div class="p-4 overflow-y-auto bg-white space-y-4 flex-1">
        <div class="rounded-2xl border-2 border-warmBrown/20 bg-pastelYellow/25 px-3 py-2.5">
          <p class="text-[11px] text-gray-500">新增地點</p>
          <p id="location-brand-raw-name" class="font-bold text-warmBrown break-words mt-0.5"></p>
        </div>
        <div>
          <label class="block text-xs font-bold text-warmBrown mb-1.5" for="location-brand-display-name">主要顯示名稱 <span class="font-medium text-gray-400">（選填）</span></label>
          <input id="location-brand-display-name" type="text" autocomplete="off" class="w-full px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-bold outline-none" placeholder="留空會使用已填名稱">
        </div>
        <div id="location-brand-alias-fields" class="space-y-3"></div>
        <div class="rounded-2xl border-2 border-warmBrown/25 bg-shinBg p-3">
          <p class="text-xs font-bold text-warmBrown">新增語言</p>
          <p class="text-[10px] text-gray-500 mt-0.5 mb-2">需要其他語言時可在這裡加欄位。</p>
          <div class="flex gap-2">
            <input id="location-brand-language-input" type="text" autocomplete="off" class="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-warmBrown bg-white text-sm text-warmBrown font-bold outline-none" placeholder="例如：義大利文">
            <button id="location-brand-language-add" type="button" class="px-3 py-2 rounded-xl bg-pastelBlue border-2 border-warmBrown text-warmBrown text-xs font-bold">＋新增語言</button>
          </div>
        </div>
        <p id="location-brand-editor-note" class="text-[10px] text-gray-500 leading-relaxed"></p>
      </div>
      <div class="p-4 border-t-2 border-warmBrown/20 bg-shinBg flex gap-3 shrink-0">
        <button id="location-brand-editor-secondary" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-white">取消</button>
        <button id="location-brand-editor-save" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-pastelGreen">新增品牌並加入地點</button>
      </div>
    </div>`;
  documentRef.body.appendChild(modal);
}

export async function initBrandLocationCreateFlow({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  if (!documentRef || !windowRef) return () => {};
  if (windowRef.__shoppingListBrandLocationCreateFlowInitialized) return () => {};
  windowRef.__shoppingListBrandLocationCreateFlowInitialized = true;

  await waitFor(() => documentRef.body && typeof windowRef.showMsg === 'function');
  ensureModal(documentRef);

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, onSnapshot, writeBatch } = firestoreSdk;

  const modal = documentRef.getElementById('location-brand-editor-modal');
  const fieldsRoot = documentRef.getElementById('location-brand-alias-fields');
  const displayNameInput = documentRef.getElementById('location-brand-display-name');
  const languageInput = documentRef.getElementById('location-brand-language-input');
  const saveButton = documentRef.getElementById('location-brand-editor-save');
  const secondaryButton = documentRef.getElementById('location-brand-editor-secondary');

  const state = {
    userId: '',
    brands: [],
    languageFieldsByCountry: {},
    dictionaryLoaded: false,
    preferencesLoaded: false,
    pending: null,
    draftFields: [],
    settingsUnsub: null,
    dictionaryUnsub: null
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

  function closeEditor() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    state.pending = null;
    state.draftFields = [];
    languageInput.value = '';
  }

  function currentDraftValues() {
    const map = new Map();
    fieldsRoot.querySelectorAll('.location-brand-alias-input').forEach((input) => {
      map.set(clean(input.dataset.language) || '其他', input.value);
    });
    return map;
  }

  function groupedAliases(aliases = []) {
    const map = new Map();
    for (const alias of aliases) {
      const language = clean(alias?.language) || '其他';
      const value = raw(alias?.value);
      if (!value) continue;
      const values = map.get(language) || [];
      if (!values.includes(value)) values.push(value);
      map.set(language, values);
    }
    return map;
  }

  function renderFields(aliases = [], preservedDraft = null) {
    fieldsRoot.replaceChildren();
    const grouped = groupedAliases(aliases);
    for (const language of state.draftFields) {
      const row = documentRef.createElement('div');
      row.innerHTML = `
        <label class="block text-xs font-bold text-warmBrown mb-1.5"></label>
        <textarea rows="1" class="location-brand-alias-input w-full px-4 py-2.5 rounded-xl bg-shinBg border-2 border-warmBrown text-warmBrown font-medium outline-none resize-y" data-language=""></textarea>`;
      row.querySelector('label').textContent = `${language}名稱`;
      const input = row.querySelector('textarea');
      input.dataset.language = language;
      input.value = preservedDraft?.has(language)
        ? preservedDraft.get(language)
        : (grouped.get(language) || []).join(', ');
      fieldsRoot.appendChild(row);
    }
  }

  function buildPrefillAliases(existingBrand, rawLocation, country) {
    const existing = Array.isArray(existingBrand?.aliases) ? existingBrand.aliases : [];
    return mergeInferredAliases(existing, inferAliasesFromLocation(rawLocation, country));
  }

  function openEditor(rawLocation, continueAdd) {
    const country = activeCountry();
    const existingBrand = findBrandForLocation(state.brands, rawLocation, country);
    const required = !existingBrand;
    const prefillAliases = buildPrefillAliases(existingBrand, rawLocation, country);
    state.pending = { rawLocation, continueAdd, country, existingBrand, required };
    state.draftFields = [...effectiveLanguageFields(country, state.languageFieldsByCountry?.[country])];
    for (const alias of prefillAliases) {
      const language = clean(alias?.language) || '其他';
      if (!state.draftFields.includes(language)) state.draftFields.push(language);
    }

    documentRef.getElementById('location-brand-editor-title').textContent = required ? '新增品牌字典' : '補充品牌字典';
    documentRef.getElementById('location-brand-editor-subtitle').textContent = required
      ? `${country} · 此地點尚未建立品牌資料，需先建立後才能加入。`
      : `${country} · 已找到「${resolveLocationDisplayName(rawLocation, [existingBrand], country)}」，可選擇補充其他語言。`;
    documentRef.getElementById('location-brand-raw-name').textContent = rawLocation;
    documentRef.getElementById('location-brand-editor-note').textContent = required
      ? '至少保留一個名稱即可；不強迫每種語言都填寫。按取消不會新增這個地點。'
      : '若不需要補充其他語言，可直接按「略過補充」，地點仍會正常加入。';
    secondaryButton.textContent = required ? '取消' : '略過補充';
    saveButton.textContent = required ? '新增品牌並加入地點' : '更新品牌並加入地點';
    displayNameInput.value = raw(existingBrand?.displayName);
    renderFields(prefillAliases);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function collectAliases() {
    const entries = [];
    fieldsRoot.querySelectorAll('.location-brand-alias-input').forEach((input) => {
      const language = clean(input.dataset.language) || '其他';
      for (const value of parseAliasValues(input.value)) entries.push({ language, value });
    });
    return normalizeBrandAliases(entries);
  }

  async function saveAndContinue() {
    const pending = state.pending;
    if (!pending || !state.userId) return;
    const aliases = collectAliases();
    if (!aliases.length) {
      notify('缺少品牌名稱', '至少需要一個品牌名稱才能建立品牌字典。', 'warning');
      return;
    }
    const displayName = clean(displayNameInput.value) || raw(aliases[0]?.value);
    const excludeId = clean(pending.existingBrand?.id);
    const conflict = findBrandAliasConflict(
      state.brands,
      [displayName, ...aliases.map((alias) => alias.value)],
      excludeId,
      pending.country
    );
    if (conflict) {
      notify('名稱已被其他品牌使用', `「${clean(conflict.displayName) || '另一個品牌'}」已使用相同名稱或別名。`, 'warning');
      return;
    }

    saveButton.disabled = true;
    try {
      const now = Date.now();
      const existing = pending.existingBrand;
      const nextBrand = {
        ...(existing || {}),
        id: existing?.id || createBrandId(),
        country: pending.country,
        displayName,
        aliases,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      const nextBrands = existing
        ? state.brands.map((brand) => String(brand?.id || '') === String(existing.id) ? nextBrand : brand)
        : [...state.brands, nextBrand];
      const nextLanguageFields = {
        ...state.languageFieldsByCountry,
        [pending.country]: effectiveLanguageFields(pending.country, state.draftFields)
      };

      const preferences = settingsRef();
      const dictionary = dictionaryRef();
      if (!preferences || !dictionary) throw new Error('Brand dictionary references unavailable.');
      const batch = writeBatch(db);
      batch.set(preferences, { brandLanguageFields: nextLanguageFields }, { merge: true });
      batch.set(dictionary, { brands: nextBrands }, { merge: true });
      await batch.commit();

      state.brands = nextBrands;
      state.languageFieldsByCountry = nextLanguageFields;
      const continueAdd = pending.continueAdd;
      const rawLocation = pending.rawLocation;
      closeEditor();
      continueAdd?.(rawLocation);
      notify(existing ? '品牌已更新' : '品牌已建立', existing ? '品牌字典已補充，並加入地點。' : '品牌字典已建立，並加入地點。', 'success');
    } catch (error) {
      console.error('Save location brand failed:', error);
      notify('儲存失敗', '品牌字典沒有完成變更，因此地點也尚未新增。', 'error');
    } finally {
      saveButton.disabled = false;
    }
  }

  function skipOrCancel() {
    const pending = state.pending;
    if (!pending) return closeEditor();
    const maySkip = !pending.required;
    const continueAdd = pending.continueAdd;
    const rawLocation = pending.rawLocation;
    closeEditor();
    if (maySkip) continueAdd?.(rawLocation);
  }

  documentRef.getElementById('location-brand-editor-close')?.addEventListener('click', skipOrCancel);
  secondaryButton.addEventListener('click', skipOrCancel);
  saveButton.addEventListener('click', () => void saveAndContinue());
  documentRef.getElementById('location-brand-language-add')?.addEventListener('click', () => {
    const language = clean(languageInput.value);
    if (!language) return;
    if (state.draftFields.some((entry) => clean(entry).toLocaleLowerCase() === language.toLocaleLowerCase())) {
      notify('語言已存在', `「${language}」已經有名稱欄位。`, 'warning');
      return;
    }
    const draft = currentDraftValues();
    state.draftFields.push(language);
    languageInput.value = '';
    renderFields(collectAliases(), draft);
  });
  modal.addEventListener('click', (event) => { if (event.target === modal) skipOrCancel(); });
  documentRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) skipOrCancel();
  });

  windowRef.shoppingListRequestBrandForLocation = (rawLocation, continueAdd) => {
    const location = raw(rawLocation);
    if (!location) return false;
    if (!state.userId) {
      notify('尚未登入', '請先登入後再新增地點。', 'warning');
      return true;
    }
    if (!state.dictionaryLoaded || !state.preferencesLoaded) {
      notify('品牌字典載入中', '品牌資料尚未同步完成，請稍後再新增地點。', 'warning');
      return true;
    }
    openEditor(location, continueAdd);
    return true;
  };

  function subscribeUser(user) {
    state.settingsUnsub?.();
    state.dictionaryUnsub?.();
    state.settingsUnsub = null;
    state.dictionaryUnsub = null;
    state.userId = user?.uid || '';
    state.brands = [];
    state.languageFieldsByCountry = {};
    state.dictionaryLoaded = false;
    state.preferencesLoaded = false;
    closeEditor();
    if (!user) return;

    const preferences = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');
    const dictionary = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'brandDictionary');
    state.settingsUnsub = onSnapshot(preferences, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.languageFieldsByCountry = data.brandLanguageFields && typeof data.brandLanguageFields === 'object'
        ? { ...data.brandLanguageFields }
        : {};
      state.preferencesLoaded = true;
    }, (error) => {
      console.error('Brand location preferences listener failed:', error);
      state.preferencesLoaded = true;
    });
    state.dictionaryUnsub = onSnapshot(dictionary, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.brands = Array.isArray(data.brands) ? data.brands.map((brand) => ({ ...brand })) : [];
      state.dictionaryLoaded = true;
    }, (error) => {
      console.error('Brand location dictionary listener failed:', error);
      state.dictionaryLoaded = true;
    });
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  return () => {
    state.settingsUnsub?.();
    state.dictionaryUnsub?.();
    if (windowRef.shoppingListRequestBrandForLocation) delete windowRef.shoppingListRequestBrandForLocation;
  };
}
