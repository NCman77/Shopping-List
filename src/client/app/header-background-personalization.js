import { createDrivePhotoService, DriveAuthorizationError } from '../photos/drive-photo-service.js';
import { configureGoogleProviderForDrive } from '../auth/google-drive-signin.js';
import {
  backgroundKindForMime,
  backgroundLoadKey,
  isSupportedBackgroundFile
} from './background-personalization.js';
import {
  createBackgroundSlideshowController,
  reorderBackgroundFiles,
  runBackgroundPlaylistDownload,
  runBackgroundPlaylistSaveTransaction
} from './background-playlist.js';
import {
  normalizePersonalization,
  positionPreset,
  normalizeRotationIntervalDraft,
  backgroundDefaultColor,
  normalizeBackgroundColor,
  normalizeBackgroundColorPresets,
  addBackgroundColorPreset
} from './personalization-preferences.js';
import { createSessionOperationTracker } from './session-operation.js';
import {
  createBackgroundMediaService,
  createFirebaseBackgroundStorageService,
  migrateLegacyPlaylistToFirebase
} from './firebase-background-storage.js';

const APP_ID = 'japan-shopping-app';
const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024;
const HEADER_BACKGROUND_UPLOAD = Object.freeze({ kind: 'header-background' });
const HEADER_DEFAULT_COLOR = backgroundDefaultColor('header');
const normalizeHeaderPersonalization = (value = {}) => normalizePersonalization(value, { defaultColor: HEADER_DEFAULT_COLOR });
const HEADER_OVERSCAN_PERCENT = 12;
const HEADER_OVERSCAN_OFFSET_PERCENT = HEADER_OVERSCAN_PERCENT / 2;
const LONG_PRESS_MS = 450;

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
        reject(new Error('等待首頁橫幅背景初始化逾時。'));
      }
    }, 40);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function installStyles() {
  if (document.getElementById('header-background-personalization-styles')) return;
  const style = document.createElement('style');
  style.id = 'header-background-personalization-styles';
  style.textContent = `
    #header-background-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      pointer-events: none;
      background: #FCD5CE;
    }
    #header-background-layer.hidden { display: none; }
    #header-background-layer .header-background-pan-wrap {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }
    #header-background-layer .header-background-media {
      position: absolute;
      width: calc(100% + ${HEADER_OVERSCAN_PERCENT}%);
      height: calc(100% + ${HEADER_OVERSCAN_PERCENT}%);
      left: -${HEADER_OVERSCAN_OFFSET_PERCENT}%;
      top: -${HEADER_OVERSCAN_OFFSET_PERCENT}%;
      max-width: none;
      max-height: none;
      object-fit: cover;
      display: block;
      will-change: transform;
    }
    #header-background-preview-viewport {
      touch-action: none;
      cursor: grab;
      user-select: none;
    }
    #header-background-preview-viewport.dragging { cursor: grabbing; }
    #header-background-preview-media {
      position: absolute;
      width: calc(100% + ${HEADER_OVERSCAN_PERCENT}%);
      height: calc(100% + ${HEADER_OVERSCAN_PERCENT}%);
      left: -${HEADER_OVERSCAN_OFFSET_PERCENT}%;
      top: -${HEADER_OVERSCAN_OFFSET_PERCENT}%;
      max-width: none;
      max-height: none;
      object-fit: cover;
      display: block;
      pointer-events: none;
      will-change: transform;
    }
    #header-background-auth-required {
      position: absolute;
      left: 50%;
      bottom: 1rem;
      transform: translateX(-50%);
      z-index: 25;
      pointer-events: auto;
    }
    #header-background-thumbnails [data-header-background-index] {
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      cursor: grab;
    }
    #header-background-thumbnails [data-header-background-index] img {
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-user-drag: none;
      -webkit-touch-callout: none;
    }
    #header-background-thumbnails.reordering [data-header-background-index] {
      cursor: grabbing;
    }
  `;
  document.head.appendChild(style);
}

function ensureHeaderLayer(header) {
  let layer = document.getElementById('header-background-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'header-background-layer';
    layer.className = 'hidden';
    layer.innerHTML = '<div class="header-background-pan-wrap"></div>';
    header.prepend(layer);
  }
  if (!document.getElementById('header-background-auth-required')) {
    const reconnect = document.createElement('button');
    reconnect.id = 'header-background-auth-required';
    reconnect.type = 'button';
    reconnect.className = 'hidden px-3 py-1.5 rounded-full bg-white/55 backdrop-blur-md border border-white/75 text-warmBrown text-xs font-bold shadow-[0_2px_10px_rgba(0,0,0,.12)]';
    reconnect.innerHTML = '<i class="fas fa-cloud-arrow-up mr-1"></i>移轉舊橫幅';
    header.appendChild(reconnect);
  }
  header.style.overflow = 'hidden';
  return layer;
}

