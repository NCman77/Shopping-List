import { buildLocationDeletionPlan, findItemsUsingOption, moveOption, removeOption } from './filter-management.js';

const APP_ID = 'japan-shopping-app';
const FIELD_BY_KIND = { category: 'categories', location: 'locations' };
const LABEL_BY_KIND = { category: '分類', location: '地點' };

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
        reject(new Error('等待首頁初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'error') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function installStyles() {
  if (document.getElementById('home-ui-enhancement-styles')) return;
  const style = document.createElement('style');
  style.id = 'home-ui-enhancement-styles';
  style.textContent = `
    #add-item-btn {
      position: fixed !important;
      bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px)) !important;
      right: max(1.5rem, calc((100vw - 28rem) / 2 + 1.5rem)) !important;
    }
    @media (max-width: 28rem) {
      #add-item-btn { right: 1.5rem !important; }
    }
    #user-panel {
      position: absolute !important;
      top: 1rem !important;
      right: 1rem !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      max-width: none !important;
      gap: 0 !important;
      cursor: pointer;
    }
    #user-panel #user-name,
    #user-panel #sign-out-btn { display: none !important; }
    #user-panel #user-avatar,
    #user-panel #user-avatar-fallback {
      width: 2.5rem !important;
      height: 2.5rem !important;
      border-width: 2px !important;
      box-shadow: 2px 2px 0 rgba(92,64,51,.25);
      background: white;
    }
    .filter-manage-trigger { cursor: pointer; user-select: none; }
    .filter-manage-trigger:active { transform: translateY(1px); }
    .filter-drag-handle { touch-action: none; cursor: grab; }
    .filter-drag-handle:active { cursor: grabbing; }
    .manage-row.drop-target { outline: 3px solid #FFB5A7; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

function removeShinChanStyle() {
  document.querySelectorAll('header p').forEach((node) => {
    if (node.textContent?.trim() === 'Shin-chan Style') node.remove();
  });
}

function setupAccountMenu() {
  const panel = document.getElementById('user-panel');
  const header = panel?.closest('header');
  if (!panel || !header || document.getElementById('account-menu')) return;

  panel.setAttribute('role', 'button');
  panel.setAttribute('tabindex', '0');
  panel.setAttribute('aria-label', 'Google 帳號選單');
  panel.setAttribute('aria-expanded', 'false');
  document.getElementById('user-name')?.setAttribute('aria-hidden', 'true');

  const menu = document.createElement('div');
  menu.id = 'account-menu';
  menu.className = 'hidden absolute top-16 right-4 z-[65] bg-white border-2 border-warmBrown rounded-2xl p-2 shadow-[4px_4px_0_rgba(92,64,51,0.2)]';
  menu.innerHTML = '<button id="account-menu-signout" type="button" class="whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold text-warmBrown hover:bg-pastelBlue"><i class="fas fa-right-from-bracket mr-2"></i>登出</button>';
  header.appendChild(menu);

  const setOpen = (open) => {
    menu.classList.toggle('hidden', !open);
    panel.setAttribute('aria-expanded', String(open));
  };
  const toggle = (event) => {
    event.stopPropagation();
    setOpen(menu.classList.contains('hidden'));
  };

  panel.addEventListener('click', toggle);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(event);
    }
  });
  menu.addEventListener('click', (event) => event.stopPropagation());
  menu.querySelector('#account-menu-signout').addEventListener('click', () => {
    setOpen(false);
    document.getElementById('sign-out-btn')?.click();
  });
  document.addEventListener('click', () => setOpen(false));
}

function ensureManagementUi() {
  if (document.getElementById('manage-filter-modal')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="manage-filter-modal" class="fixed inset-0 z-[70] hidden bg-warmBrown/40 backdrop-blur-sm px-4 items-center justify-center">
      <div class="w-full max-w-sm bg-shinBg border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,0.25)] overflow-hidden">
        <div class="bg-pastelYellow border-b-4 border-warmBrown px-5 py-4 flex items-center justify-between">
          <div>
            <h2 id="manage-filter-title" class="text-xl font-bold text-warmBrown">管理分類</h2>
            <p class="text-[11px] text-warmBrown/60 font-bold mt-1">按住左側把手拖曳，或用箭頭調整順序</p>
          </div>
          <button id="close-manage-filter" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
        </div>
        <div id="manage-filter-list" class="p-4 space-y-2 max-h-[58vh] overflow-y-auto bg-white"></div>
        <div class="p-4 border-t-2 border-warmBrown/20 bg-shinBg">
          <button id="done-manage-filter" type="button" class="w-full py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,0.2)]">完成</button>
        </div>
      </div>
    </div>
    <div id="filter-delete-warning-modal" class="fixed inset-0 z-[80] hidden bg-warmBrown/50 backdrop-blur-sm px-4 items-center justify-center">
      <div class="w-full max-w-sm bg-white border-4 border-warmBrown rounded-[2rem] p-5 shadow-[8px_8px_0_rgba(92,64,51,0.3)]">
        <div class="w-12 h-12 rounded-full bg-pastelPink border-2 border-warmBrown flex items-center justify-center text-warmBrown text-xl mb-3"><i class="fas fa-triangle-exclamation"></i></div>
        <h3 id="filter-delete-title" class="text-xl font-bold text-warmBrown"></h3>
        <p id="filter-delete-summary" class="text-sm font-bold text-warmBrown mt-2"></p>
        <div id="filter-delete-usage-list" class="mt-3 max-h-48 overflow-y-auto space-y-1.5"></div>
        <p id="filter-delete-retain-note" class="text-xs text-gray-500 mt-4 leading-relaxed"></p>
        <div class="flex gap-3 mt-5">
          <button id="cancel-filter-delete" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-white">取消</button>
          <button id="confirm-filter-delete" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-pastelPink shadow-[2px_2px_0_rgba(92,64,51,0.2)]">仍要刪除</button>
        </div>
      </div>
    </div>
  `;
  while (wrapper.firstElementChild) document.body.appendChild(wrapper.firstElementChild);
}

export async function initHomeUiEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListHomeUiInitialized) return;
  window.__shoppingListHomeUiInitialized = true;

  await waitFor(() => document.getElementById('category-filters') && document.getElementById('location-filters') && document.getElementById('user-panel'));
  installStyles();
  removeShinChanStyle();
  setupAccountMenu();
  ensureManagementUi();

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, setDoc, writeBatch } = firestoreSdk;

  const state = {
    userId: null,
    categories: [],
    locations: [],
    items: [],
    settingsLoaded: false,
    currentKind: null,
    pendingDelete: null,
    settingsUnsub: null,
    itemsUnsub: null
  };

  const modal = document.getElementById('manage-filter-modal');
  const warningModal = document.getElementById('filter-delete-warning-modal');
  const list = document.getElementById('manage-filter-list');
  const title = document.getElementById('manage-filter-title');

  function valuesFor(kind) {
    return state[FIELD_BY_KIND[kind]] || [];
  }

  async function persistValues(kind, nextValues) {
    if (!state.userId) throw new Error('請先登入 Google 帳號。');
    const field = FIELD_BY_KIND[kind];
    const previous = state[field];
    state[field] = nextValues;
    renderManageList();
    try {
      const settingsRef = doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences');
      await setDoc(settingsRef, { [field]: nextValues }, { merge: true });
    } catch (error) {
      state[field] = previous;
      renderManageList();
      throw error;
    }
  }

  function closeManageModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    state.currentKind = null;
  }

  function closeWarningModal() {
    warningModal.classList.add('hidden');
    warningModal.classList.remove('flex');
    state.pendingDelete = null;
  }

  function markDropTarget(index) {
    list.querySelectorAll('.manage-row').forEach((row) => {
      row.classList.toggle('drop-target', Number(row.dataset.manageIndex) === index);
    });
  }

  function clearDropTargets() {
    list.querySelectorAll('.manage-row').forEach((row) => row.classList.remove('drop-target'));
  }

  async function moveAndSave(kind, fromIndex, toIndex) {
    const next = moveOption(valuesFor(kind), fromIndex, toIndex);
    if (next.every((value, index) => value === valuesFor(kind)[index])) return;
    try {
      await persistValues(kind, next);
    } catch (error) {
      console.error('Filter reorder failed:', error);
      notify('排序失敗', '無法儲存新的排列順序。');
    }
  }

  function openDeleteWarning(kind, value) {
    const usages = findItemsUsingOption(state.items, kind, value);
    state.pendingDelete = { kind, value };
    document.getElementById('filter-delete-title').textContent = `刪除${LABEL_BY_KIND[kind]}「${value}」？`;
    const summary = document.getElementById('filter-delete-summary');
    const usageList = document.getElementById('filter-delete-usage-list');
    const note = document.getElementById('filter-delete-retain-note');
    usageList.innerHTML = '';

    if (usages.length) {
      summary.textContent = `⚠️ 目前有 ${usages.length} 個商品仍在使用這個${LABEL_BY_KIND[kind]}：`;
      usages.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'rounded-xl bg-pastelYellow/50 border border-warmBrown/30 px-3 py-2 text-sm font-bold text-warmBrown';
        row.textContent = item.name || '未命名商品';
        usageList.appendChild(row);
      });
      note.textContent = kind === 'location'
        ? `刪除後，上面這些既有商品會同步移除「${value}」地點；品牌字典與優惠券資料都會保留，不會一起刪除。`
        : `刪除後，上面這些既有商品仍會保留「${value}」文字；只是之後新增或編輯商品時，不會再出現在分類選單中。`;
    } else {
      summary.textContent = `目前沒有商品使用這個${LABEL_BY_KIND[kind]}。`;
      note.textContent = kind === 'location'
        ? `刪除後，「${value}」將不再出現在地點選單中；品牌字典與優惠券資料都會保留。`
        : `刪除後，「${value}」將不再出現在分類選單中。`;
    }

    warningModal.classList.remove('hidden');
    warningModal.classList.add('flex');
  }

  function renderManageList() {
    if (!state.currentKind) return;
    const kind = state.currentKind;
    const values = valuesFor(kind);
    title.textContent = `管理${LABEL_BY_KIND[kind]}`;
    list.innerHTML = '';

    if (!state.settingsLoaded) {
      const loading = document.createElement('div');
      loading.className = 'py-8 text-center text-sm font-bold text-gray-400';
      loading.textContent = '正在載入清單…';
      list.appendChild(loading);
      return;
    }

    if (!values.length) {
      const empty = document.createElement('div');
      empty.className = 'py-8 text-center text-sm font-bold text-gray-400';
      empty.textContent = `目前沒有${LABEL_BY_KIND[kind]}`;
      list.appendChild(empty);
      return;
    }

    values.forEach((value, index) => {
      const row = document.createElement('div');
      row.className = 'manage-row flex items-center gap-2 rounded-2xl border-2 border-warmBrown bg-shinBg px-2 py-2 transition-all';
      row.dataset.manageIndex = String(index);
      row.innerHTML = `
        <button type="button" class="filter-drag-handle w-9 h-10 rounded-xl text-warmBrown hover:bg-pastelYellow" aria-label="拖曳調整順序"><i class="fas fa-grip-vertical"></i></button>
        <span class="manage-option-name flex-1 min-w-0 truncate font-bold text-warmBrown"></span>
        <button type="button" class="move-up w-8 h-8 rounded-full border border-warmBrown/40 text-warmBrown disabled:opacity-25" aria-label="往上移"><i class="fas fa-chevron-up text-xs"></i></button>
        <button type="button" class="move-down w-8 h-8 rounded-full border border-warmBrown/40 text-warmBrown disabled:opacity-25" aria-label="往下移"><i class="fas fa-chevron-down text-xs"></i></button>
        <button type="button" class="delete-option w-8 h-8 rounded-full bg-pastelPink border border-warmBrown text-warmBrown" aria-label="刪除"><i class="fas fa-trash-alt text-xs"></i></button>`;
      row.querySelector('.manage-option-name').textContent = value;

      const up = row.querySelector('.move-up');
      const down = row.querySelector('.move-down');
      up.disabled = index === 0;
      down.disabled = index === values.length - 1;
      up.addEventListener('click', () => moveAndSave(kind, index, index - 1));
      down.addEventListener('click', () => moveAndSave(kind, index, index + 1));
      row.querySelector('.delete-option').addEventListener('click', () => openDeleteWarning(kind, value));

      const handle = row.querySelector('.filter-drag-handle');
      let dragTargetIndex = index;
      const finishDrag = async (event) => {
        if (!handle.hasPointerCapture?.(event.pointerId)) return;
        handle.releasePointerCapture?.(event.pointerId);
        clearDropTargets();
        if (dragTargetIndex !== index) await moveAndSave(kind, index, dragTargetIndex);
      };
      handle.addEventListener('pointerdown', (event) => {
        dragTargetIndex = index;
        handle.setPointerCapture?.(event.pointerId);
        markDropTarget(index);
        event.preventDefault();
      });
      handle.addEventListener('pointermove', (event) => {
        if (!handle.hasPointerCapture?.(event.pointerId)) return;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.manage-row');
        if (!target || !list.contains(target)) return;
        dragTargetIndex = Number(target.dataset.manageIndex);
        markDropTarget(dragTargetIndex);
        event.preventDefault();
      });
      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', (event) => {
        if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture?.(event.pointerId);
        clearDropTargets();
      });

      list.appendChild(row);
    });
  }

  function openManageModal(kind) {
    state.currentKind = kind;
    renderManageList();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function setupTrigger(containerId, kind) {
    const filterContainer = document.getElementById(containerId);
    const row = filterContainer?.parentElement;
    const trigger = row?.firstElementChild;
    if (!trigger || trigger.dataset.manageReady === '1') return;
    trigger.dataset.manageReady = '1';
    trigger.classList.add('filter-manage-trigger');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-label', `管理${LABEL_BY_KIND[kind]}`);
    trigger.title = `管理${LABEL_BY_KIND[kind]}：排序或刪除`;
    const icon = document.createElement('i');
    icon.className = 'fas fa-sliders-h ml-1 opacity-60 text-[10px]';
    trigger.appendChild(icon);
    trigger.addEventListener('click', () => openManageModal(kind));
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openManageModal(kind);
      }
    });
  }

  setupTrigger('category-filters', 'category');
  setupTrigger('location-filters', 'location');

  document.getElementById('close-manage-filter').addEventListener('click', closeManageModal);
  document.getElementById('done-manage-filter').addEventListener('click', closeManageModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeManageModal(); });
  document.getElementById('cancel-filter-delete').addEventListener('click', closeWarningModal);
  warningModal.addEventListener('click', (event) => { if (event.target === warningModal) closeWarningModal(); });
  document.getElementById('confirm-filter-delete').addEventListener('click', async () => {
    const pending = state.pendingDelete;
    if (!pending) return;
    const button = document.getElementById('confirm-filter-delete');
    button.disabled = true;
    try {
      if (pending.kind === 'location') {
        if (!state.userId) throw new Error('請先登入 Google 帳號。');
        const nextLocations = removeOption(valuesFor('location'), pending.value);
        const plan = buildLocationDeletionPlan(state.items, pending.value);
        if (plan.writeCount > 499) {
          notify('無法刪除', '使用這個地點的商品超過單次安全更新上限，未進行任何變更。', 'warning');
          return;
        }
        const settingsRef = doc(db, 'artifacts', APP_ID, 'users', state.userId, 'settings', 'preferences');
        const batch = writeBatch(db);
        batch.set(settingsRef, { locations: nextLocations }, { merge: true });
        for (const entry of plan.affected) {
          const itemRef = doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', entry.id);
          batch.update(itemRef, entry.patch);
        }
        await batch.commit();
        state.locations = nextLocations;
        renderManageList();
      } else {
        await persistValues('category', removeOption(valuesFor('category'), pending.value));
      }
      const allSelector = pending.kind === 'category'
        ? '#category-filters [data-cat="all"]'
        : '#location-filters [data-loc="all"]';
      document.querySelector(allSelector)?.click();
      closeWarningModal();
    } catch (error) {
      console.error('Filter delete failed:', error);
      notify('刪除失敗', `無法刪除這個${LABEL_BY_KIND[pending.kind]}。`);
    } finally {
      button.disabled = false;
    }
  });

  function stopListeners() {
    state.settingsUnsub?.();
    state.itemsUnsub?.();
    state.settingsUnsub = null;
    state.itemsUnsub = null;
  }

  function subscribeUser(user) {
    stopListeners();
    state.userId = user?.uid || null;
    state.categories = [];
    state.locations = [];
    state.items = [];
    state.settingsLoaded = false;
    if (!user) {
      closeManageModal();
      closeWarningModal();
      return;
    }

    const settingsRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.settingsUnsub = onSnapshot(settingsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.categories = Array.isArray(data.categories) ? [...data.categories] : [];
      state.locations = Array.isArray(data.locations) ? [...data.locations] : [];
      state.settingsLoaded = true;
      renderManageList();
    }, (error) => {
      console.error('Filter settings listener failed:', error);
      state.settingsLoaded = true;
      renderManageList();
    });
    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
    }, (error) => console.error('Filter item listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
}
