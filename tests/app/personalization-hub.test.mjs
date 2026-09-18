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


test('settings top-level headers do not display explanatory subtitle text', async () => {
  const sources = await Promise.all([
    sourceOrFail('../../src/client/app/personalization-hub.js', 'personalization hub module is missing'),
    sourceOrFail('../../src/client/app/account-settings.js', 'account settings module is missing'),
    sourceOrFail('../../src/client/app/trip-ui.js', 'trip UI module is missing'),
    sourceOrFail('../../src/client/app/brand-dictionary-ui.js', 'brand dictionary module is missing'),
    sourceOrFail('../../src/client/app/coupon-management-ui.js', 'coupon management module is missing')
  ]);
  const joined = sources.join('\n');
  for (const text of [
    '選擇要調整的背景區域',
    '國家管理 · 新旅程建立時可從這裡的清單選擇',
    '目前商品只會顯示在選定的這一趟',
    '每個旅遊國家分開管理，不會混成同一份清單',
    '每個旅遊國家分開管理，一個品牌最多一張優惠券'
  ]) assert.doesNotMatch(joined, new RegExp(text));
});