function ensureEditor() {
  if (document.getElementById('header-background-personalization-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'header-background-personalization-modal';
  modal.className = 'fixed inset-0 z-[101] hidden bg-warmBrown/50 backdrop-blur-sm px-3 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-md max-h-[92vh] overflow-hidden bg-shinBg border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,.28)] flex flex-col">
      <div class="bg-pastelYellow border-b-4 border-warmBrown px-5 py-4 flex items-center gap-3 shrink-0">
        <button id="header-background-back" type="button" class="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
        <div class="flex-1 min-w-0">
          <h2 class="text-xl font-bold text-warmBrown">首頁橫幅背景</h2>
          <p class="text-[11px] text-warmBrown/60 font-bold mt-1">設定單色或自訂圖片背景</p>
        </div>
        <button id="close-header-background-personalization" type="button" class="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
      </div>

      <div class="overflow-y-auto p-4 space-y-5 bg-white">
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="header-background-mode-button py-2.5 rounded-xl border-2 border-warmBrown text-sm font-bold text-warmBrown" data-header-background-mode="color">單色</button>
          <button type="button" class="header-background-mode-button py-2.5 rounded-xl border-2 border-warmBrown text-sm font-bold text-warmBrown" data-header-background-mode="media">自訂圖片</button>
        </div>

        <div id="header-background-color-panel" class="hidden rounded-2xl bg-shinBg border-2 border-warmBrown p-4 space-y-4">
          <label class="flex items-center justify-between gap-3 text-sm font-bold text-warmBrown">
            <span>背景顏色</span>
            <input id="header-background-color" type="color" value="#FCD5CE" class="w-14 h-10 rounded-lg border-2 border-warmBrown bg-white p-1 cursor-pointer">
          </label>
          <div>
            <label for="header-background-color-hex" class="block text-xs font-bold text-warmBrown mb-2">色碼</label>
            <div class="flex gap-2">
              <input id="header-background-color-hex" type="text" maxlength="7" value="#FCD5CE" class="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold uppercase outline-none" placeholder="#FCD5CE">
              <button id="header-background-save-color" type="button" class="px-3 py-2.5 rounded-xl bg-pastelYellow border-2 border-warmBrown text-warmBrown text-xs font-bold">儲存常用色</button>
            </div>
          </div>
          <div>
            <p class="text-xs font-bold text-warmBrown mb-2">常用顏色（最多 6 個）</p>
            <div id="header-background-color-presets" class="grid grid-cols-6 gap-2"></div>
          </div>
          <button id="header-background-reset-default" type="button" class="w-full py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold">恢復預設</button>
        </div>

        <div id="header-background-media-panel" class="hidden space-y-5">
          <div id="header-background-preview-viewport" class="relative w-full aspect-[16/9] overflow-hidden rounded-[1.5rem] bg-pastelPink border-2 border-warmBrown shadow-inner">
            <div id="header-background-preview-empty" class="absolute inset-0 flex flex-col items-center justify-center text-warmBrown/45 text-center px-6">
              <i class="fas fa-panorama text-4xl mb-3"></i>
              <span class="text-sm font-bold">選擇自訂圖片後可拖曳調整位置</span>
            </div>
          </div>

          <div id="header-background-drive-note" class="hidden rounded-xl bg-pastelYellow/60 border-2 border-warmBrown px-3 py-2 text-xs font-bold text-warmBrown">
            偵測到舊版 Google Drive 橫幅。完成一次移轉後，橫幅將改由 Firestore 直接載入。
            <button id="header-background-drive-connect" type="button" class="ml-1 underline">移轉舊橫幅</button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button id="header-background-replace" type="button" class="text-center px-3 py-2.5 rounded-xl bg-pastelYellow border-2 border-warmBrown text-warmBrown font-bold"><i class="fas fa-rotate mr-1"></i>重新上傳</button>
            <button id="header-background-append" type="button" class="text-center px-3 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold"><i class="fas fa-plus mr-1"></i>繼續上傳</button>
            <input id="header-background-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp" class="hidden">
          </div>
          <button id="header-background-remove" type="button" class="w-full px-3 py-2 rounded-xl bg-pastelPink border-2 border-warmBrown text-warmBrown text-sm font-bold">移除全部圖片</button>
          <p id="header-background-file-name" class="text-[11px] text-gray-400 font-bold truncate"></p>
          <div id="header-background-thumbnails" class="flex gap-2 overflow-x-auto pb-1"></div>
          <button id="header-background-delete-current" type="button" class="w-full py-2 rounded-xl bg-white border-2 border-warmBrown text-warmBrown text-sm font-bold">刪除目前這張</button>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label for="header-background-rotation-interval" class="text-sm font-bold text-warmBrown">照片輪播間隔</label>
              <span class="text-[11px] text-gray-400 font-bold">2–60 秒</span>
            </div>
            <div class="flex items-center gap-2">
              <input id="header-background-rotation-interval" type="number" min="2" max="60" step="1" value="8" class="w-24 px-3 py-2 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold outline-none">
              <span class="text-sm font-bold text-warmBrown">秒</span>
            </div>
          </div>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label for="header-background-scale" class="text-sm font-bold text-warmBrown">縮放</label>
              <span id="header-background-scale-value" class="text-xs font-bold text-gray-500">100%</span>
            </div>
            <input id="header-background-scale" type="range" min="1" max="3" step="0.05" value="1" class="w-full accent-[#5C4033]">
          </div>

          <div>
            <p class="text-sm font-bold text-warmBrown mb-2">快速位置</p>
            <div class="grid grid-cols-5 gap-1.5">
              <button type="button" data-header-position-preset="left" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠左</button>
              <button type="button" data-header-position-preset="right" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠右</button>
              <button type="button" data-header-position-preset="center" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-pastelYellow">置中</button>
              <button type="button" data-header-position-preset="top" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠上</button>
              <button type="button" data-header-position-preset="bottom" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠下</button>
            </div>
          </div>
        </div>
      </div>

      <div class="p-4 border-t-2 border-warmBrown/20 bg-shinBg flex gap-3 shrink-0">
        <button id="cancel-header-background-personalization" type="button" class="flex-1 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold">取消</button>
        <button id="save-header-background-personalization" type="button" class="flex-1 py-2.5 rounded-xl bg-pastelYellow border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,.18)]">儲存</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

export function scaleForPinch({ startScale = 1, startDistance = 0, currentDistance = 0 } = {}) {
  const base = clamp(Number(startScale) || 1, 1, 3);
  const start = Number(startDistance);
  const current = Number(currentDistance);
  if (!Number.isFinite(start) || !Number.isFinite(current) || start <= 0 || current <= 0) return base;
  return clamp(base * (current / start), 1, 3);
}

export function headerBackgroundTransform(preferences = {}) {
  const positionX = clamp(Number(preferences.positionX) || 50, 0, 100);
  const positionY = clamp(Number(preferences.positionY) || 50, 0, 100);
  const scale = clamp(Number(preferences.scale) || 1, 1, 3);
  const maxTranslatePercent = ((HEADER_OVERSCAN_PERCENT / 2) / (100 + HEADER_OVERSCAN_PERCENT)) * 100;
  const translateX = ((positionX - 50) / 50) * maxTranslatePercent;
  const translateY = ((positionY - 50) / 50) * maxTranslatePercent;
  return `translate(${translateX}%, ${translateY}%) scale(${scale})`;
}

function createHeaderMediaElement(kind, url, preferences, id = '') {
  const media = document.createElement(kind === 'video' ? 'video' : 'img');
  if (id) media.id = id;
  media.src = url;
  media.className = id === 'header-background-preview-media' ? '' : 'header-background-media';
  media.style.objectPosition = '50% 50%';
  media.style.transform = headerBackgroundTransform(preferences);
  media.style.transformOrigin = '50% 50%';
  if (kind === 'video') {
    media.muted = true;
    media.playsInline = true;
    media.autoplay = true;
    media.loop = true;
  }
  return media;
}

export async function initHeaderBackgroundPersonalization() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListHeaderBackgroundPersonalizationInitialized) return;
  window.__shoppingListHeaderBackgroundPersonalizationInitialized = true;

  const [header, appSdk, authSdk, firestoreSdk] = await Promise.all([
    waitFor(() => document.querySelector('header')),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  installStyles();
  const layer = ensureHeaderLayer(header);
  ensureEditor();

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, onSnapshot, setDoc } = firestoreSdk;

  const modal = document.getElementById('header-background-personalization-modal');
  const preview = document.getElementById('header-background-preview-viewport');
  const colorPanel = document.getElementById('header-background-color-panel');
  const mediaPanel = document.getElementById('header-background-media-panel');
  const colorInput = document.getElementById('header-background-color');
  const colorHexInput = document.getElementById('header-background-color-hex');
  const input = document.getElementById('header-background-file-input');
  const scaleInput = document.getElementById('header-background-scale');
  const rotationInput = document.getElementById('header-background-rotation-interval');
  const driveNote = document.getElementById('header-background-drive-note');
  const authRequiredButton = document.getElementById('header-background-auth-required');
  const thumbnailsRoot = document.getElementById('header-background-thumbnails');
  const saveButton = document.getElementById('save-header-background-personalization');

  const state = {
    userId: '',
    preferences: normalizeHeaderPersonalization(),
    editorPreferences: normalizeHeaderPersonalization(),
    editorMode: 'color',
    savedColors: [],
    pendingFiles: [],
    pendingEntries: [],
    uploadMode: 'replace',
    removeRequested: false,
    loadedItems: [],
    previewObjectUrls: new Map(),
    loadedBackgroundKey: '',
    loadingBackgroundKeys: new Set(),
    settingsUnsub: null,
    activeEditorIndex: 0,
    drag: null,
    previewPointers: new Map(),
    pinch: null,
    thumbnailDrag: null,
    thumbnailLongPressTimer: null,
    suppressThumbnailClick: false
  };

  const tracker = createSessionOperationTracker();
  const driveServiceForUser = (userId) => createDrivePhotoService({
    fetchImpl: window.fetch.bind(window),
    sessionStorageImpl: window.sessionStorage,
    getUserId: () => userId
  });
  const firebaseStorageServiceForUser = (userId) => createFirebaseBackgroundStorageService({
    firestoreSdk,
    db,
    userId,
    localStorageImpl: window.localStorage
  });
  const mediaServiceForUser = (userId) => createBackgroundMediaService({
    firebaseService: firebaseStorageServiceForUser(userId),
    driveService: driveServiceForUser(userId)
  });

  function settingsRef(userId = state.userId) {
    if (!userId) return null;
    return doc(db, 'artifacts', APP_ID, 'users', userId, 'settings', 'preferences');
  }

  const wrap = layer.querySelector('.header-background-pan-wrap');
  let slideshowPreferences = normalizeHeaderPersonalization();

  const slideshow = createBackgroundSlideshowController({
    render: (item) => {
      wrap.replaceChildren();
      const kind = backgroundKindForMime(item.mimeType);
      const media = createHeaderMediaElement(kind, item.objectUrl, { ...slideshowPreferences, ...item });
      wrap.appendChild(media);
      if (kind === 'video') media.play().catch(() => {});
    },
    setIntervalImpl: window.setInterval.bind(window),
    clearIntervalImpl: window.clearInterval.bind(window)
  });

  function revokeLoadedItems() {
    for (const item of state.loadedItems) {
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
    }
    state.loadedItems = [];
  }

  function revokePreviewObjectUrls() {
    for (const url of state.previewObjectUrls.values()) URL.revokeObjectURL(url);
    state.previewObjectUrls.clear();
  }

  function hideLayer() {
    slideshow.stop();
    layer.classList.add('hidden');
    layer.style.removeProperty('background-color');
    wrap.replaceChildren();
  }

  function applyPlaylist(items, preferences) {
    const normalized = normalizeHeaderPersonalization(preferences);
    if (normalized.mode === 'color') {
      slideshow.stop();
      wrap.replaceChildren();
      layer.style.backgroundColor = normalized.color;
      layer.classList.remove('hidden');
      return;
    }
    layer.style.removeProperty('background-color');
    if (!items.length) {
      hideLayer();
      return;
    }
    slideshowPreferences = normalized;
    const framedItems = items.map((item) => ({
      ...item,
      ...(normalized.backgroundFiles.find((file) => file.fileId === item.fileId) || {})
    }));
    layer.classList.remove('hidden');
    slideshow.start(framedItems, normalized);
  }

  async function loadPersistedBackground({ force = false } = {}) {
    const capturedUserId = state.userId;
    const loadKey = backgroundLoadKey(capturedUserId, state.preferences);
    if (state.preferences.mode === 'color') {
      revokeLoadedItems();
      applyPlaylist([], state.preferences);
      state.loadedBackgroundKey = loadKey;
      authRequiredButton.classList.add('hidden');
      return Object.freeze({ status: 'color', loadKey });
    }
    if (!force && loadKey === state.loadedBackgroundKey) {
      if (state.loadedItems.length) applyPlaylist(state.loadedItems, state.preferences);
      return Object.freeze({ status: 'skipped', loadKey });
    }
    if (state.loadingBackgroundKeys.has(loadKey)) {
      return Object.freeze({ status: 'pending', loadKey });
    }
    state.loadingBackgroundKeys.add(loadKey);
    try {
      const result = await runBackgroundPlaylistDownload({
        tracker,
        userId: capturedUserId,
        preferences: state.preferences,
        driveService: mediaServiceForUser(capturedUserId),
        createObjectUrl: (blob) => URL.createObjectURL(blob),
        revokeObjectUrl: (url) => URL.revokeObjectURL(url),
        clearBackground: () => {
          revokeLoadedItems();
          hideLayer();
        },
        hideBackground: hideLayer,
        applyBackgrounds: (items, preferences) => {
          revokeLoadedItems();
          state.loadedItems = items;
          applyPlaylist(items, preferences);
        },
        onError: (error) => {
          if (!(error instanceof DriveAuthorizationError)) console.error('Header background download failed:', error);
        }
      });
      const legacy = state.preferences.backgroundFiles.some((file) => !String(file.fileId || '').startsWith('firestore:'));
      const needsAuthorization = legacy && !driveServiceForUser(capturedUserId).hasAccessToken();
      authRequiredButton.classList.toggle('hidden', !needsAuthorization);
      if (['applied', 'empty'].includes(result.status) && !legacy) authRequiredButton.classList.add('hidden');
      if (['applied', 'empty', 'authorization-required', 'error'].includes(result.status)
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
    const provider = configureGoogleProviderForDrive(new authSdk.GoogleAuthProvider(), { loginHint: user.email || '' });
    const result = await authSdk.reauthenticateWithPopup(user, provider);
    if (!tracker.isSessionCurrent(operation, state.userId)) throw new Error('登入狀態已變更，請重新操作。');
    const credential = authSdk.GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || '';
    if (!token) throw new DriveAuthorizationError('未取得 Google Drive 授權。');
    capturedDrive.setAccessToken(token);
    try { await capturedDrive.retryQueuedCleanup(); } catch {}
    if (!tracker.isSessionCurrent(operation, state.userId)) throw new Error('登入狀態已變更，請重新操作。');
    const migration = await migrateLegacyPlaylistToFirebase({
      preferences: state.preferences,
      driveService: capturedDrive,
      mediaService: mediaServiceForUser(operation.userId),
      uploadKind: HEADER_BACKGROUND_UPLOAD.kind,
      persistPreferences: (next) => setDoc(settingsRef(operation.userId), { headerPersonalization: next }, { merge: true })
    });
    if (migration.status === 'migrated') state.preferences = migration.nextPreferences;
    driveNote.classList.add('hidden');
    authRequiredButton.classList.add('hidden');
    await loadPersistedBackground({ force: true });
    return token;
  }

  function editorFiles() {
    return state.editorPreferences.backgroundFiles;
  }

  function activeEditorFile() {
    const files = editorFiles();
    if (!files.length) return null;
    state.activeEditorIndex = clamp(state.activeEditorIndex, 0, files.length - 1);
    return files[state.activeEditorIndex];
  }

  function previewUrlAt(index) {
    const file = editorFiles()[index];
    if (!file) return '';
    if (String(file.fileId || '').startsWith('pending:')) {
      return state.previewObjectUrls.get(file.fileId) || '';
    }
    return state.loadedItems.find((item) => item.fileId === file.fileId)?.objectUrl || '';
  }

  function currentPreviewUrl() {
    return previewUrlAt(state.activeEditorIndex);
  }

  function currentPreviewMime() {
    return activeEditorFile()?.mimeType || '';
  }

  function setEditorFiles(files) {
    const cleanFiles = Array.isArray(files) ? files : [];
    state.editorPreferences = normalizeHeaderPersonalization({
      ...state.editorPreferences,
      backgroundFiles: cleanFiles,
      backgroundFileId: cleanFiles[0]?.fileId || '',
      backgroundFileName: cleanFiles[0]?.fileName || '',
      backgroundMimeType: cleanFiles[0]?.mimeType || ''
    });
    state.activeEditorIndex = cleanFiles.length ? clamp(state.activeEditorIndex, 0, cleanFiles.length - 1) : 0;
    state.removeRequested = cleanFiles.length === 0;
  }

  function updateActiveFrame(patch) {
    const files = editorFiles();
    if (!files.length) return;
    const index = state.activeEditorIndex;
    const nextFiles = files.map((file, fileIndex) => fileIndex === index ? { ...file, ...patch } : file);
    setEditorFiles(nextFiles);
  }

  function renderThumbnails() {
    const root = document.getElementById('header-background-thumbnails');
    root.replaceChildren();
    editorFiles().forEach((file, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-header-background-index', String(index));
      button.className = `relative w-16 h-16 shrink-0 overflow-hidden rounded-xl border-2 ${index === state.activeEditorIndex ? 'border-warmBrown ring-2 ring-pastelYellow' : 'border-warmBrown/30'} bg-shinBg`;
      const url = previewUrlAt(index);
      if (url && backgroundKindForMime(file.mimeType) === 'image') {
        const image = document.createElement('img');
        image.src = url;
        image.alt = file.fileName || `橫幅 ${index + 1}`;
        image.draggable = false;
        image.className = 'w-full h-full object-cover';
        button.appendChild(image);
      } else {
        const label = document.createElement('span');
        label.className = 'absolute inset-0 flex items-center justify-center text-xs font-bold text-warmBrown';
        label.innerHTML = backgroundKindForMime(file.mimeType) === 'video'
          ? '<i class="fas fa-video"></i>'
          : String(index + 1);
        button.appendChild(label);
      }
      button.addEventListener('click', () => {
        if (state.suppressThumbnailClick) return;
        state.activeEditorIndex = index;
        renderEditorPreview();
      });
      root.appendChild(button);
    });
  }

  function cancelThumbnailLongPress() {
    if (state.thumbnailLongPressTimer) clearTimeout(state.thumbnailLongPressTimer);
    state.thumbnailLongPressTimer = null;
  }

  function moveThumbnailDom(fromIndex, toIndex) {
    const buttons = [...thumbnailsRoot.querySelectorAll('[data-header-background-index]')];
    const moved = buttons[fromIndex];
    const target = buttons[toIndex];
    if (!moved || !target || moved === target) return;
    if (fromIndex < toIndex) target.insertAdjacentElement('afterend', moved);
    else target.insertAdjacentElement('beforebegin', moved);
    [...thumbnailsRoot.querySelectorAll('[data-header-background-index]')].forEach((button, index) => {
      button.dataset.headerBackgroundIndex = String(index);
    });
  }

  function finishThumbnailReorder(event) {
    cancelThumbnailLongPress();
    if (!state.thumbnailDrag) return;
    const drag = state.thumbnailDrag;
    thumbnailsRoot.classList.remove('reordering');
    if (drag.captureElement?.hasPointerCapture?.(drag.pointerId)) {
      drag.captureElement.releasePointerCapture?.(drag.pointerId);
    }
    if (drag.active) {
      state.suppressThumbnailClick = true;
      setTimeout(() => { state.suppressThumbnailClick = false; }, 0);
      renderEditorPreview();
    }
    state.thumbnailDrag = null;
  }

  thumbnailsRoot.addEventListener('contextmenu', (event) => {
    if (!event.target.closest?.('[data-header-background-index]')) return;
    event.preventDefault();
  });

  thumbnailsRoot.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.('[data-header-background-index]');
    if (!button) return;
    cancelThumbnailLongPress();
    const index = Number(button.dataset.headerBackgroundIndex);
    state.thumbnailDrag = {
      pointerId: event.pointerId,
      index,
      active: false,
      captureElement: button
    };
    state.thumbnailLongPressTimer = setTimeout(() => {
      if (!state.thumbnailDrag || state.thumbnailDrag.pointerId !== event.pointerId) return;
      state.thumbnailDrag.active = true;
      state.activeEditorIndex = index;
      thumbnailsRoot.classList.add('reordering');
      button.setPointerCapture?.(event.pointerId);
    }, LONG_PRESS_MS);
  });

  thumbnailsRoot.addEventListener('pointermove', (event) => {
    const drag = state.thumbnailDrag;
    if (!drag || drag.pointerId !== event.pointerId || !drag.active) return;
    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('[data-header-background-index]');
    const targetIndex = Number(target?.dataset?.headerBackgroundIndex);
    if (!Number.isInteger(targetIndex) || targetIndex === drag.index) return;
    const fromIndex = drag.index;
    const reordered = reorderBackgroundFiles(editorFiles(), fromIndex, targetIndex);
    setEditorFiles(reordered);
    moveThumbnailDom(fromIndex, targetIndex);
    drag.index = targetIndex;
    state.activeEditorIndex = targetIndex;
    event.preventDefault();
  });

  thumbnailsRoot.addEventListener('pointerup', finishThumbnailReorder);
  thumbnailsRoot.addEventListener('pointercancel', finishThumbnailReorder);
  thumbnailsRoot.addEventListener('pointerleave', (event) => {
    if (!state.thumbnailDrag?.active) cancelThumbnailLongPress();
  });

  function renderEditorPreview() {
    preview.querySelector('#header-background-preview-media')?.remove();
    const empty = document.getElementById('header-background-preview-empty');
    const file = activeEditorFile();
    const url = state.removeRequested ? '' : currentPreviewUrl();

    if (!url || !file) {
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      const kind = backgroundKindForMime(currentPreviewMime());
      const media = createHeaderMediaElement(kind, url, file, 'header-background-preview-media');
      preview.appendChild(media);
      if (kind === 'video') media.play().catch(() => {});
    }

    const selectedCount = editorFiles().length;
    document.getElementById('header-background-file-name').textContent = state.removeRequested
      ? '將移除目前橫幅背景'
      : (selectedCount ? `已設定 ${selectedCount} 個背景檔案，目前第 ${state.activeEditorIndex + 1} 張` : '');
    scaleInput.value = String(file?.scale ?? 1);
    rotationInput.value = String(state.editorPreferences.rotationIntervalSeconds);
    document.getElementById('header-background-scale-value').textContent = `${Math.round((file?.scale ?? 1) * 100)}%`;
    document.getElementById('header-background-delete-current').disabled = !selectedCount;
    renderThumbnails();
  }

  function renderColorPresets() {
    const root = document.getElementById('header-background-color-presets');
    root.replaceChildren();
    for (let index = 0; index < 6; index += 1) {
      const color = state.savedColors[index] || '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h-9 rounded-xl border-2 border-warmBrown/40 bg-white overflow-hidden';
      button.setAttribute('aria-label', color ? `套用 ${color}` : '尚未儲存顏色');
      if (color) {
        button.style.backgroundColor = color;
        button.title = color;
        button.addEventListener('click', () => setEditorColor(color));
      } else {
        button.disabled = true;
        button.classList.add('opacity-30');
      }
      root.appendChild(button);
    }
  }

  function setEditorColor(value) {
    const color = normalizeBackgroundColor(value, HEADER_DEFAULT_COLOR);
    state.editorMode = 'color';
    state.editorPreferences = normalizeHeaderPersonalization({ ...state.editorPreferences, mode: 'color', color });
    colorInput.value = color;
    colorHexInput.value = color;
    renderEditorMode();
  }

  function renderEditorMode() {
    document.querySelectorAll('[data-header-background-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.headerBackgroundMode === state.editorMode));
      button.classList.toggle('bg-pastelYellow', button.dataset.headerBackgroundMode === state.editorMode);
    });
    colorPanel.classList.toggle('hidden', state.editorMode !== 'color');
    mediaPanel.classList.toggle('hidden', state.editorMode !== 'media');
    colorInput.value = state.editorPreferences.color;
    colorHexInput.value = state.editorPreferences.color;
    renderColorPresets();
    if (state.editorMode === 'media') renderEditorPreview();
  }

  function openEditor() {
    state.editorPreferences = normalizeHeaderPersonalization(state.preferences);
    state.editorMode = state.preferences.mode === 'media' ? 'media' : 'color';
    state.pendingFiles = [];
    state.pendingEntries = [];
    state.uploadMode = 'replace';
    state.activeEditorIndex = 0;
    state.removeRequested = false;
    revokePreviewObjectUrls();
    const activeDrive = driveServiceForUser(state.userId);
    driveNote.classList.toggle('hidden', !(state.preferences.backgroundFiles.length && !activeDrive.hasAccessToken()));
    renderEditorMode();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeEditor() {
    revokePreviewObjectUrls();
    state.pendingFiles = [];
    state.pendingEntries = [];
    state.uploadMode = 'replace';
    state.activeEditorIndex = 0;
    state.removeRequested = false;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  document.querySelectorAll('[data-header-background-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editorMode = button.dataset.headerBackgroundMode;
      if (state.editorMode === 'media') state.editorPreferences = { ...state.editorPreferences, mode: 'media' };
      else state.editorPreferences = normalizeHeaderPersonalization({ ...state.editorPreferences, mode: 'color' });
      renderEditorMode();
    });
  });

  colorInput.addEventListener('input', () => setEditorColor(colorInput.value));
  colorHexInput.addEventListener('input', () => {
    const value = String(colorHexInput.value || '').trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(value)) setEditorColor(value);
  });
  document.getElementById('header-background-save-color').addEventListener('click', async () => {
    const value = String(colorHexInput.value || '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(value)) {
      window.showMsg?.('色碼格式錯誤', '請輸入例如 #FCD5CE 的 6 位 HEX 色碼。', 'warning');
      return;
    }
    const next = addBackgroundColorPreset(state.savedColors, value);
    try {
      await setDoc(settingsRef(), { backgroundColorPresets: next }, { merge: true });
      state.savedColors = next;
      renderColorPresets();
    } catch (error) {
      console.error('Save background color preset failed:', error);
      window.showMsg?.('儲存失敗', '無法儲存常用顏色。', 'error');
    }
  });
  document.getElementById('header-background-reset-default').addEventListener('click', () => setEditorColor(HEADER_DEFAULT_COLOR));

  function pendingKey() {
    if (typeof crypto?.randomUUID === 'function') return `pending:${crypto.randomUUID()}`;
    return `pending:${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function appendPendingFiles(files, { replace = false } = {}) {
    if (replace) {
      revokePreviewObjectUrls();
      state.pendingEntries = [];
    }
    const baseFiles = replace ? [] : editorFiles().slice();
    const added = files.map((file, index) => {
      const key = pendingKey();
      state.pendingEntries.push({ key, file });
      state.previewObjectUrls.set(key, URL.createObjectURL(file));
      return {
        fileId: key,
        fileName: file.name || `橫幅 ${baseFiles.length + index + 1}`,
        mimeType: file.type || '',
        positionX: 50,
        positionY: 50,
        scale: 1
      };
    });
    state.pendingFiles = state.pendingEntries.map((entry) => entry.file);
    setEditorFiles([...baseFiles, ...added]);
    state.activeEditorIndex = replace ? 0 : Math.max(0, baseFiles.length);
    state.removeRequested = false;
    renderEditorPreview();
  }

  document.getElementById('header-background-replace').addEventListener('click', () => {
    state.uploadMode = 'replace';
    input.click();
  });
  document.getElementById('header-background-append').addEventListener('click', () => {
    state.uploadMode = 'append';
    input.click();
  });

  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    if (files.some((file) => !isSupportedBackgroundFile(file))) {
      window.showMsg?.('不支援的檔案', '請選擇 JPG、PNG 或 WebP 照片。', 'warning');
      return;
    }
    if (files.some((file) => file.size > MAX_BACKGROUND_BYTES)) {
      window.showMsg?.('檔案太大', '每個背景照片請控制在 25MB 以內。', 'warning');
      return;
    }
    state.editorMode = 'media';
    state.editorPreferences = { ...state.editorPreferences, mode: 'media' };
    appendPendingFiles(files, { replace: state.uploadMode === 'replace' });
    renderEditorMode();
  });

  document.getElementById('header-background-remove').addEventListener('click', () => {
    revokePreviewObjectUrls();
    state.pendingFiles = [];
    state.pendingEntries = [];
    state.activeEditorIndex = 0;
    setEditorFiles([]);
    renderEditorPreview();
  });

  document.getElementById('header-background-delete-current').addEventListener('click', () => {
    const files = editorFiles();
    if (!files.length) return;
    const index = state.activeEditorIndex;
    const removed = files[index];
    if (String(removed?.fileId || '').startsWith('pending:')) {
      const removedUrl = state.previewObjectUrls.get(removed.fileId);
      if (removedUrl) URL.revokeObjectURL(removedUrl);
      state.previewObjectUrls.delete(removed.fileId);
      state.pendingEntries = state.pendingEntries.filter((entry) => entry.key !== removed.fileId);
      state.pendingFiles = state.pendingEntries.map((entry) => entry.file);
    }
    const nextFiles = files.filter((_, fileIndex) => fileIndex !== index);
    setEditorFiles(nextFiles);
    renderEditorPreview();
  });

  scaleInput.addEventListener('input', () => {
    updateActiveFrame({ scale: scaleInput.value });
    renderEditorPreview();
  });

  rotationInput.addEventListener('input', () => {
    const nextInterval = normalizeRotationIntervalDraft(rotationInput.value);
    if (nextInterval === null) return;
    state.editorPreferences = normalizeHeaderPersonalization({
      ...state.editorPreferences,
      rotationIntervalSeconds: nextInterval
    });
  });
  rotationInput.addEventListener('blur', () => {
    const nextInterval = normalizeRotationIntervalDraft(rotationInput.value);
    if (nextInterval === null) {
      rotationInput.value = String(state.editorPreferences.rotationIntervalSeconds);
      return;
    }
    state.editorPreferences = normalizeHeaderPersonalization({
      ...state.editorPreferences,
      rotationIntervalSeconds: nextInterval
    });
    rotationInput.value = String(state.editorPreferences.rotationIntervalSeconds);
  });

  for (const button of document.querySelectorAll('[data-header-position-preset]')) {
    button.addEventListener('click', () => {
      updateActiveFrame(positionPreset(button.dataset.headerPositionPreset));
      renderEditorPreview();
    });
  }

  function previewPointerDistance() {
    const points = [...state.previewPointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  function beginSinglePointerDrag(pointerId, point) {
    const file = activeEditorFile();
    if (!file) return;
    state.drag = {
      pointerId,
      x: point.x,
      y: point.y,
      positionX: file.positionX,
      positionY: file.positionY
    };
    preview.classList.add('dragging');
  }

  preview.addEventListener('pointerdown', (event) => {
    const file = activeEditorFile();
    if (!currentPreviewUrl() || !file || state.removeRequested) return;
    preview.setPointerCapture?.(event.pointerId);
    state.previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (state.previewPointers.size === 1) {
      state.pinch = null;
      beginSinglePointerDrag(event.pointerId, { x: event.clientX, y: event.clientY });
    } else if (state.previewPointers.size === 2) {
      state.drag = null;
      preview.classList.remove('dragging');
      state.pinch = {
        startDistance: previewPointerDistance(),
        startScale: Number(file.scale) || 1
      };
    }
    event.preventDefault();
  });

  preview.addEventListener('pointermove', (event) => {
    if (!state.previewPointers.has(event.pointerId)) return;
    state.previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (state.pinch && state.previewPointers.size >= 2) {
      updateActiveFrame({
        scale: scaleForPinch({
          startScale: state.pinch.startScale,
          startDistance: state.pinch.startDistance,
          currentDistance: previewPointerDistance()
        })
      });
      renderEditorPreview();
      event.preventDefault();
      return;
    }

    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const rect = preview.getBoundingClientRect();
    const dx = ((event.clientX - state.drag.x) / Math.max(rect.width, 1)) * 100;
    const dy = ((event.clientY - state.drag.y) / Math.max(rect.height, 1)) * 100;
    updateActiveFrame({
      positionX: clamp(state.drag.positionX + dx, 0, 100),
      positionY: clamp(state.drag.positionY + dy, 0, 100)
    });
    renderEditorPreview();
    event.preventDefault();
  });

  const finishPreviewGesture = (event) => {
    state.previewPointers.delete(event.pointerId);
    if (preview.hasPointerCapture?.(event.pointerId)) preview.releasePointerCapture?.(event.pointerId);

    if (state.previewPointers.size < 2) state.pinch = null;

    if (state.previewPointers.size === 1) {
      const [remainingId, point] = [...state.previewPointers.entries()][0];
      beginSinglePointerDrag(remainingId, point);
    } else if (state.previewPointers.size === 0) {
      state.drag = null;
      preview.classList.remove('dragging');
    }
  };
  preview.addEventListener('pointerup', finishPreviewGesture);
  preview.addEventListener('pointercancel', finishPreviewGesture);

  authRequiredButton.addEventListener('click', async () => {
    const operation = tracker.capture(state.userId);
    try {
      await connectDrive(operation, driveServiceForUser(operation.userId));
    } catch (error) {
      if (!tracker.isSessionCurrent(operation, state.userId)) return;
      console.error('Header background reconnect failed:', error);
      window.showMsg?.('移轉失敗', '需要最後一次讀取舊 Google Drive 橫幅才能完成 Firestore 移轉。', 'error');
    }
  });

  document.getElementById('header-background-drive-connect').addEventListener('click', async () => {
    const operation = tracker.capture(state.userId);
    try {
      await connectDrive(operation, driveServiceForUser(operation.userId));
      if (tracker.isSessionCurrent(operation, state.userId)) renderEditorPreview();
    } catch (error) {
      if (!tracker.isSessionCurrent(operation, state.userId)) return;
      console.error('Header Drive reconnect failed:', error);
      window.showMsg?.('移轉失敗', '無法讀取舊 Google Drive 橫幅。', 'error');
    }
  });

  document.getElementById('save-header-background-personalization').addEventListener('click', async () => {
    if (!state.userId) return;
    const operation = tracker.capture(state.userId);
    const capturedSettingsRef = settingsRef(operation.userId);
    const capturedEditorPreferences = normalizeHeaderPersonalization({ ...state.editorPreferences, mode: state.editorMode });
    const capturedPendingFiles = state.editorMode === 'media' ? state.pendingFiles.slice() : [];
    const capturedPendingEntries = state.editorMode === 'media' ? state.pendingEntries.map((entry) => ({ ...entry })) : [];
    const capturedRemoveRequested = state.editorMode === 'media' ? state.removeRequested : false;
    const oldFiles = state.preferences.backgroundFiles.slice();
    const capturedMedia = mediaServiceForUser(operation.userId);
    saveButton.disabled = true;

    try {
      await runBackgroundPlaylistSaveTransaction({
        tracker,
        operation,
        getCurrentUserId: () => state.userId,
        capturedSettingsRef,
        editorPreferences: capturedEditorPreferences,
        pendingFiles: capturedPendingFiles,
        pendingEntries: capturedPendingEntries,
        removeRequested: capturedRemoveRequested,
        oldFiles,
        uploadKind: HEADER_BACKGROUND_UPLOAD.kind,
        driveService: capturedMedia,
        connectDrive,
        persistSettings: (ref, next) => setDoc(ref, { headerPersonalization: next }, { merge: true }),
        afterCommit: async (next) => {
          state.preferences = next;
          closeEditor();
          await loadPersistedBackground({ force: true });
        },
        onError: (error) => {
          console.error('Header background save failed:', error);
          window.showMsg?.(
            '儲存失敗',
            error.message || '無法儲存首頁橫幅背景。',
            'error'
          );
        }
      });
    } finally {
      if (tracker.isSessionCurrent(operation, state.userId)) saveButton.disabled = false;
    }
  });

  document.getElementById('header-background-back').addEventListener('click', () => {
    closeEditor();
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') window.dispatchEvent(new EventCtor('shopping-list:open-personalization'));
  });
  document.getElementById('close-header-background-personalization').addEventListener('click', closeEditor);
  document.getElementById('cancel-header-background-personalization').addEventListener('click', closeEditor);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeEditor(); });
  window.addEventListener('shopping-list:open-header-background', openEditor);
  window.addEventListener('shopping-list:drive-token-ready', () => loadPersistedBackground({ force: true }));

  authSdk.onAuthStateChanged(auth, (user) => {
    tracker.advance(user?.uid || '');
    closeEditor();
    saveButton.disabled = false;
    hideLayer();
    authRequiredButton.classList.add('hidden');
    state.settingsUnsub?.();
    state.settingsUnsub = null;
    revokeLoadedItems();
    revokePreviewObjectUrls();
    state.loadedBackgroundKey = '';
    state.loadingBackgroundKeys.clear();
    state.userId = user?.uid || '';
    state.preferences = normalizeHeaderPersonalization();

    if (!user) return;

    void mediaServiceForUser(user.uid).retryQueuedCleanup();
    const operation = tracker.capture(user.uid);
    state.settingsUnsub = onSnapshot(settingsRef(user.uid), (snapshot) => {
      if (!tracker.isSessionCurrent(operation, state.userId)) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.savedColors = normalizeBackgroundColorPresets(data.backgroundColorPresets);
      state.preferences = normalizeHeaderPersonalization(data.headerPersonalization);
      const legacy = state.preferences.backgroundFiles.some((file) => !String(file.fileId || '').startsWith('firestore:'));
      driveNote.classList.toggle('hidden', !legacy);
      authRequiredButton.classList.toggle('hidden', !(legacy && !driveServiceForUser(state.userId).hasAccessToken()));
      if (legacy && driveServiceForUser(state.userId).hasAccessToken()) {
        void migrateLegacyPlaylistToFirebase({
          preferences: state.preferences,
          driveService: driveServiceForUser(state.userId),
          mediaService: mediaServiceForUser(state.userId),
          uploadKind: HEADER_BACKGROUND_UPLOAD.kind,
          persistPreferences: (next) => setDoc(settingsRef(state.userId), { headerPersonalization: next }, { merge: true })
        }).catch((error) => console.error('Legacy header background migration failed:', error));
        return;
      }
      loadPersistedBackground();
    }, (error) => {
      if (tracker.isSessionCurrent(operation, state.userId)) console.error('Header background settings listener failed:', error);
    });
  });
}
