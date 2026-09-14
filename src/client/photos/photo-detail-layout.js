export const DETAIL_PHOTO_CARD_CLASS = 'relative self-start rounded-xl overflow-hidden border-2 border-warmBrown bg-shinBg flex items-center justify-center';
export const DETAIL_PHOTO_IMAGE_CLASS = 'block w-auto max-w-full h-auto object-contain bg-white mx-auto';

const DETAIL_VIEW_STYLE_ID = 'photo-detail-view-mode-styles';

function applyClassTokens(node, tokens) {
  tokens.split(/\s+/).filter(Boolean).forEach((token) => node.classList.add(token));
}

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
      align-items: center;
      gap: 1rem;
      width: 100%;
    }
    .workflow-view-mode #photo-preview-grid > div {
      width: 100%;
      max-width: 100%;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      overflow: visible !important;
      justify-content: center;
    }
    .workflow-view-mode #photo-preview-grid img {
      position: static !important;
      inset: auto !important;
      width: auto !important;
      max-width: 100% !important;
      height: auto !important;
      object-fit: contain !important;
      display: block;
      margin-left: auto;
      margin-right: auto;
      background: transparent !important;
    }
  `;
  documentRef.head.appendChild(style);
}

export function normalizeDetailPhotoCard(card) {
  if (!card?.classList) return;

  card.classList.remove('aspect-square');
  applyClassTokens(card, DETAIL_PHOTO_CARD_CLASS);

  const img = card.querySelector?.('img');
  if (!img?.classList) {
    card.classList.add('min-h-20');
    return;
  }

  card.classList.remove('min-h-20');
  ['absolute', 'inset-0', 'w-full', 'h-full', 'object-cover'].forEach((token) => img.classList.remove(token));
  applyClassTokens(img, DETAIL_PHOTO_IMAGE_CLASS);
}

export function applyNaturalDetailPhotoLayout(grid) {
  if (!grid?.children) return;
  [...grid.children].forEach(normalizeDetailPhotoCard);
}

export function initPhotoDetailNaturalLayout({
  documentRef = typeof document !== 'undefined' ? document : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  installDetailViewStyles(documentRef);

  const grid = documentRef?.getElementById?.('photo-preview-grid');
  if (!grid || !MutationObserverImpl) return () => {};
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
    attributeFilter: ['class', 'src']
  });

  return () => observer.disconnect();
}
