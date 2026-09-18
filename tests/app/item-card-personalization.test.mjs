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

test('item card personalization supports default, solid color, and media modes', async () => {
  const source = await sourceOrFail('../../src/client/app/item-card-personalization.js', 'item card personalization module is missing');
  assert.match(source, /itemCardPersonalization/);
  assert.match(source, /mode:\s*['"]color['"]/);
  assert.match(source, /mode:\s*['"]media['"]/);
  assert.match(source, /type="color"/);
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp,image\/gif,video\/mp4,video\/webm"/);
  assert.match(source, /item-card-background-scale/);
  assert.match(source, /data-item-card-position-preset/);
});

test('item card media is stored independently and applied behind every homepage product card', async () => {
  const source = await sourceOrFail('../../src/client/app/item-card-personalization.js', 'item card personalization module is missing');
  assert.match(source, /kind:\s*['"]item-card-background['"]/);
  assert.match(source, /shopping-list:open-item-card-background/);
  assert.match(source, /item-card-personalization-layer/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /#item-list/);
  assert.match(source, /object-fit:\s*cover/);
  assert.match(source, /playsInline\s*=\s*true/);
  assert.match(source, /muted\s*=\s*true/);
});

test('personalization hub exposes item card background between header and page backgrounds', async () => {
  const source = await readFile(new URL('../../src/client/app/personalization-hub.js', import.meta.url), 'utf8');
  const headerIndex = source.indexOf('首頁橫幅背景');
  const cardIndex = source.indexOf('商品小卡背景');
  const pageIndex = source.indexOf('頁面背景');
  assert.ok(headerIndex >= 0 && cardIndex >= 0 && pageIndex >= 0);
  assert.ok(headerIndex < cardIndex);
  assert.ok(cardIndex < pageIndex);
  assert.match(source, /shopping-list:open-item-card-background/);
});

test('feature bootstrap loads item card personalization independently', async () => {
  const source = await readFile(new URL('../../src/client/app/feature-bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /item-card-personalization\.js/);
  assert.match(source, /initItemCardPersonalization/);
});
