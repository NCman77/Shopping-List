function removeById(documentRef, id) {
  const node = documentRef?.getElementById?.(id);
  if (node?.remove) node.remove();
}

function redactMapsRuntime(windowRef) {
  if (!windowRef) return;
  const generation = Number(windowRef.shoppingListMapsApiKeys?.generation) || 0;
  windowRef.shoppingListMapsApiKeys = { primary: '', backup: '', generation };
  windowRef.shoppingListMapsBrowserApiKey = '';
  windowRef.shoppingListMapsPlacesEnabled = false;
  windowRef.shoppingListNearbySort = { enabled: false, origin: null, distancesByItemId: {} };
}

export function removeRetiredLocationUi({
  documentRef = typeof document !== 'undefined' ? document : null
} = {}) {
  if (!documentRef) return;
  removeById(documentRef, 'account-open-maps');
  removeById(documentRef, 'account-maps-view');
  removeById(documentRef, 'item-store-field');
  removeById(documentRef, 'nearby-branch-modal');
  removeById(documentRef, 'nearby-sort-shell');
  documentRef.querySelectorAll?.('.nearby-distance-action, .nearby-distance-label')
    ?.forEach?.((node) => {
      if (node?.remove) node.remove();
    });
}

export function initRetiredLocationFeatures({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  removeRetiredLocationUi({ documentRef });
  redactMapsRuntime(windowRef);

  if (!windowRef?.addEventListener) return;
  windowRef.addEventListener('shopping-list:maps-settings-changed', () => {
    queueMicrotask(() => redactMapsRuntime(windowRef));
  });
}
