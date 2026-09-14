import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveCardItemId, itemMatchesActiveCountry } from '../../src/client/app/country-isolation.js';

test('country isolation resolves item ids from enhanced or legacy cards', () => {
  assert.equal(resolveCardItemId({ dataset: { enhancedItemId: 'enhanced-1' }, onclickSource: '' }), 'enhanced-1');
  assert.equal(resolveCardItemId({ dataset: {}, onclickSource: "window.openEditModal('legacy-1')" }), 'legacy-1');
  assert.equal(resolveCardItemId({ dataset: {}, onclickSource: '' }), '');
});

test('country isolation treats legacy items as Japan', () => {
  assert.equal(itemMatchesActiveCountry({ name: 'legacy' }, '日本'), true);
  assert.equal(itemMatchesActiveCountry({ country: '韓國' }, '日本'), false);
  assert.equal(itemMatchesActiveCountry({ country: '韓國' }, '韓國'), true);
});

test('avatar settings stay in-page and expose country, personalization and sign out', async () => {
  const source = await readFile(new URL('../../src/client/app/account-settings.js', import.meta.url), 'utf8');
  assert.match(source, /旅遊國家/);
  assert.match(source, /個人化/);
  assert.match(source, /登出/);
  assert.match(source, /account-country-input/);
  assert.match(source, /shopping-list:active-country-changed/);
  assert.match(source, /\{ merge: true \}/);
  assert.doesNotMatch(source, /window\.open\(/);
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
