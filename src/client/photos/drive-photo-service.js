export class DriveAuthorizationError extends Error {
  constructor(message = '需要重新連結 Google Drive。') {
    super(message);
    this.name = 'DriveAuthorizationError';
    this.code = 'drive-authorization-required';
  }
}

function assertFileId(fileId) {
  const value = String(fileId ?? '');
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError('無效的 Google Drive 檔案 ID。');
  return value;
}

async function readGoogleError(response) {
  try {
    const data = await response.clone().json();
    return data?.error?.message || data?.message || '';
  } catch {
    try { return (await response.clone().text()).trim(); } catch { return ''; }
  }
}

export function createDrivePhotoService({ fetchImpl = fetch, sessionStorageImpl = sessionStorage, getUserId }) {
  const userId = () => String(getUserId?.() || '');
  const tokenKey = () => `shopping-list:drive-token:${userId()}`;
  const cleanupKey = () => `shopping-list:drive-cleanup:${userId()}`;

  function requireUser() {
    if (!userId()) throw new Error('尚未登入。');
  }

  function getToken() {
    requireUser();
    return sessionStorageImpl.getItem(tokenKey()) || '';
  }

  function requireToken() {
    const token = getToken();
    if (!token) throw new DriveAuthorizationError();
    return token;
  }

  async function checkedFetch(url, options = {}) {
    const token = requireToken();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    const response = await fetchImpl(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
      sessionStorageImpl.removeItem(tokenKey());
      throw new DriveAuthorizationError();
    }
    if (!response.ok) {
      const detail = await readGoogleError(response);
      throw new Error(`Google Drive API ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return response;
  }

  function normalizeAppProperties(value) {
    const entries = Object.entries(value && typeof value === 'object' ? value : {});
    return Object.fromEntries(entries
      .map(([key, propertyValue]) => [String(key || '').trim(), String(propertyValue ?? '')])
      .filter(([key]) => key));
  }

  async function uploadFile({ blob, fileName, appProperties = {} }) {
    if (!(blob instanceof Blob)) throw new TypeError('檔案資料無效。');
    const name = String(fileName || '').trim() || `file-${Date.now()}`;
    const form = new FormData();
    const metadata = {
      name,
      parents: ['appDataFolder'],
      appProperties: normalizeAppProperties(appProperties)
    };
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob, name);
    const response = await checkedFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size', {
      method: 'POST',
      body: form
    });
    return response.json();
  }

  function getQueuedCleanup() {
    requireUser();
    try {
      const value = JSON.parse(sessionStorageImpl.getItem(cleanupKey()) || '[]');
      return Array.isArray(value) ? [...new Set(value.filter((id) => /^[A-Za-z0-9_-]+$/.test(id)))] : [];
    } catch {
      return [];
    }
  }

  return {
    setAccessToken(token) {
      requireUser();
      const value = String(token || '').trim();
      if (value) sessionStorageImpl.setItem(tokenKey(), value);
      else sessionStorageImpl.removeItem(tokenKey());
    },
    clearAccessToken() {
      if (userId()) sessionStorageImpl.removeItem(tokenKey());
    },
    hasAccessToken() {
      return Boolean(userId() && sessionStorageImpl.getItem(tokenKey()));
    },
    uploadFile,
    async uploadPhoto({ blob, fileName, itemId }) {
      return uploadFile({
        blob,
        fileName,
        appProperties: { itemId: String(itemId || '') }
      });
    },
    async downloadPhoto(fileId) {
      const id = assertFileId(fileId);
      const response = await checkedFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
      return response.blob();
    },
    async deletePhoto(fileId) {
      const id = assertFileId(fileId);
      await checkedFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' });
    },
    queueCleanup(fileId) {
      const id = assertFileId(fileId);
      const queued = getQueuedCleanup();
      if (!queued.includes(id)) queued.push(id);
      sessionStorageImpl.setItem(cleanupKey(), JSON.stringify(queued));
    },
    getQueuedCleanup,
    async retryQueuedCleanup() {
      const queued = getQueuedCleanup();
      const remaining = [];
      for (const id of queued) {
        try {
          await this.deletePhoto(id);
        } catch (error) {
          if (error instanceof DriveAuthorizationError) throw error;
          remaining.push(id);
        }
      }
      if (remaining.length) sessionStorageImpl.setItem(cleanupKey(), JSON.stringify(remaining));
      else sessionStorageImpl.removeItem(cleanupKey());
    }
  };
}
