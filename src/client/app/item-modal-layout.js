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
  `;
  documentRef.head.appendChild(style);
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
    syncItemFormColumns(documentRef);
    syncItemDetailActions(documentRef);
    syncCopyActionFooter(documentRef);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      sync();
    });
  };

  const observer = new MutationObserverImpl(schedule);
  observer.observe(modalContent, { childList: true, subtree: true });
  sync();
  return () => observer.disconnect();
}
