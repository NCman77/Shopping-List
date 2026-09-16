import {
  actionForShoppingStatus,
  detectHorizontalSwipe,
  nextPageForSwipe,
  paginateItems,
  resolveShoppingStatus,
  shouldShowWorkflowEmpty,
  sortForHomepage,
  statusWritePatch
} from './item-workflow.js';
import { itemMatchesActiveTrip } from './travel-trip.js';
import { formatDistance, sortItemsByStatusAndDistanceMap } from '../location/distance.js';
import { itemMatchesLocation } from '../pricing/location-selection.js';

const APP_ID = 'japan-shopping-app';
const PAGE_SIZE = 10;

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
        reject(new Error('等待商品流程初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'error') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function cardItemId(card) {
  const enhanced = String(card?.dataset?.enhancedItemId || card?.dataset?.itemId || '').trim();
  if (enhanced) return enhanced;
  const source = card?.querySelector?.('[onclick*="openEditModal"]')?.getAttribute?.('onclick') || '';
  return source.match(/openEditModal\(['"]([^'"]+)['"]\)/)?.[1] || '';
}

function installStyles() {
  if (document.getElementById('item-workflow-styles')) return;
  const style = document.createElement('style');
  style.id = 'item-workflow-styles';
  style.textContent = `
    .workflow-page-hidden { display: none !important; }
    .workflow-status-action { min-width: 5rem; }
    #workflow-pagination { padding-bottom: max(.75rem, env(safe-area-inset-bottom, 0px)); }
    #workflow-pagination button:disabled { opacity: .3; cursor: default; }
    .workflow-view-mode input:not([type="hidden"]),
    .workflow-view-mode textarea,
    .workflow-view-mode select { background: #f7f7f7 !important; color: #5C4033 !important; opacity: 1 !important; }
    .workflow-view-mode #item-photo-upload-label { opacity: .55; }
  `;
  document.head.appendChild(style);
}

function ensureConfirmationModal() {
  if (document.getElementById('not-wanted-confirm-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'not-wanted-confirm-modal';
  modal.className = 'fixed inset-0 z-[95] hidden bg-warmBrown/50 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-sm bg-white border-4 border-warmBrown rounded-[2rem] p-6 shadow-[8px_8px_0_rgba(92,64,51,0.3)]">
      <div class="w-12 h-12 rounded-full bg-pastelPink border-2 border-warmBrown flex items-center justify-center text-warmBrown text-xl mb-3"><i class="fas fa-heart-crack"></i></div>
      <h3 class="text-xl font-bold text-warmBrown">不想買這個商品？</h3>
      <p class="text-sm text-gray-500 font-medium mt-2">確認後會移到「不想買」，之後仍可以按「恢復」放回想買清單。</p>
      <div class="flex gap-3 mt-5">
        <button id="cancel-not-wanted" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-white">取消</button>
        <button id="confirm-not-wanted" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-pastelPink shadow-[2px_2px_0_rgba(92,64,51,0.2)]">確認不想買</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function ensurePagination(list) {
  let pagination = document.getElementById('workflow-pagination');
  if (pagination) return pagination;
  pagination = document.createElement('div');
  pagination.id = 'workflow-pagination';
  pagination.className = 'hidden shrink-0 px-4 pt-1 flex items-center justify-center gap-3 text-warmBrown';
  pagination.innerHTML = `
    <button id="workflow-prev-page" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown shadow-[2px_2px_0_rgba(92,64,51,.2)]" aria-label="上一頁"><i class="fas fa-chevron-left"></i></button>
    <span id="workflow-page-label" class="text-xs font-bold min-w-20 text-center"></span>
    <button id="workflow-next-page" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown shadow-[2px_2px_0_rgba(92,64,51,.2)]" aria-label="下一頁"><i class="fas fa-chevron-right"></i></button>`;
  list.insertAdjacentElement('afterend', pagination);
  return pagination;
}

function styleActiveStatus(status) {
  document.querySelectorAll('#status-filters .status-btn').forEach((button) => {
    const isActive = button.dataset.workflowStatus === status;
    button.classList.toggle('bg-pastelYellow', isActive);
    button.classList.toggle('text-warmBrown', isActive);
    button.classList.toggle('border-warmBrown', isActive);
    button.classList.toggle('shadow-[2px_2px_0_rgba(92,64,51,1)]', isActive);
    button.classList.toggle('bg-transparent', !isActive);
    button.classList.toggle('text-gray-400', !isActive);
    button.classList.toggle('border-transparent', !isActive);
  });
}

function ensureStatusFilterButton() {
  const filters = document.getElementById('status-filters');
  if (!filters) return null;
  const all = filters.querySelector('[data-status="all"]');
  const wanted = filters.querySelector('[data-status="unpurchased"]');
  const purchased = filters.querySelector('[data-status="purchased"]');
  if (all) all.dataset.workflowStatus = 'all';
  if (wanted) wanted.dataset.workflowStatus = 'wanted';
  if (purchased) purchased.dataset.workflowStatus = 'purchased';

  let button = filters.querySelector('[data-status="not_wanted"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.status = 'not_wanted';
    button.dataset.workflowStatus = 'not_wanted';
    button.className = 'status-btn flex-1 text-center py-2 rounded-full bg-transparent text-gray-400 font-bold text-sm border-2 border-transparent transition-all hover:bg-gray-50';
    button.textContent = '不想買';
    filters.appendChild(button);
  }
  return button;
}

function ensureDetailEditUi() {
  const save = document.getElementById('save-item-btn');
  const header = save?.parentElement;
  if (!save || !header) return null;
  let edit = document.getElementById('edit-item-btn');
  if (!edit) {
    edit = document.createElement('button');
    edit.id = 'edit-item-btn';
    edit.type = 'button';
    edit.className = 'hidden text-warmBrown bg-pastelBlue px-4 py-1.5 rounded-full border-2 border-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,1)] active:translate-y-1 active:shadow-none transition-all hover:bg-blue-200';
    edit.textContent = '編輯';
    header.insertBefore(edit, save);
  }

  const statusBlock = document.getElementById('item-status')?.closest('div.flex.items-center.justify-between');
  statusBlock?.classList.add('hidden');
  statusBlock?.setAttribute('aria-hidden', 'true');

  const photoInput = document.getElementById('item-photo');
  photoInput?.closest('label')?.setAttribute('id', 'item-photo-upload-label');
  return edit;
}

function setDetailMode(mode, { existing = false } = {}) {
  const modal = document.getElementById('add-modal-content');
  const save = document.getElementById('save-item-btn');
  const edit = ensureDetailEditUi();
  const title = document.getElementById('modal-title');
  const view = mode === 'view';

  modal?.classList.toggle('workflow-view-mode', view);
  const fieldIds = ['item-name', 'item-category', 'item-location', 'item-store-name', 'item-address', 'item-website', 'item-desc', 'item-photo'];
  fieldIds.forEach((id) => {
    const control = document.getElementById(id);
    if (control) control.disabled = view;
  });
  document.querySelectorAll('.price-edit-control, .multi-location-control').forEach((control) => {
    control.disabled = view;
  });
  document.querySelectorAll('#photo-preview-grid button[aria-label^="移除"]').forEach((button) => {
    button.disabled = view;
    button.classList.toggle('hidden', view);
  });

  if (view) {
    save?.classList.add('hidden');
    edit?.classList.remove('hidden');
    if (title) title.textContent = '商品詳情 👀';
  } else {
    save?.classList.remove('hidden');
    edit?.classList.add('hidden');
    if (existing && title) title.textContent = '修改商品 ✏️';
  }
}

export async function initItemWorkflowEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListItemWorkflowInitialized) return;
  window.__shoppingListItemWorkflowInitialized = true;

  installStyles();
  ensureConfirmationModal();

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const list = await waitFor(() => document.getElementById('item-list'));
  await waitFor(() => document.getElementById('item-website') && typeof window.connectGoogleDrive === 'function');

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, updateDoc } = firestoreSdk;

  const state = {
    userId: '',
    items: new Map(),
    cardCache: new Map(),
    itemsLoaded: false,
    filter: 'all',
    page: 1,
    totalPages: 1,
    pendingNotWantedId: '',
    itemUnsub: null,
    touchStart: null,
    detailMode: 'edit',
    applying: false,
    scheduled: false
  };

  const pagination = ensurePagination(list);
  const prevButton = pagination.querySelector('#workflow-prev-page');
  const nextButton = pagination.querySelector('#workflow-next-page');
  const pageLabel = pagination.querySelector('#workflow-page-label');
  const confirmModal = document.getElementById('not-wanted-confirm-modal');
  let listObserver = null;

  function closeNotWantedModal() {
    state.pendingNotWantedId = '';
    confirmModal.classList.add('hidden');
    confirmModal.classList.remove('flex');
  }

  function openNotWantedModal(itemId) {
    state.pendingNotWantedId = itemId;
    confirmModal.classList.remove('hidden');
    confirmModal.classList.add('flex');
  }

  async function writeStatus(itemId, status) {
    if (!state.userId || !itemId) return;
    const itemRef = doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', itemId);
    try {
      await updateDoc(itemRef, statusWritePatch(status));
    } catch (error) {
      console.error('Shopping status update failed:', error);
      notify('更新失敗', '無法更新商品狀態，請稍後再試。');
      scheduleApply();
      throw error;
    }
  }

  function eligibleCards() {
    if (!window.shoppingListTripContextReady || !window.shoppingListActiveTrip?.id) return [];
    const result = [];
    const locationFilter = window.shoppingListMultiLocationFilter || 'all';
    for (const [itemId, card] of state.cardCache) {
      const item = state.items.get(itemId);
      if (!item || !itemMatchesActiveTrip(item, window.shoppingListActiveTrip)) continue;
      if (!itemMatchesLocation(item, locationFilter)) continue;
      const status = resolveShoppingStatus(item);
      if (state.filter !== 'all' && status !== state.filter) continue;
      result.push({ card, item });
    }
    return result;
  }

  function syncCardCache() {
    for (const card of [...list.children]) {
      if (card.id) continue;
      const itemId = cardItemId(card);
      if (itemId) state.cardCache.set(itemId, card);
    }
    if (state.itemsLoaded) {
      for (const itemId of state.cardCache.keys()) {
        if (!state.items.has(itemId)) state.cardCache.delete(itemId);
      }
    }
  }

  function ensureCardAction(card, item) {
    const action = actionForShoppingStatus(item);
    const purchaseLabel = card.querySelector('input.custom-checkbox')?.closest('label');
    const row = purchaseLabel?.parentElement;
    if (!row) return;
    let button = row.querySelector('.workflow-status-action');

    if (!action) {
      button?.remove();
      row.classList.remove('justify-between');
      row.classList.add('justify-end');
      return;
    }

    row.classList.remove('justify-end');
    row.classList.add('justify-between', 'gap-3');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'workflow-status-action px-3 py-1.5 rounded-full border-2 border-warmBrown bg-white text-warmBrown text-xs font-bold shadow-[2px_2px_0_rgba(92,64,51,.16)]';
      row.insertBefore(button, row.firstChild);
    }
    button.textContent = action.label;
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = cardItemId(card);
      if (action.requiresConfirmation) openNotWantedModal(id);
      else void writeStatus(id, action.targetStatus).catch(() => {});
    };
  }

  function ensureDistanceLabel(card, item) {
    const actions = card.querySelector('.enhanced-item-actions');
    if (!actions) return;
    let label = actions.querySelector('.nearby-distance-label');
    const nearby = window.shoppingListNearbySort;
    const distance = Number(nearby?.distancesByItemId?.[item.id]);
    const visible = Boolean(nearby?.enabled && Number.isFinite(distance));
    if (!visible) {
      label?.remove();
      return;
    }
    if (!label) {
      label = document.createElement('span');
      label.className = 'nearby-distance-label text-[10px] font-bold bg-white/80 text-warmBrown px-2.5 py-1 rounded-full border border-warmBrown/40';
      label.setAttribute('aria-label', '目前距離');
      actions.prepend(label);
    }
    label.textContent = formatDistance(distance);
  }

  function applyWorkflow() {
    state.scheduled = false;
    if (state.applying) return;
    state.applying = true;
    listObserver?.disconnect();
    try {
      ensureStatusFilterButton();
      ensureDetailEditUi();
      const baseEmpty = document.getElementById('empty-state');
      baseEmpty?.classList.add('hidden');
      baseEmpty?.classList.remove('flex');

      syncCardCache();
      const candidates = eligibleCards();
      const candidateItems = candidates.map(({ item }) => item);
      const nearbyState = window.shoppingListNearbySort;
      const sortedItems = nearbyState?.enabled
        ? sortItemsByStatusAndDistanceMap(candidateItems, nearbyState?.distancesByItemId)
        : state.filter === 'all'
          ? sortForHomepage(candidateItems)
          : [...candidateItems].sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
      const cardById = new Map(candidates.map(({ card, item }) => [item.id, card]));

      const pageData = paginateItems(sortedItems, state.page, PAGE_SIZE);
      state.page = pageData.page;
      state.totalPages = pageData.totalPages;
      const visibleIds = new Set(pageData.items.map((item) => item.id));

      let empty = document.getElementById('workflow-empty-state');
      if (!empty) {
        empty = document.createElement('div');
        empty.id = 'workflow-empty-state';
        empty.className = 'hidden py-10 text-center text-sm font-bold text-gray-400';
        empty.textContent = '這個分類目前沒有商品';
      }
      for (const card of state.cardCache.values()) {
        if (card.parentElement === list) card.remove();
      }
      for (const item of pageData.items) {
        const card = cardById.get(item.id);
        if (!card) continue;
        card.classList.remove('workflow-page-hidden');
        ensureCardAction(card, item);
        ensureDistanceLabel(card, item);
        list.appendChild(card);
      }
      list.appendChild(empty);
      const showEmpty = shouldShowWorkflowEmpty({
        loaded: state.itemsLoaded && Boolean(window.shoppingListTripContextReady),
        count: sortedItems.length
      });
      empty.classList.toggle('hidden', !showEmpty);

      pagination.classList.toggle('hidden', !state.itemsLoaded || !window.shoppingListTripContextReady || state.totalPages <= 1);
      pageLabel.textContent = `第 ${state.page} / ${state.totalPages} 頁`;
      prevButton.disabled = state.page <= 1;
      nextButton.disabled = state.page >= state.totalPages;
      styleActiveStatus(state.filter);
    } finally {
      state.applying = false;
      listObserver?.observe(list, { childList: true, subtree: false });
    }
  }

  function scheduleApply() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(applyWorkflow);
  }

  function setFilter(filter) {
    state.filter = filter;
    state.page = 1;
    scheduleApply();
  }

  const notWantedButton = ensureStatusFilterButton();
  document.querySelectorAll('#status-filters [data-status="all"], #status-filters [data-status="unpurchased"], #status-filters [data-status="purchased"]').forEach((button) => {
    button.addEventListener('click', () => {
      const mapped = button.dataset.status === 'unpurchased' ? 'wanted' : button.dataset.status;
      setFilter(mapped);
    });
  });
  notWantedButton?.addEventListener('click', (event) => {
    event.preventDefault();
    const wantedButton = document.querySelector('#status-filters [data-status="unpurchased"]');
    wantedButton?.click();
    state.filter = 'not_wanted';
    state.page = 1;
    styleActiveStatus('not_wanted');
    scheduleApply();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.cat-btn, .loc-btn')) {
      state.page = 1;
      scheduleApply();
    }
  });

  window.addEventListener('shopping-list:active-country-changed', () => {
    scheduleApply();
  });

  window.addEventListener('shopping-list:active-trip-changed', () => {
    state.filter = 'all';
    state.page = 1;
    document.querySelector('#status-filters [data-status="all"]')?.click();
    scheduleApply();
  });

  window.addEventListener('shopping-list:nearby-sort-changed', () => {
    state.page = 1;
    scheduleApply();
  });

  window.addEventListener('shopping-list:multi-location-filter-changed', () => {
    state.page = 1;
    scheduleApply();
  });

  prevButton.addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    applyWorkflow();
  });
  nextButton.addEventListener('click', () => {
    state.page = Math.min(state.totalPages, state.page + 1);
    applyWorkflow();
  });

  list.addEventListener('touchstart', (event) => {
    const touch = event.touches?.[0];
    state.touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  list.addEventListener('touchend', (event) => {
    const touch = event.changedTouches?.[0];
    if (!state.touchStart || !touch || state.totalPages <= 1) return;
    const direction = detectHorizontalSwipe({
      startX: state.touchStart.x,
      startY: state.touchStart.y,
      endX: touch.clientX,
      endY: touch.clientY
    });
    state.touchStart = null;
    if (!direction) return;
    const next = nextPageForSwipe({ direction, page: state.page, totalPages: state.totalPages });
    if (next !== state.page) {
      state.page = next;
      applyWorkflow();
    }
  }, { passive: true });

  document.getElementById('cancel-not-wanted')?.addEventListener('click', closeNotWantedModal);
  document.getElementById('confirm-not-wanted')?.addEventListener('click', async () => {
    const itemId = state.pendingNotWantedId;
    if (!itemId) return;
    try {
      await writeStatus(itemId, 'not_wanted');
      closeNotWantedModal();
    } catch {}
  });

  const originalToggleStatus = window.toggleStatus;
  window.toggleStatus = async function(itemId, purchased) {
    try {
      await writeStatus(itemId, purchased ? 'purchased' : 'wanted');
    } catch {
      const card = [...list.children].find((node) => cardItemId(node) === itemId);
      const checkbox = card?.querySelector('input.custom-checkbox');
      if (checkbox) checkbox.checked = resolveShoppingStatus(state.items.get(itemId)) === 'purchased';
      if (typeof originalToggleStatus !== 'function') return;
    }
  };

  const originalOpenEdit = window.openEditModal;
  window.openEditModal = function(itemId, ...args) {
    const result = originalOpenEdit.call(this, itemId, ...args);
    state.detailMode = 'view';
    setDetailMode('view', { existing: true });
    return result;
  };

  const originalOpenAdd = window.openAddModal;
  window.openAddModal = function(...args) {
    const result = originalOpenAdd.apply(this, args);
    state.detailMode = 'edit';
    setDetailMode('edit', { existing: false });
    return result;
  };

  const editButton = ensureDetailEditUi();
  editButton?.addEventListener('click', () => {
    state.detailMode = 'edit';
    setDetailMode('edit', { existing: true });
  });

  const detailObserver = new MutationObserver(() => {
    if (state.detailMode === 'view' && !document.getElementById('add-modal')?.classList.contains('hidden')) {
      setDetailMode('view', { existing: true });
    }
  });
  const previewGrid = document.getElementById('photo-preview-grid');
  if (previewGrid) detailObserver.observe(previewGrid, { childList: true });

  listObserver = new MutationObserver(scheduleApply);
  listObserver.observe(list, { childList: true, subtree: false });

  function subscribeUser(user) {
    state.itemUnsub?.();
    state.itemUnsub = null;
    state.userId = user?.uid || '';
    state.items = new Map();
    state.cardCache.clear();
    state.itemsLoaded = false;
    state.page = 1;
    if (!user) return scheduleApply();
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
      state.itemsLoaded = true;
      scheduleApply();
    }, (error) => {
      console.error('Item workflow listener failed:', error);
      notify('讀取失敗', '無法載入商品狀態。');
    });
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  scheduleApply();
}
