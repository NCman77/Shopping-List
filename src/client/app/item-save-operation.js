const snapshotProviders = new Map();

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyAndFreeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(copyAndFreeze));
  }
  if (!isPlainRecord(value)) return value;

  const copy = {};
  for (const [key, entry] of Object.entries(value)) {
    copy[key] = copyAndFreeze(entry);
  }
  return Object.freeze(copy);
}

export function registerItemSaveSnapshotProvider(name, provider) {
  const providerName = String(name || '').trim();
  if (!providerName) throw new TypeError('Item save snapshot provider name is required.');
  if (typeof provider !== 'function') throw new TypeError('Item save snapshot provider must be a function.');
  if (snapshotProviders.has(providerName)) throw new Error(`Item save snapshot provider already registered: ${providerName}`);

  snapshotProviders.set(providerName, provider);
  return () => {
    if (snapshotProviders.get(providerName) === provider) snapshotProviders.delete(providerName);
  };
}

export function captureRegisteredItemSaveExtensions() {
  const extensions = {};
  for (const [name, provider] of snapshotProviders) {
    extensions[name] = provider();
  }
  return copyAndFreeze(extensions);
}

export function createItemSaveOperation(input = {}) {
  return Object.freeze({
    operationId: input.operationId,
    userId: input.userId,
    itemId: input.itemId,
    isNew: Boolean(input.isNew),
    modalGeneration: input.modalGeneration,
    fields: copyAndFreeze(input.fields || {}),
    pendingPhotos: copyAndFreeze(input.pendingPhotos || []),
    removedPhotoIds: Object.freeze(Array.from(input.removedPhotoIds || [], (id) => String(id))),
    extensions: copyAndFreeze(input.extensions || {})
  });
}

export function isItemSaveOperationCurrent(operation, current) {
  return Boolean(operation && current
    && operation.userId === current.userId
    && operation.modalGeneration === current.modalGeneration);
}

export function createItemSaveResult(operation, succeeded, reason = '') {
  return Object.freeze({
    operationId: operation.operationId,
    itemId: operation.itemId,
    userId: operation.userId,
    succeeded: Boolean(succeeded),
    reason: String(reason || '')
  });
}
