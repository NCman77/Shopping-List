import { classifyBrandInputAliases } from './brand-dictionary-core.js';

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function waitFor(predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('等待品牌字典新增畫面逾時。'));
      }
    }, 30);
  });
}

function countryButton(documentRef, country) {
  return [...documentRef.querySelectorAll('#brand-country-list button')].find((button) =>
    clean(button.querySelector('.font-bold')?.textContent) === clean(country)
  ) || null;
}

function brandCard(documentRef, brand) {
  const displayName = clean(brand?.displayName);
  const aliases = new Set((Array.isArray(brand?.aliases) ? brand.aliases : []).map((alias) => clean(alias?.value)).filter(Boolean));
  return [...documentRef.querySelectorAll('#brand-list button')].find((button) => {
    const title = clean(button.querySelector('h4')?.textContent);
    const summary = clean(button.querySelector('.brand-alias-summary')?.textContent);
    return (displayName && title === displayName) || [...aliases].some((alias) => summary.includes(alias));
  }) || null;
}

function mergePrefill(documentRef, rawLocation, existingBrand) {
  const aliases = classifyBrandInputAliases(rawLocation, documentRef.getElementById('brand-editor-country')?.textContent || '');
  for (const alias of aliases) {
    const input = [...documentRef.querySelectorAll('#brand-alias-fields .brand-alias-input')]
      .find((node) => clean(node.dataset.language) === alias.language);
    if (!input) continue;
    const current = String(input.value || '').trim();
    const values = current.split(/[\n,，、;；]+/u).map(clean).filter(Boolean);
    if (!values.some((value) => value.toLocaleLowerCase() === clean(alias.value).toLocaleLowerCase())) {
      input.value = current ? `${current}, ${alias.value}` : alias.value;
    }
  }
  if (!aliases.length && !existingBrand) {
    const display = documentRef.getElementById('brand-display-name');
    if (display && !clean(display.value)) display.value = String(rawLocation ?? '').trim();
  }
}

function removeOnboardingActions(documentRef) {
  documentRef.getElementById('brand-location-onboarding-actions')?.remove();
}

export async function initLocationBrandOnboarding({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null
} = {}) {
  if (!documentRef || !windowRef || !MutationObserverImpl) return () => {};
  if (windowRef.__shoppingListLocationBrandOnboardingInitialized) return () => {};
  windowRef.__shoppingListLocationBrandOnboardingInitialized = true;

  await waitFor(() => documentRef.getElementById('brand-dictionary-modal') && documentRef.getElementById('account-open-brand-dictionary'));

  let activeCleanup = null;

  async function openRequest({ country, rawLocation, brand = null, required = false, onComplete } = {}) {
    activeCleanup?.();
    removeOnboardingActions(documentRef);

    documentRef.getElementById('account-open-brand-dictionary')?.click();
    const countryEntry = await waitFor(() => countryButton(documentRef, country));
    countryEntry.click();

    if (brand) {
      const card = await waitFor(() => brandCard(documentRef, brand));
      card.click();
    } else {
      await waitFor(() => documentRef.getElementById('brand-add'));
      documentRef.getElementById('brand-add').click();
    }

    await waitFor(() => !documentRef.getElementById('brand-editor-view')?.classList.contains('hidden'));
    mergePrefill(documentRef, rawLocation, brand);

    const editor = documentRef.getElementById('brand-editor-view');
    const save = documentRef.getElementById('brand-editor-save');
    const body = editor?.querySelector('.overflow-y-auto');
    if (!editor || !save || !body) return;

    const originalSaveText = save.textContent;
    save.textContent = brand ? '更新品牌並加入地點' : '新增品牌並加入地點';

    const actions = documentRef.createElement('div');
    actions.id = 'brand-location-onboarding-actions';
    actions.className = 'rounded-2xl border-2 border-warmBrown/30 bg-pastelYellow/30 p-3';
    const note = documentRef.createElement('p');
    note.className = 'text-[11px] text-warmBrown font-bold leading-relaxed';
    note.textContent = brand
      ? '已找到品牌字典中的既有品牌。你可以補充其他語言，或略過補充直接加入這個地點。'
      : '品牌字典尚未有這個品牌。請先建立至少一個品牌名稱，儲存後才會加入地點。';
    actions.appendChild(note);

    let finished = false;
    let saveAttempted = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      documentRef.getElementById('brand-close')?.click();
      if (typeof onComplete === 'function') onComplete(result);
    };

    if (brand && !required) {
      const skip = documentRef.createElement('button');
      skip.type = 'button';
      skip.className = 'mt-3 w-full py-2.5 rounded-xl bg-white border-2 border-warmBrown text-warmBrown text-sm font-bold';
      skip.textContent = '略過補充，直接加入地點';
      skip.addEventListener('click', () => finish('skipped'));
      actions.appendChild(skip);
    }
    body.appendChild(actions);

    const onSaveClick = () => { saveAttempted = true; };
    save.addEventListener('click', onSaveClick, true);
    const observer = new MutationObserverImpl(() => {
      if (saveAttempted && editor.classList.contains('hidden')) finish('saved');
    });
    observer.observe(editor, { attributes: true, attributeFilter: ['class'] });

    function cleanup() {
      observer.disconnect();
      save.removeEventListener('click', onSaveClick, true);
      save.textContent = originalSaveText;
      removeOnboardingActions(documentRef);
      if (activeCleanup === cleanup) activeCleanup = null;
    }
    activeCleanup = cleanup;
  }

  const listener = (event) => void openRequest(event.detail || {}).catch((error) => {
    console.error('Location brand onboarding failed:', error);
    windowRef.showMsg?.('品牌字典開啟失敗', '無法開啟品牌字典新增畫面，地點尚未新增。', 'error');
  });
  windowRef.addEventListener('shopping-list:location-brand-onboarding', listener);

  return () => {
    activeCleanup?.();
    windowRef.removeEventListener('shopping-list:location-brand-onboarding', listener);
  };
}
