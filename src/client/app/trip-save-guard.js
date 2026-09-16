import { resolveItemCountry } from './travel-country.js';

const APP_ID = 'japan-shopping-app';
const RESERVATION_OPERATION_FIELD = '_shoppingListReservationOperationId';

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

export function resolveTripSaveReservationAction({ markerOperationId, operationId, succeeded } = {}) {
  const marker = clean(markerOperationId);
  const owner = clean(operationId);
  if (!marker || !owner || marker !== owner) return 'none';
  return succeeded ? 'clear' : 'delete';
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
  const { deleteField, doc, getDoc, runTransaction, setDoc } = firestoreSdk;
  const originalSave = window.saveItem;

  async function settleReservation(itemRef, operationId, succeeded) {
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(itemRef);
      if (!snapshot.exists()) return 'none';
      const action = resolveTripSaveReservationAction({
        markerOperationId: snapshot.data()?.[RESERVATION_OPERATION_FIELD],
        operationId,
        succeeded
      });
      if (action === 'delete') transaction.delete(itemRef);
      if (action === 'clear') {
        transaction.update(itemRef, { [RESERVATION_OPERATION_FIELD]: deleteField() });
      }
      return action;
    });
  }

  window.saveItem = async function(...args) {
    const operation = args[0]?.operationId
      ? args[0]
      : window.beginShoppingListSaveOperation();
    if (!operation) return null;

    const failBeforeBaseSave = (reason) => {
      const result = Object.freeze({
        operationId: operation.operationId,
        itemId: operation.itemId,
        userId: operation.userId,
        succeeded: false,
        reason
      });
      window.shoppingListLastItemSave = result;
      window.releaseShoppingListSaveOperation(operation);
      return result;
    };

    if (!operation.userId) {
      return originalSave.apply(this, [operation, ...args.slice(1)]);
    }

    const idInput = document.getElementById('item-id');
    const wasEditing = !operation.isNew;
    const generatedNewId = operation.isNew;
    let existingItem = null;

    if (wasEditing) {
      try {
        const existingRef = doc(db, 'artifacts', APP_ID, 'users', operation.userId, 'items', operation.itemId);
        const snapshot = await getDoc(existingRef);
        existingItem = snapshot.exists() ? snapshot.data() : null;
        if (!existingItem) {
          notify('商品資料不存在', '找不到原本的商品資料，請重新整理後再試。', 'error');
          return failBeforeBaseSave('item-not-found');
        }
      } catch (error) {
        failBeforeBaseSave(error.message || 'trip-membership-read-failed');
        throw error;
      }
    } else {
      if (!window.shoppingListTripContextReady || !window.shoppingListActiveTrip?.id) {
        notify('尚未選擇旅程', '請先新增或選擇一趟旅程，再新增商品。');
        return failBeforeBaseSave('active-trip-required');
      }
      if (idInput) idInput.value = operation.itemId;
    }

    const membership = resolveTripMembershipForSave({
      existingItem: wasEditing ? existingItem : null,
      activeTrip: window.shoppingListActiveTrip
    });

    if (!membership.tripId || !membership.country) {
      if (generatedNewId && idInput?.value === operation.itemId) idInput.value = '';
      notify('旅程資料尚未完成', wasEditing
        ? '這個舊商品還沒有完成旅程歸檔，請重新整理後再試。'
        : '請先新增或選擇一趟旅程，再新增商品。');
      return failBeforeBaseSave('trip-membership-required');
    }

    const itemRef = doc(db, 'artifacts', APP_ID, 'users', operation.userId, 'items', operation.itemId);
    const inheritedReservationOperationId = clean(existingItem?.[RESERVATION_OPERATION_FIELD]);
    const reservationOperationId = generatedNewId || inheritedReservationOperationId
      ? operation.operationId
      : '';

    const settleReservationSafely = async (succeeded, errorMessage) => {
      if (!reservationOperationId) return 'none';
      try {
        return await settleReservation(itemRef, reservationOperationId, succeeded);
      } catch (cleanupError) {
        console.error(errorMessage, cleanupError);
        return 'none';
      }
    };

    try {
      if (reservationOperationId) {
        await setDoc(itemRef, {
          ...(generatedNewId ? membership : {}),
          [RESERVATION_OPERATION_FIELD]: reservationOperationId
        }, { merge: true });
      }

      const result = await originalSave.apply(this, [operation, ...args.slice(1)]);
      const succeeded = Boolean(
        result && result.succeeded
        && result.operationId === operation.operationId
        && result.itemId === operation.itemId
        && result.userId === operation.userId
      );
      const settlement = await settleReservationSafely(
        succeeded,
        'Failed to settle reserved item after save:'
      );
      if (settlement === 'delete') {
        if (idInput?.value === operation.itemId) idInput.value = '';
      }
      return result;
    } catch (error) {
      const settlement = await settleReservationSafely(
        false,
        'Failed to settle reserved item after save error:'
      );
      if (settlement === 'delete') {
        if (idInput?.value === operation.itemId) idInput.value = '';
      }
      if (!window.shoppingListLastItemSave
        || window.shoppingListLastItemSave.operationId !== operation.operationId) {
        failBeforeBaseSave(error.message || 'trip-save-guard-failed');
      }
      throw error;
    }
  };

  window.__shoppingListTripSaveGuardReady = true;
  window.dispatchEvent(new CustomEvent('shopping-list:trip-save-guard-ready'));
}
