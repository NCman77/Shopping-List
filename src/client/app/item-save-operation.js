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
    existingActivePhotos: copyAndFreeze(input.existingActivePhotos || []),
    removedPhotoDriveFileIds: copyAndFreeze(input.removedPhotoDriveFileIds || {}),
    extensions: copyAndFreeze(input.extensions || {})
  });
}

export function createOwnedItemSavePhotoService(operation, options = {}) {
  const capturedUserId = String(operation?.userId || '');
  const { createService, getCurrentUserId } = options;
  if (!capturedUserId) throw new TypeError('Item save operation user is required.');
  if (typeof createService !== 'function') throw new TypeError('Item photo service factory is required.');
  if (typeof getCurrentUserId !== 'function') throw new TypeError('Current user provider is required.');

  const service = createService(capturedUserId);
  function assertCurrentUser() {
    if (String(getCurrentUserId() || '') === capturedUserId) return;
    const error = new Error('item-save-operation-stale');
    error.code = 'item-save-operation-stale';
    throw error;
  }

  return Object.freeze({
    assertCurrentUser,
    hasAccessToken() {
      assertCurrentUser();
      return service.hasAccessToken();
    },
    uploadPhoto(input) {
      assertCurrentUser();
      return service.uploadPhoto(input);
    },
    deletePhoto(fileId) {
      assertCurrentUser();
      return service.deletePhoto(fileId);
    },
    queueCleanup(fileId) {
      return service.queueCleanup(fileId);
    }
  });
}

export async function deleteCapturedItemPhoto({
  driveFileId,
  photoService,
  deletePhotoMetadata,
  shouldQueueCleanup = () => true
}) {
  try {
    await photoService.deletePhoto(driveFileId);
  } catch (error) {
    if (shouldQueueCleanup(error)) photoService.queueCleanup(driveFileId);
    return false;
  }

  await deletePhotoMetadata();
  return true;
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
