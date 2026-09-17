function numericZIndex(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function highestVisibleOverlayZIndex({ documentRef, windowRef, excluded = null } = {}) {
  if (!documentRef?.querySelectorAll || typeof windowRef?.getComputedStyle !== 'function') return 0;
  let highest = 0;
  const nodes = documentRef.querySelectorAll('.fixed, [style*="position: fixed"], [style*="position:fixed"]');
  for (const node of nodes) {
    if (!node || node === excluded || node.classList?.contains?.('hidden')) continue;
    const style = windowRef.getComputedStyle(node);
    if (!style || style.display === 'none' || style.visibility === 'hidden') continue;
    highest = Math.max(highest, numericZIndex(style.zIndex));
  }
  return highest;
}

export function nextSystemMessageZIndex({ documentRef, windowRef, excluded = null } = {}) {
  return Math.max(200, highestVisibleOverlayZIndex({ documentRef, windowRef, excluded }) + 10);
}

export function initSystemMessageLayer({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  if (!documentRef || !windowRef || windowRef.__shoppingListSystemMessageLayerInitialized) return () => {};
  const originalShowMsg = windowRef.showMsg;
  if (typeof originalShowMsg !== 'function') return () => {};
  const modal = documentRef.getElementById('msg-modal');
  if (!modal) return () => {};

  windowRef.__shoppingListSystemMessageLayerInitialized = true;
  const wrappedShowMsg = function(...args) {
    modal.style.zIndex = String(nextSystemMessageZIndex({ documentRef, windowRef, excluded: modal }));
    return originalShowMsg.apply(this, args);
  };
  windowRef.showMsg = wrappedShowMsg;

  return () => {
    if (windowRef.showMsg === wrappedShowMsg) windowRef.showMsg = originalShowMsg;
    modal.style.zIndex = '';
    windowRef.__shoppingListSystemMessageLayerInitialized = false;
  };
}
