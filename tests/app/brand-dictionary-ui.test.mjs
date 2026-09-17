import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('brand dictionary is exposed from account settings and remains country scoped', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /account-open-brand-dictionary/);
  assert.match(source, /品牌字典/);
  assert.match(source, /account-settings-root/);
  assert.match(source, /brand-country-list/);
  assert.match(source, /brand-country-title/);
  assert.match(source, /新增語言/);
  assert.match(source, /主要顯示名稱/);
  assert.match(source, /brandLanguageFields/);
  assert.match(source, /collection\(db, 'artifacts', APP_ID, 'users', state\.userId, 'brands'\)/);
  assert.match(source, /country:\s*state\.selectedCountry/);
});

test('brand editor supports add edit delete and alias conflict protection', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /findBrandAliasConflict/);
  assert.match(source, /deleteDoc/);
  assert.match(source, /setDoc/);
  assert.match(source, /brand-edit/);
  assert.match(source, /brand-delete/);
  assert.match(source, /名稱已被其他品牌使用/);
});

test('feature bootstrap loads brand dictionary and duplicate guard independently', async () => {
  const bootstrap = await readFile(new URL('../../src/client/app/feature-bootstrap.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /brand-dictionary-ui\.js/);
  assert.match(bootstrap, /location-duplicate-guard\.js/);
  assert.match(bootstrap, /品牌字典/);
  assert.match(bootstrap, /地點重複檢查/);
});
