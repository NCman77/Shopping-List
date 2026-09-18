import { createDrivePhotoService, DriveAuthorizationError } from '../photos/drive-photo-service.js';
import { configureGoogleProviderForDrive } from '../auth/google-drive-signin.js';
import {
  backgroundKindForMime,
  isSupportedBackgroundFile,
  runBackgroundDownload,
  runBackgroundSaveTransaction
} from './background-personalization.js';
import {
  DEFAULT_ITEM_CARD_PERSONALIZATION,
  normalizeItemCardPersonalization
} from './item-card-personalization-core.js';
import {
  positionPreset,
  backgroundDefaultColor,
  normalizeBackgroundColor,
  normalizeBackgroundColorPresets,
  addBackgroundColorPreset
} from './personalization-preferences.js';
import { createSessionOperationTracker } from './session-operation.js';
import {
  createBackgroundMediaService,
  createFirebaseBackgroundStorageService,
  migrateLegacySingleToFirebase
} from './firebase-background-storage.js';

const APP_ID = 'japan-shopping-app';
const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024;
const ITEM_CARD_BACKGROUND_UPLOAD = Object.freeze({ kind: 'item-card-background' });

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
        reject(new Error('等待商品小卡背景初始化逾時。'));
      }
    }, 40);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mediaPreferences(settings) {
  return {
    backgroundFileId: settings.backgroundFileId,
    backgroundFileName: settings.backgroundFileName,
    backgroundMimeType: settings.backgroundMimeType,
    positionX: settings.positionX,
    positionY: settings.positionY,
    scale: settings.scale
  };
}

function installStyles() {
  if (document.getElementById('item-card-personalization-styles')) return;
  const style = document.createElement('style');
  style.id = 'item-card-personalization-styles';
  style.textContent = `
    #item-list > .item-card-personalized {
      isolation: isolate;
      overflow: hidden;
    }
    #item-list > .item-card-personalized.item-card-personalized-color {
      background-color: var(--item-card-background-color) !important;
    }
    #item-list > .item-card-personalized.item-card-personalized-media {
      background-color: transparent !important;
    }
    #item-list > .item-card-personalized > .item-card-personalization-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      pointer-events: none;
    }
    #item-list > .item-card-personalized > .item-card-personalization-layer + *,
    #item-list > .item-card-personalized > :not(.item-card-personalization-layer) {
      position: relative;
      z-index: 1;
    }
    .item-card-personalization-media {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      will-change: transform;
    }
    #item-card-background-preview-media {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
      will-change: transform;
    }
    #item-card-background-preview {
      touch-action: none;
      cursor: grab;
      user-select: none;
    }
    #item-card-background-preview.dragging { cursor: grabbing; }
    .item-card-mode-button[aria-pressed="true"] {
      background: #FDE68A;
      box-shadow: 2px 2px 0 rgba(92,64,51,.16);
    }
  `;
  document.head.appendChild(style);
}

