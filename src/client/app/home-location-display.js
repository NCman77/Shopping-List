function legacyLocationLink(card) {
  return [...(card?.querySelectorAll?.('a[target="_blank"]') || [])].find((link) => {
    const href = link.getAttribute?.('href') || link.href || '';
    return /google\.com\/maps\/search/i.test(href);
  }) || null;
}

function moveLocationActions(card) {
  const actions = card?.querySelector?.('.enhanced-item-actions');
  if (!actions) return;

  const buttons = [...actions.querySelectorAll('button[aria-label^="在 Google 地圖搜尋"]')];
  if (!buttons.length) return;

  const legacyLink = legacyLocationLink(card);
  const metaRow = card.querySelector('.home-item-meta-row') || legacyLink?.parentElement;
  if (!metaRow) return;
  metaRow.classList.add('home-item-meta-row');

  legacyLink?.remove();
  for (const button of buttons) {
    button.classList.add('home-location-map-action', 'bg-pastelBlue');
    button.classList.remove('bg-pastelYellow');
    metaRow.appendChild(button);
  }
}

function applyHomeLocationDisplay(documentRef) {
  const list = documentRef?.getElementById?.('item-list');
  if (!list) return;
  for (const card of [...list.children]) {
    if (!card.id) moveLocationActions(card);
  }
}

export function initHomeLocationDisplay({
  documentRef = typeof document !== 'undefined' ? document : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef) return () => {};
  const list = documentRef.getElementById('item-list');
  if (!list) return () => {};

  applyHomeLocationDisplay(documentRef);
  if (!MutationObserverImpl) return () => {};

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyHomeLocationDisplay(documentRef);
    });
  };
  const observer = new MutationObserverImpl(schedule);
  observer.observe(list, { childList: true, subtree: true });
  return () => observer.disconnect();
}
