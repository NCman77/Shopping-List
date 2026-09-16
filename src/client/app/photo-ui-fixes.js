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
        reject(new Error('等待商品照片介面初始化逾時。'));
      }
    }, 40);
  });
}

function repairPhotoUi() {
  const placeholder = document.getElementById('photo-placeholder');
  if (placeholder) {
    const preview = document.getElementById('photo-preview');
    const shouldHide = Boolean(preview && !preview.classList.contains('hidden'));
    if (placeholder.classList.contains('hidden') !== shouldHide) {
      placeholder.classList.toggle('hidden', shouldHide);
    }
    if (!placeholder.textContent?.includes('新增照片')) {
      placeholder.innerHTML = '<i class="fas fa-camera text-3xl mb-1"></i><span class="text-sm font-bold">新增照片</span><span class="text-[10px] opacity-60">相簿與相機</span>';
    }
  }

  const grid = document.getElementById('photo-preview-grid');
  if (grid && !grid.classList.contains('lg:max-w-md')) grid.classList.add('lg:max-w-md');
  if (grid && !grid.classList.contains('lg:mx-auto')) grid.classList.add('lg:mx-auto');
}

export async function initPhotoUiFixes() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListPhotoUiFixesInitialized) return;
  window.__shoppingListPhotoUiFixesInitialized = true;

  const modal = await waitFor(() => document.getElementById('add-modal'));
  repairPhotoUi();

  const observer = new MutationObserver(() => repairPhotoUi());
  observer.observe(modal, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true
  });

  window.addEventListener('shopping-list:item-modal-opened', repairPhotoUi);
  queueMicrotask(repairPhotoUi);
}
