import {
  addLocationSelection,
  availableLocationChoices,
  normalizeLocations,
  removeLocationSelection
} from '../pricing/location-selection.js';

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
        reject(new Error('等待「哪裡買」選擇器初始化逾時。'));
      }
    }, 40);
  });
}

function installStyles(documentRef) {
  if (!documentRef?.head || documentRef.getElementById('location-picker-chip-styles')) return;
  const style = documentRef.createElement('style');
  style.id = 'location-picker-chip-styles';
  style.textContent = `
    #item-multi-location-options { display: none !important; }
    .workflow-view-mode #item-multi-location-select-wrapper { display: none !important; }
    .workflow-view-mode .multi-location-remove { display: none !important; }
    .workflow-view-mode #item-multi-location-chips { margin-top: 0 !important; }
  `;
  documentRef.head.appendChild(style);
}

function locationButtons(root) {
  return [...(root?.querySelectorAll?.('.multi-location-choice[data-location]') || [])];
}

function activeLocationDefinitions(root, buttons) {
  const legacySelect = root?.ownerDocument?.getElementById?.('item-location');
  if (legacySelect?.options) {
    return normalizeLocations([...legacySelect.options]
      .filter((option) => option?.dataset?.pricingTemporary !== 'true')
      .map((option) => option.value));
  }
  return normalizeLocations(buttons
    .filter((button) => {
      const location = clean(button.dataset?.location);
      return clean(button.textContent) !== `${location}（舊）`;
    })
    .map((button) => button.dataset?.location));
}

export function buildLocationPickerModel(root) {
  const buttons = locationButtons(root);
  const definitions = activeLocationDefinitions(root, buttons);
  const selected = normalizeLocations(buttons
    .filter((button) => button.getAttribute?.('aria-pressed') === 'true')
    .map((button) => button.dataset?.location));
  return {
    definitions,
    selected,
    selectable: availableLocationChoices(definitions, selected)
  };
}

function findLocationButton(root, location) {
  const target = clean(location);
  return locationButtons(root).find((button) => clean(button.dataset?.location) === target) || null;
}

function pickerLabelForLocation(root, location) {
  const button = findLocationButton(root, location);
  return clean(button?.dataset?.brandLocationPickerLabel) || clean(location);
}

function ensureCompactUi(root, documentRef) {
  const field = root?.closest?.('#item-multi-location-field') || root?.parentElement;
  if (!field) return null;
  let wrapper = documentRef.getElementById('item-multi-location-compact');
  if (wrapper) return wrapper;

  wrapper = documentRef.createElement('div');
  wrapper.id = 'item-multi-location-compact';
  wrapper.innerHTML = `
    <div id="item-multi-location-select-wrapper">
      <select id="item-multi-location-select" class="multi-location-control w-full bg-shinBg border-2 border-warmBrown rounded-2xl px-3 py-3 focus:outline-none focus:bg-white focus:border-4 transition-all font-medium text-warmBrown min-w-0">
        <option value="">選擇購買地點</option>
      </select>
    </div>
    <div id="item-multi-location-chips" class="flex flex-nowrap overflow-x-auto no-scrollbar gap-2 mt-2 min-h-8 pb-1 sm:flex-wrap sm:overflow-visible"></div>`;
  root.insertAdjacentElement('afterend', wrapper);
  return wrapper;
}

function renderPicker(root, documentRef) {
  ensureCompactUi(root, documentRef);
  const select = documentRef.getElementById('item-multi-location-select');
  const chips = documentRef.getElementById('item-multi-location-chips');
  if (!select || !chips) return;

  const model = buildLocationPickerModel(root);
  select.replaceChildren();
  const placeholder = documentRef.createElement('option');
  placeholder.value = '';
  placeholder.selected = true;
  placeholder.textContent = !model.definitions.length
    ? '請先新增地點'
    : !model.selectable.length
      ? '已全部選擇'
      : '選擇購買地點';
  select.appendChild(placeholder);
  select.disabled = !model.selectable.length;

  for (const location of model.selectable) {
    const option = documentRef.createElement('option');
    option.value = location;
    option.textContent = pickerLabelForLocation(root, location);
    select.appendChild(option);
  }

  chips.replaceChildren();
  if (!model.selected.length) {
    const empty = documentRef.createElement('span');
    empty.className = 'shrink-0 px-1 py-1 text-xs text-gray-400';
    empty.textContent = '尚未選擇地點';
    chips.appendChild(empty);
    return;
  }

  const activeDefinitions = new Set(model.definitions);
  for (const location of model.selected) {
    const chip = documentRef.createElement('span');
    chip.className = 'relative inline-flex shrink-0 items-center rounded-full border-2 border-warmBrown bg-pastelBlue pl-3 pr-7 py-1.5 text-xs font-bold text-warmBrown shadow-[2px_2px_0_rgba(92,64,51,.14)]';

    const label = documentRef.createElement('span');
    label.textContent = activeDefinitions.has(location) ? location : `${location}（舊）`;
    chip.appendChild(label);

    const remove = documentRef.createElement('button');
    remove.type = 'button';
    remove.className = 'multi-location-control multi-location-remove absolute -top-1 -right-1 w-5 h-5 rounded-full border border-warmBrown bg-white text-warmBrown leading-none flex items-center justify-center';
    remove.dataset.location = location;
    remove.setAttribute('aria-label', `移除${location}`);
    remove.textContent = '×';
    remove.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = buildLocationPickerModel(root);
      const next = removeLocationSelection(current.selected, location);
      if (next.length === current.selected.length) return;
      const button = findLocationButton(root, location);
      if (button && !button.disabled) button.click();
    });
    chip.appendChild(remove);
    chips.appendChild(chip);
  }
}

export async function initLocationPickerChips({
  documentRef = typeof document !== 'undefined' ? document : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !MutationObserverImpl) return () => {};
  if (documentRef.documentElement?.dataset?.locationPickerChipsInitialized === 'true') return () => {};

  installStyles(documentRef);
  const root = await waitFor(() => documentRef.getElementById('item-multi-location-options'));
  if (!root) return () => {};
  if (documentRef.documentElement?.dataset) documentRef.documentElement.dataset.locationPickerChipsInitialized = 'true';

  ensureCompactUi(root, documentRef);
  const select = documentRef.getElementById('item-multi-location-select');
  select?.addEventListener('change', () => {
    const value = clean(select.value);
    if (!value) return;
    const current = buildLocationPickerModel(root);
    const next = addLocationSelection(current.selected, value);
    select.value = '';
    if (next.length === current.selected.length) return;
    const button = findLocationButton(root, value);
    if (button && !button.disabled) button.click();
  });

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      renderPicker(root, documentRef);
    });
  };
  const observer = new MutationObserverImpl(schedule);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-pressed', 'disabled', 'data-brand-location-picker-label']
  });

  renderPicker(root, documentRef);
  return () => observer.disconnect();
}
