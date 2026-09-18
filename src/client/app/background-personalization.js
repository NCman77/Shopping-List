import { createDrivePhotoService, DriveAuthorizationError } from '../photos/drive-photo-service.js';
import { normalizePersonalization, positionPreset, buildPanStyle } from './personalization-preferences.js';
import { createSessionOperationTracker } from './session-operation.js';
import {
  createBackgroundSlideshowController,
  runBackgroundPlaylistDownload,
  runBackgroundPlaylistSaveTransaction
} from './background-playlist.js';

export { runBackgroundPlaylistSaveTransaction };

const APP_ID = 'japan-shopping-app';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm'
]);
const MAX_BACKGROUND_BYTES = 100 * 1024 * 1024;

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
        reject(new Error('等待背景個人化初始化逾時。'));
      }
    }, 40);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function backgroundKindForMime(mimeType) {
  return String(mimeType || '').toLowerCase().startsWith('video/') ? 'video' : 'image';
}

export function backgroundLoadKey(userId, preferences = {}) {
  const normalized = normalizePersonalization(preferences);
  return `${String(userId || '').trim()}:${normalized.backgroundFiles.map((file) => file.fileId).join(',')}`;
}

export function isSupportedBackgroundFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (ACCEPTED_MIME_TYPES.has(type)) return true;
  const name = String(file.name || '').toLowerCase();
  return /\.(jpe?g|png|webp|gif|mp4|webm)$/.test(name);
}

async function cleanupCapturedDriveFile(driveService, fileId) {
  if (!fileId) return;
  try {
    await driveService.deletePhoto(fileId);
  } catch {
    try { await driveService.queueCleanup(fileId); } catch {}
  }
}

export async function runBackgroundDownload({
  tracker,
  userId,
  preferences,
  driveService,
  createObjectUrl,
  revokeObjectUrl,
  clearBackground,
  hideBackground,
  applyBackground,
  onError = () => {}
}) {
  const operation = tracker.nextRequest('background-load', userId);
  const capturedPreferences = normalizePersonalization(preferences);
  const fileId = capturedPreferences.backgroundFileId;
  if (!operation.userId || !fileId) {
    if (tracker.isLatestRequest(operation, userId)) clearBackground();
    return Object.freeze({ status: 'empty', operation });
  }
  if (!driveService.hasAccessToken()) {
    if (tracker.isLatestRequest(operation, userId)) hideBackground();
    return Object.freeze({ status: 'authorization-required', operation });
  }
  try {
    const blob = await driveService.downloadPhoto(fileId);
    const objectUrl = createObjectUrl(blob);
    if (!tracker.isLatestRequest(operation, userId)) {
      revokeObjectUrl(objectUrl);
      return Object.freeze({ status: 'stale', operation });
    }
    applyBackground(objectUrl, capturedPreferences);
    return Object.freeze({ status: 'applied', operation, objectUrl });
  } catch (error) {
    if (!tracker.isLatestRequest(operation, userId)) {
      return Object.freeze({ status: 'stale', operation });
    }
    onError(error);
    hideBackground();
    return Object.freeze({ status: 'error', operation, error });
  }
}

