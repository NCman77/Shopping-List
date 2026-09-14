import { groupActivePhotosByItem } from './photo-metadata.js';
import { createLightweightThumbnail } from './photo-thumbnail-persistence.js';
import { getPhotoVisibilityState, shouldBackfillPhotoThumbnail, shouldClearPersistentThumbnail } from './photo-visibility-state.js';

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
        reject(new Error('等待照片介面初始化逾時。'));
      }
    }, 40);
  });
}

function getCardItemId(card) {
  const clickable = card.querySelector('[onclick*="openEditModal"]');
  const source = clickable?.getAttribute('onclick') || '';
  const match = source.match(/openEditModal\(['"]([^'"]+)['"]\)/);
  return match?.[1] || card.dataset.enhancedItemId || '';
}

export async function initPhotoVisibilityEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListPhotoVisibilityInitialized) return;
  window.__shoppingListPhotoVisibilityInitialized = true;

  await waitFor(() => document.getElementById('item-list'));

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, updateDoc } = firestoreSdk;

  const state = {
    userId: null,
    items: new Map(),
    photosByItem: new Map(),
    itemUnsub: null,
    photoUnsub: null,
    objectUrls: new Map(),
    thumbnailWrites: new Set()
  };

  function clearObjectUrls() {
    for (const url of state.objectUrls.values()) URL.revokeObjectURL(url);
    state.objectUrls.clear();
  }

  function tokenKey() {
    return state.userId ? `shopping-list:drive-token:${state.userId}` : '';
  }

  function getDriveToken() {
    const key = tokenKey();
    return key ? (window.sessionStorage.getItem(key) || '') : '';
  }

  function clearDriveToken() {
    const key = tokenKey();
    if (key) window.sessionStorage.removeItem(key);
  }

  function photoBoxForCard(card) {
    return card?.firstElementChild || null;
  }

  function setCardImage(card, src) {
    const box = photoBoxForCard(card);
    if (!box || !src) return;
    let img = box.querySelector('img');
    if (!img) {
      box.innerHTML = '';
      img = document.createElement('img');
      img.alt = 'item photo';
      img.className = 'w-full h-full object-cover';
      box.appendChild(img);
    }
    img.src = src;
  }

  function renderEmptyPhoto(card) {
    const box = photoBoxForCard(card);
    if (!box) return;
    box.innerHTML = '<i class="fas fa-gift text-3xl text-pastelOrange"></i>';
  }

  function renderAuthorizationRequired(card) {
    const box = photoBoxForCard(card);
    if (!box) return;
    if (box.querySelector('.drive-photo-auth-required')) return;
    box.innerHTML = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'drive-photo-auth-required w-full h-full px-2 flex flex-col items-center justify-center text-[10px] font-bold text-warmBrown bg-pastelBlue/40 leading-tight';
    button.innerHTML = '<i class="fab fa-google-drive text-xl mb-1"></i><span>照片仍在 Drive</span><span class="mt-1 underline">點此顯示</span>';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const connect = await waitFor(() => typeof window.connectGoogleDrive === 'function' && window.connectGoogleDrive, 3000);
        await connect(true);
        renderAll();
      } catch (error) {
        console.error('Drive reconnect failed:', error);
        if (typeof window.showMsg === 'function') {
          window.showMsg('需要 Google Drive 授權', '照片沒有被刪除，請重新連結 Google Drive 後即可顯示。', 'warning');
        }
      }
    });
    box.appendChild(button);
  }

  async function downloadDrivePhoto(fileId) {
    const token = getDriveToken();
    if (!token) throw new Error('authorization-required');
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) {
      clearDriveToken();
      throw new Error('authorization-required');
    }
    if (!response.ok) throw new Error(`Google Drive API ${response.status}`);
    return response.blob();
  }

  async function backfillThumbnail(itemId, coverId, blob) {
    if (!state.userId || state.thumbnailWrites.has(itemId)) return;
    const item = state.items.get(itemId);
    if (!item || (item.photoUrl && item.photoThumbCoverId === coverId)) return;
    state.thumbnailWrites.add(itemId);
    try {
      const thumbnail = await createLightweightThumbnail(blob);
      if (!thumbnail) return;
      await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', itemId), {
        photoUrl: thumbnail,
        photoThumbCoverId: coverId
      });
    } catch (error) {
      console.warn('Photo thumbnail backfill failed:', error);
    } finally {
      state.thumbnailWrites.delete(itemId);
    }
  }

  async function clearTrackedThumbnail(itemId) {
    if (!state.userId || state.thumbnailWrites.has(itemId)) return;
    const item = state.items.get(itemId);
    if (!item?.photoThumbCoverId) return;
    state.thumbnailWrites.add(itemId);
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', itemId), {
        photoUrl: '',
        photoThumbCoverId: null
      });
    } catch (error) {
      console.warn('Photo thumbnail clear failed:', error);
    } finally {
      state.thumbnailWrites.delete(itemId);
    }
  }

  async function renderCardPhoto(card, itemId) {
    const item = state.items.get(itemId);
    if (!item) return;
    const cover = state.photosByItem.get(itemId)?.[0] || null;
    const driveCoverId = cover?.id || '';
    const visibility = getPhotoVisibilityState({
      photoUrl: item.photoUrl || '',
      persistentCoverId: item.photoThumbCoverId || '',
      driveCoverId,
      hasDriveToken: Boolean(getDriveToken())
    });

    if (visibility.mode === 'persistent') {
      setCardImage(card, visibility.src);
      return;
    }

    if (visibility.mode === 'empty') {
      renderEmptyPhoto(card);
      if (shouldClearPersistentThumbnail({
        photoUrl: item.photoUrl || '',
        persistentCoverId: item.photoThumbCoverId || '',
        driveCoverId
      })) {
        void clearTrackedThumbnail(itemId);
      }
      return;
    }

    if (visibility.mode === 'authorization-required') {
      renderAuthorizationRequired(card);
      return;
    }

    if (!cover?.driveFileId) return;
    try {
      const cacheKey = cover.driveFileId;
      let url = state.objectUrls.get(cacheKey);
      let blob;
      if (!url) {
        blob = await downloadDrivePhoto(cover.driveFileId);
        url = URL.createObjectURL(blob);
        state.objectUrls.set(cacheKey, url);
      }
      if (!card.isConnected) return;
      setCardImage(card, url);
      if (shouldBackfillPhotoThumbnail({
        photoUrl: item.photoUrl || '',
        persistentCoverId: item.photoThumbCoverId || '',
        driveCoverId,
        hasDriveToken: true
      })) {
        blob ||= await downloadDrivePhoto(cover.driveFileId);
        await backfillThumbnail(itemId, driveCoverId, blob);
      }
    } catch (error) {
      if (error?.message === 'authorization-required') renderAuthorizationRequired(card);
      else console.warn('Drive photo display failed:', error);
    }
  }

  function renderAll() {
    const list = document.getElementById('item-list');
    if (!list) return;
    for (const card of [...list.children]) {
      if (card.id) continue;
      const itemId = getCardItemId(card);
      if (itemId) void renderCardPhoto(card, itemId);
    }
  }

  function stopListeners() {
    state.itemUnsub?.();
    state.photoUnsub?.();
    state.itemUnsub = null;
    state.photoUnsub = null;
  }

  function subscribeUser(user) {
    stopListeners();
    clearObjectUrls();
    state.userId = user?.uid || null;
    state.items = new Map();
    state.photosByItem = new Map();
    state.thumbnailWrites.clear();
    if (!user) return;

    state.itemUnsub = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items'), (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
      queueMicrotask(renderAll);
    }, (error) => console.error('Photo item listener failed:', error));

    state.photoUnsub = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'itemPhotos'), (snapshot) => {
      if (state.userId !== user.uid) return;
      const photos = snapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() }));
      state.photosByItem = groupActivePhotosByItem(photos);
      queueMicrotask(renderAll);
    }, (error) => console.error('Photo metadata listener failed:', error));
  }

  const list = document.getElementById('item-list');
  const observer = new MutationObserver(() => queueMicrotask(renderAll));
  observer.observe(list, { childList: true, subtree: false });

  authSdk.onAuthStateChanged(auth, subscribeUser);
  renderAll();
}
