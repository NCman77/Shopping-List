export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export function configureGoogleProviderForDrive(provider) {
  if (!provider || typeof provider.addScope !== 'function') {
    throw new TypeError('Google provider must support addScope().');
  }
  provider.addScope(DRIVE_APPDATA_SCOPE);
  return provider;
}

export function storeDriveAccessTokenFromSignIn({
  result,
  credentialFromResult,
  sessionStorageImpl
}) {
  const userId = result?.user?.uid || '';
  if (!userId || typeof credentialFromResult !== 'function' || !sessionStorageImpl) return '';

  const credential = credentialFromResult(result);
  const token = credential?.accessToken || '';
  if (!token) return '';

  sessionStorageImpl.setItem(`shopping-list:drive-token:${userId}`, token);
  return token;
}

export function installGoogleDriveSignIn({
  windowRef = typeof window !== 'undefined' ? window : null,
  documentRef = typeof document !== 'undefined' ? document : null,
  importAppSdk = () => import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
  importAuthSdk = () => import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js')
} = {}) {
  const button = documentRef?.getElementById?.('google-sign-in-btn');
  if (!windowRef || !button || button.dataset.driveAwareSignIn === 'true') return () => {};

  button.dataset.driveAwareSignIn = 'true';

  // Prefetch the Firebase modules during page initialization so the actual
  // popup call stays as close as possible to the user's click gesture.
  const sdkPromise = Promise.all([importAppSdk(), importAuthSdk()]);
  sdkPromise.catch(() => {});

  const handler = async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const label = documentRef.getElementById('google-sign-in-label');
    button.disabled = true;
    if (label) label.textContent = '登入中...';

    try {
      const [appSdk, authSdk] = await sdkPromise;
      const app = appSdk.getApps()[0] || appSdk.getApp();
      const auth = authSdk.getAuth(app);
      const provider = configureGoogleProviderForDrive(new authSdk.GoogleAuthProvider());
      const result = await authSdk.signInWithPopup(auth, provider);
      const token = storeDriveAccessTokenFromSignIn({
        result,
        credentialFromResult: (value) => authSdk.GoogleAuthProvider.credentialFromResult(value),
        sessionStorageImpl: windowRef.sessionStorage
      });

      if (token) {
        documentRef.getElementById('drive-connect-btn')?.classList.add('hidden');
        const EventCtor = windowRef.CustomEvent || globalThis.CustomEvent;
        if (typeof EventCtor === 'function') {
          windowRef.dispatchEvent?.(new EventCtor('shopping-list:drive-token-ready', {
            detail: { userId: result?.user?.uid || '' }
          }));
        }
      }
    } catch (error) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.error('Google 登入失敗:', error);
        if (typeof windowRef.showMsg === 'function') {
          windowRef.showMsg('登入失敗', '無法使用 Google 登入，請稍後再試。', 'error');
        }
      }
    } finally {
      button.disabled = false;
      if (label) label.textContent = '使用 Google 登入';
    }
  };

  button.addEventListener('click', handler, { capture: true });
  return () => button.removeEventListener('click', handler, { capture: true });
}
