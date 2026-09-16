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
        reject(new Error('等待商品表單版面初始化逾時。'));
      }
    }, 40);
  });
}

function installStyles(documentRef) {
  if (!documentRef?.head || documentRef.getElementById('item-modal-layout-styles')) return;
  const style = documentRef.createElement('style');
  style.id = 'item-modal-layout-styles';
  style.textContent = `
    #item-detail-fixed-footer {
      display: none;
      flex-shrink: 0;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.75rem;
      padding: 0.75rem 1.5rem max(0.75rem, env(safe-area-inset-bottom));
      background: rgba(255, 255, 255, 0.98);
      border-top: 2px solid rgba(92, 64, 51, 0.18);
      z-index: 30;
    }

    .workflow-view-mode #item-detail-fixed-footer {
      display: grid !important;
    }

    .workflow-view-mode #item-detail-inline-actions {
      display: none !important;
    }

    #item-multi-location-chips-row {
      width: 100%;
      margin-top: 0.5rem !important;
      min-width: 0;
    }

    #item-multi-location-chips-row #item-multi-location-chips {
      width: 100%;
      margin-top: 0 !important;
    }

    #copy-item-trip-action-wrap.item-copy-fixed-footer {
      flex-shrink: 0;
      padding: 0.75rem 1.5rem max(0.75rem, env(safe-area-inset-bottom));
      background: rgba(255, 255, 255, 0.98);
      border-top: 2px solid rgba(92, 64, 51, 0.18);
      z-index: 30;
    }

    #item-inline-add-category,
    #item-inline-add-location { display: none; }

    .workflow-add-mode #item-inline-add-category,
    .workflow-add-mode #item-inline-add-location {
      display: inline-flex;
    }

    .workflow-edit-mode #item-edit-form-scroll {
      display: flex !important;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem !important;
      background: #FAFAFA !important;
    }

    .workflow-edit-mode #item-edit-form-scroll > * {
      margin-top: 0 !important;
      margin-bottom: 0 !important;
    }

    .workflow-edit-mode #item-edit-photo-field { order: 1; }
    .workflow-edit-mode #item-edit-photo-controls { order: 2; }
    .workflow-edit-mode #item-edit-name-field { order: 3; }
    .workflow-edit-mode #item-edit-purchase-card { order: 4; }
    .workflow-edit-mode #item-multi-location-chips-row { order: 5; }
    .workflow-edit-mode #price-research-section { order: 6; }
    .workflow-edit-mode #item-edit-address-field { order: 7; }
    .workflow-edit-mode #item-edit-website-field { order: 8; }
    .workflow-edit-mode #item-edit-notes-field { order: 9; }

    .workflow-edit-mode #item-edit-photo-field,
    .workflow-edit-mode #item-edit-photo-controls,
    .workflow-edit-mode #item-edit-name-field,
    .workflow-edit-mode #item-edit-purchase-card,
    .workflow-edit-mode #price-research-section,
    .workflow-edit-mode #item-edit-address-field,
    .workflow-edit-mode #item-edit-website-field,
    .workflow-edit-mode #item-edit-notes-field,
    .workflow-edit-mode #item-multi-location-chips-row {
      border: 2px solid #5C4033 !important;
      border-radius: 1.25rem !important;
      padding: 0.75rem !important;
      box-shadow: 2px 2px 0 rgba(92, 64, 51, 0.12);
    }

    .workflow-edit-mode #item-edit-photo-field,
    .workflow-edit-mode #item-edit-name-field { background: #fff !important; }
    .workflow-edit-mode #item-edit-purchase-card,
    .workflow-edit-mode #item-multi-location-chips-row { background: rgba(213, 229, 242, 0.34) !important; }
    .workflow-edit-mode #price-research-section { background: rgba(255, 241, 185, 0.32) !important; }
    .workflow-edit-mode #item-edit-address-field { background: rgba(252, 213, 206, 0.28) !important; }
    .workflow-edit-mode #item-edit-website-field { background: rgba(208, 240, 192, 0.28) !important; }
    .workflow-edit-mode #item-edit-notes-field { background: #fff !important; }

    .workflow-edit-mode #item-edit-photo-field label[for="item-photo"] {
      margin-left: auto;
      margin-right: auto;
      width: 10rem !important;
      height: 10rem !important;
      border-radius: 1.5rem !important;
      background: rgba(213, 229, 242, 0.25) !important;
    }

    .workflow-edit-mode #item-edit-photo-controls #photo-preview-grid {
      margin-left: auto;
      margin-right: auto;
      width: 100%;
    }

    .workflow-edit-mode #item-edit-purchase-card {
      column-gap: 0.75rem !important;
    }

    .workflow-edit-mode #item-edit-form-scroll input,
    .workflow-edit-mode #item-edit-form-scroll select,
    .workflow-edit-mode #item-edit-form-scroll textarea {
      background: #fff !important;
    }
  `;
  documentRef.head.appendChild(style);
}

