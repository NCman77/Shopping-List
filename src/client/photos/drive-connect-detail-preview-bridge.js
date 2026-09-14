function waitFor(predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('等待 Google Drive 詳情圖橋接功能初始化逾時。'));
      }
    }, 40);
  });
}

export function installDriveConnectDetailPreviewBridge({ windowRef = window, documentRef = document } = {}) {
  const button = documentRef?.getElementById?.('drive-connect-btn');
  if (!button || typeof windowRef?.connectGoogleDrive !== 'function' || typeof windowRef?.backfillDetailPhotoPreviews !== 'function') {
    return false;
  }
  if (button.dataset?.detailPreviewBridge === '1') return true;
  if (button.dataset) button.dataset.detailPreviewBridge = '1';

  button.addEventListener('click', async (event) => {
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    try {
      await windowRef.connectGoogleDrive(true);
    } catch (error) {
      console.warn('Google Drive detail preview bridge failed:', error);
    }
  }, true);

  return true;
}

export async function initDriveConnectDetailPreviewBridge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  await waitFor(() => (
    document.getElementById('drive-connect-btn')
    && typeof window.connectGoogleDrive === 'function'
    && typeof window.backfillDetailPhotoPreviews === 'function'
  ));
  installDriveConnectDetailPreviewBridge({ windowRef: window, documentRef: document });
}