export async function runBackgroundSaveTransaction({
  tracker,
  operation,
  getCurrentUserId,
  capturedSettingsRef,
  editorPreferences,
  pendingFile,
  removeRequested,
  oldFileId,
  uploadKind = 'background',
  driveService,
  connectDrive,
  persistSettings,
  afterCommit,
  onError = () => {}
}) {
  let uploadedFileId = '';
  let persistenceCommitted = false;
  let nextPreferences = normalizePersonalization(editorPreferences);
  const isCurrent = () => tracker.isSessionCurrent(operation, getCurrentUserId());
  const staleResult = async () => {
    if (uploadedFileId && !persistenceCommitted) {
      await cleanupCapturedDriveFile(driveService, uploadedFileId);
    }
    return Object.freeze({ status: 'stale', persistenceCommitted, nextPreferences });
  };

  try {
    if (pendingFile) {
      if (!driveService.hasAccessToken()) await connectDrive(operation, driveService);
      if (!isCurrent()) return staleResult();
      const uploaded = await driveService.uploadFile({
        blob: pendingFile,
        fileName: pendingFile.name || `background-${Date.now()}`,
        appProperties: { kind: uploadKind, owner: operation.userId }
      });
      uploadedFileId = uploaded.id;
      if (!isCurrent()) return staleResult();
      nextPreferences = normalizePersonalization({
        ...nextPreferences,
        backgroundFileId: uploaded.id,
        backgroundFileName: uploaded.name || pendingFile.name,
        backgroundMimeType: uploaded.mimeType || pendingFile.type
      });
    } else if (removeRequested) {
      nextPreferences = normalizePersonalization({
        ...nextPreferences,
        backgroundFileId: '',
        backgroundFileName: '',
        backgroundMimeType: ''
      });
    }

    if (!isCurrent()) return staleResult();
    await persistSettings(capturedSettingsRef, nextPreferences);
    persistenceCommitted = true;

    if (oldFileId && oldFileId !== nextPreferences.backgroundFileId) {
      await cleanupCapturedDriveFile(driveService, oldFileId);
    }

    if (!isCurrent()) return staleResult();
    await afterCommit(nextPreferences);
    return Object.freeze({ status: 'saved', persistenceCommitted, nextPreferences });
  } catch (error) {
    if (uploadedFileId && !persistenceCommitted) {
      await cleanupCapturedDriveFile(driveService, uploadedFileId);
    }
    if (isCurrent()) onError(error);
    return Object.freeze({ status: 'error', persistenceCommitted, nextPreferences, error });
  }
}

export function resetBackgroundSessionUi({ tracker, userId, closeEditor, hideBackground, saveButton }) {
  tracker.advance(userId);
  closeEditor();
  saveButton.disabled = false;
  hideBackground();
  return tracker.capture(userId);
}

function installStyles() {
  if (document.getElementById('background-personalization-styles')) return;
  const style = document.createElement('style');
  style.id = 'background-personalization-styles';
  style.textContent = `
    #shopping-background-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      pointer-events: none;
      background: #FAFAFA;
    }
    #shopping-background-layer.hidden { display: none; }
    #shopping-background-layer .shopping-background-pan-wrap {
      position: absolute;
      inset: -6%;
      overflow: hidden;
      animation-duration: 14s;
      animation-timing-function: ease-in-out;
      animation-fill-mode: both;
      animation-direction: alternate;
    }
    #shopping-background-layer .shopping-background-media {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      will-change: transform;
    }
    @keyframes shopping-bg-pan-left {
      from { transform: translateX(3%); }
      to { transform: translateX(-3%); }
    }
    @keyframes shopping-bg-pan-right {
      from { transform: translateX(-3%); }
      to { transform: translateX(3%); }
    }
    #background-preview-viewport {
      touch-action: none;
      cursor: grab;
      user-select: none;
    }
    #background-preview-viewport.dragging { cursor: grabbing; }
    #background-preview-media {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
      will-change: transform;
    }
  `;
  document.head.appendChild(style);
}

function ensureLayer(shell) {
  let layer = document.getElementById('shopping-background-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'shopping-background-layer';
    layer.className = 'hidden';
    layer.innerHTML = '<div class="shopping-background-pan-wrap"></div>';
    shell.prepend(layer);
  }
  const main = shell.querySelector(':scope > main');
  if (main) {
    main.style.position = 'relative';
    main.style.zIndex = '1';
    main.style.backgroundColor = 'transparent';
  }
  return layer;
}

