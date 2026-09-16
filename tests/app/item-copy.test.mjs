import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCopiedItemData, findExistingCopy, normalizeCopiedPriceResearch } from '../../src/client/app/item-copy.js';

const uiPath = new URL('../../src/client/app/item-copy-ui.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('copied item preserves reusable content and store identity but resets status and membership', () => {
  const copied = buildCopiedItemData({
    source: {
      id: 'source-1',
      name: 'EVE 止痛藥',
      category: '藥妝',
      location: '新宿',
      address: 'Tokyo',
      website: 'https://example.com/eve',
      description: '回購',
      storeName: '松本清',
      storePlaceId: 'place-1',
      storeDisplayName: '松本清 新宿店',
      storeAddress: '東京都新宿區',
      storeLat: 35.69,
      storeLng: 139.70,
      storeResolvedAt: 123,
      purchased: true,
      shoppingStatus: 'purchased',
      tripId: 'trip-old',
      country: '日本',
      photoUrl: 'old-thumb',
      coverPhotoId: 'old-photo'
    },
    targetTrip: { id: 'trip-new', country: '日本' },
    newItemId: 'copy-1',
    now: 123456
  });

  assert.equal(copied.name, 'EVE 止痛藥');
  assert.equal(copied.category, '藥妝');
  assert.equal(copied.location, '新宿');
  assert.equal(copied.address, 'Tokyo');
  assert.equal(copied.website, 'https://example.com/eve');
  assert.equal(copied.description, '回購');
  assert.equal(copied.storeName, '松本清');
  assert.equal(copied.storePlaceId, 'place-1');
  assert.equal(copied.storeDisplayName, '松本清 新宿店');
  assert.equal(copied.storeAddress, '東京都新宿區');
  assert.equal(copied.storeLat, 35.69);
  assert.equal(copied.storeLng, 139.70);
  assert.equal(copied.storeResolvedAt, 123);
  assert.equal(copied.tripId, 'trip-new');
  assert.equal(copied.country, '日本');
  assert.equal(copied.shoppingStatus, 'wanted');
  assert.equal(copied.purchased, false);
  assert.equal(copied.createdAt, 123456);
  assert.equal(copied.updatedAt, 123456);
  assert.equal(copied.copiedFromItemId, 'source-1');
  assert.equal(copied.photoUrl, '');
  assert.equal(copied.coverPhotoId, null);
  assert.equal(copied.photoThumbCoverId, null);
});

test('copying an item without resolved store metadata keeps missing numeric fields null', () => {
  const copied = buildCopiedItemData({
    source: {
      id: 'source-2',
      name: '沒有店家座標的商品',
      storeLat: null,
      storeLng: '',
      storeResolvedAt: undefined
    },
    targetTrip: { id: 'trip-new', country: '日本' },
    newItemId: 'copy-2',
    now: 123456
  });

  assert.equal(copied.storeLat, null);
  assert.equal(copied.storeLng, null);
  assert.equal(copied.storeResolvedAt, null);
});

test('cross-country copies retain Taiwan reference prices but clear local currency values', () => {
  const copied = normalizeCopiedPriceResearch({
    sourceResearch: {
      taiwanMinTwd: 500,
      taiwanMaxTwd: 800,
      localMin: 1200,
      localMax: 1800,
      currencyCode: 'JPY',
      updatedAt: 123456
    },
    sourceCountry: '日本',
    targetCountry: '美國'
  });

  assert.deepEqual(copied, {
    taiwanMinTwd: 500,
    taiwanMaxTwd: 800,
    localMin: null,
    localMax: null,
    currencyCode: '',
    updatedAt: 123456
  });
});

test('same-country copies retain normalized local price research', () => {
  const copied = normalizeCopiedPriceResearch({
    sourceResearch: { localMin: 1800, localMax: 1200, currencyCode: 'jpy' },
    sourceCountry: '日本',
    targetCountry: '日本'
  });

  assert.deepEqual(copied, {
    taiwanMinTwd: null,
    taiwanMaxTwd: null,
    localMin: 1200,
    localMax: 1800,
    currencyCode: 'JPY',
    updatedAt: null
  });
});

test('duplicate detection is scoped to source item plus target trip', () => {
  const items = [
    { id: 'copy-a', tripId: 'trip-b', copiedFromItemId: 'source-1' },
    { id: 'copy-b', tripId: 'trip-c', copiedFromItemId: 'source-1' },
    { id: 'copy-c', tripId: 'trip-b', copiedFromItemId: 'source-2' }
  ];
  assert.equal(findExistingCopy(items, 'source-1', 'trip-b')?.id, 'copy-a');
  assert.equal(findExistingCopy(items, 'source-1', 'missing'), null);
});

test('detail view exposes copy action and target trip picker excludes current trip', async () => {
  const source = await readFile(uiPath, 'utf8');
  assert.match(source, /複製到其他旅程/);
  assert.match(source, /copy-item-trip-modal/);
  assert.match(source, /target\.id\s*!==\s*source\.tripId/);
  assert.match(source, /findExistingCopy/);
  assert.match(source, /confirm/);
});

test('copy UI bootstraps independently', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /item-copy-ui\.js/);
  assert.match(source, /initItemCopyUi/);
  assert.match(source, /商品跨旅程複製/);
});
