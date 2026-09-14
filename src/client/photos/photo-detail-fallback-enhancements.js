import { createDetailPhotoPreview, resolveDetailPhotoDisplay } from './photo-detail-preview.js';

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
        reject(new Error('等待商品詳情照片 fallback 初始化逾時。'));
      }
    }, 40);
  });
}

function sortActivePhotos(photos = []) {
  return photos
    .filter((photo) => !photo?.status || photo.status === 'active')
    .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
}

export async function initPhotoDetailFallbackEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListPhotoDetailFallbackInitialized) return;
  window.__shoppingListPhotoDetailFallbackInitialized = true;

  await waitFor(() => (
    document.getElementById('photo-preview-grid')
    && typeof window.openEditModal === 'function'
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
  const { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } = firestoreSdk;
  let currentItemId = '';
  let renderVersion = 0;

  function tokenFor(userId) {
    return userId ? (window.sessionStorage.getItem(`shopping-list:drive-token:${userId}`) || '') : '';
  }

  async function loadPreview(userId, photoId) {
    const snapshot = await getDoc(doc(
      db, 'artifacts', APP_ID, 'users', userId, 'itemPhotoPreviews', photoId
    ));
    return snapshot.exists() ? String(snapshot.data()?.previewDataUrl || '').trim() : '';
  }

  async function downloadDrivePhoto(userId, fileId) {
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

  function setImage(card, src) {
    if (!card?.isConnected || !src) return;
    card.querySelector('[data-detail-load-action]')?.remove();
    let img = card.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      card.prepend(img);
    }
    img.src = src;
    img.alt = '商品照片';
    img.className = 'absolute inset-0 w-full h-full object-contain bg-white';
  }

  function showLoadAction(card, itemId) {
    if (!card?.isConnected || card.querySelector('[data-detail-load-action]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.detailLoadAction = 'true';
    button.className = 'absolute inset-2 z-20 rounded-xl bg-white/95 border-2 border-warmBrown text-warmBrown text-xs font-bold flex flex-col items-center justify-center gap-1';
    button.innerHTML = '<i class="fas fa-cloud-arrow-down text-lg"></i><span>載入完整照片</span><span class="text-[10px] font-medium text-gray-400">只需重新連結 Drive 一次</span>';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await window.connectGoogleDrive(true);
        if (currentItemId === itemId) await renderItem(itemId, { forceDrive: true });
      } catch (error) {
        console.warn('Detail photo Drive reconnect failed:', error);
        button.disabled = false;
      }
    });
    card.appendChild(button);
  }

  async function createAndPersistPreview(userId, photo) {
    if (!photo?.id || !photo?.driveFileId) return '';
    const blob = await downloadDrivePhoto(userId, photo.driveFileId);
    const preview = await createDetailPhotoPreview(blob);
    if (!preview?.dataUrl) return '';
    await setDoc(doc(
      db, 'artifacts', APP_ID, 'users', userId, 'itemPhotoPreviews', photo.id
    ), {
      itemId: photo.itemId || currentItemId,
      photoId: photo.id,
      previewDataUrl: preview.dataUrl,
      previewWidth: preview.width,
      previewHeight: preview.height,
      updatedAt: Date.now()
    }, { merge: true });
    await updateDoc(doc(
      db, 'artifacts', APP_ID, 'users', userId, 'itemPhotos', photo.id
    ), { detailPreviewReady: true }).catch(() => {});
    return preview.dataUrl;
  }

  async function renderItem(itemId, { forceDrive = false } = {}) {
    const user = auth.currentUser;
    const grid = document.getElementById('photo-preview-grid');
    if (!user || !itemId || !grid) return;
    const version = ++renderVersion;

    try {
      const [itemSnapshot, photoSnapshot] = await Promise.all([
        getDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'items', itemId)),
        getDocs(query(
          collection(db, 'artifacts', APP_ID, 'users', user.uid, 'itemPhotos'),
          where('itemId', '==', itemId)
        ))
      ]);
      if (version !== renderVersion || currentItemId !== itemId) return;

      const item = itemSnapshot.exists() ? itemSnapshot.data() : {};
      const photos = sortActivePhotos(photoSnapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() })));
      const cards = [...grid.children];
      const count = Math.min(photos.length, cards.length);

      for (let index = 0; index < count; index += 1) {
        const photo = photos[index];
        const card = cards[index];
        const previewDataUrl = await loadPreview(user.uid, photo.id).catch(() => '');
        if (version !== renderVersion || currentItemId !== itemId) return;

        const isCover = photo.id === item.coverPhotoId || index === 0;
        let display = resolveDetailPhotoDisplay({
          previewDataUrl,
          homepagePhotoUrl: item.photoUrl || '',
          isCover,
          hasDriveToken: Boolean(tokenFor(user.uid))
        });

        if ((display.mode === 'drive-backfill' || forceDrive) && photo.driveFileId) {
          try {
            const persisted = await createAndPersistPreview(user.uid, photo);
            if (persisted) display = { mode: 'persistent-preview', src: persisted };
          } catch (error) {
            console.warn('Detail photo immediate backfill failed:', error);
            display = resolveDetailPhotoDisplay({
              previewDataUrl: '',
              homepagePhotoUrl: item.photoUrl || '',
              isCover,
              hasDriveToken: Boolean(tokenFor(user.uid))
            });
          }
        }

        if (display.src) {
          setImage(card, display.src);
        } else if (display.mode === 'authorization-required') {
          showLoadAction(card, itemId);
        }
      }
    } catch (error) {
      console.warn('Detail photo fallback render failed:', error);
    }
  }

  const originalOpenEdit = window.openEditModal;
  window.openEditModal = function(id, ...args) {
    currentItemId = id;
    const result = originalOpenEdit.call(this, id, ...args);
    queueMicrotask(() => renderItem(id));
    return result;
  };

  const originalClose = window.closeAddModal;
  window.closeAddModal = function(...args) {
    currentItemId = '';
    renderVersion += 1;
    return originalClose.apply(this, args);
  };

  authSdk.onAuthStateChanged(auth, () => {
    currentItemId = '';
    renderVersion += 1;
  });
}
