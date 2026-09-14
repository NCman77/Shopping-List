export const DETAIL_PHOTO_CARD_CLASS = 'relative self-start rounded-xl overflow-hidden border-2 border-warmBrown bg-shinBg flex items-center justify-center';
export const DETAIL_PHOTO_IMAGE_CLASS = 'block w-auto max-w-full h-auto object-contain bg-white mx-auto';

const DETAIL_VIEW_STYLE_ID = 'photo-detail-view-mode-styles';
const GRID_WAIT_TIMEOUT_MS = 10000;

function installDetailViewStyles(documentRef) {
  if (!documentRef?.head || documentRef.getElementById?.(DETAIL_VIEW_STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = DETAIL_VIEW_STYLE_ID;
  style.textContent = `
    .workflow-view-mode #item-photo-upload-label {
      display: none !important;
    }
    .workflow-view-mode #photo-upload-status,
    .workflow-view-mode #drive-connect-btn {
      display: none !important;
    }
    .workflow-view-mode #photo-preview-grid + div {
      display: none !important;
    }
    .workflow-view-mode #photo-preview-grid {
      display: flex !important;
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
      width: 100%;
    }
    .workflow-view-mode #photo-preview-grid > div {
      display: block !important;
      width: 100%;
      max-width: 100%;
      aspect-ratio: auto !important;
      height: auto !important;
      min-height: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      overflow: hidden !important;
    }
    .workflow-view-mode #photo-preview-grid > div[data-detail-image-ready="false"] {
      display: none !important;
    }
    .workflow-view-mode #photo-preview-grid > div[data-detail-image-ready="action"] {
      display: block !important;
      position: relative !important;
      min-height: 8rem !important;
    }
    .workflow-view-mode #photo-preview-grid .fa-image {
      display: none !important;
    }
    .workflow-view-mode #photo-preview-grid > div > span {
      display: none !important;
    }
    .workflow-view-mode #photo-preview-grid img {
      position: static !important;
      inset: auto !important;
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      object-fit: contain !important;
      margin: 0 auto !important;
      background: transparent !important;
    }
  `;
  documentRef.head.appendChild(style);
}

export function normalizeDetailPhotoCard(card) {
  if (!card) return;
  const img = card.querySelector?.('img');
  const loadAction = card.querySelector?.('[data-detail-load-action]');

  if (!img) {
    if (card.dataset) card.dataset.detailImageReady = loadAction ? 'action' : 'false';
    return;
  }

  if (card.dataset) card.dataset.detailImageReady = 'true';
  const placeholderIcon = card.querySelector?.('.fa-image');
  placeholderIcon?.closest?.('div')?.remove?.();
}

export function applyNaturalDetailPhotoLayout(grid) {
  if (!grid?.children) return;
  [...grid.children].forEach(normalizeDetailPhotoCard);
}

export function waitForPhotoGrid(documentRef, MutationObserverImpl, timeoutMs = GRID_WAIT_TIMEOUT_MS) {
  const existing = documentRef?.getElementById?.('photo-preview-grid');
  if (existing) return Promise.resolve(existing);
  if (!documentRef?.documentElement || !MutationObserverImpl) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (grid) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
      resolve(grid || null);
    };
    const observer = new MutationObserverImpl(() => {
      const grid = documentRef.getElementById?.('photo-preview-grid');
      if (grid) finish(grid);
    });
    observer.observe(documentRef.documentElement, { childList: true, subtree: true });
    timer = setTimeout(() => finish(documentRef.getElementById?.('photo-preview-grid') || null), timeoutMs);
  });
}

export async function initPhotoDetailNaturalLayout({
  documentRef = typeof document !== 'undefined' ? document : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  installDetailViewStyles(documentRef);
  if (!documentRef || !MutationObserverImpl) return () => {};

  const grid = await waitForPhotoGrid(documentRef, MutationObserverImpl);
  if (!grid) return () => {};
  if (grid.dataset.naturalDetailLayout === 'true') return () => {};

  grid.dataset.naturalDetailLayout = 'true';
  applyNaturalDetailPhotoLayout(grid);

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyNaturalDetailPhotoLayout(grid);
    });
  };

  const observer = new MutationObserverImpl(schedule);
  observer.observe(grid, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });

  return () => observer.disconnect();
}
