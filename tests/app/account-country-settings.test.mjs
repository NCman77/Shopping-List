import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveCardItemId, itemMatchesActiveCountry } from '../../src/client/app/country-isolation.js';

test('country isolation resolves item ids from enhanced or legacy cards', () => {
  assert.equal(resolveCardItemId({ dataset: { enhancedItemId: 'enhanced-1' }, onclickSource: '' }), 'enhanced-1');
  assert.equal(resolveCardItemId({ dataset: {}, onclickSource: "window.openEditModal('legacy-1')" }), 'legacy-1');
  assert.equal(resolveCardItemId({ dataset: {}, onclickSource: '' }), '');
});

test('country compatibility helper still resolves legacy country defaults', () => {
  assert.equal(itemMatchesActiveCountry({ name: 'legacy' }, '日本'), true);
  assert.equal(itemMatchesActiveCountry({ country: '韓國' }, '日本'), false);
  assert.equal(itemMatchesActiveCountry({ country: '韓國' }, '韓國'), true);
});

test('avatar settings expose country management, personalization and sign out without independently switching active country', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  assert.match(source, /旅遊國家/);
  assert.match(source, /國家管理/);
  assert.match(source, /個人化/);
  assert.match(source, /登出/);
  assert.match(source, /account-country-input/);
  assert.match(source, /\{ countries: nextCountries \}/);
  assert.match(source, /\{ merge: true \}/);
  assert.doesNotMatch(source, /dispatchCountryChanged/);
  assert.doesNotMatch(source, /shopping-list:active-country-changed/);
  assert.doesNotMatch(source, /writeCachedActiveCountry/);
  assert.doesNotMatch(source, /window\.open\(/);
});

test('adding a country does not write activeCountry or close the management screen as a selection action', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  const addIndex = source.indexOf('async function addCountry');
  const nextFunctionIndex = source.indexOf('function subscribeUser', addIndex);
  assert.ok(addIndex >= 0 && nextFunctionIndex > addIndex);
  const slice = source.slice(addIndex, nextFunctionIndex);
  assert.match(slice, /countries:\s*nextCountries/);
  assert.doesNotMatch(slice, /activeCountry/);
  assert.doesNotMatch(slice, /selectCountry/);
  assert.doesNotMatch(slice, /closeModal\(\)/);
});

test('account modal signs out directly instead of synthetic-clicking inside the avatar capture boundary', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  assert.match(source, /authSdk\.signOut\(auth\)/);
  assert.doesNotMatch(source, /getElementById\('sign-out-btn'\)\?\.click/);
});

test('feature bootstrap loads country, account and background enhancements independently', async () => {
  const bootstrap = await readFile(new URL('../../src/client/app/feature-bootstrap.js', import.meta.url), 'utf8');
  const root = await readFile(new URL('../../auth-session.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /runEnhancementsIndependently/);
  assert.match(bootstrap, /country-isolation\.js/);
  assert.match(bootstrap, /account-settings\.js/);
  assert.match(bootstrap, /background-personalization\.js/);
  assert.match(root, /feature-bootstrap\.js/);
});


test('account settings keeps the requested feature order and leaves API settings immediately before sign out', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  assert.match(source, /enforceAccountMenuOrder/);
  const desired = [
    'account-open-personalization',
    'account-open-countries',
    'account-open-trips',
    'account-open-brand-dictionary',
    'account-open-coupon-management',
    'account-open-maps',
    'account-settings-signout'
  ];
  for (const id of desired) assert.match(source, new RegExp(id));
  assert.match(source, /MutationObserver/);
});


test('travel country management exposes edit and delete controls without rewriting existing trips', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  assert.match(source, /editingCountry/);
  assert.match(source, /beginCountryEdit/);
  assert.match(source, /deleteCountry/);
  assert.match(source, /account-country-cancel/);
  assert.match(source, /fa-pen/);
  assert.match(source, /fa-trash/);
  assert.match(source, /既有旅遊紀錄不會被改寫/);
  assert.doesNotMatch(source, /collection\(db, ['"]artifacts['"], APP_ID, ['"]users['"], .*?['"]trips['"]\)/s);
});

test('active trip country stays protected but edit and delete remain clickable so the warning can be shown', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  const lockBody = source.match(/function countryLockedReason\(country\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.doesNotMatch(lockBody, /DEFAULT_COUNTRY/);
  assert.match(lockBody, /country === state\.activeCountry/);
  assert.doesNotMatch(source, /edit\.disabled = Boolean\(countryLockedReason\(country\)\)/);
  assert.doesNotMatch(source, /remove\.disabled = Boolean\(countryLockedReason\(country\)\)/);
  assert.match(source, /notify\('目前不能編輯', reason, 'warning'\)/);
  assert.match(source, /notify\('目前不能刪除', reason, 'warning'\)/);
  assert.doesNotMatch(source, /country === DEFAULT_COUNTRY \? '預設'/);
});

test('account settings can be reopened by child settings pages', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  assert.match(source, /shopping-list:open-account-settings/);
  assert.match(source, /addEventListener\('shopping-list:open-account-settings',[\s\S]*openModal\(\)/);
});


test('opening account country/maps views or starting country edit does not autofocus mobile inputs', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  const countryView = source.match(/function showCountryView\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const mapsView = source.match(/function showMapsView\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  const editView = source.match(/function beginCountryEdit\(country\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.doesNotMatch(countryView, /\.focus\(/);
  assert.doesNotMatch(mapsView, /\.focus\(/);
  assert.doesNotMatch(editView, /\.focus\(|\.select\(/);
});
