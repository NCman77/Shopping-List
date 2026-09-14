import { buildCopiedItemData, findExistingCopy } from './item-copy.js';
import { normalizeTrip, sortTripsForPicker, tripDisplayTitle } from './travel-trip.js';
import { createDrivePhotoService, DriveAuthorizationError } from '../photos/drive-photo-service.js';
import { createLightweightThumbnail } from '../photos/photo-thumbnail-persistence.js';
import { resolvePhotoPersistenceForSave } from '../photos/photo-visibility-state.js';

const APP_ID = 'japan-shopping-app';

function waitFor(predicate, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('等待商品複製功能初始化逾時。'));
      }
    }, 40);
  });
}

function clean(value) {
  return String(value ?? '').trim();
}

function notify(title, message, type = 'error') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function sourcePhotosForItem(photoDocs, itemId) {
  return (Array.isArray(photoDocs) ? photoDocs : [])
    .filter((photo) => clean(photo?.itemId) === clean(itemId) && (!photo.status || photo.status === 'active'))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function ensureCopyAction() {
  let button = document.getElementById('copy-item-trip-action');
  if (button) return button;
  const modalContent = document.getElementById('add-modal-content');
  const scrollArea = modalContent?.querySelector('.overflow-y-auto');
  if (!scrollArea) return null;
  const wrapper = document.createElement('div');
  wrapper.id = 'copy-item-trip-action-wrap';
  wrapper.className = 'hidden pt-2 pb-1';
  wrapper.innerHTML = `
    <button id="copy-item-trip-action" type="button" class="w-full py-3 rounded-2xl bg-pastelBlue border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,.18)]">
      <i class="fas fa-copy mr-2"></i>複製到其他旅程
    </button>`;
  scrollArea.appendChild(wrapper);
  return wrapper.querySelector('#copy-item-trip-action');
}

function ensureCopyModal() {
  let modal = document.getElementById('copy-item-trip-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'copy-item-trip-modal';
  modal.className = 'fixed inset-0 z-[110] hidden bg-warmBrown/50 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-sm max-h-[82vh] overflow-hidden bg-white border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,.28)]">
      <div class="px-5 py-4 bg-pastelBlue border-b-4 border-warmBrown flex items-center justify-between gap-3">
        <div class="min-w-0"><h3 class="font-bold text-lg text-warmBrown">複製到其他旅程</h3><p id="copy-item-source-label" class="text-[11px] text-warmBrown/60 font-bold mt-0.5 truncate"></p></div>
        <button id="copy-item-trip-close" type="button" class="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
      </div>
      <div id="copy-item-trip-list" class="p-4 max-h-[62vh] overflow-y-auto space-y-2"></div>
      <div id="copy-item-progress" class="hidden px-4 pb-4 text-xs font-bold text-gray-500"></div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

export async function initItemCopyUi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListItemCopyUiInitialized) return;
  window.__shoppingListItemCopyUiInitialized = true;

  await waitFor(() => (
    document.getElementById('add-modal-content')
    && document.getElementById('item-id')
    && typeof window.openEditModal === 'function'
    && typeof window.openAddModal === 'function'
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
  const { collection, doc, onSnapshot, writeBatch } = firestoreSdk;

  const state = {
    userId: '',
    items: new Map(),
    photoDocs: [],
    itemUnsub: null,
    photoUnsub: null,
    copying: false
  };

  const drivePhotoService = createDrivePhotoService({
    fetchImpl: window.fetch.bind(window),
    sessionStorageImpl: window.sessionStorage,
    getUserId: () => state.userId
  });

  const copyButton = ensureCopyAction();
  const modal = ensureCopyModal();
  const list = document.getElementById('copy-item-trip-list');
  const progress = document.getElementById('copy-item-progress');

  function currentSourceId() {
    return clean(document.getElementById('item-id')?.value);
  }

  function syncCopyAction() {
    const wrapper = document.getElementById('copy-item-trip-action-wrap');
    const sourceId = currentSourceId();
    const visible = Boolean(sourceId && state.items.has(sourceId));
    wrapper?.classList.toggle('hidden', !visible);
  }

  function closeModal() {
    if (state.copying) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function tripSubtitle(trip) {
    if (trip.kind === 'legacy') return '既有清單';
    const start = clean(trip.startDate).replaceAll('-', '/');
    const end = clean(trip.endDate).replaceAll('-', '/');
    return [trip.country, start && end ? `${start} – ${end}` : ''].filter(Boolean).join(' · ');
  }

  function renderTargets(source) {
    list.innerHTML = '';
    document.getElementById('copy-item-source-label').textContent = source?.name || '';
    const targets = sortTripsForPicker((Array.isArray(window.shoppingListTrips) ? window.shoppingListTrips : [])
      .map(normalizeTrip)
      .filter((target) => target.id !== source.tripId && target.kind !== 'legacy'));

    if (!targets.length) {
      const empty = document.createElement('p');
      empty.className = 'py-8 text-center text-sm font-bold text-gray-400';
      empty.textContent = '目前沒有其他可複製的旅程';
      list.appendChild(empty);
      return;
    }

    for (const target of targets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-warmBrown bg-shinBg text-left text-warmBrown';
      button.innerHTML = '<span class="w-9 h-9 shrink-0 rounded-full bg-pastelGreen border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-suitcase"></i></span><span class="flex-1 min-w-0"><span class="copy-target-title block font-bold truncate"></span><span class="copy-target-subtitle block text-[11px] text-gray-500 mt-0.5 truncate"></span></span><i class="fas fa-chevron-right text-xs"></i>';
      button.querySelector('.copy-target-title').textContent = tripDisplayTitle(target);
      button.querySelector('.copy-target-subtitle').textContent = tripSubtitle(target);
      button.addEventListener('click', () => void copyToTrip(source, target, button));
      list.appendChild(button);
    }
  }

  function openModal() {
    const source = state.items.get(currentSourceId());
    if (!source) return notify('找不到商品', '請重新開啟商品後再試。', 'warning');
    renderTargets(source);
    progress.classList.add('hidden');
    progress.textContent = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  async function ensureDriveAccess() {
    if (drivePhotoService.hasAccessToken()) return;
    await window.connectGoogleDrive(true);
    if (!drivePhotoService.hasAccessToken()) throw new DriveAuthorizationError('未取得 Google Drive 授權。');
  }

  async function cleanupUploadedFiles(uploadedDriveFileIds) {
    for (const fileId of uploadedDriveFileIds) {
      try {
        await drivePhotoService.deletePhoto(fileId);
      } catch (cleanupError) {
        console.error('Copied-photo rollback failed:', cleanupError);
        try { drivePhotoService.queueCleanup(fileId); } catch {}
      }
    }
  }

  async function copyToTrip(source, target, button) {
    if (state.copying || !auth.currentUser) return;
    const existing = findExistingCopy([...state.items.values()], source.id, target.id);
    if (existing) {
      const approved = window.confirm?.(`「${source.name || '這個商品'}」已經複製到「${tripDisplayTitle(target)}」。仍要再複製一份嗎？`);
      if (!approved) return;
    }

    state.copying = true;
    button.disabled = true;
    modal.querySelectorAll('button').forEach((node) => { if (node !== document.getElementById('copy-item-trip-close')) node.disabled = true; });
    progress.classList.remove('hidden');
    progress.textContent = '正在建立商品副本…';

    const user = auth.currentUser;
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    const newItemRef = doc(itemsRef);
    const newItemId = newItemRef.id;
    const copiedItem = buildCopiedItemData({ source, targetTrip: target, newItemId, now: Date.now() });
    const sourcePhotos = sourcePhotosForItem(state.photoDocs, source.id);
    const uploadedDriveFileIds = [];

    try {
      const uploadedEntries = [];
      let firstThumbnail = '';

      if (sourcePhotos.length) {
        await ensureDriveAccess();
        for (const [index, photo] of sourcePhotos.entries()) {
          progress.textContent = `正在複製照片 ${index + 1}/${sourcePhotos.length}…`;
          const blob = await drivePhotoService.downloadPhoto(photo.driveFileId);
          if (index === 0) firstThumbnail = await createLightweightThumbnail(blob);
          const driveFile = await drivePhotoService.uploadPhoto({
            itemId: newItemId,
            blob,
            fileName: clean(photo.fileName) || `copied-photo-${index + 1}.jpg`
          });
          uploadedDriveFileIds.push(driveFile.id);
          uploadedEntries.push({ photo, blob, driveFile, order: index });
        }
      }

      const batch = writeBatch(db);
      const uploadedForPersistence = [];
      for (const entry of uploadedEntries) {
        const photoRef = doc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'itemPhotos'));
        uploadedForPersistence.push({
          id: photoRef.id,
          thumbnailDataUrl: entry.order === 0 ? firstThumbnail : ''
        });
        batch.set(photoRef, {
          itemId: newItemId,
          driveFileId: entry.driveFile.id,
          fileName: entry.driveFile.name || entry.photo.fileName || `copied-photo-${entry.order + 1}.jpg`,
          mimeType: entry.photo.mimeType || entry.blob.type || 'image/jpeg',
          width: Number(entry.photo.width || 0),
          height: Number(entry.photo.height || 0),
          size: Number(entry.blob.size || entry.photo.size || 0),
          order: entry.order,
          status: 'active',
          createdAt: Date.now()
        });
      }

      const photoPersistence = resolvePhotoPersistenceForSave({
        existingItem: {},
        existingActivePhotos: [],
        uploadedPhotos: uploadedForPersistence
      });

      batch.set(newItemRef, {
        ...copiedItem,
        photoUrl: photoPersistence.photoUrl,
        photoThumbCoverId: photoPersistence.photoThumbCoverId,
        coverPhotoId: photoPersistence.coverPhotoId
      });

      progress.textContent = '正在儲存副本…';
      await batch.commit();
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      notify('複製完成', `已複製到「${tripDisplayTitle(target)}」。`, 'success');
    } catch (error) {
      console.error('Cross-trip item copy failed:', error);
      await cleanupUploadedFiles(uploadedDriveFileIds);
      if (error instanceof DriveAuthorizationError) {
        notify('需要 Google Drive 授權', '來源商品有照片，請重新連結 Google Drive 後再試。', 'warning');
      } else {
        notify('複製失敗', error?.message || '無法複製商品，來源商品沒有被修改。');
      }
    } finally {
      state.copying = false;
      progress.classList.add('hidden');
      modal.querySelectorAll('button').forEach((node) => { node.disabled = false; });
      syncCopyAction();
    }
  }

  copyButton?.addEventListener('click', openModal);
  document.getElementById('copy-item-trip-close')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });

  const originalOpenEdit = window.openEditModal;
  window.openEditModal = function(id, ...args) {
    const result = originalOpenEdit.call(this, id, ...args);
    queueMicrotask(syncCopyAction);
    return result;
  };

  const originalOpenAdd = window.openAddModal;
  window.openAddModal = function(...args) {
    const result = originalOpenAdd.apply(this, args);
    queueMicrotask(syncCopyAction);
    return result;
  };

  function subscribeUser(user) {
    state.itemUnsub?.();
    state.photoUnsub?.();
    state.itemUnsub = state.photoUnsub = null;
    state.userId = user?.uid || '';
    state.items = new Map();
    state.photoDocs = [];
    syncCopyAction();
    if (!user) return;

    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    const photosRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'itemPhotos');
    state.itemUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
      syncCopyAction();
    }, (error) => console.error('Item copy item listener failed:', error));
    state.photoUnsub = onSnapshot(photosRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.photoDocs = snapshot.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() }));
    }, (error) => console.error('Item copy photo listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  syncCopyAction();
}
