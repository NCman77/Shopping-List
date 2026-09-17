import { deriveItemCouponRows, findUniqueBrandMatch } from './coupon-core.js';
import { resolveLocationDisplayName } from './brand-location-resolver.js';
import { buildLocationPickerModel } from './location-picker-chips.js';
import { DEFAULT_COUNTRY } from './travel-country.js';

function clean(value) {
  return String(value ?? '').trim();
}

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
        reject(new Error('等待商品優惠券介面初始化逾時。'));
      }
    }, 40);
  });
}

function couponByBrandRows({ locations, brands, coupons, country, todayKey }) {
  return new Map(deriveItemCouponRows({
    locations,
    brands,
    coupons,
    country,
    todayKey,
    includeInactive: true
  }).map((row) => [row.brandId, row]));
}

export function buildItemCouponEditorRows({
  locations,
  brands,
  coupons,
  country,
  todayKey
} = {}) {
  const result = [];
  const seenBrandIds = new Set();
  const derived = couponByBrandRows({ locations, brands, coupons, country, todayKey });

  for (const rawValue of Array.isArray(locations) ? locations : []) {
    const rawLocation = clean(rawValue);
    if (!rawLocation) continue;
    const match = findUniqueBrandMatch(brands, rawLocation, country);
    if (match.kind !== 'match') {
      result.push({
        rawLocation,
        brandId: '',
        displayName: rawLocation,
        coupon: null,
        status: match.kind === 'ambiguous' ? 'ambiguous' : 'unresolved'
      });
      continue;
    }

    const id = clean(match.brand?.id || match.brand?.brandId);
    if (!id || seenBrandIds.has(id)) continue;
    seenBrandIds.add(id);
    const couponRow = derived.get(id);
    result.push({
      rawLocation,
      brandId: id,
      displayName: resolveLocationDisplayName(rawLocation, brands, country) || rawLocation,
      coupon: couponRow?.coupon || null,
      status: couponRow?.status || 'none'
    });
  }
  return result;
}

function currentCountry(windowRef) {
  return clean(windowRef?.shoppingListActiveTrip?.country)
    || clean(windowRef?.shoppingListActiveCountry)
    || DEFAULT_COUNTRY;
}

function installStyles(documentRef) {
  if (!documentRef?.head || documentRef.getElementById('item-coupon-ui-styles')) return;
  const style = documentRef.createElement('style');
  style.id = 'item-coupon-ui-styles';
  style.textContent = `
    #item-coupon-section {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid rgba(92,64,51,.24);
      border-radius: 1rem;
      background: rgba(252,213,206,.18);
      color: #5C4033;
    }
    .workflow-view-mode #item-coupon-section { display: none !important; }
    .workflow-edit-mode #item-coupon-section { margin-top: 0 !important; }
  `;
  documentRef.head.appendChild(style);
}

