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
      const error = new Error(`Google Drive API ${response.status}${detail ? `: ${detail}` : ''}`);
      error.status = response.status;
      throw error;
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

  function normalizeCleanupJob(entry) {
    if (typeof entry === 'string') {
      return /^[A-Za-z0-9_-]+$/.test(entry) ? { fileId: entry, metadataId: '' } : null;
    }
    if (!entry || typeof entry !== 'object' || !/^[A-Za-z0-9_-]+$/.test(entry.fileId || '')) return null;
    return {
      fileId: String(entry.fileId),
      metadataId: String(entry.metadataId || '').trim()
    };
  }

  function getQueuedCleanupJobs() {
    requireUser();
    try {
      const value = JSON.parse(sessionStorageImpl.getItem(cleanupKey()) || '[]');
      if (!Array.isArray(value)) return [];
      const jobs = new Map();
      for (const entry of value) {
        const job = normalizeCleanupJob(entry);
        if (!job) continue;
        const previous = jobs.get(job.fileId);
        jobs.set(job.fileId, {
          fileId: job.fileId,
          metadataId: job.metadataId || previous?.metadataId || ''
        });
      }
      return [...jobs.values()];
    } catch {
      return [];
    }
  }

  function getQueuedCleanup() {
    return getQueuedCleanupJobs().map((job) => job.fileId);
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
      try {
        await checkedFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' });
      } catch (error) {
        if (error?.status === 404) return;
        throw error;
      }
    },
    queueCleanup(fileId, metadataId = '') {
      const id = assertFileId(fileId);
      const metadata = String(metadataId || '').trim();
      const queued = getQueuedCleanupJobs();
      const existing = queued.find((job) => job.fileId === id);
      if (existing) {
        if (!existing.metadataId && metadata) existing.metadataId = metadata;
      } else {
        queued.push({ fileId: id, metadataId: metadata });
      }
      sessionStorageImpl.setItem(cleanupKey(), JSON.stringify(queued));
    },
    getQueuedCleanup,
    async retryQueuedCleanup({ onDeleted } = {}) {
      const queued = getQueuedCleanupJobs();
      const remaining = [];
      for (const job of queued) {
        try {
          await this.deletePhoto(job.fileId);
          const handled = typeof onDeleted === 'function' ? await onDeleted(job) : true;
          if (handled === false) remaining.push(job);
        } catch (error) {
          if (error instanceof DriveAuthorizationError) throw error;
          remaining.push(job);
        }
      }
      if (remaining.length) sessionStorageImpl.setItem(cleanupKey(), JSON.stringify(remaining));
      else sessionStorageImpl.removeItem(cleanupKey());
    }
  };
}