function setClassState(element, className, enabled) {
  if (!element?.classList) return;
  if (element.classList.contains(className) !== enabled) element.classList.toggle(className, enabled);
}

function formFieldFor(control) {
  if (!control) return null;
  if (control.id === 'item-address') return control.parentElement?.parentElement || null;
  return control.parentElement || null;
}

function setUnifiedLabels(documentRef) {
  const name = documentRef.getElementById('item-name');
  const nameLabel = name?.parentElement?.querySelector?.('label');
  if (nameLabel && nameLabel.dataset.itemUnifiedLabel !== 'name') {
    nameLabel.innerHTML = '商品名稱 <span class="text-red-400">*</span>';
    nameLabel.dataset.itemUnifiedLabel = 'name';
  }

  const notes = documentRef.getElementById('item-desc');
  const notesLabel = notes?.parentElement?.querySelector?.('label');
  if (notesLabel && notesLabel.dataset.itemUnifiedLabel !== 'notes') {
    notesLabel.textContent = '我的筆記';
    notesLabel.dataset.itemUnifiedLabel = 'notes';
  }
}

function addInlineCreateButton(documentRef, {
  controlId,
  buttonId,
  title,
  placeholder,
  handlerName
}) {
  if (documentRef.getElementById(buttonId)) return;
  const control = documentRef.getElementById(controlId);
  const field = controlId === 'item-multi-location-options'
    ? documentRef.getElementById('item-multi-location-field')
    : formFieldFor(control);
  const label = field?.querySelector?.('label');
  if (!field || !label) return;

  field.style.position = 'relative';
  label.style.paddingRight = '4rem';
  const button = documentRef.createElement('button');
  button.id = buttonId;
  button.type = 'button';
  button.className = 'absolute right-0 top-0 items-center justify-center px-2 py-0.5 rounded-full border border-warmBrown bg-white text-[10px] font-bold text-warmBrown shadow-[1px_1px_0_rgba(92,64,51,.16)]';
  button.textContent = '＋新增';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const view = documentRef.defaultView || (typeof window !== 'undefined' ? window : null);
    const handler = view?.[handlerName];
    if (typeof view?.openInputModal === 'function' && typeof handler === 'function') {
      view.openInputModal(title, placeholder, handler);
    }
  });
  field.appendChild(button);
}

function ensureInlineCreateButtons(documentRef) {
  addInlineCreateButton(documentRef, {
    controlId: 'item-category',
    buttonId: 'item-inline-add-category',
    title: '新增分類',
    placeholder: '輸入新分類...',
    handlerName: 'handleAddCategory'
  });
  addInlineCreateButton(documentRef, {
    controlId: 'item-multi-location-options',
    buttonId: 'item-inline-add-location',
    title: '新增地點',
    placeholder: '輸入新地點...',
    handlerName: 'handleAddLocation'
  });
}

export function syncItemFormColumns(documentRef = typeof document !== 'undefined' ? document : null) {
  if (!documentRef) return false;
  const categorySelect = documentRef.getElementById('item-category');
  const categoryField = categorySelect?.closest?.('.flex-1') || categorySelect?.parentElement?.parentElement;
  const whereField = documentRef.getElementById('item-multi-location-field');
  const row = categoryField?.parentElement;
  if (!categoryField || !whereField || !row || whereField.parentElement !== row) return false;

  row.classList?.remove?.('flex', 'space-x-4');
  row.id = 'item-purchase-meta-row';
  row.style.display = 'grid';
  row.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 1fr)';
  row.style.columnGap = '1rem';
  row.style.alignItems = 'start';
  categoryField.style.minWidth = '0';
  whereField.style.minWidth = '0';

  const chips = documentRef.getElementById('item-multi-location-chips');
  if (!chips || !row.parentElement) return true;

  let chipsRow = documentRef.getElementById('item-multi-location-chips-row');
  if (!chipsRow) {
    chipsRow = documentRef.createElement('div');
    chipsRow.id = 'item-multi-location-chips-row';
    chipsRow.style.width = '100%';
    row.insertAdjacentElement('afterend', chipsRow);
  }
  if (chips.parentElement !== chipsRow) chipsRow.appendChild(chips);
  return true;
}

function syncEditFormHooks(documentRef) {
  const name = documentRef.getElementById('item-name');
  const scroll = name?.parentElement?.parentElement;
  if (scroll) scroll.id = 'item-edit-form-scroll';

  const photoInput = documentRef.getElementById('item-photo');
  const photoField = photoInput?.closest?.('label')?.parentElement;
  if (photoField) photoField.id = 'item-edit-photo-field';

  const driveButton = documentRef.getElementById('drive-connect-btn');
  const photoControls = driveButton?.closest?.('.w-full');
  if (photoControls) photoControls.id = 'item-edit-photo-controls';

  if (name?.parentElement) name.parentElement.id = 'item-edit-name-field';
  const purchase = documentRef.getElementById('item-purchase-meta-row');
  if (purchase) purchase.id = 'item-edit-purchase-card';

  const address = formFieldFor(documentRef.getElementById('item-address'));
  if (address) address.id = 'item-edit-address-field';
  const website = formFieldFor(documentRef.getElementById('item-website'));
  if (website) website.id = 'item-edit-website-field';
  const notes = formFieldFor(documentRef.getElementById('item-desc'));
  if (notes) notes.id = 'item-edit-notes-field';
}

