const APP_ID = 'japan-shopping-app';

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
        reject(new Error('等待分類/地點新增功能初始化逾時。'));
      }
    }, 40);
  });
}

export function mergeUniqueOption(values, value) {
  const next = Array.isArray(values)
    ? values.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : [];
  const normalized = String(value ?? '').trim();
  if (normalized && !next.includes(normalized)) next.push(normalized);
  return [...new Set(next)];
}

function visibleOptions(containerId, dataKey) {
  return [...(document.getElementById(containerId)?.querySelectorAll?.(`[data-${dataKey}]`) || [])]
    .map((node) => String(node.dataset?.[dataKey] || '').trim())
    .filter((value) => value && value !== 'all');
}

function notify(title, message) {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, 'error');
  else console.error(`${title}: ${message}`);
}

export async function initSettingsMergeGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListSettingsMergeGuardInitialized) return;
  window.__shoppingListSettingsMergeGuardInitialized = true;

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'),
    waitFor(() => typeof window.handleAddCategory === 'function' && typeof window.handleAddLocation === 'function')
  ]).then(([appModule, authModule, firestoreModule]) => [appModule, authModule, firestoreModule]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, getDoc, setDoc } = firestoreSdk;

  async function addOption(field, value) {
    const user = auth.currentUser;
    if (!user) return;
    const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');
    try {
      const snapshot = await getDoc(ref);
      const data = snapshot.exists() ? snapshot.data() : {};
      const fallback = field === 'categories'
        ? visibleOptions('category-filters', 'cat')
        : visibleOptions('location-filters', 'loc');
      const current = Array.isArray(data[field]) ? data[field] : fallback;
      const next = mergeUniqueOption(current, value);
      if (!String(value ?? '').trim() || next.length === current.length) return;
      await setDoc(ref, { [field]: next }, { merge: true });
    } catch (error) {
      console.error(`Failed to add ${field}:`, error);
      notify('儲存失敗', field === 'categories' ? '無法新增分類。' : '無法新增地點。');
    }
  }

  window.handleAddCategory = (category) => addOption('categories', category);
  window.handleAddLocation = (location) => addOption('locations', location);
}
