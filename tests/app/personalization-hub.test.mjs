import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function sourceOrFail(path, message) {
  try {
    return await readFile(new URL(path, import.meta.url), 'utf8');
  } catch {
    assert.fail(message);
  }
}

test('personalization opens a hub with header background before page background', async () => {
  const source = await sourceOrFail('../../src/client/app/personalization-hub.js', 'personalization hub module is missing');
  const headerIndex = source.indexOf('首頁橫幅背景');
  const pageIndex = source.indexOf('頁面背景');
  assert.ok(headerIndex >= 0);
  assert.ok(pageIndex >= 0);
  assert.ok(headerIndex < pageIndex);
  assert.match(source, /shopping-list:open-header-background/);
  assert.match(source, /shopping-list:open-page-background/);
  assert.match(source, /shopping-list:open-personalization/);
});

test('feature bootstrap loads the personalization hub and header background feature', async () => {
  const source = await readFile(new URL('../../src/client/app/feature-bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /personalization-hub\.js/);
  assert.match(source, /initPersonalizationHub/);
  assert.match(source, /header-background-personalization\.js/);
  assert.match(source, /initHeaderBackgroundPersonalization/);
});


test('personalization hub has a back button to account settings while close still exits the flow', async () => {
  const source = await sourceOrFail('../../src/client/app/personalization-hub.js', 'personalization hub module is missing');
  assert.match(source, /personalization-hub-back/);
  assert.match(source, /fa-chevron-left/);
  assert.match(source, /shopping-list:open-account-settings/);
  assert.match(source, /personalization-hub-close/);
});
