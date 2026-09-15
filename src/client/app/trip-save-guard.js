import { resolveItemCountry } from './travel-country.js';

const APP_ID = 'japan-shopping-app';

function waitFor(predicate, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('等待商品旅程儲存功能初始化逾時。'));
      }
    }, 40);
  });
}

function clean(value) {
  return String(value ?? '').trim();
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'warn'](`${title}: ${message}`);
}

function makeItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function resolveTripMembershipForSave({ existingItem, activeTrip } = {}) {
  if (existingItem !== null && existingItem !== undefined) {
    return {
      tripId: clean(existingItem.tripId),
      country: resolveItemCountry(existingItem)
    };
  }
  return {
    tripId: clean(activeTrip?.id),
    country: clean(activeTrip?.country)
  };
}

export async function initTripSaveGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListTripSaveGuardInitialized) return;
  window.__shoppingListTripSaveGuardInitialized = true;

  await waitFor(() => typeof window.saveItem === 'function' && document.getElementById('item-website'));

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { deleteDoc, doc, getDoc, setDoc } = firestoreSdk;
  const originalSave = window.saveItem;

  window.saveItem = async function(...args) {
    window.shoppingListLastItemSave = { itemId: '', succeeded: false };
    const user = auth.currentUser;
    if (!user) return originalSave.apply(this, args);

    const idInput = document.getElementById('item-id');
    const modalContent = document.getElementById('add-modal-content');
    let itemId = clean(idInput?.value);
    const wasEditing = Boolean(itemId);
    const generatedNewId = !itemId;
    let existingItem = null;

    if (wasEditing) {
      const existingRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'items', itemId);
      const snapshot = await getDoc(existingRef);
      existingItem = snapshot.exists() ? snapshot.data() : null;
      if (!existingItem) {
        notify('商品資料不存在', '找不到原本的商品資料，請重新整理後再試。', 'error');
        return;
      }
    } else {
      if (!window.shoppingListTripContextReady || !window.shoppingListActiveTrip?.id) {
        notify('尚未選擇旅程', '請先新增或選擇一趟旅程，再新增商品。');
        return;
      }
      itemId = makeItemId();
      if (idInput) idInput.value = itemId;
    }

    const membership = resolveTripMembershipForSave({
      existingItem: wasEditing ? existingItem : null,
      activeTrip: window.shoppingListActiveTrip
    });

    if (!membership.tripId || !membership.country) {
      if (generatedNewId && idInput?.value === itemId) idInput.value = '';
      notify('旅程資料尚未完成', wasEditing
        ? '這個舊商品還沒有完成旅程歸檔，請重新整理後再試。'
        : '請先新增或選擇一趟旅程，再新增商品。');
      return;
    }

    const itemRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'items', itemId);
    let reservedNewItem = false;
    try {
      if (generatedNewId) {
        await setDoc(itemRef, membership, { merge: true });
        reservedNewItem = true;
      }

      const result = await originalSave.apply(this, args);
      const saveSucceeded = Boolean(modalContent?.classList?.contains('translate-y-full'));
      window.shoppingListLastItemSave = {
        itemId: saveSucceeded ? itemId : '',
        succeeded: saveSucceeded
      };
      if (!saveSucceeded && reservedNewItem) {
        try { await deleteDoc(itemRef); } catch (cleanupError) {
          console.error('Failed to clean reserved item after unsuccessful save:', cleanupError);
        }
        if (idInput?.value === itemId) idInput.value = '';
      }
      return result;
    } catch (error) {
      window.shoppingListLastItemSave = { itemId: '', succeeded: false };
      if (reservedNewItem) {
        try { await deleteDoc(itemRef); } catch (cleanupError) {
          console.error('Failed to clean reserved item after save error:', cleanupError);
        }
        if (idInput?.value === itemId) idInput.value = '';
      }
      throw error;
    }
  };
}
