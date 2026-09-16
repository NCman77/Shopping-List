import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadDetailModule() {
  try {
    return await import('../../src/client/app/item-detail-view.js');
  } catch {
    return {};
  }
}

const workflowPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);

test('detail model keeps category, every fallback location, specific purchase place, price ranges, website and notes', async () => {
  const mod = await loadDetailModule();
  assert.equal(typeof mod.buildItemDetailModel, 'function');

  const model = mod.buildItemDetailModel({
    name: 'UNIPLEX Bond Melty Repair Hair Mask',
    category: '髮品',
    locations: ['Matsumoto Kiyoshi マツモトキヨシ', 'Don Quijote ドン・キホーテ', '@cosme TOKYO'],
    storeName: 'Matsumoto Kiyoshi 新宿三丁目店',
    address: '東京都新宿區新宿3-17-3',
    website: 'https://example.com/product',
    description: '別人推薦這間一定買得到',
    country: '日本',
    priceResearch: {
      taiwanMinTwd: 199,
      taiwanMaxTwd: 699,
      localMin: 1680,
      localMax: 2280,
      currencyCode: 'JPY'
    }
  });

  assert.equal(model.name, 'UNIPLEX Bond Melty Repair Hair Mask');
  assert.equal(model.category, '髮品');
  assert.deepEqual(model.locations, [
    'Matsumoto Kiyoshi マツモトキヨシ',
    'Don Quijote ドン・キホーテ',
    '@cosme TOKYO'
  ]);
  assert.deepEqual(model.purchase, {
    storeName: 'Matsumoto Kiyoshi 新宿三丁目店',
    address: '東京都新宿區新宿3-17-3',
    mapQuery: '東京都新宿區新宿3-17-3'
  });
  assert.equal(model.prices.taiwan, 'NT$199–699');
  assert.equal(model.prices.local, '¥1,680–2,280');
  assert.equal(model.website, 'https://example.com/product');
  assert.equal(model.description, '別人推薦這間一定買得到');
});

test('specific purchase place falls back to store name when no exact address exists', async () => {
  const mod = await loadDetailModule();
  assert.equal(typeof mod.buildItemDetailModel, 'function');

  const model = mod.buildItemDetailModel({
    storeName: 'Welcia ウエルシア',
    priceResearch: { taiwanMinTwd: 499, taiwanMaxTwd: 499, localMin: 1680, localMax: 1680, currencyCode: 'JPY' }
  });

  assert.equal(model.purchase.mapQuery, 'Welcia ウエルシア');
  assert.equal(model.prices.taiwan, 'NT$499');
  assert.equal(model.prices.local, '¥1,680');
});

test('detail renderer uses the existing site palette and creates separate location and purchase sections', async () => {
  const mod = await loadDetailModule();
  const source = await readFile(new URL('../../src/client/app/item-detail-view.js', import.meta.url), 'utf8').catch(() => '');

  assert.equal(typeof mod.renderItemDetailView, 'function');
  assert.match(source, /地點分類/);
  assert.match(source, /哪裡買/);
  assert.match(source, /價格功課/);
  assert.match(source, /網站/);
  assert.match(source, /商品名稱/);
  assert.match(source, /bg-pastelYellow|bg-pastelBlue|bg-pastelGreen|bg-pastelPink/);
  assert.match(source, /text-warmBrown/);
  assert.match(source, /createGoogleMapsUrl/);
  assert.match(source, /locationMapQuery/);
});

test('detail view uses compact cards and a two-column fallback-location grid on mobile', async () => {
  const source = await readFile(new URL('../../src/client/app/item-detail-view.js', import.meta.url), 'utf8');

  assert.match(source, /const locationsGrid = element\(documentRef, 'div', 'grid grid-cols-2 gap-2'\);/);
  assert.match(source, /w-8 h-8 shrink-0/);
  assert.match(source, /px-3 py-2\.5/);
  assert.match(source, /gap-2 p-3 rounded-2xl/);
  assert.match(source, /bg-pastelPink\/25 border-2 border-warmBrown\/30 p-3/);
  assert.match(source, /space-y-3 text-warmBrown/);
});

test('workflow swaps only view mode into the redesigned detail surface and leaves edit mode available', async () => {
  const source = await readFile(workflowPath, 'utf8');

  assert.match(source, /item-detail-view\.js/);
  assert.match(source, /商品檢視/);
  assert.match(source, /workflow-view-mode #item-detail-view/);
  assert.match(source, /workflow-view-mode #copy-item-trip-action-wrap/);
  assert.match(source, /renderItemDetailView/);
  assert.match(source, /setDetailMode\('edit', \{ existing: true \}\)/);
  assert.match(source, /item-name/);
  assert.match(source, /item-category/);
  assert.match(source, /item-website/);
});
