import { normalizeWebsiteUrl, createGoogleMapsUrl } from './url-utils.js';
import { compressImage, revokeCompressedImage } from './image-compression.js';
import { createDrivePhotoService, DriveAuthorizationError } from './drive-photo-service.js';
import { groupActivePhotosByItem } from './photo-metadata.js';
import { createLightweightThumbnail } from '../photos/photo-thumbnail-persistence.js';
import { resolvePhotoPersistenceForSave } from '../photos/photo-visibility-state.js';
import { resolveItemLocations } from '../pricing/location-selection.js';
import {
  captureRegisteredItemSaveExtensions,
  createItemSaveOperation,
  createItemSaveResult,
  isItemSaveOperationCurrent
} from './item-save-operation.js';

const APP_ID = 'japan-shopping-app';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

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
        reject(new Error('等待頁面初始化逾時。'));
      }
    }, 40);
  });
}

function showMessage(title, message, type = 'error') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeFileName(name, mimeType) {
  const stem = String(name || 'photo').replace(/\.[^.]+$/, '').replace(/[^\w\-\u4e00-\u9fff]+/g, '-').slice(0, 80) || 'photo';
  return `${stem}.${mimeType === 'image/webp' ? 'webp' : 'jpg'}`;
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

export async function initShoppingListEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  await waitFor(() => document.getElementById('item-status') && typeof window.openAddModal === 'function' && typeof window.saveItem === 'function');

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);

  const {
    collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc, writeBatch
  } = firestoreSdk;

  const state = {
    userId: auth.currentUser?.uid || null,
    items: new Map(),
    photoDocs: [],
    photosByItem: new Map(),
    pendingPhotos: [],
    removedPhotoIds: new Set(),
    currentEditingId: '',
    itemUnsub: null,
    photoUnsub: null,
    driveObjectUrls: new Map(),
    pendingDeleteId: '',
    modalGeneration: 0
  };

  const drivePhotoService = createDrivePhotoService({
    fetchImpl: window.fetch.bind(window),
    sessionStorageImpl: window.sessionStorage,
    getUserId: () => state.userId
  });
  let driveConnectPromise = null;
  let activeSaveOperation = null;
  let activeSaveButton = null;
  let activeSaveButtonLabel = '';
  const capturingSaveOperation = Symbol('capturing-save-operation');

  function revokeDriveUrls() {
    for (const url of state.driveObjectUrls.values()) URL.revokeObjectURL(url);
    state.driveObjectUrls.clear();
  }

  function resetPendingPhotos() {
    state.pendingPhotos.forEach(revokeCompressedImage);
    state.pendingPhotos = [];
    state.removedPhotoIds.clear();
    renderPhotoGrid();
  }

  function ensureFormFields() {
    const statusBlock = document.getElementById('item-status')?.closest('div.flex.items-center.justify-between');
    if (!statusBlock) return;

    if (!document.getElementById('item-website')) {
      const website = document.createElement('div');
      website.innerHTML = `
        <label class="block text-sm font-bold text-warmBrown mb-2 ml-1">網站</label>
        <input type="url" id="item-website" inputmode="url" autocomplete="url" class="w-full bg-shinBg border-2 border-warmBrown rounded-2xl px-5 py-3 focus:outline-none focus:bg-white focus:border-4 focus:shadow-[4px_4px_0_rgba(92,64,51,0.2)] transition-all font-medium text-warmBrown placeholder-gray-300" placeholder="YouTube、Instagram、TikTok、部落格或介紹頁網址">
        <p class="text-[11px] text-gray-400 mt-1 ml-1">沒寫 https:// 會自動補上；只儲存連結，不下載影片。</p>`;
      statusBlock.parentElement.insertBefore(website, statusBlock);
    }

    if (!document.getElementById('item-address')) {
      const locationSelect = document.getElementById('item-location');
      const row = locationSelect?.closest('.flex.space-x-4');
      if (row) {
        const address = document.createElement('div');
        address.innerHTML = `
          <label class="block text-sm font-bold text-warmBrown mb-2 ml-1">地址</label>
          <div class="flex gap-2">
            <input type="text" id="item-address" class="flex-1 min-w-0 bg-shinBg border-2 border-warmBrown rounded-2xl px-5 py-3 focus:outline-none focus:bg-white focus:border-4 transition-all font-medium text-warmBrown placeholder-gray-300" placeholder="完整地址（選填）">
            <button id="open-address-btn" type="button" aria-label="在 Google 地圖開啟地址" class="w-12 shrink-0 rounded-2xl bg-pastelBlue border-2 border-warmBrown text-warmBrown shadow-[2px_2px_0_rgba(92,64,51,0.2)]"><i class="fas fa-map-location-dot"></i></button>
          </div>`;
        row.insertAdjacentElement('afterend', address);
        address.querySelector('#open-address-btn').addEventListener('click', () => {
          const url = createGoogleMapsUrl(document.getElementById('item-address').value);
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        });
      }
    }
  }

  function ensurePhotoUi() {
    const input = document.getElementById('item-photo');
    if (!input) return;
    input.multiple = true;
    input.onchange = null;

    const label = input.closest('label');
    if (label) {
      const placeholder = document.getElementById('photo-placeholder');
      if (placeholder) placeholder.innerHTML = '<i class="fas fa-camera text-3xl mb-2 text-pastelBlue drop-shadow-[1px_1px_0_rgba(92,64,51,0.5)]"></i><span class="text-sm font-bold">新增照片</span>';
      const oldPreview = document.getElementById('photo-preview');
      if (oldPreview) oldPreview.classList.add('hidden');
    }

    if (!document.getElementById('drive-connect-btn')) {
      const wrapper = label?.parentElement;
      if (wrapper) {
        const controls = document.createElement('div');
        controls.className = 'w-full mt-3';
        controls.innerHTML = `
          <div id="photo-preview-grid" class="grid grid-cols-3 gap-2"></div>
          <div class="flex items-center justify-between gap-2 mt-3">
            <span id="photo-upload-status" class="text-[11px] text-gray-400 font-medium"></span>
            <button id="drive-connect-btn" type="button" class="px-3 py-1.5 rounded-full bg-pastelBlue border-2 border-warmBrown text-xs font-bold text-warmBrown">連結 Google Drive</button>
          </div>`;
        wrapper.insertAdjacentElement('afterend', controls);
        controls.querySelector('#drive-connect-btn').addEventListener('click', () => connectGoogleDrive(true));
      }
    }
  }

  async function connectGoogleDrive(interactive = true) {
    if (driveConnectPromise) return driveConnectPromise;
    const button = document.getElementById('drive-connect-btn');
    if (button) button.disabled = true;

    driveConnectPromise = (async () => {
      const user = auth.currentUser;
      if (!user) throw new Error('請先登入 Google 帳號。');
      const provider = new authSdk.GoogleAuthProvider();
      provider.addScope(DRIVE_SCOPE);
      provider.setCustomParameters({ prompt: interactive ? 'consent' : 'select_account' });
      const result = await authSdk.reauthenticateWithPopup(user, provider);
      const credential = authSdk.GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || '';
      if (!token) throw new DriveAuthorizationError('未取得 Google Drive 授權。');
      drivePhotoService.setAccessToken(token);
      document.getElementById('drive-connect-btn')?.classList.add('hidden');
      try { await drivePhotoService.retryQueuedCleanup(); } catch {}
      return token;
    })();

    try {
      return await driveConnectPromise;
    } finally {
      driveConnectPromise = null;
      if (button) button.disabled = false;
    }
  }

  async function ensureDriveAccess() {
    if (drivePhotoService.hasAccessToken()) return;
    document.getElementById('drive-connect-btn')?.classList.remove('hidden');
    throw new DriveAuthorizationError('需要重新連結 Google Drive。');
  }

  function activePhotosForItem(itemId) {
    return state.photosByItem.get(itemId) || [];
  }

  async function getDriveObjectUrl(fileId) {
    if (state.driveObjectUrls.has(fileId)) return state.driveObjectUrls.get(fileId);
    try {
      const blob = await drivePhotoService.downloadPhoto(fileId);
      const url = URL.createObjectURL(blob);
      state.driveObjectUrls.set(fileId, url);
      return url;
    } catch (error) {
      if (error instanceof DriveAuthorizationError) {
        document.getElementById('drive-connect-btn')?.classList.remove('hidden');
      }
      throw error;
    }
  }

  async function renderPhotoGrid() {
    const grid = document.getElementById('photo-preview-grid');
    if (!grid) return;
    const existing = state.currentEditingId ? activePhotosForItem(state.currentEditingId).filter((p) => !state.removedPhotoIds.has(p.id)) : [];
    grid.innerHTML = '';

    for (const [index, photo] of existing.entries()) {
      const card = document.createElement('div');
      card.className = 'relative aspect-square rounded-xl overflow-hidden border-2 border-warmBrown bg-shinBg';
      card.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-gray-300"><i class="fas fa-image"></i></div><button type="button" class="absolute top-1 right-1 z-10 w-7 h-7 rounded-full bg-white border border-warmBrown text-warmBrown" aria-label="移除照片"><i class="fas fa-times text-xs"></i></button>${index === 0 ? '<span class="absolute left-1 bottom-1 z-10 text-[9px] bg-pastelYellow border border-warmBrown rounded-full px-1.5 font-bold">封面</span>' : ''}`;
      card.querySelector('button').addEventListener('click', () => {
        state.removedPhotoIds.add(photo.id);
        renderPhotoGrid();
      });
      grid.appendChild(card);
      if (drivePhotoService.hasAccessToken()) {
        getDriveObjectUrl(photo.driveFileId).then((url) => {
          if (!card.isConnected) return;
          const img = document.createElement('img');
          img.src = url;
          img.className = 'absolute inset-0 w-full h-full object-cover';
          card.prepend(img);
        }).catch(() => {});
      }
    }

    state.pendingPhotos.forEach((photo, index) => {
      const card = document.createElement('div');
      card.className = 'relative aspect-square rounded-xl overflow-hidden border-2 border-warmBrown bg-shinBg';
      if (photo.error) {
        card.innerHTML = `<div class="absolute inset-0 p-2 flex items-center justify-center text-center text-[10px] text-red-500 font-bold">${escapeHtml(photo.error)}</div>`;
      } else {
        card.innerHTML = `<img src="${photo.previewUrl}" class="absolute inset-0 w-full h-full object-cover"><button type="button" class="absolute top-1 right-1 z-10 w-7 h-7 rounded-full bg-white border border-warmBrown text-warmBrown" aria-label="移除待上傳照片"><i class="fas fa-times text-xs"></i></button>${existing.length === 0 && index === 0 ? '<span class="absolute left-1 bottom-1 z-10 text-[9px] bg-pastelYellow border border-warmBrown rounded-full px-1.5 font-bold">封面</span>' : ''}`;
        card.querySelector('button').addEventListener('click', () => {
          const [removed] = state.pendingPhotos.splice(index, 1);
          revokeCompressedImage(removed);
          renderPhotoGrid();
        });
      }
      grid.appendChild(card);
    });
  }

  async function handlePhotoSelection(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    const status = document.getElementById('photo-upload-status');
    if (status) status.textContent = `正在壓縮 ${files.length} 張照片…`;
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        state.pendingPhotos.push({ ...compressed, originalName: file.name, clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}` });
      } catch (error) {
        state.pendingPhotos.push({ error: error.message || '照片處理失敗', originalName: file.name });
      }
      renderPhotoGrid();
    }
    if (status) status.textContent = `${state.pendingPhotos.filter((p) => !p.error).length} 張新照片準備上傳`;
  }

  function getCardItemId(card) {
    const clickable = card.querySelector('[onclick*="openEditModal"]');
    const source = clickable?.getAttribute('onclick') || '';
    const match = source.match(/openEditModal\(['"]([^'"]+)['"]\)/);
    return match?.[1] || '';
  }

  async function enhanceCards() {
    const list = document.getElementById('item-list');
    if (!list) return;
    for (const card of [...list.children]) {
      if (card.id) continue;
      const itemId = getCardItemId(card);
      if (!itemId) continue;
      card.dataset.enhancedItemId = itemId;
      const item = state.items.get(itemId);
      if (!item) continue;

      let actions = card.querySelector('.enhanced-item-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'enhanced-item-actions flex flex-wrap gap-1.5 mt-1.5';
        const description = card.querySelector('p');
        description?.insertAdjacentElement('afterend', actions);
      }
      actions.innerHTML = '';

      if (item.website) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'text-[10px] font-bold bg-pastelGreen text-warmBrown px-2.5 py-1 rounded-full border border-warmBrown hover:brightness-95';
        link.innerHTML = '<i class="fas fa-up-right-from-square mr-1"></i>觀看介紹';
        link.addEventListener('click', (event) => {
          event.stopPropagation();
          try {
            const url = normalizeWebsiteUrl(item.website);
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
          } catch { showMessage('網址錯誤', '這個商品的介紹網址格式不正確。', 'warning'); }
        });
        actions.appendChild(link);
      }

      for (const location of resolveItemLocations(item)) {
        const locationMap = document.createElement('button');
        locationMap.type = 'button';
        locationMap.className = 'text-[10px] font-bold bg-pastelYellow text-warmBrown px-2.5 py-1 rounded-full border border-warmBrown hover:brightness-95';
        locationMap.setAttribute('aria-label', `在 Google 地圖搜尋${location}附近分店`);
        const icon = document.createElement('i');
        icon.className = 'fas fa-location-dot mr-1';
        locationMap.append(icon, document.createTextNode(location));
        locationMap.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const url = createGoogleMapsUrl(location);
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        });
        actions.appendChild(locationMap);
      }

      if (item.address) {
        const map = document.createElement('button');
        map.type = 'button';
        map.className = 'text-[10px] font-bold bg-pastelBlue text-warmBrown px-2.5 py-1 rounded-full border border-warmBrown';
        map.innerHTML = '<i class="fas fa-map-location-dot mr-1"></i>地址';
        map.addEventListener('click', (event) => {
          event.stopPropagation();
          const url = createGoogleMapsUrl(item.address);
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        });
        actions.appendChild(map);
      }

      const cover = activePhotosForItem(itemId)[0];
      if (cover && drivePhotoService.hasAccessToken()) {
        getDriveObjectUrl(cover.driveFileId).then((url) => {
          if (!card.isConnected) return;
          const box = card.firstElementChild;
          if (!box) return;
          let img = box.querySelector('img');
          if (!img) {
            box.innerHTML = '';
            img = document.createElement('img');
            img.className = 'w-full h-full object-cover';
            img.alt = 'item photo';
            box.appendChild(img);
          }
          img.src = url;
        }).catch(() => {});
      }
    }
  }

  function subscribeUserData(user) {
    state.itemUnsub?.();
    state.photoUnsub?.();
    state.itemUnsub = state.photoUnsub = null;
    state.items.clear();
    state.photoDocs = [];
    state.photosByItem = new Map();
    revokeDriveUrls();

    if (!user) {
      state.userId = null;
      return;
    }
    state.userId = user.uid;
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    const photosRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'itemPhotos');
    state.itemUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
      queueMicrotask(enhanceCards);
    });
    state.photoUnsub = onSnapshot(photosRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.photoDocs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.photosByItem = groupActivePhotosByItem(state.photoDocs);
      renderPhotoGrid();
      queueMicrotask(enhanceCards);
    });
  }

  ensureFormFields();
  ensurePhotoUi();
  document.getElementById('item-photo')?.addEventListener('change', handlePhotoSelection);

  function releaseActiveSaveClaim(expectedOwner) {
    if (activeSaveOperation !== expectedOwner) return;
    activeSaveOperation = null;
    if (activeSaveButton) {
      activeSaveButton.disabled = false;
      activeSaveButton.textContent = activeSaveButtonLabel;
    }
    activeSaveButton = null;
    activeSaveButtonLabel = '';
  }

  window.beginShoppingListSaveOperation = function() {
    if (activeSaveOperation) return null;

    const saveButton = document.getElementById('save-item-btn');
    activeSaveOperation = capturingSaveOperation;
    activeSaveButton = saveButton;
    activeSaveButtonLabel = saveButton?.textContent || '';
    if (saveButton) saveButton.disabled = true;

    try {
      const fields = {};
      document.querySelectorAll('#add-modal input, #add-modal select, #add-modal textarea').forEach((field) => {
        if (!field.id) return;
        fields[field.id] = field.type === 'checkbox' ? Boolean(field.checked) : field.value;
      });

      const userId = String(auth.currentUser?.uid || '');
      const existingItemId = String(fields['item-id'] || '').trim();
      const itemId = existingItemId || (userId
        ? doc(collection(db, 'artifacts', APP_ID, 'users', userId, 'items')).id
        : (window.crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`));
      const operation = createItemSaveOperation({
        operationId: window.crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        userId,
        itemId,
        isNew: !existingItemId,
        modalGeneration: state.modalGeneration,
        fields,
        pendingPhotos: state.pendingPhotos,
        removedPhotoIds: state.removedPhotoIds,
        extensions: captureRegisteredItemSaveExtensions()
      });
      activeSaveOperation = operation;
      return operation;
    } catch (error) {
      releaseActiveSaveClaim(capturingSaveOperation);
      throw error;
    }
  };

  window.releaseShoppingListSaveOperation = function(operation) {
    releaseActiveSaveClaim(operation);
  };

  const originalOpenAdd = window.openAddModal;
  window.openAddModal = function(...args) {
    state.modalGeneration += 1;
    state.currentEditingId = '';
    resetPendingPhotos();
    const result = originalOpenAdd.apply(this, args);
    ensureFormFields();
    ensurePhotoUi();
    document.getElementById('item-website').value = '';
    document.getElementById('item-address').value = '';
    renderPhotoGrid();
    return result;
  };

  const originalOpenEdit = window.openEditModal;
  window.openEditModal = function(id, ...args) {
    state.modalGeneration += 1;
    state.currentEditingId = id;
    resetPendingPhotos();
    state.currentEditingId = id;
    const result = originalOpenEdit.call(this, id, ...args);
    ensureFormFields();
    ensurePhotoUi();
    const item = state.items.get(id);
    document.getElementById('item-website').value = item?.website || '';
    document.getElementById('item-address').value = item?.address || '';
    renderPhotoGrid();
    return result;
  };

  const originalClose = window.closeAddModal;
  window.closeAddModal = function(...args) {
    state.modalGeneration += 1;
    resetPendingPhotos();
    state.currentEditingId = '';
    return originalClose.apply(this, args);
  };

  window.saveItem = async function(existingOperation) {
    const operation = existingOperation?.operationId
      ? existingOperation
      : window.beginShoppingListSaveOperation();
    if (!operation) return null;

    const currentOperationState = () => ({
      userId: String(auth.currentUser?.uid || ''),
      modalGeneration: state.modalGeneration
    });
    const publishResult = (succeeded, reason = '') => {
      const result = createItemSaveResult(operation, succeeded, reason);
      window.shoppingListLastItemSave = result;
      return result;
    };

    try {
      if (!operation.userId) return publishResult(false, 'authentication-required');

      const name = String(operation.fields['item-name'] || '').trim();
      if (!name) {
        showMessage('缺少名稱', '請填寫商品名稱唷！', 'warning');
        return publishResult(false, 'item-name-required');
      }

      let website = '';
      try {
        website = normalizeWebsiteUrl(operation.fields['item-website']);
      } catch (error) {
        showMessage('網址格式錯誤', error.message, 'warning');
        return publishResult(false, error.message);
      }

      const failedPending = operation.pendingPhotos.filter((photo) => photo.error);
      if (failedPending.length) {
        showMessage('照片尚未完成', '請先移除處理失敗的照片再儲存。', 'warning');
        return publishResult(false, 'pending-photo-error');
      }

      const itemRef = doc(db, 'artifacts', APP_ID, 'users', operation.userId, 'items', operation.itemId);
      const existingSnapshot = await getDoc(itemRef);
      const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
      const pending = operation.pendingPhotos.filter((photo) => !photo.error);
      const removedPhotoIds = new Set(operation.removedPhotoIds);

      if (pending.length || operation.removedPhotoIds.length) await ensureDriveAccess();
      if (pending.length && isItemSaveOperationCurrent(operation, currentOperationState())) {
        document.getElementById('photo-upload-status').textContent = `正在上傳 0/${pending.length}…`;
      }

      let completed = 0;
      const uploaded = await mapWithConcurrency(pending, 2, async (photo, index) => {
        const fileName = safeFileName(photo.originalName, photo.mimeType);
        const driveFile = await drivePhotoService.uploadPhoto({
          blob: photo.blob,
          fileName,
          itemId: operation.itemId
        });
        completed += 1;
        if (isItemSaveOperationCurrent(operation, currentOperationState())) {
          document.getElementById('photo-upload-status').textContent = `正在上傳 ${completed}/${pending.length}…`;
        }
        return {
          photo,
          driveFile,
          order: activePhotosForItem(operation.itemId).filter((entry) => !removedPhotoIds.has(entry.id)).length + index
        };
      });

      const batch = writeBatch(db);
      const existingActive = activePhotosForItem(operation.itemId).filter((photo) => !removedPhotoIds.has(photo.id));
      const newPhotoIds = [];
      for (const entry of uploaded) {
        const photoRef = doc(collection(db, 'artifacts', APP_ID, 'users', operation.userId, 'itemPhotos'));
        newPhotoIds.push(photoRef.id);
        batch.set(photoRef, {
          itemId: operation.itemId,
          driveFileId: entry.driveFile.id,
          fileName: entry.driveFile.name || safeFileName(entry.photo.originalName, entry.photo.mimeType),
          mimeType: entry.photo.mimeType,
          width: entry.photo.width,
          height: entry.photo.height,
          size: entry.photo.size,
          order: entry.order,
          status: 'active',
          createdAt: Date.now()
        });
      }

      const uploadedForPersistence = newPhotoIds.map((photoId) => ({ id: photoId, thumbnailDataUrl: '' }));
      if (!existingActive.length && uploaded[0] && uploadedForPersistence[0]) {
        uploadedForPersistence[0].thumbnailDataUrl = await createLightweightThumbnail(uploaded[0].photo.blob);
      }
      const photoPersistence = resolvePhotoPersistenceForSave({
        existingItem: existing || {},
        existingActivePhotos: existingActive,
        uploadedPhotos: uploadedForPersistence
      });

      for (const photoId of operation.removedPhotoIds) {
        const photoRef = doc(db, 'artifacts', APP_ID, 'users', operation.userId, 'itemPhotos', photoId);
        batch.update(photoRef, { status: 'deleting' });
      }

      const itemData = {
        name,
        category: String(operation.fields['item-category'] || ''),
        location: String(operation.fields['item-location'] || ''),
        address: String(operation.fields['item-address'] || '').trim(),
        website,
        description: String(operation.fields['item-desc'] || '').trim(),
        purchased: Boolean(operation.fields['item-status']),
        photoUrl: photoPersistence.photoUrl,
        photoThumbCoverId: photoPersistence.photoThumbCoverId,
        coverPhotoId: photoPersistence.coverPhotoId,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      batch.set(itemRef, itemData, { merge: true });
      if (auth.currentUser?.uid !== operation.userId) throw new Error('item-save-operation-stale');
      await batch.commit();

      for (const photoId of operation.removedPhotoIds) {
        const photo = state.photoDocs.find((entry) => entry.id === photoId);
        if (!photo) continue;
        try {
          await drivePhotoService.deletePhoto(photo.driveFileId);
          await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', operation.userId, 'itemPhotos', photoId));
        } catch (error) {
          if (!(error instanceof DriveAuthorizationError)) drivePhotoService.queueCleanup(photo.driveFileId);
        }
      }

      const result = publishResult(true);
      if (isItemSaveOperationCurrent(operation, currentOperationState())) {
        const uploadStatus = document.getElementById('photo-upload-status');
        if (uploadStatus) uploadStatus.textContent = '';
        window.closeAddModal();
      }
      return result;
    } catch (error) {
      console.error('Enhanced save failed:', error);
      if (isItemSaveOperationCurrent(operation, currentOperationState())) {
        if (error instanceof DriveAuthorizationError) {
          document.getElementById('drive-connect-btn')?.classList.remove('hidden');
          showMessage('需要 Google Drive 授權', '請先按「連結 Google Drive」後再重試。', 'warning');
        } else {
          showMessage('儲存失敗', error.message || '無法儲存商品資料。');
        }
      }
      return publishResult(false, error.message);
    } finally {
      window.releaseShoppingListSaveOperation(operation);
    }
  };

  const originalAskDelete = window.askDelete;
  window.askDelete = function(id, ...args) {
    state.pendingDeleteId = id;
    return originalAskDelete.call(this, id, ...args);
  };

  const confirmDelete = document.getElementById('confirm-delete-btn');
  confirmDelete?.addEventListener('click', async (event) => {
    if (!state.pendingDeleteId || !auth.currentUser) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const itemId = state.pendingDeleteId;
    const photos = activePhotosForItem(itemId);
    try {
      if (photos.length) await ensureDriveAccess();
      for (const photo of photos) {
        await drivePhotoService.deletePhoto(photo.driveFileId);
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'itemPhotos', photo.id));
      }
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', auth.currentUser.uid, 'items', itemId));
      state.pendingDeleteId = '';
      window.closeDeleteModal?.();
    } catch (error) {
      console.error('Enhanced delete failed:', error);
      showMessage('刪除失敗', error instanceof DriveAuthorizationError ? '請重新連結 Google Drive 後再刪除。' : (error.message || '無法刪除商品。'));
    }
  }, true);

  const listObserver = new MutationObserver(() => queueMicrotask(enhanceCards));
  const itemList = document.getElementById('item-list');
  if (itemList) listObserver.observe(itemList, { childList: true, subtree: false });

  authSdk.onAuthStateChanged(auth, (user) => {
    if (state.userId && state.userId !== user?.uid) {
      try { drivePhotoService.clearAccessToken(); } catch {}
    }
    subscribeUserData(user);
    if (!user) resetPendingPhotos();
  });

  window.connectGoogleDrive = connectGoogleDrive;
  window.openWebsite = (value) => {
    const url = normalizeWebsiteUrl(value);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };
  window.openAddressInMaps = (value) => {
    const url = createGoogleMapsUrl(value);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  enhanceCards();
}
