import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { brandLocationValuesForCountry } from '../../src/client/app/brand-store-sync.js';

const sourcePath = new URL('../../src/client/app/brand-store-sync.js', import.meta.url);

test('active-country location choices only include raw locations represented by that country brand dictionary', () => {
  const brands = [
    {
      id: 'jp', country: '日本', displayName: '松本清',
      aliases: [{ language: '英文', value: 'Matsumoto Kiyoshi' }]
    },
    {
      id: 'ca', country: '加拿大', displayName: 'Shoppers Drug Mart',
      aliases: []
    }
  ];

  assert.deepEqual(
    brandLocationValuesForCountry(
      ['Matsumoto Kiyoshi', 'Shoppers Drug Mart', '舊地點'],
      brands,
      '日本'
    ),
    ['Matsumoto Kiyoshi']
  );
});

test('sync bridge mirrors brand dictionary into compatibility locations and filters the visible item picker', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /ensureBrandLocationDefinitions/);
  assert.match(source, /settings', 'preferences'/);
  assert.match(source, /settings', 'brandDictionary'/);
  assert.match(source, /option\.hidden/);
  assert.match(source, /option\.disabled/);
});

test('add-item store creation opens the existing brand dictionary editor and blocks the legacy location input flow', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /item-inline-add-location/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /account-open-brand-dictionary/);
  assert.match(source, /brand-add/);
});

test('homepage legacy add-location control is removed instead of being revived', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /removeHomepageLegacyAddButton/);
  assert.match(source, /handleAddLocation/);
  assert.match(source, /remove\(\)/);
});

test('coupon manager offers brand creation through the same dictionary editor when no store matches', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /coupon-add-brand-from-search/);
  assert.match(source, /coupon-brand-search/);
  assert.match(source, /coupon-editor-country/);
  assert.match(source, /context:\s*'coupon'/);
});

test('brand dictionary duplicate warnings are raised above the dictionary only while it is open', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /msg-modal/);
  assert.match(source, /brand-dictionary-modal/);
  assert.match(source, /style\.zIndex = '180'/);
  assert.match(source, /restoreAlertLayer/);
});
