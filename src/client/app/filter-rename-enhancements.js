import { buildRenameItemPatch, renameOption } from './filter-management.js';

const APP_ID = 'japan-shopping-app';
const FIELD_BY_KIND = { category: 'categories', location: 'locations' };
const LABEL_BY_KIND = { category: '分類', location: '地點' };
const MAX_RENAME_ITEM_WRITES = 499;

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
        reject(new Error('等待分類／地點重新命名功能初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'error') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function removeHomepageAddButtons(documentRef) {
  const targets = [
    ['category-filters', 'handleAddCategory'],
    ['location-filters', 'handleAddLocation']
  ];
  for (const [rootId, handlerName] of targets) {
    const row = documentRef.getElementById(rootId)?.parentElement;
    row?.querySelector?.(`button[onclick*="${handlerName}"]`)?.remove();
  }
}

function ensureRenameModal(documentRef) {
  if (documentRef.getElementById('filter-rename-modal')) return;
  const modal = documentRef.createElement('div');
  modal.id = 'filter-rename-modal';
  modal.className = 'fixed inset-0 z-[85] hidden bg-warmBrown/50 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-sm bg-white border-4 border-warmBrown rounded-[2rem] p-5 shadow-[8px_8px_0_rgba(92,64,51,0.3)]">
      <div class="w-11 h-11 rounded-full bg-pastelBlue border-2 border-warmBrown flex items-center justify-center text-warmBrown text-lg mb-3"><i class="fas fa-pen"></i></div>
      <h3 id="filter-rename-title" class="text-xl font-bold text-warmBrown">重新命名</h3>
      <p id="filter-rename-summary" class="text-xs text-gray-500 mt-1"></p>
      <input id="filter-rename-input" type="text" autocomplete="off" class="mt-4 w-full bg-shinBg border-2 border-warmBrown rounded-xl px-4 py-3 font-bold text-warmBrown focus:outline-none focus:bg-white focus:border-4">
      <div class="flex gap-3 mt-5">
        <button id="cancel-filter-rename" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-white">取消</button>
        <button id="confirm-filter-rename" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-pastelBlue shadow-[2px_2px_0_rgba(92,64,51,0.2)]">儲存名稱</button>
      </div>
    </div>`;
  documentRef.body.appendChild(modal);
}

function managementKind(documentRef) {
  const title = clean(documentRef.getElementById('manage-filter-title')?.textContent);
  if (title.includes('分類')) return 'category';
  if (title.includes('地點')) return 'location';
  return '';
}

export async function initFilterRenameEnhancements({
  documentRef = typeof document !== 'undefined' ? document : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !MutationObserverImpl) return () => {};
  if (documentRef.documentElement?.dataset?.filterRenameInitialized === 'true') return () => {};

  await waitFor(() => documentRef.getElementById('category-filters') && documentRef.getElementById('location-filters'));
  removeHomepageAddButtons(documentRef);
  const manageList = await waitFor(() => documentRef.getElementById('manage-filter-list'));
  ensureRenameModal(documentRef);
  documentRef.documentElement.dataset.filterRenameInitialized = 'true';

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, writeBatch } = firestoreSdk;

  const state = {
    userId: '',
    categories: [],
    locations: [],
    items: [],
    pendingRename: null,
    settingsUnsub: null,
    itemsUnsub: null
  };

  const renameModal = documentRef.getElementById('filter-rename-modal');
  const renameInput = documentRef.getElementById('filter-rename-input');
  const confirmRename = documentRef.getElementById('confirm-filter-rename');

  function valuesFor(kind) {
    return state[FIELD_BY_KIND[kind]] || [];
  }

  function closeRenameModal() {
    renameModal.classList.add('hidden');
    renameModal.classList.remove('flex');
    state.pendingRename = null;
    renameInput.value = '';
  }

  function openRenameModal(kind, value) {
    if (kind === 'location') return;
    if (!LABEL_BY_KIND[kind] || !value) return;
    state.pendingRename = { kind, value };
    documentRef.getElementById('filter-rename-title').textContent = `重新命名${LABEL_BY_KIND[kind]}`;
    documentRef.getElementById('filter-rename-summary').textContent = `「${value}」會同步更新所有已新增商品。`;
    renameInput.value = value;
    renameModal.classList.remove('hidden');
    renameModal.classList.add('flex');
    setTimeout(() => {
      renameInput.focus();
      renameInput.select();
    }, 40);
  }

  function enhanceManagementRows() {
    const kind = managementKind(documentRef);
    if (!kind) return;
    const help = documentRef.querySelector('#manage-filter-modal p');
    if (kind === 'location') {
      if (help) help.textContent = '按住左側把手拖曳或用箭頭排序；名稱與刪除請至品牌字典管理';
      manageList.querySelectorAll('.rename-option').forEach((button) => button.remove());
      return;
    }
    if (help) help.textContent = '按住左側把手拖曳或用箭頭排序；鉛筆可重新命名';

    manageList.querySelectorAll('.manage-row').forEach((row) => {
      if (row.querySelector('.rename-option')) return;
      const value = clean(row.dataset?.manageValue || row.querySelector('.manage-option-name')?.textContent);
      const deleteButton = row.querySelector('.delete-option');
      if (!value || !deleteButton) return;
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'rename-option w-8 h-8 rounded-full bg-pastelBlue border border-warmBrown text-warmBrown';
      button.setAttribute('aria-label', `重新命名${LABEL_BY_KIND[kind]}${value}`);
      button.innerHTML = '<i class="fas fa-pen text-xs"></i>';
      button.addEventListener('click', () => openRenameModal(kind, value));
      deleteButton.insertAdjacentElement('beforebegin', button);
    });
  }

  async function commitRename() {
    const pending = state.pendingRename;
    if (!pending || !state.userId) return;
    const nextName = clean(renameInput.value);
    const currentValues = valuesFor(pending.kind);

    if (!nextName) {
      notify('名稱不能空白', `請輸入新的${LABEL_BY_KIND[pending.kind]}名稱。`, 'warning');
      return;
    }
    if (nextName === pending.value) {
      closeRenameModal();
      return;
    }
    if (valuesFor(pending.kind).includes(nextName)) {
      notify('名稱已存在', `「${nextName}」已經在${LABEL_BY_KIND[pending.kind]}清單中，請使用不同名稱。`, 'warning');
      return;
    }
    if (!currentValues.includes(pending.value)) {
      notify('資料已變更', '這個選項已經不存在，請重新開啟管理畫面。', 'warning');
      closeRenameModal();
      return;
    }

    const itemPatches = state.items
      .map((item) => ({ item, patch: buildRenameItemPatch(item, pending.kind, pending.value, nextName) }))
      .filter(({ patch }) => Boolean(patch));
    if (itemPatches.length > MAX_RENAME_ITEM_WRITES) {
      notify('使用商品太多', `目前有 ${itemPatches.length} 個商品使用這個${LABEL_BY_KIND[pending.kind]}，超過單次安全更新上限，名稱尚未變更。`);
      return;
    }

    confirmRename.disabled = true;
    try {
      const nextValues = renameOption(currentValues, pending.value, nextName);
      const batch = writeBatch(db);
      const settingsRef = doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences');
      batch.set(settingsRef, { [FIELD_BY_KIND[pending.kind]]: nextValues }, { merge: true });
      for (const { item, patch } of itemPatches) {
        const itemRef = doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', item.id);
        batch.update(itemRef, patch);
      }
      await batch.commit();
      closeRenameModal();
      notify('名稱已更新', `「${pending.value}」已改成「${nextName}」，並同步更新既有商品。`, 'success');
    } catch (error) {
      console.error('Filter rename failed:', error);
      notify('重新命名失敗', '設定與商品都沒有完成變更，請稍後再試。');
    } finally {
      confirmRename.disabled = false;
    }
  }

  documentRef.getElementById('cancel-filter-rename')?.addEventListener('click', closeRenameModal);
  confirmRename?.addEventListener('click', commitRename);
  renameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename();
    }
  });
  renameModal.addEventListener('click', (event) => {
    if (event.target === renameModal) closeRenameModal();
  });

  const observer = new MutationObserverImpl(enhanceManagementRows);
  observer.observe(manageList, { childList: true, subtree: true });
  enhanceManagementRows();

  function subscribeUser(user) {
    state.settingsUnsub?.();
    state.itemsUnsub?.();
    state.settingsUnsub = null;
    state.itemsUnsub = null;
    state.userId = user?.uid || '';
    state.categories = [];
    state.locations = [];
    state.items = [];
    closeRenameModal();
    if (!user) return;

    const settingsRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.settingsUnsub = onSnapshot(settingsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.categories = Array.isArray(data.categories) ? [...data.categories] : [];
      state.locations = Array.isArray(data.locations) ? [...data.locations] : [];
    }, (error) => console.error('Filter rename settings listener failed:', error));
    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
    }, (error) => console.error('Filter rename item listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  return () => {
    observer.disconnect();
    state.settingsUnsub?.();
    state.itemsUnsub?.();
  };
}