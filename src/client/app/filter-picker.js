function clean(value) {
  return String(value ?? '').trim();
}

export function filterOptionsByQuery(options = [], query = '') {
  const needle = clean(query).toLocaleLowerCase();
  const values = Array.isArray(options) ? options : [];
  if (!needle) return [...values];
  return values.filter((option) => clean(option?.label).toLocaleLowerCase().includes(needle));
}

const FILTERS = {
  category: {
    rootId: 'category-filters',
    selector: '.cat-btn',
    dataKey: 'cat',
    dataAttr: 'data-cat',
    title: '選擇分類',
    iconClass: 'fas fa-tag'
  },
  location: {
    rootId: 'location-filters',
    selector: '.loc-btn',
    dataKey: 'loc',
    dataAttr: 'data-loc',
    title: '選擇地點',
    iconClass: 'fas fa-map-marker-alt'
  }
};

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
        reject(new Error('等待完整篩選選單初始化逾時。'));
      }
    }, 40);
  });
}

export async function initFilterPicker() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListFilterPickerInitialized) return;
  window.__shoppingListFilterPickerInitialized = true;

  const [categoryRoot, locationRoot] = await Promise.all([
    waitFor(() => document.getElementById('category-filters')),
    waitFor(() => document.getElementById('location-filters'))
  ]);

  document.querySelectorAll('[data-filter-kind-icon="category"], [data-filter-kind-icon="location"]').forEach((icon) => {
    icon.classList.add('hidden');
  });

  const state = {
    activeType: '',
    query: '',
    selected: { category: 'all', location: 'all' },
    scheduled: false
  };

  function ensureModal() {
    if (document.getElementById('filter-picker-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'filter-picker-modal';
    modal.className = 'fixed inset-0 z-[125] hidden bg-warmBrown/45 backdrop-blur-sm px-4 items-end sm:items-center justify-center';
    modal.innerHTML = `
      <div class="w-full max-w-md max-h-[82vh] bg-white border-4 border-warmBrown rounded-t-[2rem] sm:rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,0.25)] overflow-hidden">
        <div class="px-5 py-4 bg-pastelYellow border-b-4 border-warmBrown flex items-center justify-between gap-3">
          <div class="min-w-0"><h3 id="filter-picker-title" class="font-bold text-warmBrown text-lg">選擇項目</h3><p class="text-[11px] text-warmBrown/60">一次查看目前旅程可用的選項</p></div>
          <div class="flex items-center gap-2 shrink-0">
            <button id="filter-picker-manage" type="button" class="px-3 h-9 rounded-full bg-white/80 border-2 border-warmBrown text-warmBrown text-xs font-bold"><i class="fas fa-sliders-h mr-1"></i>管理</button>
            <button id="filter-picker-close" type="button" class="w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div class="p-4 bg-shinBg border-b-2 border-warmBrown/20">
          <div class="relative">
            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-warmBrown/40"></i>
            <input id="filter-picker-search" type="search" autocomplete="off" class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown font-medium outline-none" placeholder="搜尋選項">
          </div>
        </div>
        <div id="filter-picker-options" class="p-4 grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#filter-picker-close')?.addEventListener('click', closeModal);
    modal.querySelector('#filter-picker-manage')?.addEventListener('click', () => {
      const kind = state.activeType;
      if (!kind) return;
      closeModal();
      window.dispatchEvent(new CustomEvent('shopping-list:manage-filter', { detail: { kind } }));
    });
    modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
    modal.querySelector('#filter-picker-search')?.addEventListener('input', (event) => {
      state.query = event.target.value;
      renderOptions();
    });
  }

  function closeModal() {
    const modal = document.getElementById('filter-picker-modal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    state.activeType = '';
    state.query = '';
    const search = document.getElementById('filter-picker-search');
    if (search) search.value = '';
  }

  function collectOptions(type) {
    const config = FILTERS[type];
    if (!config) return [];
    const root = document.getElementById(config.rootId);
    if (!root) return [];
    return [...root.querySelectorAll(config.selector)]
      .filter((button) => !button.classList.contains('hidden'))
      .map((sourceButton) => ({
        value: clean(sourceButton.dataset?.[config.dataKey]),
        label: clean(sourceButton.dataset?.filterPickerLabel || sourceButton.textContent) || clean(sourceButton.dataset?.[config.dataKey]),
        sourceButton
      }))
      .filter((option) => option.value && option.label);
  }

  function renderOptions() {
    const container = document.getElementById('filter-picker-options');
    if (!container || !state.activeType) return;
    const options = filterOptionsByQuery(collectOptions(state.activeType), state.query);
    container.replaceChildren();

    if (!options.length) {
      const empty = document.createElement('div');
      empty.className = 'col-span-2 py-8 text-center text-sm font-bold text-gray-400';
      empty.textContent = '找不到符合的選項';
      container.appendChild(empty);
      return;
    }

    for (const option of options) {
      const selected = state.selected[state.activeType] === option.value;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `px-4 py-3 rounded-2xl border-2 border-warmBrown text-left font-bold text-warmBrown transition-all ${selected ? 'bg-pastelYellow shadow-[2px_2px_0_rgba(92,64,51,.25)]' : 'bg-white hover:bg-shinBg'}`;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.textContent = option.label;
      button.addEventListener('click', () => {
        const sourceButton = option.sourceButton;
        if (!sourceButton?.isConnected || sourceButton.classList.contains('hidden')) {
          renderOptions();
          return;
        }
        state.selected[state.activeType] = option.value;
        sourceButton.click();
        closeModal();
      });
      container.appendChild(button);
    }
  }

  function openModal(type) {
    const config = FILTERS[type];
    if (!config) return;
    ensureModal();
    state.activeType = type;
    state.query = '';
    const modal = document.getElementById('filter-picker-modal');
    const title = document.getElementById('filter-picker-title');
    const search = document.getElementById('filter-picker-search');
    if (title) title.textContent = config.title;
    if (search) search.value = '';
    renderOptions();
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
  }

  function allButtonFor(type) {
    const config = FILTERS[type];
    const root = config ? document.getElementById(config.rootId) : null;
    return root?.querySelector(`${config.selector}[${config.dataAttr}="all"]`) || null;
  }

  function enhanceAllChip(type) {
    const config = FILTERS[type];
    const button = allButtonFor(type);
    if (!button || button.dataset.filterPickerAll === type) return;
    button.dataset.filterPickerAll = type;
    button.dataset.filterPickerLabel = '全部';
    button.innerHTML = `<i class="${config.iconClass} mr-1"></i>全部 <i class="fas fa-chevron-down ml-1 text-[9px]"></i>`;
    button.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openModal(type);
    }, true);
  }

  function selectAllWithoutPicker(type) {
    const button = allButtonFor(type);
    if (!button) return;
    state.selected[type] = 'all';
    button.click();
  }

  function ensureAllChips() {
    state.scheduled = false;
    enhanceAllChip('category');
    enhanceAllChip('location');
    if (state.activeType) renderOptions();
  }

  function scheduleEnsure() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(ensureAllChips);
  }

  document.addEventListener('click', (event) => {
    const category = event.target.closest?.('#category-filters .cat-btn');
    if (category && !category.classList.contains('hidden')) {
      state.selected.category = clean(category.getAttribute('data-cat') || category.dataset.cat) || 'all';
      return;
    }
    const location = event.target.closest?.('#location-filters .loc-btn');
    if (location && !location.classList.contains('hidden')) {
      state.selected.location = clean(location.getAttribute('data-loc') || location.dataset.loc) || 'all';
    }
  });

  window.addEventListener('shopping-list:active-trip-changed', () => {
    closeModal();
    selectAllWithoutPicker('category');
    selectAllWithoutPicker('location');
    scheduleEnsure();
  });
  window.addEventListener('shopping-list:trips-changed', () => {
    closeModal();
    scheduleEnsure();
  });

  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(categoryRoot, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
  observer.observe(locationRoot, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('filter-picker-modal')?.classList.contains('hidden')) closeModal();
  });

  ensureModal();
  ensureAllChips();
}
