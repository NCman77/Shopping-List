const APP_ID = 'japan-shopping-app';
const MAX_MESSAGE_LENGTH = 300;
const MAX_STACK_LENGTH = 1800;
const DEDUPE_WINDOW_MS = 10000;

function redact(value) {
  return String(value || '')
    .replace(/(?:token|api[_-]?key|password|secret|authorization)\s*[=:]\s*[^&\s]+/gi, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/(https?:\/\/[^\s/?#]+)[^\s]*/gi, '$1');
}

export function sanitizeClientError(error, source = '', location = {}) {
  const message = redact(error?.message || error || 'Unknown client error').slice(0, MAX_MESSAGE_LENGTH);
  const stack = redact(error?.stack || '').slice(0, MAX_STACK_LENGTH);
  const path = redact(location?.path || '').split('?')[0].slice(0, 300);
  return {
    name: redact(error?.name || 'Error').slice(0, 80),
    message,
    stack,
    source: redact(source).slice(0, 80),
    path,
    line: Number.isFinite(Number(location?.line)) ? Number(location.line) : null,
    column: Number.isFinite(Number(location?.column)) ? Number(location.column) : null,
    occurredAt: Date.now()
  };
}

export function createClientErrorMonitor({
  windowRef = typeof window !== 'undefined' ? window : null,
  consoleRef = typeof console !== 'undefined' ? console : null,
  persist = async () => {}
} = {}) {
  if (!windowRef?.addEventListener) return { report: () => null, destroy: () => {} };
  const recent = new Map();

  const report = (error, source = 'manual', location = {}) => {
    const payload = sanitizeClientError(error, source, location);
    const fingerprint = `${payload.source}|${payload.name}|${payload.message}|${payload.path}`;
    const previous = recent.get(fingerprint) || 0;
    if (Date.now() - previous < DEDUPE_WINDOW_MS) return payload;
    recent.set(fingerprint, Date.now());
    consoleRef?.error?.('[shopping-list client error]', payload);
    windowRef.dispatchEvent?.(new (windowRef.CustomEvent || CustomEvent)('shopping-list:client-error', { detail: payload }));
    Promise.resolve(persist(payload)).catch((persistError) => {
      consoleRef?.warn?.('[shopping-list error monitor unavailable]', persistError);
    });
    return payload;
  };

  const onError = (event) => report(event?.error || new Error(event?.message || 'Window error'), 'window.error', {
    path: event?.filename,
    line: event?.lineno,
    column: event?.colno
  });
  const onRejection = (event) => report(event?.reason || new Error('Unhandled promise rejection'), 'unhandledrejection');
  windowRef.addEventListener('error', onError);
  windowRef.addEventListener('unhandledrejection', onRejection);

  return {
    report,
    destroy() {
      windowRef.removeEventListener?.('error', onError);
      windowRef.removeEventListener?.('unhandledrejection', onRejection);
      recent.clear();
    }
  };
}

export async function initClientErrorMonitoring() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.__shoppingListErrorMonitor) return window.__shoppingListErrorMonitor.destroy;

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { addDoc, collection, serverTimestamp } = firestoreSdk;
  let authenticated = false;

  authSdk.onAuthStateChanged(auth, (user) => {
    authenticated = Boolean(user && !user.isAnonymous);
  });

  const monitor = createClientErrorMonitor({
    persist: async (payload) => {
      if (!authenticated) return;
      await addDoc(collection(db, 'artifacts', APP_ID, 'clientErrors'), {
        name: payload.name,
        message: payload.message,
        stack: payload.stack,
        source: payload.source,
        path: payload.path,
        line: payload.line,
        column: payload.column,
        createdAt: serverTimestamp()
      });
    }
  });
  window.__shoppingListErrorMonitor = monitor;
  return monitor.destroy;
}
