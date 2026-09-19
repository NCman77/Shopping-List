import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('brand dictionary entry is inserted immediately before personalization', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /account-open-brand-dictionary/);
  assert.match(source, /account-open-personalization/);
  assert.match(source, /root\.insertBefore\(button, personalizationButton\)/);
});

test('country view contains brand cards only and cards open an editor that can delete existing brands', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /brand-country-list/);
  assert.match(source, /brand-list/);
  assert.match(source, /card\.addEventListener\('click', \(\) => openEditor\(brand\)\)/);
  assert.match(source, /brand-editor-delete/);
  assert.match(source, /removeBrand\(brand\)/);
  assert.doesNotMatch(source, /class="brand-edit/);
  assert.doesNotMatch(source, /class="brand-delete/);
});

test('language management lives in the brand editor below alias fields and is saved with the brand', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /id="brand-alias-fields"/);
  assert.match(source, /id="brand-language-section"/);
  assert.match(source, /id="brand-language-input"/);
  assert.match(source, /新增語言/);
  assert.match(source, /draftLanguageFields/);
  assert.match(source, /persistBrandDictionary/);
  assert.match(source, /brandLanguageFields/);
});

test('brand storage uses the already-authorized settings brandDictionary document instead of a new brands collection', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /settings', 'brandDictionary'/);
  assert.doesNotMatch(source, /collection\(db, 'artifacts', APP_ID, 'users', state\.userId, 'brands'\)/);
  assert.doesNotMatch(source, /doc\(brandsRef\(\)\)/);
});

test('feature bootstrap loads brand dictionary, centralized store sync and duplicate guard independently', async () => {
  const bootstrap = await readFile(new URL('../../src/client/app/feature-bootstrap.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /brand-dictionary-ui\.js/);
  assert.match(bootstrap, /brand-store-sync\.js/);
  assert.match(bootstrap, /location-duplicate-guard\.js/);
  assert.match(bootstrap, /品牌字典/);
  assert.match(bootstrap, /品牌商店同步/);
  assert.match(bootstrap, /地點重複檢查/);
});


test('opening brand editor does not autofocus an alias input on mobile', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  const body = source.match(/function openEditor\(brand = null\) \{([\s\S]*?)\n  \}\n\n  function collectAliases/)?.[1] || '';
  assert.doesNotMatch(body, /\.focus\(/);
});


test('brand dictionary top-level header matches personalization styling with country flag rows', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /id="brand-country-header"[^>]*bg-pastelBlue[^>]*border-b-4[^>]*px-5 py-4/);
  assert.match(source, /<h3 class="text-xl font-bold text-warmBrown">品牌字典<\/h3>/);
  assert.match(source, /createCountryFlagElement/);
});


test('brand list exposes a visible delete-brand action without adding any country deletion action', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /brand-row-delete/);
  assert.match(source, /aria-label.*刪除品牌|setAttribute\('aria-label',\s*`刪除品牌/);
  assert.match(source, /removeBrand\(brand\)/);
  assert.doesNotMatch(source, /deleteCountry|removeCountry|刪除國家/);
});


test('brand dictionary country rows use the shared PNG country flag renderer', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  const render = source.match(/function renderCountries\(\) \{([\s\S]*?)\n  \}\n\n  function renderBrandList/)?.[1] || '';
  assert.match(source, /createCountryFlagElement/);
  assert.match(render, /createCountryFlagElement\(documentRef,\s*country/);
  assert.doesNotMatch(render, /fa-store/);
});