function syncModalMode(documentRef) {
  const modalContent = documentRef.getElementById('add-modal-content');
  if (!modalContent) return;
  const viewMode = modalContent.classList.contains('workflow-view-mode');
  const existing = Boolean(String(documentRef.getElementById('item-id')?.value || '').trim());
  setClassState(modalContent, 'workflow-edit-mode', !viewMode && existing);
  setClassState(modalContent, 'workflow-add-mode', !viewMode && !existing);
}

function findDetailAction(documentRef, label) {
  const surface = documentRef?.getElementById?.('item-detail-view');
  if (!surface?.querySelectorAll) return null;
  return [...surface.querySelectorAll('button')]
    .find((button) => String(button.textContent || '').trim() === label) || null;
}

function ensureItemDetailFixedFooter(documentRef) {
  const modalContent = documentRef?.getElementById?.('add-modal-content');
  if (!modalContent) return null;
  let footer = documentRef.getElementById('item-detail-fixed-footer');
  if (footer) return footer;

  footer = documentRef.createElement('div');
  footer.id = 'item-detail-fixed-footer';

  const back = documentRef.createElement('button');
  back.type = 'button';
  back.className = 'py-3 rounded-2xl bg-white border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,.14)]';
  back.textContent = '返回';
  back.addEventListener('click', () => findDetailAction(documentRef, '返回')?.click());

  const edit = documentRef.createElement('button');
  edit.type = 'button';
  edit.className = 'py-3 rounded-2xl bg-pastelBlue border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,.18)]';
  edit.textContent = '編輯商品';
  edit.addEventListener('click', () => findDetailAction(documentRef, '編輯商品')?.click());

  footer.append(back, edit);
  modalContent.appendChild(footer);
  return footer;
}

export function syncItemDetailActions(documentRef = typeof document !== 'undefined' ? document : null) {
  const back = findDetailAction(documentRef, '返回');
  const edit = findDetailAction(documentRef, '編輯商品');
  const actions = back?.parentElement;
  if (!actions || edit?.parentElement !== actions) return false;
  actions.id = 'item-detail-inline-actions';
  ensureItemDetailFixedFooter(documentRef);
  return true;
}

export function syncCopyActionFooter(documentRef = typeof document !== 'undefined' ? document : null) {
  if (!documentRef) return false;
  const modalContent = documentRef.getElementById('add-modal-content');
  const wrapper = documentRef.getElementById('copy-item-trip-action-wrap');
  if (!modalContent || !wrapper) return false;

  wrapper.classList?.add?.('item-copy-fixed-footer');
  if (wrapper.parentElement !== modalContent) modalContent.appendChild(wrapper);
  return true;
}

function wrapOpenAddModal(documentRef, sync) {
  const view = documentRef.defaultView || (typeof window !== 'undefined' ? window : null);
  if (!view || view.__shoppingListItemModalLayoutOpenAddWrapped || typeof view.openAddModal !== 'function') return;
  const original = view.openAddModal;
  view.openAddModal = function(...args) {
    const result = original.apply(this, args);
    queueMicrotask(sync);
    return result;
  };
  view.__shoppingListItemModalLayoutOpenAddWrapped = true;
}

export async function initItemModalLayout({
  documentRef = typeof document !== 'undefined' ? document : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !MutationObserverImpl) return () => {};
  if (documentRef.documentElement?.dataset?.itemModalLayoutInitialized === 'true') return () => {};

  installStyles(documentRef);
  const modalContent = await waitFor(() => (
    documentRef.getElementById('add-modal-content')
    && documentRef.getElementById('item-category')
  ));
  if (documentRef.documentElement?.dataset) {
    documentRef.documentElement.dataset.itemModalLayoutInitialized = 'true';
  }

  let scheduled = false;
  const sync = () => {
    setUnifiedLabels(documentRef);
    syncItemFormColumns(documentRef);
    ensureInlineCreateButtons(documentRef);
    syncEditFormHooks(documentRef);
    syncItemDetailActions(documentRef);
    syncCopyActionFooter(documentRef);
    syncModalMode(documentRef);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      sync();
    });
  };

  wrapOpenAddModal(documentRef, sync);
  const observer = new MutationObserverImpl(schedule);
  observer.observe(modalContent, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
  sync();
  return () => observer.disconnect();
}
