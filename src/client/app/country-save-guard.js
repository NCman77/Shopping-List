import { DEFAULT_COUNTRY, readCachedActiveCountry, resolveItemCountry } from './travel-country.js';

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
        reject(new Error('等待商品國家儲存功能初始化逾時。'));
      }
    }, 40);
  });
}

export function resolveCountryForSave({ existingItem, activeCountry } = {}) {
  if (existingItem !== null && existingItem !== undefined) return resolveItemCountry(existingItem);
  return String(activeCountry ?? '').trim() || DEFAULT_COUNTRY;
}

function makeItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function initCountrySaveGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListCountrySaveGuardInitialized) return;
  window.__shoppingListCountrySaveGuardInitialized = true;

  await waitFor(() => typeof window.saveItem === 'function' && document.getElementById('item-website'));

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, getDoc, onSnapshot, setDoc } = firestoreSdk;

  const state = {
    userId: '',
    items: new Map(),
    itemsUnsub: null
  };

  function subscribeUser(user) {
    state.itemsUnsub?.();
    state.itemsUnsub = null;
    state.userId = user?.uid || '';
    state.items = new Map();
    if (!user) return;
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemsUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
    }, (error) => console.error('Country save item listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);

  const originalSave = window.saveItem;
  window.saveItem = async function(...args) {
    const user = auth.currentUser;
    if (!user) return originalSave.apply(this, args);

    const idInput = document.getElementById('item-id');
    const modalContent = document.getElementById('add-modal-content');
    let itemId = String(idInput?.value || '').trim();
    const wasEditing = Boolean(itemId);
    const existingItem = wasEditing ? (state.items.get(itemId) || {}) : null;

    if (!itemId) {
      itemId = makeItemId();
      if (idInput) idInput.value = itemId;
    }

    const activeCountry = String(window.shoppingListActiveCountry || '').trim()
      || readCachedActiveCountry(window.localStorage, user.uid);
    const country = resolveCountryForSave({ existingItem, activeCountry });

    const result = await originalSave.apply(this, args);

    const saveSucceeded = Boolean(modalContent?.classList?.contains('translate-y-full'));
    if (!saveSucceeded) return result;

    const itemRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'items', itemId);
    try {
      const snapshot = await getDoc(itemRef);
      if (!snapshot.exists()) return result;
      await setDoc(itemRef, { country }, { merge: true });
    } catch (error) {
      console.error('Country persistence failed:', error);
      if (typeof window.showMsg === 'function') {
        window.showMsg('國家儲存失敗', '商品已儲存，但國家標記尚未同步，請再編輯儲存一次。', 'warning');
      }
    }
    return result;
  };
}
