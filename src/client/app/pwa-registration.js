export function ensurePwaHead(documentRef = typeof document !== 'undefined' ? document : null) {
  if (!documentRef?.head) return;

  if (!documentRef.querySelector('link[rel="manifest"]')) {
    const manifest = documentRef.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = './manifest.webmanifest';
    documentRef.head.appendChild(manifest);
  }

  if (!documentRef.querySelector('meta[name="theme-color"]')) {
    const theme = documentRef.createElement('meta');
    theme.name = 'theme-color';
    theme.content = '#FCD5CE';
    documentRef.head.appendChild(theme);
  }

  if (!documentRef.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const capable = documentRef.createElement('meta');
    capable.name = 'apple-mobile-web-app-capable';
    capable.content = 'yes';
    documentRef.head.appendChild(capable);
  }
}

export async function registerShoppingListServiceWorker({
  documentRef = typeof document !== 'undefined' ? document : null,
  navigatorRef = typeof navigator !== 'undefined' ? navigator : null
} = {}) {
  ensurePwaHead(documentRef);
  if (!navigatorRef?.serviceWorker?.register) return null;

  try {
    return await navigatorRef.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    console.error('PWA service worker registration failed:', error);
    return null;
  }
}
