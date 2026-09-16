import { resolveItemLocations } from '../pricing/location-selection.js';
import { currencyCodeForCountry } from '../pricing/country-rules.js';
import { createGoogleMapsUrl, normalizeWebsiteUrl } from './url-utils.js';

function clean(value) {
  return String(value ?? '').trim();
}

function numeric(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function currencyPrefix(currencyCode) {
  const code = clean(currencyCode).toUpperCase();
  if (code === 'TWD') return 'NT$';
  if (code === 'JPY') return '¥';
  if (code === 'KRW') return '₩';
  if (code === 'USD') return 'US$';
  if (code === 'CAD') return 'CA$';
  if (code === 'GBP') return '£';
  if (code === 'EUR') return '€';
  if (code === 'THB') return '฿';
  if (code === 'AUD') return 'AU$';
  if (code === 'SGD') return 'S$';
  if (code === 'HKD') return 'HK$';
  return code ? `${code} ` : '';
}

function formatNumber(value, currencyCode) {
  const code = clean(currencyCode).toUpperCase();
  const digits = ['JPY', 'KRW', 'TWD'].includes(code) ? 0 : 2;
  return Number(value).toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function formatPriceRange(minValue, maxValue, currencyCode) {
  const rawMin = numeric(minValue);
  const rawMax = numeric(maxValue);
  if (rawMin === null && rawMax === null) return '';
  const low = rawMin === null ? rawMax : rawMax === null ? rawMin : Math.min(rawMin, rawMax);
  const high = rawMax === null ? rawMin : rawMin === null ? rawMax : Math.max(rawMin, rawMax);
  const prefix = currencyPrefix(currencyCode);
  if (low === high) return `${prefix}${formatNumber(low, currencyCode)}`;
  return `${prefix}${formatNumber(low, currencyCode)}–${formatNumber(high, currencyCode)}`;
}

export function buildItemDetailModel(item = {}) {
  const research = item?.priceResearch && typeof item.priceResearch === 'object' ? item.priceResearch : {};
  const localCurrencyCode = clean(research.currencyCode).toUpperCase() || currencyCodeForCountry(item.country);
  const storeName = clean(item.storeName || item.storeDisplayName);
  const address = clean(item.address || item.storeAddress);

  return {
    name: clean(item.name),
    category: clean(item.category),
    locations: resolveItemLocations(item),
    purchase: {
      storeName,
      address,
      mapQuery: address || storeName
    },
    prices: {
      taiwan: formatPriceRange(research.taiwanMinTwd, research.taiwanMaxTwd, 'TWD'),
      local: formatPriceRange(research.localMin, research.localMax, localCurrencyCode),
      localCurrencyCode
    },
    website: clean(item.website),
    description: clean(item.description)
  };
}

function element(documentRef, tagName, className = '', text = '') {
  const node = documentRef.createElement(tagName);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function iconBadge(documentRef, iconClass, backgroundClass) {
  const badge = element(
    documentRef,
    'span',
    `w-10 h-10 shrink-0 rounded-full ${backgroundClass} border-2 border-warmBrown flex items-center justify-center text-warmBrown`
  );
  const icon = element(documentRef, 'i', iconClass);
  badge.appendChild(icon);
  return badge;
}

function openExternal(openWindow, url) {
  if (!url || typeof openWindow !== 'function') return;
  openWindow(url, '_blank', 'noopener,noreferrer');
}

function locationButton(documentRef, location, openWindow) {
  const button = element(
    documentRef,
    'button',
    'w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-pastelYellow/40 border-2 border-warmBrown text-left text-warmBrown shadow-[2px_2px_0_rgba(92,64,51,.12)] active:translate-y-0.5'
  );
  button.type = 'button';
  button.appendChild(iconBadge(documentRef, 'fas fa-location-dot', 'bg-pastelYellow'));
  const text = element(documentRef, 'span', 'flex-1 min-w-0 font-bold break-words', location);
  const chevron = element(documentRef, 'i', 'fas fa-chevron-right text-xs shrink-0');
  button.append(text, chevron);
  const locationMapQuery = location;
  button.addEventListener('click', () => openExternal(openWindow, createGoogleMapsUrl(locationMapQuery)));
  return button;
}

function infoRow(documentRef, { icon, iconBackground, label, value, tone = 'bg-white' }) {
  const row = element(documentRef, 'div', `flex items-start gap-3 p-4 rounded-2xl ${tone} border-2 border-warmBrown/30`);
  row.appendChild(iconBadge(documentRef, icon, iconBackground));
  const content = element(documentRef, 'div', 'flex-1 min-w-0');
  content.appendChild(element(documentRef, 'p', 'text-xs font-bold text-warmBrown/60 mb-1', label));
  content.appendChild(element(documentRef, 'p', 'font-bold text-warmBrown break-words', value || '未設定'));
  row.appendChild(content);
  return row;
}

export function ensureItemDetailViewSurface(documentRef = typeof document !== 'undefined' ? document : null) {
  if (!documentRef) return null;
  let surface = documentRef.getElementById('item-detail-view');
  if (surface) return surface;

  surface = element(documentRef, 'div', 'hidden w-full max-w-5xl mx-auto space-y-4 pb-2');
  surface.id = 'item-detail-view';

  const grid = documentRef.getElementById('photo-preview-grid');
  const photoControls = grid?.parentElement;
  if (photoControls?.parentElement) photoControls.insertAdjacentElement('afterend', surface);
  else documentRef.getElementById('add-modal-content')?.querySelector('.overflow-y-auto')?.appendChild(surface);
  return surface;
}

export function renderItemDetailView(container, item, {
  onBack,
  onEdit,
  openWindow = typeof window !== 'undefined' ? window.open.bind(window) : null
} = {}) {
  if (!container?.ownerDocument) return null;
  const documentRef = container.ownerDocument;
  const model = buildItemDetailModel(item);
  container.replaceChildren();

  const mainCard = element(
    documentRef,
    'section',
    'bg-white border-2 border-warmBrown rounded-[2rem] p-4 sm:p-5 shadow-[4px_4px_0_rgba(92,64,51,.14)] space-y-4 text-warmBrown'
  );

  const nameBlock = element(documentRef, 'div', 'px-1 pb-4 border-b-2 border-warmBrown/10');
  nameBlock.appendChild(element(documentRef, 'p', 'text-sm font-bold text-warmBrown/60 mb-1', '商品名稱'));
  nameBlock.appendChild(element(documentRef, 'h3', 'text-xl sm:text-2xl font-bold leading-snug break-words', model.name || '未設定'));
  mainCard.appendChild(nameBlock);

  mainCard.appendChild(infoRow(documentRef, {
    icon: 'fas fa-tag',
    iconBackground: 'bg-pastelBlue',
    label: '分類',
    value: model.category,
    tone: 'bg-pastelBlue/20'
  }));

  const locationsSection = element(documentRef, 'section', 'space-y-2');
  const locationsHeading = element(documentRef, 'div', 'flex items-center gap-2 px-1');
  locationsHeading.appendChild(element(documentRef, 'i', 'fas fa-store text-warmBrown'));
  locationsHeading.appendChild(element(documentRef, 'h4', 'font-bold text-warmBrown', '地點分類'));
  locationsSection.appendChild(locationsHeading);
  if (model.locations.length) {
    model.locations.forEach((location) => locationsSection.appendChild(locationButton(documentRef, location, openWindow)));
  } else {
    locationsSection.appendChild(infoRow(documentRef, {
      icon: 'fas fa-store',
      iconBackground: 'bg-pastelYellow',
      label: '可找的店家',
      value: '',
      tone: 'bg-pastelYellow/15'
    }));
  }
  mainCard.appendChild(locationsSection);

  const purchaseCard = element(
    documentRef,
    model.purchase.mapQuery ? 'button' : 'div',
    'w-full flex items-start gap-3 p-4 rounded-2xl bg-pastelGreen/30 border-2 border-warmBrown text-left text-warmBrown shadow-[2px_2px_0_rgba(92,64,51,.12)]'
  );
  if (model.purchase.mapQuery) purchaseCard.type = 'button';
  purchaseCard.appendChild(iconBadge(documentRef, 'fas fa-map-location-dot', 'bg-pastelGreen'));
  const purchaseText = element(documentRef, 'div', 'flex-1 min-w-0');
  purchaseText.appendChild(element(documentRef, 'p', 'text-sm font-bold mb-1', '哪裡買'));
  if (model.purchase.storeName) purchaseText.appendChild(element(documentRef, 'p', 'font-bold break-words', model.purchase.storeName));
  purchaseText.appendChild(element(documentRef, 'p', model.purchase.storeName ? 'text-xs text-warmBrown/70 mt-1 break-words' : 'font-bold break-words', model.purchase.address || model.purchase.storeName || '未設定'));
  if (model.purchase.mapQuery) purchaseText.appendChild(element(documentRef, 'p', 'text-[11px] text-warmBrown/55 mt-1', '點擊後在 Google Maps 開啟這個地點'));
  purchaseCard.appendChild(purchaseText);
  if (model.purchase.mapQuery) {
    purchaseCard.appendChild(element(documentRef, 'i', 'fas fa-chevron-right text-xs mt-3 shrink-0'));
    purchaseCard.addEventListener('click', () => openExternal(openWindow, createGoogleMapsUrl(model.purchase.mapQuery)));
  }
  mainCard.appendChild(purchaseCard);

  const priceCard = element(documentRef, 'section', 'rounded-2xl bg-pastelPink/25 border-2 border-warmBrown/30 p-4');
  const priceHeading = element(documentRef, 'div', 'flex items-center gap-2 mb-3');
  priceHeading.appendChild(element(documentRef, 'i', 'fas fa-coins text-warmBrown'));
  priceHeading.appendChild(element(documentRef, 'h4', 'font-bold text-warmBrown', '價格功課'));
  priceCard.appendChild(priceHeading);
  const priceGrid = element(documentRef, 'div', 'grid grid-cols-1 sm:grid-cols-2 gap-2');
  priceGrid.appendChild(infoRow(documentRef, {
    icon: 'fas fa-dollar-sign',
    iconBackground: 'bg-pastelPink',
    label: '台灣參考價',
    value: model.prices.taiwan,
    tone: 'bg-white/80'
  }));
  priceGrid.appendChild(infoRow(documentRef, {
    icon: 'fas fa-plane',
    iconBackground: 'bg-pastelYellow',
    label: '旅遊地參考價',
    value: model.prices.local,
    tone: 'bg-white/80'
  }));
  priceCard.appendChild(priceGrid);
  mainCard.appendChild(priceCard);

  const websiteRow = element(
    documentRef,
    model.website ? 'button' : 'div',
    'w-full flex items-center gap-3 p-4 rounded-2xl bg-pastelBlue/20 border-2 border-warmBrown/30 text-left text-warmBrown'
  );
  if (model.website) websiteRow.type = 'button';
  websiteRow.appendChild(iconBadge(documentRef, 'fas fa-link', 'bg-pastelBlue'));
  const websiteText = element(documentRef, 'div', 'flex-1 min-w-0');
  websiteText.appendChild(element(documentRef, 'p', 'text-xs font-bold text-warmBrown/60 mb-1', '網站'));
  websiteText.appendChild(element(documentRef, 'p', 'font-bold break-all', model.website || '未設定'));
  websiteRow.appendChild(websiteText);
  if (model.website) {
    websiteRow.appendChild(element(documentRef, 'i', 'fas fa-up-right-from-square text-xs shrink-0'));
    websiteRow.addEventListener('click', () => {
      try {
        openExternal(openWindow, normalizeWebsiteUrl(model.website));
      } catch {}
    });
  }
  mainCard.appendChild(websiteRow);
  container.appendChild(mainCard);

  if (model.description) {
    const notes = element(documentRef, 'section', 'bg-pastelYellow/20 border-2 border-warmBrown/30 rounded-[1.5rem] p-4 text-warmBrown');
    const heading = element(documentRef, 'div', 'flex items-center gap-2 mb-2 font-bold');
    heading.appendChild(element(documentRef, 'i', 'fas fa-note-sticky'));
    heading.appendChild(element(documentRef, 'span', '', '我的筆記'));
    notes.appendChild(heading);
    notes.appendChild(element(documentRef, 'p', 'text-sm whitespace-pre-wrap break-words leading-relaxed', model.description));
    container.appendChild(notes);
  }

  const actions = element(documentRef, 'div', 'grid grid-cols-2 gap-3 pt-1');
  const back = element(documentRef, 'button', 'py-3 rounded-2xl bg-white border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,.14)]', '返回');
  back.type = 'button';
  back.addEventListener('click', () => onBack?.());
  const edit = element(documentRef, 'button', 'py-3 rounded-2xl bg-pastelBlue border-2 border-warmBrown text-warmBrown font-bold shadow-[2px_2px_0_rgba(92,64,51,.18)]', '編輯商品');
  edit.type = 'button';
  edit.addEventListener('click', () => onEdit?.());
  actions.append(back, edit);
  container.appendChild(actions);

  return model;
}