function ensureSection(documentRef) {
  let section = documentRef.getElementById('item-coupon-section');
  if (!section) {
    section = documentRef.createElement('section');
    section.id = 'item-coupon-section';
    section.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <span class="w-7 h-7 shrink-0 rounded-full bg-pastelPink border-2 border-warmBrown flex items-center justify-center text-warmBrown text-xs"><i class="fas fa-ticket"></i></span>
        <div class="flex-1 min-w-0"><h4 class="text-sm font-bold text-warmBrown">優惠券</h4><p class="text-[10px] text-warmBrown/55">依「哪裡買」自動帶入品牌優惠券</p></div>
      </div>
      <div id="item-coupon-rows" class="space-y-2"></div>`;
  }

  const chipsRow = documentRef.getElementById('item-multi-location-chips-row');
  if (chipsRow?.parentElement) {
    if (section.parentElement !== chipsRow.parentElement || section.previousElementSibling !== chipsRow) {
      chipsRow.insertAdjacentElement('afterend', section);
    }
    return section;
  }

  if (!section.parentElement) {
    const field = documentRef.getElementById('item-multi-location-field');
    const purchaseRow = field?.parentElement;
    if (purchaseRow?.parentElement) purchaseRow.insertAdjacentElement('afterend', section);
    else field?.insertAdjacentElement?.('afterend', section);
  }
  return section;
}

function selectedRawLocations(documentRef) {
  const root = documentRef.getElementById('item-multi-location-options');
  return root ? buildLocationPickerModel(root).selected : [];
}

function button(documentRef, label, className) {
  const node = documentRef.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  return node;
}

export function renderItemCouponEditorRows({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  if (!documentRef || !windowRef) return [];
  const manager = windowRef.shoppingListCouponManager;
  const section = ensureSection(documentRef);
  const root = section?.querySelector?.('#item-coupon-rows');
  if (!section || !root || !manager) return [];

  const locations = selectedRawLocations(documentRef);
  const country = currentCountry(windowRef);
  const rows = buildItemCouponEditorRows({
    locations,
    brands: manager.brands(),
    coupons: manager.coupons(),
    country,
    todayKey: manager.todayKey()
  });

  root.replaceChildren();
  if (!locations.length) {
    const empty = documentRef.createElement('p');
    empty.className = 'text-xs text-gray-400 font-bold';
    empty.textContent = '選擇「哪裡買」後，這裡會顯示對應優惠券。';
    root.appendChild(empty);
    return rows;
  }

  for (const row of rows) {
    const item = documentRef.createElement('div');
    item.className = 'flex items-center gap-2 rounded-xl border border-warmBrown/20 bg-white/80 px-3 py-2';
    item.dataset.couponBrandId = row.brandId;
    item.dataset.couponRawLocation = row.rawLocation;

    const text = documentRef.createElement('div');
    text.className = 'flex-1 min-w-0';
    const name = documentRef.createElement('p');
    name.className = 'text-xs font-bold text-warmBrown break-words';
    name.textContent = row.displayName;
    text.appendChild(name);

    if (!row.brandId) {
      const note = documentRef.createElement('p');
      note.className = 'text-[10px] text-gray-500 mt-0.5';
      note.textContent = row.status === 'ambiguous' ? '品牌資料有衝突，請先整理品牌字典' : '需先建立品牌字典';
      text.appendChild(note);
      item.appendChild(text);
      root.appendChild(item);
      continue;
    }

    const action = button(
      documentRef,
      row.coupon ? '已設定優惠券 · 編輯' : '＋新增優惠券',
      row.coupon
        ? 'shrink-0 px-2.5 py-1.5 rounded-full border border-warmBrown bg-pastelYellow text-[10px] font-bold text-warmBrown'
        : 'shrink-0 px-2.5 py-1.5 rounded-full border border-warmBrown bg-pastelGreen text-[10px] font-bold text-warmBrown'
    );
    action.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      windowRef.shoppingListCouponManager.open({
        country,
        brandId: row.brandId,
        returnContext: { source: 'item-form' }
      });
    });
    item.append(text, action);
    root.appendChild(item);
  }
  return rows;
}

export async function initItemCouponUi({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !windowRef || !MutationObserverImpl) return () => {};
  if (windowRef.__shoppingListItemCouponUiInitialized) return () => {};
  windowRef.__shoppingListItemCouponUiInitialized = true;

  installStyles(documentRef);
  const locationRoot = await waitFor(() => documentRef.getElementById('item-multi-location-options'));
  await waitFor(() => windowRef.shoppingListCouponManager);
  ensureSection(documentRef);

  let scheduled = false;
  const render = () => renderItemCouponEditorRows({ documentRef, windowRef });
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      render();
    });
  };

  const observer = new MutationObserverImpl(schedule);
  observer.observe(locationRoot, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-pressed', 'disabled']
  });

  const modalContent = documentRef.getElementById('add-modal-content');
  const layoutObserver = modalContent ? new MutationObserverImpl((mutations) => {
    if (mutations.some((mutation) => !mutation.target?.closest?.('#item-coupon-section'))) schedule();
  }) : null;
  layoutObserver?.observe(modalContent, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  const unsubscribeCoupons = windowRef.shoppingListCouponManager.subscribe(schedule);
  windowRef.addEventListener('shopping-list:active-country-changed', schedule);
  windowRef.addEventListener('shopping-list:active-trip-changed', schedule);
  render();

  windowRef.shoppingListItemCouponUi = {
    renderItemCouponEditorRows: render
  };

  return () => {
    observer.disconnect();
    layoutObserver?.disconnect();
    unsubscribeCoupons?.();
    windowRef.removeEventListener('shopping-list:active-country-changed', schedule);
    windowRef.removeEventListener('shopping-list:active-trip-changed', schedule);
    if (windowRef.shoppingListItemCouponUi) delete windowRef.shoppingListItemCouponUi;
    windowRef.__shoppingListItemCouponUiInitialized = false;
  };
}
