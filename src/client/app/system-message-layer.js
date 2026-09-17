function numericZIndex(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function waitForMessageDependencies(documentRef, windowRef, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const modal = documentRef.getElementById?.('msg-modal');
      const showMsg = windowRef.showMsg;
      if (modal && typeof showMsg === 'function') {
        resolve({ modal, showMsg });
        return true;
      }
      if (Date.now() - started > timeout) {
        reject(new Error('等待系統訊息視窗初始化逾時。'));
        return true;
      }
      return false;
    };
    if (check()) return;
    const timer = setInterval(() => {
      if (check()) clearInterval(timer);
    }, 40);
  });
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

export async function initSystemMessageLayer({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  if (!documentRef || !windowRef || windowRef.__shoppingListSystemMessageLayerInitialized) return () => {};
  const { modal, showMsg: originalShowMsg } = await waitForMessageDependencies(documentRef, windowRef);
  if (windowRef.__shoppingListSystemMessageLayerInitialized) return () => {};

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