function ensureEditor() {
  if (document.getElementById('item-card-personalization-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'item-card-personalization-modal';
  modal.className = 'fixed inset-0 z-[102] hidden bg-warmBrown/50 backdrop-blur-sm px-3 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-md max-h-[92vh] overflow-hidden bg-shinBg border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,.28)] flex flex-col">
      <div class="bg-pastelGreen border-b-4 border-warmBrown px-5 py-4 flex items-center gap-3 shrink-0">
        <button id="item-card-background-back" type="button" class="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
        <div class="flex-1 min-w-0">
          <h2 class="text-xl font-bold text-warmBrown">商品小卡背景</h2>
          <p class="text-[11px] text-warmBrown/60 font-bold mt-1">設定單色或自訂圖片背景</p>
        </div>
        <button id="item-card-background-close" type="button" class="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
      </div>

      <div class="overflow-y-auto p-4 space-y-5 bg-white">
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="item-card-mode-button py-2.5 rounded-xl border-2 border-warmBrown text-sm font-bold text-warmBrown" data-item-card-mode="color">單色</button>
          <button type="button" class="item-card-mode-button py-2.5 rounded-xl border-2 border-warmBrown text-sm font-bold text-warmBrown" data-item-card-mode="media">自訂圖片</button>
        </div>

        <div id="item-card-color-panel" class="hidden rounded-2xl bg-shinBg border-2 border-warmBrown p-4 space-y-4">
          <label class="flex items-center justify-between gap-3 text-sm font-bold text-warmBrown">
            <span>小卡顏色</span>
            <input id="item-card-background-color" type="color" value="#FFFFFF" class="w-14 h-10 rounded-lg border-2 border-warmBrown bg-white p-1 cursor-pointer">
          </label>
          <div>
            <label for="item-card-background-color-hex" class="block text-xs font-bold text-warmBrown mb-2">色碼</label>
            <div class="flex gap-2">
              <input id="item-card-background-color-hex" type="text" inputmode="text" maxlength="7" value="#FFFFFF" class="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold uppercase outline-none" placeholder="#FFFFFF">
              <button id="item-card-background-save-color" type="button" class="px-3 py-2.5 rounded-xl bg-pastelYellow border-2 border-warmBrown text-warmBrown text-xs font-bold">儲存常用色</button>
            </div>
          </div>
          <div>
            <p class="text-xs font-bold text-warmBrown mb-2">常用顏色（最多 6 個）</p>
            <div id="item-card-background-color-presets" class="grid grid-cols-6 gap-2"></div>
          </div>
          <button id="item-card-background-reset-default" type="button" class="w-full py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold">恢復預設</button>
        </div>

        <div id="item-card-media-panel" class="hidden space-y-4">
          <div id="item-card-background-preview" class="relative w-full aspect-[3/2] overflow-hidden rounded-[1.5rem] bg-shinBg border-2 border-warmBrown shadow-inner">
            <div id="item-card-background-preview-empty" class="absolute inset-0 flex flex-col items-center justify-center text-warmBrown/45 text-center px-6">
              <i class="fas fa-image text-4xl mb-3"></i>
              <span class="text-sm font-bold">選擇自訂圖片</span>
            </div>
          </div>

          <div id="item-card-background-drive-note" class="hidden rounded-xl bg-pastelYellow/60 border-2 border-warmBrown px-3 py-2 text-xs font-bold text-warmBrown">
            偵測到舊版 Google Drive 小卡背景。完成一次移轉後，背景將改由 Firestore 直接載入。
            <button id="item-card-background-drive-connect" type="button" class="ml-1 underline">移轉舊背景</button>
          </div>

          <label class="block text-center px-3 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold cursor-pointer">
            <i class="fas fa-upload mr-1"></i>選擇自訂圖片
            <input id="item-card-background-file" type="file" accept="image/jpeg,image/png,image/webp" class="hidden">
          </label>
          <p id="item-card-background-file-name" class="text-[11px] text-gray-400 font-bold truncate"></p>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label for="item-card-background-scale" class="text-sm font-bold text-warmBrown">縮放</label>
              <span id="item-card-background-scale-value" class="text-xs font-bold text-gray-500">100%</span>
            </div>
            <input id="item-card-background-scale" type="range" min="1" max="3" step="0.05" value="1" class="w-full accent-[#5C4033]">
          </div>

          <div>
            <p class="text-sm font-bold text-warmBrown mb-2">快速位置</p>
            <div class="grid grid-cols-5 gap-1.5">
              <button type="button" data-item-card-position-preset="left" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠左</button>
              <button type="button" data-item-card-position-preset="right" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠右</button>
              <button type="button" data-item-card-position-preset="center" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-pastelYellow">置中</button>
              <button type="button" data-item-card-position-preset="top" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠上</button>
              <button type="button" data-item-card-position-preset="bottom" class="py-2 rounded-xl border-2 border-warmBrown text-[11px] font-bold text-warmBrown bg-shinBg">靠下</button>
            </div>
          </div>
        </div>
      </div>

      <div class="p-4 border-t-2 border-warmBrown/20 bg-shinBg flex gap-3 shrink-0">
        <button id="item-card-background-cancel" type="button" class="flex-1 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-bold">取消</button>
        <button id="item-card-background-save" type="button" class="flex-1 py-2.5 rounded-xl bg-pastelGreen border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,.18)]">儲存</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function createMedia(kind, url, settings, className, id = '') {
  const media = document.createElement(kind === 'video' ? 'video' : 'img');
  if (id) media.id = id;
  media.className = className;
  media.src = url;
  media.style.objectPosition = `${settings.positionX}% ${settings.positionY}%`;
  media.style.transform = `scale(${settings.scale})`;
  media.style.transformOrigin = `${settings.positionX}% ${settings.positionY}%`;
  if (kind === 'video') {
    media.muted = true;
    media.playsInline = true;
    media.autoplay = true;
    media.loop = true;
  }
  return media;
}

export async function initItemCardPersonalization() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListItemCardPersonalizationInitialized) return;
  window.__shoppingListItemCardPersonalizationInitialized = true;

  const [list, appSdk, authSdk, firestoreSdk] = await Promise.all([
    waitFor(() => document.getElementById('item-list')),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);

  installStyles();
  ensureEditor();

  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { doc, onSnapshot, setDoc } = firestoreSdk;

  const modal = document.getElementById('item-card-personalization-modal');
  const colorPanel = document.getElementById('item-card-color-panel');
  const mediaPanel = document.getElementById('item-card-media-panel');
  const colorInput = document.getElementById('item-card-background-color');
  const colorHexInput = document.getElementById('item-card-background-color-hex');
  const fileInput = document.getElementById('item-card-background-file');
  const scaleInput = document.getElementById('item-card-background-scale');
  const preview = document.getElementById('item-card-background-preview');
  const driveNote = document.getElementById('item-card-background-drive-note');
  const saveButton = document.getElementById('item-card-background-save');

  const state = {
    userId: '',
    preferences: { ...DEFAULT_ITEM_CARD_PERSONALIZATION },
    editor: { ...DEFAULT_ITEM_CARD_PERSONALIZATION },
    editorMode: 'color',
    savedColors: [],
    pendingFile: null,
    objectUrl: '',
    previewObjectUrl: '',
    settingsUnsub: null,
    drag: null
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

  function revokeUrl(key) {
    if (state[key]) URL.revokeObjectURL(state[key]);
    state[key] = '';
  }

  function productCards() {
    return [...list.children].filter((card) => !card.id && card.classList?.contains('fade-in'));
  }

  function clearCard(card) {
    card.classList.remove('item-card-personalized', 'item-card-personalized-color', 'item-card-personalized-media');
    card.style.removeProperty('--item-card-background-color');
    card.querySelector(':scope > .item-card-personalization-layer')?.remove();
  }

  function applyCards() {
    const settings = state.preferences;
    for (const card of productCards()) {
      clearCard(card);
      if (settings.mode === 'default') continue;

      card.classList.add('item-card-personalized');
      if (settings.mode === 'color') {
        card.classList.add('item-card-personalized-color');
        card.style.setProperty('--item-card-background-color', settings.color);
        continue;
      }

      if (settings.mode === 'media' && state.objectUrl) {
        card.classList.add('item-card-personalized-media');
        const layer = document.createElement('div');
        layer.className = 'item-card-personalization-layer';
        const kind = backgroundKindForMime(settings.backgroundMimeType);
        const media = createMedia(kind, state.objectUrl, settings, 'item-card-personalization-media');
        layer.appendChild(media);
        card.prepend(layer);
        if (kind === 'video') media.play().catch(() => {});
      }
    }
  }

  const listObserver = new MutationObserver(() => applyCards());
  listObserver.observe(list, { childList: true });

  async function loadMedia({ force = false } = {}) {
    const settings = state.preferences;
    if (settings.mode !== 'media' || !settings.backgroundFileId) {
      revokeUrl('objectUrl');
      applyCards();
      return;
    }
    if (!force && state.objectUrl) {
      applyCards();
      return;
    }
    const capturedUserId = state.userId;
    const service = mediaServiceForUser(capturedUserId);
    const result = await runBackgroundDownload({
      tracker,
      userId: capturedUserId,
      preferences: mediaPreferences(settings),
      driveService: service,
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
      clearBackground: () => {
        revokeUrl('objectUrl');
        applyCards();
      },
      hideBackground: () => {
        revokeUrl('objectUrl');
        applyCards();
      },
      applyBackground: (objectUrl) => {
        revokeUrl('objectUrl');
        state.objectUrl = objectUrl;
        applyCards();
      },
      onError: (error) => {
        if (!(error instanceof DriveAuthorizationError)) console.error('Item card background download failed:', error);
      }
    });
    return result;
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
    const migration = await migrateLegacySingleToFirebase({
      preferences: state.preferences,
      driveService: capturedDrive,
      mediaService: mediaServiceForUser(operation.userId),
      uploadKind: ITEM_CARD_BACKGROUND_UPLOAD.kind,
      persistPreferences: (next) => setDoc(settingsRef(operation.userId), { itemCardPersonalization: next }, { merge: true })
    });
    if (migration.status === 'migrated') {
      state.preferences = normalizeItemCardPersonalization(migration.nextPreferences);
    }
    driveNote.classList.add('hidden');
    await loadMedia({ force: true });
    return token;
  }

  function previewUrl() {
    return state.previewObjectUrl || state.objectUrl;
  }

  function renderPreview() {
    preview.querySelector('#item-card-background-preview-media')?.remove();
    const empty = document.getElementById('item-card-background-preview-empty');
    const url = state.editorMode === 'media' ? previewUrl() : '';
    if (!url) {
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      const mime = state.pendingFile?.type || state.editor.backgroundMimeType;
      const media = createMedia(
        backgroundKindForMime(mime),
        url,
        state.editor,
        '',
        'item-card-background-preview-media'
      );
      preview.appendChild(media);
      if (media.tagName === 'VIDEO') media.play().catch(() => {});
    }
    document.getElementById('item-card-background-file-name').textContent =
      state.pendingFile?.name || state.editor.backgroundFileName || '';
    scaleInput.value = String(state.editor.scale);
    document.getElementById('item-card-background-scale-value').textContent = `${Math.round(state.editor.scale * 100)}%`;
  }

  function renderColorPresets() {
    const root = document.getElementById('item-card-background-color-presets');
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
    const color = normalizeBackgroundColor(value, backgroundDefaultColor('item-card'));
    state.editorMode = 'color';
    state.editor = { ...state.editor, mode: 'color', color };
    colorInput.value = color;
    colorHexInput.value = color;
    renderMode();
  }

  function renderMode() {
    document.querySelectorAll('[data-item-card-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.itemCardMode === state.editorMode));
    });
    colorPanel.classList.toggle('hidden', state.editorMode !== 'color');
    mediaPanel.classList.toggle('hidden', state.editorMode !== 'media');
    colorInput.value = state.editor.color;
    colorHexInput.value = state.editor.color;
    renderColorPresets();
    renderPreview();
  }

  function openEditor() {
    state.editor = normalizeItemCardPersonalization(state.preferences);
    state.editorMode = state.preferences.mode === 'media' ? 'media' : 'color';
    state.pendingFile = null;
    revokeUrl('previewObjectUrl');
    const legacy = state.preferences.mode === 'media'
      && state.preferences.backgroundFileId
      && !String(state.preferences.backgroundFileId).startsWith('firestore:');
    driveNote.classList.toggle('hidden', !legacy);
    renderMode();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeEditor() {
    revokeUrl('previewObjectUrl');
    state.pendingFile = null;
    state.drag = null;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  document.querySelectorAll('[data-item-card-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editorMode = button.dataset.itemCardMode;
      if (state.editorMode === 'color') {
        state.editor = { ...state.editor, mode: 'color' };
      }
      if (state.editorMode === 'media' && !state.editor.backgroundFileId && state.pendingFile) {
        state.editor = { ...state.editor, mode: 'media', backgroundFileId: 'pending' };
      }
      renderMode();
    });
  });

  colorInput.addEventListener('input', () => {
    setEditorColor(colorInput.value);
  });
  colorHexInput.addEventListener('input', () => {
    const value = String(colorHexInput.value || '').trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(value)) setEditorColor(value);
  });
  document.getElementById('item-card-background-save-color').addEventListener('click', async () => {
    const value = String(colorHexInput.value || '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(value)) {
      window.showMsg?.('色碼格式錯誤', '請輸入例如 #FFFFFF 的 6 位 HEX 色碼。', 'warning');
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
  document.getElementById('item-card-background-reset-default').addEventListener('click', () => {
    setEditorColor(backgroundDefaultColor('item-card'));
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (!isSupportedBackgroundFile(file)) {
      window.showMsg?.('不支援的檔案', '請選擇 JPG、PNG 或 WebP 照片。', 'warning');
      return;
    }
    if (file.size > MAX_BACKGROUND_BYTES) {
      window.showMsg?.('檔案太大', '小卡背景照片請控制在 25MB 以內。', 'warning');
      return;
    }
    revokeUrl('previewObjectUrl');
    state.pendingFile = file;
    state.previewObjectUrl = URL.createObjectURL(file);
    state.editorMode = 'media';
    state.editor = {
      ...state.editor,
      mode: 'media',
      backgroundFileId: state.editor.backgroundFileId || 'pending',
      backgroundFileName: file.name,
      backgroundMimeType: file.type,
      positionX: 50,
      positionY: 50,
      scale: 1
    };
    renderMode();
  });

  scaleInput.addEventListener('input', () => {
    state.editor = {
      ...state.editor,
      scale: clamp(Number(scaleInput.value) || 1, 1, 3)
    };
    renderPreview();
  });

  for (const button of document.querySelectorAll('[data-item-card-position-preset]')) {
    button.addEventListener('click', () => {
      state.editor = { ...state.editor, ...positionPreset(button.dataset.itemCardPositionPreset) };
      renderPreview();
    });
  }

  preview.addEventListener('pointerdown', (event) => {
    if (state.editorMode !== 'media' || !previewUrl()) return;
    preview.setPointerCapture?.(event.pointerId);
    preview.classList.add('dragging');
    state.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      positionX: state.editor.positionX,
      positionY: state.editor.positionY
    };
    event.preventDefault();
  });

  preview.addEventListener('pointermove', (event) => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const rect = preview.getBoundingClientRect();
    const dx = ((event.clientX - state.drag.x) / Math.max(rect.width, 1)) * 100;
    const dy = ((event.clientY - state.drag.y) / Math.max(rect.height, 1)) * 100;
    state.editor = {
      ...state.editor,
      positionX: clamp(state.drag.positionX + dx, 0, 100),
      positionY: clamp(state.drag.positionY + dy, 0, 100)
    };
    renderPreview();
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

  document.getElementById('item-card-background-drive-connect').addEventListener('click', async () => {
    const operation = tracker.capture(state.userId);
    try {
      await connectDrive(operation, driveServiceForUser(operation.userId));
      if (tracker.isSessionCurrent(operation, state.userId)) renderPreview();
    } catch (error) {
      if (!tracker.isSessionCurrent(operation, state.userId)) return;
      console.error('Item card Drive reconnect failed:', error);
      window.showMsg?.('連結失敗', '無法重新連結 Google Drive。', 'error');
    }
  });

  saveButton.addEventListener('click', async () => {
    if (!state.userId) return;
    const operation = tracker.capture(state.userId);
    const ref = settingsRef(operation.userId);
    const oldFileId = state.preferences.backgroundFileId;
    const capturedMedia = mediaServiceForUser(operation.userId);
    const desiredMode = state.editorMode;
    const desiredColor = state.editor.color;
    const desiredFrame = {
      positionX: state.editor.positionX,
      positionY: state.editor.positionY,
      scale: state.editor.scale
    };
    saveButton.disabled = true;

    try {
      let persistedSettings = null;
      await runBackgroundSaveTransaction({
        tracker,
        operation,
        getCurrentUserId: () => state.userId,
        capturedSettingsRef: ref,
        editorPreferences: mediaPreferences(state.editor),
        pendingFile: desiredMode === 'media' ? state.pendingFile : null,
        removeRequested: desiredMode !== 'media',
        oldFileId,
        uploadKind: ITEM_CARD_BACKGROUND_UPLOAD.kind,
        driveService: capturedMedia,
        connectDrive,
        persistSettings: async (settingsRefValue, nextMedia) => {
          const next = desiredMode === 'media'
            ? normalizeItemCardPersonalization({
                mode: 'media',
                color: desiredColor,
                backgroundFileId: nextMedia.backgroundFileId,
                backgroundFileName: nextMedia.backgroundFileName,
                backgroundMimeType: nextMedia.backgroundMimeType,
                ...desiredFrame
              })
            : normalizeItemCardPersonalization({
                mode: desiredMode === 'color' ? 'color' : 'default',
                color: desiredColor
              });
          persistedSettings = next;
          await setDoc(settingsRefValue, { itemCardPersonalization: next }, { merge: true });
        },
        afterCommit: async () => {
          if (!persistedSettings) return;
          state.preferences = persistedSettings;
          closeEditor();
          revokeUrl('objectUrl');
          await loadMedia({ force: true });
          applyCards();
        },
        onError: (error) => {
          console.error('Item card background save failed:', error);
          window.showMsg?.(
            '儲存失敗',
            error.message || '無法儲存商品小卡背景。',
            'error'
          );
        }
      });
    } finally {
      if (tracker.isSessionCurrent(operation, state.userId)) saveButton.disabled = false;
    }
  });

  document.getElementById('item-card-background-back').addEventListener('click', () => {
    closeEditor();
    const EventCtor = window.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') window.dispatchEvent(new EventCtor('shopping-list:open-personalization'));
  });
  document.getElementById('item-card-background-close').addEventListener('click', closeEditor);
  document.getElementById('item-card-background-cancel').addEventListener('click', closeEditor);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeEditor(); });
  window.addEventListener('shopping-list:open-item-card-background', openEditor);
  window.addEventListener('shopping-list:drive-token-ready', () => loadMedia({ force: true }));

  authSdk.onAuthStateChanged(auth, (user) => {
    tracker.advance(user?.uid || '');
    closeEditor();
    state.settingsUnsub?.();
    state.settingsUnsub = null;
    revokeUrl('objectUrl');
    state.userId = user?.uid || '';
    state.preferences = { ...DEFAULT_ITEM_CARD_PERSONALIZATION };
    applyCards();
    if (!user) return;

    void mediaServiceForUser(user.uid).retryQueuedCleanup();
    const operation = tracker.capture(user.uid);
    state.settingsUnsub = onSnapshot(settingsRef(user.uid), (snapshot) => {
      if (!tracker.isSessionCurrent(operation, state.userId)) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.savedColors = normalizeBackgroundColorPresets(data.backgroundColorPresets);
      state.preferences = normalizeItemCardPersonalization(data.itemCardPersonalization);
      revokeUrl('objectUrl');
      const legacy = state.preferences.mode === 'media'
        && state.preferences.backgroundFileId
        && !String(state.preferences.backgroundFileId).startsWith('firestore:');
      driveNote.classList.toggle('hidden', !legacy);
      if (legacy && driveServiceForUser(state.userId).hasAccessToken()) {
        void migrateLegacySingleToFirebase({
          preferences: state.preferences,
          driveService: driveServiceForUser(state.userId),
          mediaService: mediaServiceForUser(state.userId),
          uploadKind: ITEM_CARD_BACKGROUND_UPLOAD.kind,
          persistPreferences: (next) => setDoc(settingsRef(state.userId), { itemCardPersonalization: next }, { merge: true })
        }).catch((error) => console.error('Legacy item-card background migration failed:', error));
        return;
      }
      void loadMedia({ force: true });
      applyCards();
    }, (error) => {
      if (tracker.isSessionCurrent(operation, state.userId)) {
        console.error('Item card personalization listener failed:', error);
      }
    });
  });

  applyCards();
}