function ensureEditor() {
  if (document.getElementById('background-personalization-modal')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="background-personalization-modal" class="fixed inset-0 z-[100] hidden bg-warmBrown/50 backdrop-blur-sm px-3 items-center justify-center">
      <div class="w-full max-w-md max-h-[92vh] overflow-hidden bg-shinBg border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,0.28)] flex flex-col">
        <div class="bg-pastelBlue border-b-4 border-warmBrown px-5 py-4 flex items-center justify-between shrink-0">
          <div><h2 class="text-xl font-bold text-warmBrown">個人化背景</h2><p class="text-[11px] text-warmBrown/60 font-bold mt-1">圖片、GIF、MP4、WebM</p></div>
          <button id="close-background-personalization" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
        </div>
        <div class="overflow-y-auto p-4 space-y-5 bg-white">
          <div id="background-preview-viewport" class="relative w-full aspect-[4/5] max-h-[48vh] overflow-hidden rounded-[1.5rem] bg-shinBg border-2 border-warmBrown shadow-inner">
            <div id="background-preview-empty" class="absolute inset-0 flex flex-col items-center justify-center text-warmBrown/45 text-center px-6">
              <i class="fas fa-image text-4xl mb-3"></i><span class="text-sm font-bold">選擇背景後可拖曳調整位置</span>
            </div>
          </div>

          <div id="background-drive-note" class="hidden rounded-xl bg-pastelYellow/60 border-2 border-warmBrown px-3 py-2 text-xs font-bold text-warmBrown">
            背景仍儲存在 Google Drive，需要重新連結才能預覽。
            <button id="background-drive-connect" type="button" class="ml-1 underline">重新連結</button>
          </div>

          <div class="flex gap-2">
            <label class="flex-1 text-center px-3 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold cursor-pointer">
              <i class="fas fa-upload mr-1"></i>選擇背景
              <input id="background-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" class="hidden">
            </label>
            <button id="background-remove" type="button" class="px-3 py-2.5 rounded-xl bg-pastelPink border-2 border-warmBrown text-warmBrown font-bold">移除</button>
          </div>
          <p id="background-file-name" class="text-[11px] text-gray-400 font-bold truncate"></p>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label for="background-rotation-interval" class="text-sm font-bold text-warmBrown">照片輪播間隔</label>
              <span class="text-[11px] text-gray-400 font-bold">2–60 秒</span>
            </div>
            <div class="flex items-center gap-2">
              <input id="background-rotation-interval" type="number" min="2" max="60" step="1" value="8" class="w-24 px-3 py-2 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold outline-none">
              <span class="text-sm font-bold text-warmBrown">秒</span>
            </div>
          </div>

          <div>
            <div class="flex justify-between items-center mb-2"><label for="background-scale" class="text-sm font-bold text-warmBrown">縮放</label><span id="background-scale-value" class="text-xs font-bold text-gray-500">100%</span></div>
            <input id="background-scale" type="range" min="1" max="3" step="0.05" value="1" class="w-full accent-[#5C4033]">
          </div>

          <div>
            <p class="text-sm font-bold text-warmBrown mb-2">快速位置</p>
            <div class="grid grid-cols-5 gap-1.5">
              <button type="button" data-position-preset="left" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠左</button>
              <button type="button" data-position-preset="right" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠右</button>
              <button type="button" data-position-preset="center" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-pastelYellow">置中</button>
              <button type="button" data-position-preset="top" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠上</button>
              <button type="button" data-position-preset="bottom" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠下</button>
            </div>
          </div>

          <div class="rounded-2xl bg-shinBg border-2 border-warmBrown p-3 space-y-3">
            <label class="flex items-center justify-between gap-3 text-sm font-bold text-warmBrown">
              <span>連播</span><input id="background-pan-enabled" type="checkbox" class="w-5 h-5 accent-[#5C4033]">
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="text-xs font-bold text-warmBrown">方向
                <select id="background-pan-direction" class="mt-1 w-full px-3 py-2 rounded-xl bg-white border-2 border-warmBrown">
                  <option value="left">往左連播</option><option value="right">往右連播</option>
                </select>
              </label>
              <label class="text-xs font-bold text-warmBrown">次數
                <select id="background-pan-iteration" class="mt-1 w-full px-3 py-2 rounded-xl bg-white border-2 border-warmBrown">
                  <option value="once">1 次</option><option value="infinite">無限</option>
                </select>
              </label>
            </div>
          </div>
        </div>
        <div class="p-4 border-t-2 border-warmBrown/20 bg-shinBg flex gap-3 shrink-0">
          <button id="cancel-background-personalization" type="button" class="flex-1 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold">取消</button>
          <button id="save-background-personalization" type="button" class="flex-1 py-2.5 rounded-xl bg-pastelYellow border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,0.18)]">儲存</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper.firstElementChild);
}

