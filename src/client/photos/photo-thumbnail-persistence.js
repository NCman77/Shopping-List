import { compressImage, revokeCompressedImage } from './image-compression.js';
import { resolvePhotoPersistenceForSave } from './photo-visibility-state.js';

const APP_ID = 'japan-shopping-app';
const MAX_THUMBNAIL_CHARS = 80000;

function sortActivePhotos(photos = []) {
  return photos
    .filter((photo) => !photo?.status || photo.status === 'active')
    .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('無法建立照片縮圖。'));
    reader.readAsDataURL(blob);
  });
}

export async function createLightweightThumbnail(blob) {
  const attempts = [
    { maxEdge: 256, quality: 0.60 },
    { maxEdge: 192, quality: 0.48 }
  ];

  for (const options of attempts) {
    const compressed = await compressImage(blob, options);
    try {
      const dataUrl = await blobToDataUrl(compressed.blob);
      if (dataUrl && dataUrl.length <= MAX_THUMBNAIL_CHARS) return dataUrl;
    } finally {
      revokeCompressedImage(compressed);
    }
  }
  return '';
}

export function createPhotoThumbnailPersistenceService({
  getItem,
  listPhotosForItem,
  downloadPhoto,
  createThumbnail = createLightweightThumbnail,
  updateItem,
  maxThumbnailChars = MAX_THUMBNAIL_CHARS
}) {
  return {
    async backfillItem(itemId, preload = {}) {
      const item = preload.item || await getItem(itemId);
      if (!item) return { status: 'missing' };

      const photos = sortActivePhotos(preload.photos || await listPhotosForItem(itemId));
      const cover = photos[0] || null;

      if (!cover) {
        const next = resolvePhotoPersistenceForSave({
          existingItem: item,
          existingActivePhotos: [],
          uploadedPhotos: []
        });
        if (item.photoThumbCoverId) {
          await updateItem(itemId, next);
          return { status: 'cleared' };
        }
        return { status: 'no-drive-photo' };
      }

      const currentUrl = String(item.photoUrl || '').trim();
      const currentCoverId = String(item.photoThumbCoverId || '').trim();
      if (currentUrl && currentCoverId === String(cover.id) && currentUrl.length <= maxThumbnailChars) {
        return { status: 'ready' };
      }

      if (!cover.driveFileId) return { status: 'missing-drive-file' };
      const blob = await downloadPhoto(cover.driveFileId);
      const thumbnailDataUrl = await createThumbnail(blob);
      if (!thumbnailDataUrl) return { status: 'thumbnail-too-large' };

      const patch = resolvePhotoPersistenceForSave({
        existingItem: item,
        existingActivePhotos: [],
        uploadedPhotos: [{ id: cover.id, thumbnailDataUrl }]
      });
      await updateItem(itemId, patch);
      return { status: 'updated' };
    }
  };
}

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
        reject(new Error('等待照片持久化功能初始化逾時。'));
      }
    }, 40);
  });
}

async function mapWithConcurrency(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

export async function initPhotoThumbnailPersistence() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListPhotoThumbnailPersistenceInitialized) return;
  window.__shoppingListPhotoThumbnailPersistenceInitialized = true;

  await waitFor(() => typeof window.saveItem === 'function' && typeof window.connectGoogleDrive === 'function');

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, getDoc, getDocs, query, updateDoc, where } = firestoreSdk;

  function tokenFor(userId) {
    return window.sessionStorage.getItem(`shopping-list:drive-token:${userId}`) || '';
  }

  async function downloadPhotoForUser(userId, fileId) {
    const token = tokenFor(userId);
    if (!token) throw new Error('authorization-required');
    const response = await window.fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) {
      window.sessionStorage.removeItem(`shopping-list:drive-token:${userId}`);
      throw new Error('authorization-required');
    }
    if (!response.ok) throw new Error(`Google Drive API ${response.status}`);
    return response.blob();
  }

  function serviceFor(userId) {
    return createPhotoThumbnailPersistenceService({
      getItem: async (itemId) => {
        const snapshot = await getDoc(doc(db, 'artifacts', APP_ID, 'users', userId, 'items', itemId));
        return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
      },
      listPhotosForItem: async (itemId) => {
        const snapshot = await getDocs(query(
          collection(db, 'artifacts', APP_ID, 'users', userId, 'itemPhotos'),
          where('itemId', '==', itemId)
        ));
        return snapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() }));
      },
      downloadPhoto: (fileId) => downloadPhotoForUser(userId, fileId),
      updateItem: (itemId, patch) => updateDoc(
        doc(db, 'artifacts', APP_ID, 'users', userId, 'items', itemId),
        patch
      )
    });
  }

  async function backfillAllMissingThumbnails(userId) {
    if (!userId || !tokenFor(userId)) return;
    const [itemsSnapshot, photosSnapshot] = await Promise.all([
      getDocs(collection(db, 'artifacts', APP_ID, 'users', userId, 'items')),
      getDocs(collection(db, 'artifacts', APP_ID, 'users', userId, 'itemPhotos'))
    ]);

    const photosByItem = new Map();
    for (const photoDoc of photosSnapshot.docs) {
      const photo = { id: photoDoc.id, ...photoDoc.data() };
      if (!photo.itemId) continue;
      if (!photosByItem.has(photo.itemId)) photosByItem.set(photo.itemId, []);
      photosByItem.get(photo.itemId).push(photo);
    }

    const service = serviceFor(userId);
    const items = itemsSnapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
    await mapWithConcurrency(items, 3, async (item) => {
      try {
        return await service.backfillItem(item.id, {
          item,
          photos: photosByItem.get(item.id) || []
        });
      } catch (error) {
        if (error?.message !== 'authorization-required') {
          console.warn('Persistent thumbnail backfill failed:', item.id, error);
        }
        return { status: 'failed' };
      }
    });
  }

  const originalSaveItem = window.saveItem;
  window.saveItem = async function(...args) {
    const result = await originalSaveItem.apply(this, args);
    const userId = auth.currentUser?.uid || '';
    if (userId && tokenFor(userId)) {
      try { await backfillAllMissingThumbnails(userId); }
      catch (error) { console.warn('Post-save thumbnail persistence failed:', error); }
    }
    return result;
  };

  const originalConnectGoogleDrive = window.connectGoogleDrive;
  window.connectGoogleDrive = async function(...args) {
    const result = await originalConnectGoogleDrive.apply(this, args);
    const userId = auth.currentUser?.uid || '';
    if (userId && tokenFor(userId)) {
      try { await backfillAllMissingThumbnails(userId); }
      catch (error) { console.warn('Drive thumbnail persistence failed:', error); }
    }
    return result;
  };

  const driveButton = document.getElementById('drive-connect-btn');
  driveButton?.addEventListener('click', async () => {
    const userId = auth.currentUser?.uid || '';
    if (!userId) return;
    try {
      await waitFor(() => tokenFor(userId), 5000);
      await backfillAllMissingThumbnails(userId);
    } catch {}
  });

  authSdk.onAuthStateChanged(auth, (user) => {
    if (user?.uid && tokenFor(user.uid)) {
      void backfillAllMissingThumbnails(user.uid);
    }
  });

  window.backfillDrivePhotoThumbnails = () => {
    const userId = auth.currentUser?.uid || '';
    return userId ? backfillAllMissingThumbnails(userId) : Promise.resolve();
  };
}
