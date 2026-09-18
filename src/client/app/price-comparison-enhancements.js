import { appendComparisonHistory, removeNewestComparisonHistory } from '../pricing/comparison-history.js';
import {
  currencyCodeForCountry,
  resolveCountryPricingRule,
  taxModeById
} from '../pricing/country-rules.js';
import { convertToTwd, fetchRateToTwd } from '../pricing/exchange-rate.js';
import { resolveItemLocations, locationWritePatch, normalizeLocations } from '../pricing/location-selection.js';
import { buildTaiwanComparison, calculateLocalPrice } from '../pricing/price-calculator.js';
import {
  compareValueToRange,
  normalizePriceRange,
  normalizePriceResearch
} from '../pricing/price-range.js';
import { registerItemSaveSnapshotProvider } from './item-save-operation.js';

const APP_ID = 'japan-shopping-app';

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
        reject(new Error('等待商品比價功能初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'warn'](`${title}: ${message}`);
}

function numeric(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.abs(number).toFixed(1)}%` : '—';
}

function formatMoney(value, currencyCode = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const currency = clean(currencyCode).toUpperCase();
  const digits = ['JPY', 'KRW'].includes(currency) ? 0 : 2;
  const rounded = number.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
  if (currency === 'TWD') return `NT$${rounded}`;
  if (currency === 'JPY') return `¥${rounded}`;
  return currency ? `${currency} ${rounded}` : rounded;
}

function formatDateTime(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(number));
  } catch {
    return '';
  }
}

function cardItemId(card) {
  const enhanced = clean(card?.dataset?.enhancedItemId);
  if (enhanced) return enhanced;
  const source = card?.querySelector?.('[onclick*="openEditModal"]')?.getAttribute?.('onclick') || '';
  return source.match(/openEditModal\(['"]([^'"]+)['"]\)/)?.[1] || '';
}

function installStyles() {
  if (document.getElementById('price-comparison-styles')) return;
  const style = document.createElement('style');
  style.id = 'price-comparison-styles';
  style.textContent = `
    #item-location-pricing-legacy { display: none !important; }
    .multi-location-choice[aria-pressed="true"] { background: #D5E5F2; box-shadow: 2px 2px 0 rgba(92,64,51,.22); }
    #location-filters .loc-btn.multi-location-filter-selected { background: #D5E5F2 !important; color: #5C4033 !important; box-shadow: 2px 2px 0 rgba(92,64,51,1) !important; }
    #location-filters .loc-btn.multi-location-filter-unselected { background: white !important; color: #6b7280 !important; box-shadow: none !important; }
    .workflow-view-mode .multi-location-choice:disabled { opacity: .65; cursor: default; }
    .price-compare-action { white-space: nowrap; }
    #price-comparison-modal input:focus, #price-comparison-modal select:focus { outline: none; box-shadow: 0 0 0 2px rgba(92,64,51,.15); }
  `;
  document.head.appendChild(style);
}

function ensureResearchFields() {
  let section = document.getElementById('price-research-section');
  if (section) return section;
  const row = document.getElementById('item-purchase-meta-row')
    || document.getElementById('item-location')?.closest('.flex-1')?.parentElement;
  if (!row) return null;
  section = document.createElement('section');
  section.id = 'price-research-section';
  section.className = 'border-2 border-warmBrown/25 bg-pastelYellow/20 rounded-2xl p-4 space-y-3';
  section.innerHTML = `
    <div>
      <h3 class="text-sm font-bold text-warmBrown">價格功課</h3>
      <p class="text-[11px] text-gray-400 mt-1">先記台灣與旅遊地參考價；現場售價與優惠券到「比價」再輸入。</p>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <label class="text-xs font-bold text-warmBrown">台灣最低價 NT$
        <input id="item-price-tw-min" class="price-edit-control mt-1 w-full bg-white border-2 border-warmBrown rounded-xl px-3 py-2 font-medium" inputmode="decimal" type="number" min="0" step="any" placeholder="399">
      </label>
      <label class="text-xs font-bold text-warmBrown">台灣最高價 NT$
        <input id="item-price-tw-max" class="price-edit-control mt-1 w-full bg-white border-2 border-warmBrown rounded-xl px-3 py-2 font-medium" inputmode="decimal" type="number" min="0" step="any" placeholder="699">
      </label>
      <label class="text-xs font-bold text-warmBrown">當地最低價
        <input id="item-price-local-min" class="price-edit-control mt-1 w-full bg-white border-2 border-warmBrown rounded-xl px-3 py-2 font-medium" inputmode="decimal" type="number" min="0" step="any" placeholder="1280">
      </label>
      <label class="text-xs font-bold text-warmBrown">當地最高價
        <input id="item-price-local-max" class="price-edit-control mt-1 w-full bg-white border-2 border-warmBrown rounded-xl px-3 py-2 font-medium" inputmode="decimal" type="number" min="0" step="any" placeholder="1680">
      </label>
    </div>`;
  row.insertAdjacentElement('afterend', section);
  return section;
}

function ensureMultiLocationField() {
  const legacy = document.getElementById('item-location');
  if (!legacy) return null;
  const legacyField = legacy.closest('.flex-1') || legacy.parentElement?.parentElement;
  if (legacyField) legacyField.id = 'item-location-pricing-legacy';

  let field = document.getElementById('item-multi-location-field');
  if (field) return field;
  field = document.createElement('div');
  field.id = 'item-multi-location-field';
  field.className = 'min-w-0';
  field.innerHTML = `
    <label class="block text-sm font-bold text-warmBrown mb-2 ml-1">哪裡買</label>
    <div id="item-multi-location-options" class="flex flex-wrap gap-2 min-h-11 rounded-2xl border-2 border-warmBrown bg-shinBg p-2"></div>`;
  const row = document.getElementById('item-purchase-meta-row') || legacyField?.parentElement;
  const storeField = document.getElementById('item-store-field');
  if (row) {
    if (storeField?.parentElement === row) row.insertBefore(field, storeField);
    else row.appendChild(field);
  } else legacyField?.insertAdjacentElement('afterend', field);
  return field;
}

function ensureComparisonModal() {
  let modal = document.getElementById('price-comparison-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'price-comparison-modal';
  modal.className = 'fixed inset-0 z-[110] hidden bg-warmBrown/50 backdrop-blur-sm px-3 py-4 items-end sm:items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-md max-h-[92vh] overflow-y-auto bg-shinBg border-4 border-warmBrown rounded-[2rem] shadow-[8px_8px_0_rgba(92,64,51,.28)]">
      <div class="sticky top-0 z-10 flex items-center justify-between gap-3 bg-pastelYellow border-b-4 border-warmBrown px-5 py-4 rounded-t-[1.7rem]">
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-wider font-bold text-warmBrown/60">現場比價</p>
          <h2 id="compare-item-name" class="font-bold text-warmBrown truncate">商品比價</h2>
        </div>
        <button id="close-price-comparison" type="button" class="shrink-0 w-9 h-9 rounded-full bg-white border-2 border-warmBrown text-warmBrown"><i class="fas fa-times"></i></button>
      </div>
      <div class="p-5 space-y-5 bg-white">
        <section id="compare-research-card" class="w-full rounded-[1.5rem] border-4 border-warmBrown bg-pastelYellow/20 p-4 space-y-2">
          <h3 class="text-sm font-bold text-warmBrown">價格功課</h3>
          <div id="compare-research-summary" class="text-xs text-gray-600 space-y-1"></div>
        </section>

        <section id="compare-live-card" class="w-full rounded-[1.5rem] border-4 border-warmBrown bg-pastelBlue/25 p-4 space-y-3">
          <h3 class="text-sm font-bold text-warmBrown">現場比價</h3>
          <div class="grid grid-cols-3 gap-2 sm:gap-3">
            <label class="min-w-0 text-[11px] sm:text-xs font-bold text-warmBrown">目前店價
              <input id="compare-store-price" type="number" min="0" step="any" inputmode="decimal" class="mt-1 w-full min-w-0 rounded-xl border-2 border-warmBrown bg-white px-2 sm:px-3 py-2.5" placeholder="1480">
            </label>
            <label class="min-w-0 text-[11px] sm:text-xs font-bold text-warmBrown">優惠券 %
              <input id="compare-coupon-percent" type="number" min="0" max="100" step="any" inputmode="decimal" class="mt-1 w-full min-w-0 rounded-xl border-2 border-warmBrown bg-white px-2 sm:px-3 py-2.5" placeholder="10">
            </label>
            <label class="min-w-0 text-[11px] sm:text-xs font-bold text-warmBrown">免稅/退稅
              <select id="compare-tax-mode" class="mt-1 w-full min-w-0 rounded-xl border-2 border-warmBrown bg-white px-2 py-2.5 text-[11px] sm:text-xs"></select>
            </label>
          </div>
        </section>

        <section id="compare-estimate-card" class="w-full rounded-[1.5rem] border-4 border-warmBrown bg-pastelGreen/25 p-4 text-center">
          <p class="text-xs font-bold text-warmBrown/65">預估到手價</p>
          <div id="compare-final-local" class="mt-1 text-3xl font-black text-warmBrown">—</div>
          <div id="compare-final-twd" class="mt-1 text-lg font-bold text-warmBrown/80">—</div>
          <div id="compare-headline" class="mt-3 text-sm font-black text-warmBrown"></div>
        </section>

        <section id="compare-details" class="rounded-2xl border-2 border-warmBrown/20 p-4 text-xs text-gray-600 space-y-1"></section>

        <section class="rounded-2xl border-2 border-warmBrown/15 bg-gray-50 p-3">
          <div id="compare-fx-status" class="text-[11px] text-gray-500"></div>
        </section>

        <div class="grid grid-cols-2 gap-3">
          <button id="save-comparison-history" type="button" class="w-full py-3 rounded-xl bg-pastelPink border-2 border-warmBrown text-warmBrown font-bold shadow-[3px_3px_0_rgba(92,64,51,.22)] disabled:opacity-40 disabled:shadow-none">保存</button>
          <button id="delete-comparison-history" type="button" class="w-full py-3 rounded-xl bg-pastelOrange/70 border-2 border-warmBrown text-warmBrown font-bold shadow-[3px_3px_0_rgba(92,64,51,.22)] disabled:opacity-40 disabled:shadow-none">刪除</button>
        </div>
        <p id="compare-history-status" class="min-h-4 text-center text-[11px] text-gray-500"></p>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function inputValue(id) {
  return document.getElementById(id)?.value ?? '';
}

export async function initPriceComparisonEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__shoppingListPriceComparisonInitialized) return;
  window.__shoppingListPriceComparisonInitialized = true;

  installStyles();
  await waitFor(() => (
    window.__shoppingListTripSaveGuardReady === true
    && typeof window.saveItem === 'function'
    && typeof window.openAddModal === 'function'
    && typeof window.openEditModal === 'function'
    && document.getElementById('item-location')
  ));

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot, updateDoc } = firestoreSdk;

  const state = {
    userId: auth.currentUser?.uid || '',
    items: new Map(),
    itemUnsub: null,
    selectedLocations: [],
    locationFilter: 'all',
    normalizingBaseFilter: false,
    compareItemId: '',
    compareRule: null,
    compareFx: null,
    compareFxLoading: false,
    compareRequestId: 0,
    lastCalculation: null
  };

  ensureMultiLocationField();
  ensureResearchFields();
  const compareModal = ensureComparisonModal();

  function availableLocations() {
    const select = document.getElementById('item-location');
    return normalizeLocations([...(select?.options || [])].map((option) => option.value));
  }

  function ensureLegacyOption(value) {
    const select = document.getElementById('item-location');
    const location = clean(value);
    if (!select || !location) return;
    if ([...select.options].some((option) => option.value === location)) return;
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    option.dataset.pricingTemporary = 'true';
    select.appendChild(option);
  }

  function syncLegacyLocation() {
    const select = document.getElementById('item-location');
    if (!select) return;
    const first = state.selectedLocations[0] || '';
    if (first) ensureLegacyOption(first);
    select.value = first;
  }

  function renderLocationChoices() {
    ensureMultiLocationField();
    const root = document.getElementById('item-multi-location-options');
    if (!root) return;
    const choices = normalizeLocations([...availableLocations(), ...state.selectedLocations]);
    root.replaceChildren();
    if (!choices.length) {
      root.innerHTML = '<span class="px-2 py-1 text-xs text-gray-400">請先新增地點</span>';
      return;
    }
    const activeDefinitions = new Set(availableLocations());
    for (const location of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'multi-location-control multi-location-choice px-3 py-1.5 rounded-full border-2 border-warmBrown text-xs font-bold text-warmBrown bg-white';
      button.dataset.location = location;
      button.setAttribute('aria-pressed', state.selectedLocations.includes(location) ? 'true' : 'false');
      button.textContent = activeDefinitions.has(location) ? location : `${location}（舊）`;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const selected = state.selectedLocations.includes(location);
        state.selectedLocations = selected
          ? state.selectedLocations.filter((value) => value !== location)
          : normalizeLocations([...state.selectedLocations, location]);
        syncLegacyLocation();
        renderLocationChoices();
      });
      root.appendChild(button);
    }
  }

  function setInput(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value == null ? '' : String(value);
  }

  function clearFormPricing() {
    state.selectedLocations = [];
    setInput('item-price-tw-min', '');
    setInput('item-price-tw-max', '');
    setInput('item-price-local-min', '');
    setInput('item-price-local-max', '');
    syncLegacyLocation();
    renderLocationChoices();
  }

  function populateFormPricing(item = {}) {
    state.selectedLocations = resolveItemLocations(item);
    const research = item?.priceResearch || {};
    setInput('item-price-tw-min', research.taiwanMinTwd);
    setInput('item-price-tw-max', research.taiwanMaxTwd);
    setInput('item-price-local-min', research.localMin);
    setInput('item-price-local-max', research.localMax);
    syncLegacyLocation();
    renderLocationChoices();
  }

  function buildFormPatch() {
    const locationPatch = locationWritePatch(state.selectedLocations);
    const country = clean(window.shoppingListActiveTrip?.country);
    const priceResearch = normalizePriceResearch({
      taiwanMinTwd: inputValue('item-price-tw-min'),
      taiwanMaxTwd: inputValue('item-price-tw-max'),
      localMin: inputValue('item-price-local-min'),
      localMax: inputValue('item-price-local-max'),
      currencyCode: currencyCodeForCountry(country),
      updatedAt: Date.now()
    });
    return { ...locationPatch, priceResearch };
  }

  registerItemSaveSnapshotProvider('price-comparison', () => {
    syncLegacyLocation();
    return buildFormPatch();
  });

  function compareCurrency(item) {
    return clean(state.compareRule?.currencyCode || item?.priceResearch?.currencyCode || currencyCodeForCountry(item?.country));
  }

  function effectiveTripDate() {
    return clean(window.shoppingListActiveTrip?.startDate) || new Date().toISOString().slice(0, 10);
  }

  function renderResearch(item) {
    const root = document.getElementById('compare-research-summary');
    if (!root) return;
    const research = item?.priceResearch || {};
    const tw = normalizePriceRange(research.taiwanMinTwd, research.taiwanMaxTwd);
    const local = normalizePriceRange(research.localMin, research.localMax);
    const currency = compareCurrency(item);
    const twText = tw.low == null
      ? '未設定'
      : tw.low === tw.high ? formatMoney(tw.low, 'TWD') : `${formatMoney(tw.low, 'TWD')} ～ ${formatMoney(tw.high, 'TWD')}`;
    const localText = local.low == null
      ? '未設定'
      : local.low === local.high ? formatMoney(local.low, currency) : `${formatMoney(local.low, currency)} ～ ${formatMoney(local.high, currency)}`;
    root.innerHTML = `
      <div><span class="font-bold text-warmBrown">台灣參考：</span>${twText}</div>
      <div><span class="font-bold text-warmBrown">當地參考：</span>${localText}</div>`;
  }

  function renderTaxModes() {
    const select = document.getElementById('compare-tax-mode');
    if (!select) return;
    const modes = Array.isArray(state.compareRule?.taxModes) ? state.compareRule.taxModes : [];
    if (!modes.length) {
      select.innerHTML = '<option value="none">未設定免稅</option>';
      select.disabled = true;
      select.classList.add('opacity-60');
    } else {
      select.disabled = false;
      select.classList.remove('opacity-60');
      select.innerHTML = modes.map((mode) => `<option value="${mode.id}">${mode.label}</option>`).join('');
    }
  }

  function renderFxStatus() {
    const status = document.getElementById('compare-fx-status');
    if (!status) return;
    if (state.compareFxLoading) {
      status.textContent = '正在取得最新匯率…';
      return;
    }
    const fx = state.compareFx;
    if (!fx?.rateToTwd) {
      status.textContent = '匯率暫時無法取得；仍可使用當地幣別比價。';
      return;
    }
    if (fx.source === 'stale-cache') {
      status.textContent = `目前使用快取匯率${formatDateTime(fx.updatedAt) ? `（來源更新 ${formatDateTime(fx.updatedAt)}）` : ''}，可能已超過 24 小時。`;
    } else {
      status.textContent = `匯率：1 ${fx.currencyCode} ≈ ${Number(fx.rateToTwd).toFixed(4)} TWD${formatDateTime(fx.updatedAt) ? ` · 更新 ${formatDateTime(fx.updatedAt)}` : ''}`;
    }
  }

  function comparisonLine(label, percent) {
    const number = Number(percent);
    if (!Number.isFinite(number)) return '';
    if (Math.abs(number) < 0.05) return `${label}：幾乎相同`;
    return `${label}：${number > 0 ? '便宜' : '貴'} ${formatPercent(number)}`;
  }

  function calculateAndRender() {
    const item = state.items.get(state.compareItemId);
    if (!item) return null;
    const currency = compareCurrency(item);
    const taxSelect = document.getElementById('compare-tax-mode');
    const selectedMode = taxModeById(state.compareRule, taxSelect?.value);
    const calculation = calculateLocalPrice({
      storePrice: inputValue('compare-store-price'),
      couponPercent: inputValue('compare-coupon-percent'),
      taxRate: selectedMode?.taxRate ?? null
    });
    const estimatedTwd = calculation.estimatedFinalPrice == null
      ? null
      : convertToTwd(calculation.estimatedFinalPrice, state.compareFx?.rateToTwd);
    const taiwan = buildTaiwanComparison({ estimatedTwd, research: item.priceResearch || {} });
    const localRange = normalizePriceRange(item?.priceResearch?.localMin, item?.priceResearch?.localMax);
    const localComparison = calculation.estimatedFinalPrice == null
      ? null
      : compareValueToRange(calculation.estimatedFinalPrice, localRange);

    const localOutput = document.getElementById('compare-final-local');
    const twdOutput = document.getElementById('compare-final-twd');
    const headline = document.getElementById('compare-headline');
    const details = document.getElementById('compare-details');
    const saveButton = document.getElementById('save-comparison-history');
    const deleteButton = document.getElementById('delete-comparison-history');

    if (localOutput) localOutput.textContent = calculation.estimatedFinalPrice == null ? '—' : formatMoney(calculation.estimatedFinalPrice, currency);
    if (twdOutput) twdOutput.textContent = estimatedTwd == null ? '約合台幣 —' : `≈ ${formatMoney(estimatedTwd, 'TWD')}`;
    if (headline) {
      if (!taiwan) headline.textContent = estimatedTwd == null ? '' : '未設定台灣參考價';
      else if (taiwan.direction === 'same') headline.textContent = '與台灣常見價幾乎相同';
      else headline.textContent = `比台灣常見價${taiwan.direction === 'cheaper' ? '便宜' : '貴'} ${formatPercent(taiwan.percentDifference)}`;
    }

    const detailLines = [];
    if (calculation.postCouponPrice != null) detailLines.push(`優惠後：${formatMoney(calculation.postCouponPrice, currency)}`);
    if (taiwan) {
      detailLines.push(comparisonLine('比台灣最低價', taiwan.versusLowPercent));
      detailLines.push(comparisonLine('比台灣最高價', taiwan.versusHighPercent));
    }
    if (localComparison) {
      detailLines.push(comparisonLine('比當地參考最低價', localComparison.versusLowPercent));
      detailLines.push(comparisonLine('比當地參考最高價', localComparison.versusHighPercent));
    }
    if (details) details.innerHTML = detailLines.filter(Boolean).map((line) => `<div>${line}</div>`).join('') || '<div class="text-gray-400">輸入目前店價後會自動計算。</div>';
    if (saveButton) saveButton.disabled = calculation.estimatedFinalPrice == null;
    if (deleteButton) deleteButton.disabled = !Array.isArray(item.priceComparisons) || item.priceComparisons.length === 0;

    state.lastCalculation = {
      item,
      currency,
      selectedMode,
      calculation,
      estimatedTwd,
      taiwan,
      localComparison
    };
    renderFxStatus();
    return state.lastCalculation;
  }

  function closeComparisonModal() {
    state.compareRequestId += 1;
    state.compareItemId = '';
    state.compareRule = null;
    state.compareFx = null;
    state.compareFxLoading = false;
    state.lastCalculation = null;
    compareModal.classList.add('hidden');
    compareModal.classList.remove('flex');
  }

  async function openComparisonModal(itemId) {
    const item = state.items.get(clean(itemId));
    if (!item) {
      notify('無法比價', '找不到這個商品的最新資料。', 'error');
      return;
    }
    const country = clean(item.country || window.shoppingListActiveTrip?.country);
    state.compareItemId = item.id;
    state.compareRule = resolveCountryPricingRule(country, effectiveTripDate());
    state.compareFx = null;
    state.compareFxLoading = true;
    state.lastCalculation = null;
    const requestId = ++state.compareRequestId;

    document.getElementById('compare-item-name').textContent = item.name || '商品比價';
    document.getElementById('compare-store-price').value = '';
    document.getElementById('compare-coupon-percent').value = '';
    document.getElementById('compare-history-status').textContent = '';
    renderResearch(item);
    renderTaxModes();
    renderFxStatus();
    calculateAndRender();
    compareModal.classList.remove('hidden');
    compareModal.classList.add('flex');

    const currency = compareCurrency(item);
    const fx = await fetchRateToTwd({
      currencyCode: currency,
      storage: window.localStorage
    });
    if (requestId !== state.compareRequestId || state.compareItemId !== item.id) return;
    state.compareFx = fx;
    state.compareFxLoading = false;
    calculateAndRender();
  }

  function ensureCompareAction(card) {
    const itemId = cardItemId(card);
    if (!itemId || !state.items.has(itemId)) return;
    const purchaseLabel = card.querySelector('input.custom-checkbox')?.closest('label');
    const row = purchaseLabel?.parentElement;
    if (!row) return;
    let button = row.querySelector('.price-compare-action');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'price-compare-action px-3 py-1.5 rounded-full border-2 border-warmBrown bg-pastelBlue text-warmBrown text-xs font-bold shadow-[2px_2px_0_rgba(92,64,51,.16)]';
      button.innerHTML = '<span>比價</span>';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openComparisonModal(itemId);
      });
      row.insertBefore(button, row.firstChild);
      row.classList.add('gap-2');
    }
  }

  function ensureCompareActions() {
    const list = document.getElementById('item-list');
    if (!list) return;
    for (const card of [...list.children]) {
      if (!card.id) ensureCompareAction(card);
    }
  }

  const legacySelect = document.getElementById('item-location');
  if (legacySelect) {
    new MutationObserver(() => renderLocationChoices()).observe(legacySelect, { childList: true });
  }

  const originalOpenAdd = window.openAddModal;
  window.openAddModal = function(...args) {
    const result = originalOpenAdd.apply(this, args);
    ensureMultiLocationField();
    ensureResearchFields();
    clearFormPricing();
    return result;
  };

  const originalOpenEdit = window.openEditModal;
  window.openEditModal = function(itemId, ...args) {
    const result = originalOpenEdit.call(this, itemId, ...args);
    ensureMultiLocationField();
    ensureResearchFields();
    populateFormPricing(state.items.get(clean(itemId)) || {});
    return result;
  };

  const originalSave = window.saveItem;
  window.saveItem = async function(...args) {
    const operation = args[0]?.operationId
      ? args[0]
      : window.beginShoppingListSaveOperation();
    if (!operation) return null;
    const patch = operation.extensions?.['price-comparison'];
    const result = await originalSave.apply(this, [operation, ...args.slice(1)]);
    const succeeded = Boolean(
      result?.succeeded
      && result.operationId === operation.operationId
      && result.itemId === operation.itemId
      && result.userId === operation.userId
      && auth.currentUser?.uid === operation.userId
    );
    if (!succeeded) return result;
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'users', operation.userId, 'items', operation.itemId), patch);
    } catch (error) {
      console.error('Price research / multi-location save failed:', error);
      notify('價格資料儲存失敗', '商品本身已儲存，但價格功課或多地點沒有成功同步，請再編輯一次。', 'error');
    }
    return result;
  };

  function styleLocationFilterButtons() {
    document.querySelectorAll('#location-filters .loc-btn').forEach((button) => {
      const active = clean(button.dataset.loc) === state.locationFilter;
      button.classList.toggle('multi-location-filter-selected', active);
      button.classList.toggle('multi-location-filter-unselected', !active);
    });
  }

  function publishLocationFilter(value) {
    state.locationFilter = clean(value) || 'all';
    window.shoppingListMultiLocationFilter = state.locationFilter;
    styleLocationFilterButtons();
    window.dispatchEvent(new CustomEvent('shopping-list:multi-location-filter-changed', {
      detail: { location: state.locationFilter }
    }));
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#location-filters .loc-btn');
    if (!button || state.normalizingBaseFilter) return;
    const selected = clean(button.dataset.loc) || 'all';
    publishLocationFilter(selected);
    queueMicrotask(() => {
      if (selected !== 'all') {
        const allButton = document.querySelector('#location-filters .loc-btn[data-loc="all"]');
        if (allButton) {
          state.normalizingBaseFilter = true;
          try { allButton.click(); } finally { state.normalizingBaseFilter = false; }
        }
      }
      publishLocationFilter(selected);
    });
  }, true);

  const locationFilterRoot = document.getElementById('location-filters');
  if (locationFilterRoot) {
    new MutationObserver(() => queueMicrotask(styleLocationFilterButtons)).observe(locationFilterRoot, { childList: true });
  }

  window.addEventListener('shopping-list:active-trip-changed', () => publishLocationFilter('all'));
  publishLocationFilter('all');

  document.getElementById('close-price-comparison')?.addEventListener('click', closeComparisonModal);
  compareModal.addEventListener('click', (event) => {
    if (event.target === compareModal) closeComparisonModal();
  });
  document.getElementById('compare-store-price')?.addEventListener('input', calculateAndRender);
  document.getElementById('compare-coupon-percent')?.addEventListener('input', calculateAndRender);
  document.getElementById('compare-tax-mode')?.addEventListener('change', calculateAndRender);
  document.getElementById('save-comparison-history')?.addEventListener('click', async () => {
    const current = calculateAndRender();
    if (current?.calculation?.estimatedFinalPrice == null || !state.userId || !state.compareItemId) return;
    const status = document.getElementById('compare-history-status');
    const item = state.items.get(state.compareItemId);
    const record = {
      createdAt: Date.now(),
      country: clean(item?.country || window.shoppingListActiveTrip?.country),
      currencyCode: current.currency,
      storePrice: current.calculation.storePrice,
      couponPercent: current.calculation.couponPercent,
      taxMode: current.selectedMode?.id || 'none',
      taxRate: current.selectedMode?.taxRate ?? null,
      exchangeRateToTwd: state.compareFx?.rateToTwd ?? null,
      rateUpdatedAt: state.compareFx?.updatedAt ?? null,
      postCouponPrice: current.calculation.postCouponPrice,
      estimatedFinalPrice: current.calculation.estimatedFinalPrice,
      estimatedTwd: current.estimatedTwd
    };
    const priceComparisons = appendComparisonHistory(item?.priceComparisons, record, 20);
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', state.compareItemId), { priceComparisons });
      state.items.set(item.id, { ...item, priceComparisons });
      if (status) status.textContent = '已保存這次比價紀錄。';
      calculateAndRender();
    } catch (error) {
      console.error('Comparison history save failed:', error);
      if (status) status.textContent = '比較紀錄儲存失敗；目前畫面的計算結果仍可正常使用。';
    }
  });
  document.getElementById('delete-comparison-history')?.addEventListener('click', async () => {
    const status = document.getElementById('compare-history-status');
    const item = state.items.get(state.compareItemId);
    if (!item || !state.userId || !state.compareItemId) return;
    if (!Array.isArray(item.priceComparisons) || item.priceComparisons.length === 0) {
      if (status) status.textContent = '目前沒有可刪除的比價紀錄。';
      calculateAndRender();
      return;
    }
    const priceComparisons = removeNewestComparisonHistory(item.priceComparisons);
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.userId, 'items', state.compareItemId), { priceComparisons });
      state.items.set(item.id, { ...item, priceComparisons });
      if (status) status.textContent = '已刪除最近一筆比價紀錄。';
      calculateAndRender();
    } catch (error) {
      console.warn('Comparison history delete failed:', error);
      if (status) status.textContent = '比較紀錄刪除失敗；不影響商品資料與目前試算。';
    }
  });

  const itemList = document.getElementById('item-list');
  if (itemList) {
    new MutationObserver(() => queueMicrotask(ensureCompareActions)).observe(itemList, { childList: true, subtree: false });
  }

  function subscribeUser(user) {
    state.itemUnsub?.();
    state.itemUnsub = null;
    state.userId = user?.uid || '';
    state.items = new Map();
    closeComparisonModal();
    if (!user) return;
    const itemsRef = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'items');
    state.itemUnsub = onSnapshot(itemsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.items = new Map(snapshot.docs.map((itemDoc) => [itemDoc.id, { id: itemDoc.id, ...itemDoc.data() }]));
      queueMicrotask(ensureCompareActions);
      if (state.compareItemId && state.items.has(state.compareItemId)) {
        renderResearch(state.items.get(state.compareItemId));
        calculateAndRender();
      }
    }, (error) => console.error('Price comparison item listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  renderLocationChoices();
  ensureCompareActions();
}
