function legacyLocationLinks(card) {
  return [...(card?.querySelectorAll?.('a[target="_blank"]') || [])].filter((link) => {
    const href = link.getAttribute?.('href') || link.href || '';
    return /google\.com\/maps\/search/i.test(href);
  });
}

function metadataRow(card, legacyLink) {
  const categoryIcon = card?.querySelector?.('i.fa-tag');
  return card?.querySelector?.('.home-item-meta-row')
    || legacyLink?.parentElement
    || categoryIcon?.closest('div')
    || null;
}

function styleAddressAction(actions) {
  const addressAction = [...(actions?.querySelectorAll?.('button') || [])].find(
    (button) => button.textContent?.trim() === '地址'
  );
  if (!addressAction) return;
  addressAction.classList.add('bg-pastelYellow');
  addressAction.classList.remove('bg-pastelBlue');
}

function moveLocationActions(card) {
  const actions = card?.querySelector?.('.enhanced-item-actions');
  if (!actions) return;

  styleAddressAction(actions);

  const buttons = [...actions.querySelectorAll('button[aria-label^="在 Google 地圖搜尋"]')];
  if (!buttons.length) return;

  const legacyLinks = legacyLocationLinks(card);
  const metaRow = metadataRow(card, legacyLinks[0] || null);
  if (!metaRow) return;
  metaRow.classList.add('home-item-meta-row');

  for (const existing of [...metaRow.querySelectorAll('.home-location-map-action')]) existing.remove();
  for (const legacyLink of legacyLinks) legacyLink.remove();
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
