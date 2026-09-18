function ensureHub() {
  let modal = document.getElementById('personalization-hub-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'personalization-hub-modal';
  modal.className = 'fixed inset-0 z-[99] hidden bg-warmBrown/50 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-md overflow-hidden bg-shinBg border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,.28)]">
      <div class="bg-pastelBlue border-b-4 border-warmBrown px-5 py-4 flex items-center gap-3">
        <button id="personalization-hub-back" type="button" class="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-chevron-left"></i></button>
        <div class="flex-1 min-w-0">
          <h2 class="text-xl font-bold text-warmBrown">個人化</h2>
          <p class="text-[11px] text-warmBrown/60 font-bold mt-1">選擇要調整的背景區域</p>
        </div>
        <button id="personalization-hub-close" type="button" class="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
      </div>
      <div class="p-4 space-y-3 bg-white">
        <button id="personalization-open-header-background" type="button" class="w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelYellow/60 border-2 border-warmBrown text-warmBrown">
          <span class="w-11 h-11 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-panorama"></i></span>
          <span class="flex-1 min-w-0">
            <span class="block font-bold">首頁橫幅背景</span>
            <span class="block text-xs opacity-60 mt-0.5">修改首頁最上方橫幅，可使用 JPEG、PNG 或 WebP 照片</span>
          </span>
          <i class="fas fa-chevron-right text-xs"></i>
        </button>
        <button id="personalization-open-item-card-background" type="button" class="w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelGreen/60 border-2 border-warmBrown text-warmBrown">
          <span class="w-11 h-11 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-clone"></i></span>
          <span class="flex-1 min-w-0">
            <span class="block font-bold">商品小卡背景</span>
            <span class="block text-xs opacity-60 mt-0.5">設定主頁商品小卡的單色或照片背景</span>
          </span>
          <i class="fas fa-chevron-right text-xs"></i>
        </button>
        <button id="personalization-open-page-background" type="button" class="w-full flex items-center gap-3 text-left p-4 rounded-2xl bg-pastelBlue/60 border-2 border-warmBrown text-warmBrown">
          <span class="w-11 h-11 shrink-0 rounded-full bg-white border-2 border-warmBrown flex items-center justify-center"><i class="fas fa-image"></i></span>
          <span class="flex-1 min-w-0">
            <span class="block font-bold">頁面背景</span>
            <span class="block text-xs opacity-60 mt-0.5">保留目前整個購物清單頁面的背景功能</span>
          </span>
          <i class="fas fa-chevron-right text-xs"></i>
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function dispatch(name) {
  const EventCtor = window.CustomEvent || globalThis.CustomEvent;
  if (typeof EventCtor === 'function') window.dispatchEvent(new EventCtor(name));
}

export function initPersonalizationHub() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListPersonalizationHubInitialized) return;
  window.__shoppingListPersonalizationHubInitialized = true;

  const modal = ensureHub();
  const open = () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  };
  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };

  document.getElementById('personalization-hub-back').addEventListener('click', () => {
    close();
    dispatch('shopping-list:open-account-settings');
  });
  document.getElementById('personalization-hub-close').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.getElementById('personalization-open-header-background').addEventListener('click', () => {
    close();
    dispatch('shopping-list:open-header-background');
  });
  document.getElementById('personalization-open-item-card-background').addEventListener('click', () => {
    close();
    dispatch('shopping-list:open-item-card-background');
  });
  document.getElementById('personalization-open-page-background').addEventListener('click', () => {
    close();
    dispatch('shopping-list:open-page-background');
  });
  window.addEventListener('shopping-list:open-personalization', open);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
}