function createMediaElement(kind, url, preferences, id = '') {
  const media = document.createElement(kind === 'video' ? 'video' : 'img');
  if (id) media.id = id;
  media.src = url;
  media.className = id === 'background-preview-media' ? '' : 'shopping-background-media';
  media.style.objectPosition = `${preferences.positionX}% ${preferences.positionY}%`;
  media.style.transform = `scale(${preferences.scale})`;
  media.style.transformOrigin = `${preferences.positionX}% ${preferences.positionY}%`;
  if (kind === 'video') {
    media.muted = true;
    media.playsInline = true;
    media.autoplay = true;
    media.loop = preferences.panIteration === 'infinite';
  }
  return media;
}

export async function initBackgroundPersonalization() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListBackgroundPersonalizationInitialized) return;
  window.__shoppingListBackgroundPersonalizationInitialized = true;

  const [shell, appSdk, authSdk, firestoreSdk] = await Promise.all([
    waitFor(() => document.getElementById('user-panel')?.closest('div.w-full.max-w-md')),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  installStyles();
  const layer = ensureLayer(shell);
  ensureEditor();

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, onSnapshot, setDoc } = firestoreSdk;

  const modal = document.getElementById('background-personalization-modal');
  const preview = document.getElementById('background-preview-viewport');
  const input = document.getElementById('background-file-input');
  const scaleInput = document.getElementById('background-scale');
  const rotationInput = document.getElementById('background-rotation-interval');
  const panEnabledInput = document.getElementById('background-pan-enabled');
  const panDirectionInput = document.getElementById('background-pan-direction');
  const panIterationInput = document.getElementById('background-pan-iteration');
  const driveNote = document.getElementById('background-drive-note');
  const saveButton = document.getElementById('save-background-personalization');

  const state = {
    userId: '',
    preferences: normalizePersonalization(),
    editorPreferences: normalizePersonalization(),
    pendingFile: null,
    removeRequested: false,
    objectUrl: '',
    previewObjectUrl: '',
    loadedBackgroundKey: '',
    loadingBackgroundKeys: new Set(),
    settingsUnsub: null,
    drag: null
  };

  const tracker = createSessionOperationTracker();
  const driveServiceForUser = (userId) => createDrivePhotoService({
    fetchImpl: window.fetch.bind(window),
    sessionStorageImpl: window.sessionStorage,
    getUserId: () => userId
  });

  function settingsRef(userId = state.userId) {
    if (!userId) return null;
    return doc(db, 'artifacts', APP_ID, 'users', userId, 'settings', 'preferences');
  }

  function revokeObjectUrl(key) {
    if (state[key]) URL.revokeObjectURL(state[key]);
    state[key] = '';
  }

  function hideLayer() {
    layer.classList.add('hidden');
    layer.querySelector('.shopping-background-pan-wrap').replaceChildren();
  }

  function applyLayer(url, preferences) {
    const normalized = normalizePersonalization(preferences);
    const wrap = layer.querySelector('.shopping-background-pan-wrap');
    wrap.replaceChildren();
    if (!url || !normalized.backgroundFileId) {
      hideLayer();
      return;
    }
    const kind = backgroundKindForMime(normalized.backgroundMimeType);
    const media = createMediaElement(kind, url, normalized);
    wrap.appendChild(media);
    const pan = buildPanStyle(normalized);
    wrap.style.animationName = pan.animationName;
    wrap.style.animationIterationCount = pan.animationIterationCount;
    wrap.style.animationPlayState = normalized.panEnabled ? 'running' : 'paused';
    layer.classList.remove('hidden');
    if (kind === 'video') media.play().catch(() => {});
  }

  async function loadPersistedBackground({ force = false } = {}) {
    const capturedUserId = state.userId;
    const loadKey = backgroundLoadKey(capturedUserId, state.preferences);
    if (!force && loadKey === state.loadedBackgroundKey) {
      if (state.objectUrl) applyLayer(state.objectUrl, state.preferences);
      return Object.freeze({ status: 'skipped', loadKey });
    }
    if (state.loadingBackgroundKeys.has(loadKey)) {
      return Object.freeze({ status: 'pending', loadKey });
    }
    state.loadingBackgroundKeys.add(loadKey);
    try {
      const result = await runBackgroundDownload({
        tracker,
        userId: capturedUserId,
        preferences: state.preferences,
        driveService: driveServiceForUser(capturedUserId),
        createObjectUrl: (blob) => URL.createObjectURL(blob),
        revokeObjectUrl: (url) => URL.revokeObjectURL(url),
        clearBackground: () => {
          revokeObjectUrl('objectUrl');
          hideLayer();
        },
        hideBackground: hideLayer,
        applyBackground: (objectUrl, preferences) => {
          revokeObjectUrl('objectUrl');
          state.objectUrl = objectUrl;
          applyLayer(objectUrl, preferences);
        },
        onError: (error) => {
          if (!(error instanceof DriveAuthorizationError)) console.error('Background download failed:', error);
        }
      });
      if (['applied', 'empty', 'authorization-required'].includes(result.status)
        && backgroundLoadKey(state.userId, state.preferences) === loadKey) {
        state.loadedBackgroundKey = loadKey;
      }
      return result;
    } finally {
      state.loadingBackgroundKeys.delete(loadKey);
    }
  }

  async function connectDrive(operation = tracker.capture(state.userId), capturedDrive = driveServiceForUser(operation.userId)) {
    const user = auth.currentUser;
    if (!user || user.uid !== operation.userId || !tracker.isSessionCurrent(operation, state.userId)) {
      throw new Error('登入狀態已變更，請重新操作。');
    }
    const provider = new authSdk.GoogleAuthProvider();
    provider.addScope(DRIVE_SCOPE);
    provider.setCustomParameters({ prompt: 'consent' });
    const result = await authSdk.reauthenticateWithPopup(user, provider);
    if (!tracker.isSessionCurrent(operation, state.userId)) throw new Error('登入狀態已變更，請重新操作。');
    const credential = authSdk.GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || '';
    if (!token) throw new DriveAuthorizationError('未取得 Google Drive 授權。');
    capturedDrive.setAccessToken(token);
    driveNote.classList.add('hidden');
    try { await capturedDrive.retryQueuedCleanup(); } catch {}
    if (!tracker.isSessionCurrent(operation, state.userId)) throw new Error('登入狀態已變更，請重新操作。');
    await loadPersistedBackground({ force: true });
    return token;
  }

  function currentPreviewUrl() {
    if (state.previewObjectUrl) return state.previewObjectUrl;
    return state.objectUrl;
  }

  function currentPreviewMime() {
    return state.pendingFile?.type || state.editorPreferences.backgroundMimeType;
  }

  function renderEditorPreview() {
    preview.querySelector('#background-preview-media')?.remove();
    const empty = document.getElementById('background-preview-empty');
    const url = state.removeRequested ? '' : currentPreviewUrl();
    if (!url) {
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      const kind = backgroundKindForMime(currentPreviewMime());
      const media = createMediaElement(kind, url, state.editorPreferences, 'background-preview-media');
      preview.appendChild(media);
      if (kind === 'video') media.play().catch(() => {});
    }
    document.getElementById('background-file-name').textContent = state.removeRequested
      ? '將移除目前背景'
      : (state.pendingFile?.name || state.editorPreferences.backgroundFileName || '');
    scaleInput.value = String(state.editorPreferences.scale);
    document.getElementById('background-scale-value').textContent = `${Math.round(state.editorPreferences.scale * 100)}%`;
    panEnabledInput.checked = state.editorPreferences.panEnabled;
    panDirectionInput.value = state.editorPreferences.panDirection;
    panIterationInput.value = state.editorPreferences.panIteration;
  }

  function openEditor() {
    state.editorPreferences = normalizePersonalization(state.preferences);
    state.pendingFile = null;
    state.removeRequested = false;
    revokeObjectUrl('previewObjectUrl');
    const activeDrive = driveServiceForUser(state.userId);
    driveNote.classList.toggle('hidden', !(state.preferences.backgroundFileId && !activeDrive.hasAccessToken()));
    renderEditorPreview();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeEditor() {
    revokeObjectUrl('previewObjectUrl');
    state.pendingFile = null;
    state.removeRequested = false;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!isSupportedBackgroundFile(file)) {
      window.showMsg?.('不支援的檔案', '請選擇 JPG、PNG、WebP、GIF、MP4 或 WebM。', 'warning');
      return;
    }
    if (file.size > MAX_BACKGROUND_BYTES) {
      window.showMsg?.('檔案太大', '背景檔案請控制在 100MB 以內。', 'warning');
      return;
    }
    revokeObjectUrl('previewObjectUrl');
    state.pendingFile = file;
    state.removeRequested = false;
    state.previewObjectUrl = URL.createObjectURL(file);
    state.editorPreferences = normalizePersonalization({
      ...state.editorPreferences,
      backgroundFileName: file.name,
      backgroundMimeType: file.type
    });
    renderEditorPreview();
  });

  document.getElementById('background-remove').addEventListener('click', () => {
    revokeObjectUrl('previewObjectUrl');
    state.pendingFile = null;
    state.removeRequested = true;
    state.editorPreferences = normalizePersonalization({
      ...state.editorPreferences,
      backgroundFileId: '',
      backgroundFileName: '',
      backgroundMimeType: ''
    });
    renderEditorPreview();
  });

  scaleInput.addEventListener('input', () => {
    state.editorPreferences = normalizePersonalization({ ...state.editorPreferences, scale: scaleInput.value });
    renderEditorPreview();
  });

  for (const button of document.querySelectorAll('[data-position-preset]')) {
    button.addEventListener('click', () => {
      state.editorPreferences = normalizePersonalization({
        ...state.editorPreferences,
        ...positionPreset(button.dataset.positionPreset)
      });
      renderEditorPreview();
    });
  }

  panEnabledInput.addEventListener('change', () => {
    state.editorPreferences = normalizePersonalization({ ...state.editorPreferences, panEnabled: panEnabledInput.checked });
  });
  panDirectionInput.addEventListener('change', () => {
    state.editorPreferences = normalizePersonalization({ ...state.editorPreferences, panDirection: panDirectionInput.value });
  });
  panIterationInput.addEventListener('change', () => {
    state.editorPreferences = normalizePersonalization({ ...state.editorPreferences, panIteration: panIterationInput.value });
  });

  preview.addEventListener('pointerdown', (event) => {
    if (!currentPreviewUrl() || state.removeRequested) return;
    preview.setPointerCapture?.(event.pointerId);
    preview.classList.add('dragging');
    state.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      positionX: state.editorPreferences.positionX,
      positionY: state.editorPreferences.positionY
    };
    event.preventDefault();
  });
  preview.addEventListener('pointermove', (event) => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const rect = preview.getBoundingClientRect();
    const dx = ((event.clientX - state.drag.x) / Math.max(rect.width, 1)) * 100;
    const dy = ((event.clientY - state.drag.y) / Math.max(rect.height, 1)) * 100;
    state.editorPreferences = normalizePersonalization({
      ...state.editorPreferences,
      positionX: clamp(state.drag.positionX + dx, 0, 100),
      positionY: clamp(state.drag.positionY + dy, 0, 100)
    });
    renderEditorPreview();
    event.preventDefault();
  });
  const finishDrag = (event) => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    preview.releasePointerCapture?.(event.pointerId);
    preview.classList.remove('dragging');
    state.drag = null;
  };
  preview.addEventListener('pointerup', finishDrag);
  preview.addEventListener('pointercancel', finishDrag);

  document.getElementById('background-drive-connect').addEventListener('click', async () => {
    const operation = tracker.capture(state.userId);
    try {
      await connectDrive(operation, driveServiceForUser(operation.userId));
      if (tracker.isSessionCurrent(operation, state.userId)) renderEditorPreview();
    } catch (error) {
      if (!tracker.isSessionCurrent(operation, state.userId)) return;
      console.error('Drive reconnect failed:', error);
      window.showMsg?.('連結失敗', '無法重新連結 Google Drive。', 'error');
    }
  });

  document.getElementById('save-background-personalization').addEventListener('click', async () => {
    if (!state.userId) return;
    const operation = tracker.capture(state.userId);
    const capturedSettingsRef = settingsRef(operation.userId);
    const capturedEditorPreferences = normalizePersonalization(state.editorPreferences);
    const capturedPendingFile = state.pendingFile;
    const capturedRemoveRequested = state.removeRequested;
    const oldFileId = state.preferences.backgroundFileId;
    const capturedDrive = driveServiceForUser(operation.userId);
    saveButton.disabled = true;
    try {
      await runBackgroundSaveTransaction({
        tracker,
        operation,
        getCurrentUserId: () => state.userId,
        capturedSettingsRef,
        editorPreferences: capturedEditorPreferences,
        pendingFile: capturedPendingFile,
        removeRequested: capturedRemoveRequested,
        oldFileId,
        driveService: capturedDrive,
        connectDrive,
        persistSettings: (ref, next) => setDoc(ref, { personalization: next }, { merge: true }),
        afterCommit: async (next) => {
          state.preferences = next;
          closeEditor();
          await loadPersistedBackground({ force: true });
        },
        onError: (error) => {
          console.error('Background save failed:', error);
          window.showMsg?.('儲存失敗', error instanceof DriveAuthorizationError ? '請重新連結 Google Drive 後再試。' : (error.message || '無法儲存背景設定。'), 'error');
        }
      });
    } finally {
      if (tracker.isSessionCurrent(operation, state.userId)) saveButton.disabled = false;
    }
  });

  document.getElementById('close-background-personalization').addEventListener('click', closeEditor);
  document.getElementById('cancel-background-personalization').addEventListener('click', closeEditor);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeEditor(); });
  window.addEventListener('shopping-list:open-page-background', openEditor);
  window.addEventListener('shopping-list:drive-token-ready', () => loadPersistedBackground({ force: true }));

  authSdk.onAuthStateChanged(auth, (user) => {
    const operation = resetBackgroundSessionUi({
      tracker,
      userId: user?.uid || '',
      closeEditor,
      hideBackground: hideLayer,
      saveButton
    });
    state.settingsUnsub?.();
    state.settingsUnsub = null;
    revokeObjectUrl('objectUrl');
    revokeObjectUrl('previewObjectUrl');
    state.loadedBackgroundKey = '';
    state.loadingBackgroundKeys.clear();
    state.userId = user?.uid || '';
    state.preferences = normalizePersonalization();
    if (!user) {
      return;
    }
    const ref = settingsRef(operation.userId);
    state.settingsUnsub = onSnapshot(ref, (snapshot) => {
      if (!tracker.isSessionCurrent(operation, state.userId)) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.preferences = normalizePersonalization(data.personalization);
      loadPersistedBackground();
    }, (error) => {
      if (tracker.isSessionCurrent(operation, state.userId)) console.error('Background settings listener failed:', error);
    });
  });
}
