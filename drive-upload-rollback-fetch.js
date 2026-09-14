import { rollbackUploadedFiles } from './photo-upload-transaction.js';

const UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files';
const DELETE_PREFIX = 'https://www.googleapis.com/drive/v3/files/';
const TOKEN_PREFIX = 'shopping-list:drive-token:';
const CLEANUP_PREFIX = 'shopping-list:drive-cleanup:';

function getHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return String(value ?? '');
  }
  return '';
}

async function readItemId(body) {
  if (!body || typeof body.get !== 'function') return '';
  const metadata = body.get('metadata');
  if (!metadata) return '';
  try {
    const text = typeof metadata.text === 'function' ? await metadata.text() : String(metadata);
    return String(JSON.parse(text)?.appProperties?.itemId || '');
  } catch {
    return '';
  }
}

function findUserIdForBearerToken(storage, authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i);
  const token = match?.[1] || '';
  if (!token || !storage) return '';
  for (let index = 0; index < Number(storage.length || 0); index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(TOKEN_PREFIX)) continue;
    if (storage.getItem(key) === token) return key.slice(TOKEN_PREFIX.length);
  }
  return '';
}

function queueCleanup(storage, authorization, fileId) {
  const userId = findUserIdForBearerToken(storage, authorization);
  if (!userId) return;
  const key = `${CLEANUP_PREFIX}${userId}`;
  let queued = [];
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    if (Array.isArray(parsed)) queued = parsed;
  } catch {}
  if (!queued.includes(fileId)) queued.push(fileId);
  storage.setItem(key, JSON.stringify(queued));
}

export function installDriveUploadRollbackFetch(windowRef = window) {
  if (!windowRef?.fetch) throw new TypeError('window.fetch is required.');
  if (windowRef.__shoppingListDriveRollbackInstalled) {
    return windowRef.__shoppingListDriveRollbackInstalled;
  }

  const originalFetch = windowRef.fetch.bind(windowRef);
  const transactions = new Map();

  async function finalize(key, transaction) {
    if (transaction.active !== 0) return;
    transactions.delete(key);
    if (!transaction.failed || transaction.uploadedFileIds.length === 0) return;

    await rollbackUploadedFiles(
      transaction.uploadedFileIds,
      async (fileId) => {
        const headers = transaction.authorization ? { Authorization: transaction.authorization } : {};
        const response = await originalFetch(`${DELETE_PREFIX}${encodeURIComponent(fileId)}`, {
          method: 'DELETE',
          headers
        });
        if (!response.ok) throw new Error(`Drive rollback delete failed: ${response.status}`);
      },
      (fileId) => queueCleanup(windowRef.sessionStorage, transaction.authorization, fileId)
    );
  }

  async function wrappedFetch(input, options = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(options.method || 'GET').toUpperCase();
    if (method !== 'POST' || !url.startsWith(UPLOAD_PREFIX)) {
      return originalFetch(input, options);
    }

    const itemId = await readItemId(options.body);
    const key = itemId || '__shopping-list-upload__';
    let transaction = transactions.get(key);
    if (!transaction) {
      transaction = {
        active: 0,
        failed: false,
        uploadedFileIds: [],
        authorization: '',
        finalizeTimer: null
      };
      transactions.set(key, transaction);
    }

    if (transaction.finalizeTimer) {
      clearTimeout(transaction.finalizeTimer);
      transaction.finalizeTimer = null;
    }
    transaction.active += 1;
    transaction.authorization ||= getHeader(options.headers, 'Authorization');

    try {
      const response = await originalFetch(input, options);
      if (response.ok) {
        try {
          const data = await response.clone().json();
          if (data?.id && !transaction.uploadedFileIds.includes(data.id)) {
            transaction.uploadedFileIds.push(data.id);
          }
        } catch {}
      } else {
        transaction.failed = true;
      }
      return response;
    } catch (error) {
      transaction.failed = true;
      throw error;
    } finally {
      transaction.active -= 1;
      if (transaction.active === 0) {
        transaction.finalizeTimer = setTimeout(() => {
          finalize(key, transaction).catch((error) => {
            console.error('Google Drive rollback failed:', error);
          });
        }, 0);
      }
    }
  }

  windowRef.fetch = wrappedFetch;
  const uninstall = () => {
    if (windowRef.fetch === wrappedFetch) windowRef.fetch = originalFetch;
    delete windowRef.__shoppingListDriveRollbackInstalled;
  };
  windowRef.__shoppingListDriveRollbackInstalled = uninstall;
  return uninstall;
}
