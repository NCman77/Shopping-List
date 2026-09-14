import { createDetailPhotoPreview, createDetailPreviewBackfillService } from './photo-detail-preview.js';

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
        reject(new Error('等待商品詳情照片功能初始化逾時。'));
      }
    }, 40);
  });
}

function sortActivePhotos(photos = []) {
  return photos
    .filter((photo) => !photo?.status || photo.status === 'active')
    .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
}

export async function initPhotoDetailPreviewEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListPhotoDetailPreviewInitialized) return;
  window.__shoppingListPhotoDetailPreviewInitialized = true;

  await waitFor(() => (
    document.getElementById('photo-preview-grid')
    && typeof window.openEditModal === 'function'
    && typeof window.saveItem === 'function'
    && typeof window.connectGoogleDrive === 'function'
  ));

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const {
    collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, writeBatch
  } = firestoreSdk;

  const state = {
    currentItemId: '',
    pendingDeleteItemId: '',
    removedPhotoIds: new Set(),
    photosByItem: new Map(),
    previewCache: new Map(),
    applying: false,
    applyScheduled: false
  };

  function tokenFor(userId) {
    return userId ? (window.sessionStorage.getItem(`shopping-list:drive-token:${userId}`) || '') : '';
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

  async function listActivePhotos(itemId, force = false) {
    if (!itemId) return [];
    if (!force && state.photosByItem.has(itemId)) return state.photosByItem.get(itemId);
    const snapshot = await getDocs(query(
      collection(db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'itemPhotos'),
      where('itemId', '==', itemId)
    ));
    const photos = sortActivePhotos(snapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() })));
    state.photosByItem.set(itemId, photos);
    return photos;
  }

  async function loadPersistentDetailPreview(photoId) {
    if (!photoId || !auth.currentUser) return '';
    if (state.previewCache.has(photoId)) return state.previewCache.get(photoId);
    const snapshot = await getDoc(doc(
      db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'itemPhotoPreviews', photoId
    ));
    const previewDataUrl = snapshot.exists() ? String(snapshot.data()?.previewDataUrl || '').trim() : '';
    state.previewCache.set(photoId, previewDataUrl);
    return previewDataUrl;
  }

  function setPersistentImage(card, src) {
    if (!card?.isConnected || !src) return;
    let img = card.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      card.prepend(img);
    }
    img.src = src;
    img.alt = '商品照片';
    img.className = 'absolute inset-0 w-full h-full object-contain bg-white';
  }

  async function applyDetailPreviews({ forcePhotos = false } = {}) {
    const itemId = state.currentItemId;
    const grid = document.getElementById('photo-preview-grid');
    if (!itemId || !grid || !auth.currentUser || state.applying) return;
    state.applying = true;
    try {
      const photos = (await listActivePhotos(itemId, forcePhotos))
        .filter((photo) => !state.removedPhotoIds.has(photo.id));
      const cards = [...grid.children];
      const count = Math.min(photos.length, cards.length);

      for (let index = 0; index < count; index += 1) {
        const photo = photos[index];
        const card = cards[index];
        card.dataset.detailPhotoId = photo.id;
        const previewDataUrl = await loadPersistentDetailPreview(photo.id);
        if (state.currentItemId !== itemId) return;
        setPersistentImage(card, previewDataUrl);
      }
    } catch (error) {
      console.warn('Persistent detail preview render failed:', error);
    } finally {
      state.applying = false;
    }
  }

  function scheduleApply(options) {
    if (state.applyScheduled) return;
    state.applyScheduled = true;
    queueMicrotask(async () => {
      state.applyScheduled = false;
      await applyDetailPreviews(options);
    });
  }

  async function persistDetailPreview(photoId, photo, preview) {
    if (!auth.currentUser || !photoId || !preview?.dataUrl) return;
    const batch = writeBatch(db);
    batch.set(doc(
      db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'itemPhotoPreviews', photoId
    ), {
      itemId: photo.itemId || '',
      photoId,
      previewDataUrl: preview.dataUrl,
      previewWidth: preview.width,
      previewHeight: preview.height,
      updatedAt: Date.now()
    }, { merge: true });
    batch.update(doc(
      db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'itemPhotos', photoId
    ), {
      detailPreviewReady: true
    });
    await batch.commit();
    state.previewCache.set(photoId, preview.dataUrl);
  }

  async function backfillMissingDetailPreviews(userId) {
    if (!userId || !tokenFor(userId)) return { updated: 0 };
    const snapshot = await getDocs(collection(db, 'artifacts', APP_ID, 'users', userId, 'itemPhotos'));
    const photos = sortActivePhotos(snapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() })));
    const candidates = [];

    for (const photo of photos) {
      if (photo.detailPreviewReady === true) continue;
      const previewSnapshot = await getDoc(doc(
        db, 'artifacts', APP_ID, 'users', userId, 'itemPhotoPreviews', photo.id
      ));
      if (previewSnapshot.exists() && String(previewSnapshot.data()?.previewDataUrl || '').trim()) {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', userId, 'itemPhotos', photo.id), {
          detailPreviewReady: true
        });
        continue;
      }
      candidates.push(photo);
    }

    const service = createDetailPreviewBackfillService({
      downloadPhoto: (fileId) => downloadPhotoForUser(userId, fileId),
      createPreview: createDetailPhotoPreview,
      updatePreview: (photoId, preview, photo) => persistDetailPreview(photoId, photo, preview)
    });
    const result = await service.backfillPhotos(candidates);
    if (state.currentItemId) {
      state.photosByItem.delete(state.currentItemId);
      scheduleApply({ forcePhotos: true });
    }
    return result;
  }

  async function cleanupRemovedPreviews(itemId, beforePhotos = []) {
    if (!itemId || !auth.currentUser || !beforePhotos.length) return;
    const afterPhotos = await listActivePhotos(itemId, true);
    const remaining = new Set(afterPhotos.map((photo) => photo.id));
    const removed = beforePhotos.filter((photo) => !remaining.has(photo.id));
    await Promise.all(removed.map(async (photo) => {
      state.previewCache.delete(photo.id);
      await deleteDoc(doc(
        db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'itemPhotoPreviews', photo.id
      )).catch(() => {});
    }));
  }

  async function cleanupDeletedItemPreviews(itemId) {
    if (!itemId || !auth.currentUser) return;
    const itemSnapshot = await getDoc(doc(db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'items', itemId));
    if (itemSnapshot.exists()) return;
    const previews = await getDocs(query(
      collection(db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'itemPhotoPreviews'),
      where('itemId', '==', itemId)
    ));
    await Promise.all(previews.docs.map((previewDoc) => deleteDoc(previewDoc.ref).catch(() => {})));
  }

  const grid = document.getElementById('photo-preview-grid');
  grid?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button');
    const card = button?.closest?.('[data-detail-photo-id]');
    const photoId = card?.dataset?.detailPhotoId || '';
    if (photoId) state.removedPhotoIds.add(photoId);
  }, true);

  const observer = new MutationObserver(() => {
    if (!state.applying && state.currentItemId) scheduleApply();
  });
  if (grid) observer.observe(grid, { childList: true, subtree: false });

  const originalOpenEdit = window.openEditModal;
  window.openEditModal = function(id, ...args) {
    state.currentItemId = id;
    state.removedPhotoIds.clear();
    state.photosByItem.delete(id);
    const result = originalOpenEdit.call(this, id, ...args);
    scheduleApply({ forcePhotos: true });
    return result;
  };

  const originalOpenAdd = window.openAddModal;
  window.openAddModal = function(...args) {
    state.currentItemId = '';
    state.removedPhotoIds.clear();
    return originalOpenAdd.apply(this, args);
  };

  const originalCloseAdd = window.closeAddModal;
  window.closeAddModal = function(...args) {
    state.currentItemId = '';
    state.removedPhotoIds.clear();
    return originalCloseAdd.apply(this, args);
  };

  const originalSaveItem = window.saveItem;
  window.saveItem = async function(...args) {
    const itemIdBeforeSave = document.getElementById('item-id')?.value || state.currentItemId || '';
    const beforePhotos = itemIdBeforeSave ? await listActivePhotos(itemIdBeforeSave, true).catch(() => []) : [];
    const result = await originalSaveItem.apply(this, args);
    const userId = auth.currentUser?.uid || '';
    if (userId && tokenFor(userId)) {
      try { await backfillMissingDetailPreviews(userId); }
      catch (error) { console.warn('Detail preview persistence after save failed:', error); }
    }
    if (itemIdBeforeSave) {
      try { await cleanupRemovedPreviews(itemIdBeforeSave, beforePhotos); }
      catch (error) { console.warn('Detail preview cleanup failed:', error); }
    }
    return result;
  };

  const originalConnectGoogleDrive = window.connectGoogleDrive;
  window.connectGoogleDrive = async function(...args) {
    const result = await originalConnectGoogleDrive.apply(this, args);
    const userId = auth.currentUser?.uid || '';
    if (userId && tokenFor(userId)) {
      try { await backfillMissingDetailPreviews(userId); }
      catch (error) { console.warn('Detail preview backfill failed:', error); }
    }
    return result;
  };

  if (typeof window.askDelete === 'function') {
    const originalAskDelete = window.askDelete;
    window.askDelete = function(id, ...args) {
      state.pendingDeleteItemId = id;
      return originalAskDelete.call(this, id, ...args);
    };
  }

  if (typeof window.closeDeleteModal === 'function') {
    const originalCloseDeleteModal = window.closeDeleteModal;
    window.closeDeleteModal = function(...args) {
      const itemId = state.pendingDeleteItemId;
      const result = originalCloseDeleteModal.apply(this, args);
      if (itemId) {
        queueMicrotask(async () => {
          try { await cleanupDeletedItemPreviews(itemId); }
          catch (error) { console.warn('Deleted item detail preview cleanup failed:', error); }
          state.pendingDeleteItemId = '';
        });
      }
      return result;
    };
  }

  authSdk.onAuthStateChanged(auth, (user) => {
    state.currentItemId = '';
    state.removedPhotoIds.clear();
    state.photosByItem.clear();
    state.previewCache.clear();
    if (user?.uid && tokenFor(user.uid)) {
      void backfillMissingDetailPreviews(user.uid);
    }
  });

  window.backfillDetailPhotoPreviews = () => {
    const userId = auth.currentUser?.uid || '';
    return userId ? backfillMissingDetailPreviews(userId) : Promise.resolve({ updated: 0 });
  };
}
