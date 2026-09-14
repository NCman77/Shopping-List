export const DETAIL_PHOTO_CARD_CLASS = 'relative self-start rounded-xl overflow-hidden border-2 border-warmBrown bg-shinBg flex items-center justify-center';
export const DETAIL_PHOTO_IMAGE_CLASS = 'block w-auto max-w-full h-auto object-contain bg-white mx-auto';

function applyClassTokens(node, tokens) {
  tokens.split(/\s+/).filter(Boolean).forEach((token) => node.classList.add(token));
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
