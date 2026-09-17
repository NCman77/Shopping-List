import test from 'node:test';
import assert from 'node:assert/strict';

import * as resolver from '../../src/client/app/brand-location-resolver.js';

const {
  displayLanguagePriorityForCountry,
  mapLanguagePriorityForCountry,
  inferAliasesFromLocation,
  findBrandForLocation,
  resolveLocationDisplayName,
  resolveLocationMapQuery
} = resolver;

const japanBrand = {
  id: 'matsukiyo',
  country: '日本',
  displayName: 'Matsumoto Kiyoshi',
  aliases: [
    { language: '中文', value: '松本清' },
    { language: '日文', value: 'マツモトキヨシ' },
    { language: '英文', value: 'Matsumoto Kiyoshi' }
  ]
};

test('display language priority is country scoped with Chinese first', () => {
  assert.deepEqual(displayLanguagePriorityForCountry('日本').slice(0, 4), ['中文', '日文', '英文', '其他']);
  assert.deepEqual(displayLanguagePriorityForCountry('加拿大').slice(0, 4), ['中文', '英文', '法文', '其他']);
  assert.deepEqual(displayLanguagePriorityForCountry('西班牙').slice(0, 4), ['中文', '西班牙文', '英文', '其他']);
  assert.deepEqual(displayLanguagePriorityForCountry('德國').slice(0, 4), ['中文', '德文', '英文', '其他']);
});

test('maps language priority prefers local language and never promotes Chinese', () => {
  assert.deepEqual(mapLanguagePriorityForCountry('日本').slice(0, 3), ['日文', '英文', '其他']);
  assert.deepEqual(mapLanguagePriorityForCountry('加拿大').slice(0, 3), ['英文', '法文', '其他']);
  assert.deepEqual(mapLanguagePriorityForCountry('西班牙').slice(0, 3), ['西班牙文', '英文', '其他']);
  assert.deepEqual(mapLanguagePriorityForCountry('德國').slice(0, 3), ['德文', '英文', '其他']);
  assert.equal(mapLanguagePriorityForCountry('日本').includes('中文'), false);
});

test('Japanese mixed input is split into English and Japanese aliases without changing entered text', () => {
  assert.deepEqual(inferAliasesFromLocation('Matsumoto Kiyoshi マツモトキヨシ', '日本'), [
    { language: '英文', value: 'Matsumoto Kiyoshi' },
    { language: '日文', value: 'マツモトキヨシ' }
  ]);
});

test('brand matching understands English, kana, and mixed variants', () => {
  const brands = [japanBrand];
  assert.equal(findBrandForLocation(brands, 'Matsumoto Kiyoshi', '日本')?.id, 'matsukiyo');
  assert.equal(findBrandForLocation(brands, 'マツモトキヨシ', '日本')?.id, 'matsukiyo');
  assert.equal(findBrandForLocation(brands, 'Matsumoto Kiyoshi マツモトキヨシ', '日本')?.id, 'matsukiyo');
  assert.equal(findBrandForLocation(brands, 'Matsumoto Kiyoshi', '加拿大'), null);
});

test('homepage display uses Chinese but Google Maps uses local language', () => {
  const brands = [japanBrand];
  assert.equal(resolveLocationDisplayName('Matsumoto Kiyoshi マツモトキヨシ', brands, '日本'), '松本清');
  assert.equal(resolveLocationMapQuery('Matsumoto Kiyoshi マツモトキヨシ', brands, '日本'), 'マツモトキヨシ');
});

test('where-to-buy picker uses Chinese, English, then local language for Japan', () => {
  assert.equal(typeof resolver.resolveLocationPickerLabel, 'function');
  assert.equal(
    resolver.resolveLocationPickerLabel('Matsumoto Kiyoshi', [japanBrand], '日本'),
    '松本清 / Matsumoto Kiyoshi / マツモトキヨシ'
  );
});

test('where-to-buy picker skips missing languages and deduplicates English when it is also a local language', () => {
  assert.equal(typeof resolver.resolveLocationPickerLabel, 'function');
  const japanWithoutChinese = {
    id: 'donki',
    country: '日本',
    displayName: 'Don Quijote',
    aliases: [
      { language: '英文', value: 'Don Quijote' },
      { language: '日文', value: 'ドン・キホーテ' }
    ]
  };
  const canadaBrand = {
    id: 'london-drugs',
    country: '加拿大',
    displayName: 'London Drugs',
    aliases: [
      { language: '中文', value: '倫敦藥房' },
      { language: '英文', value: 'London Drugs' },
      { language: '法文', value: 'London Drugs' }
    ]
  };
  assert.equal(
    resolver.resolveLocationPickerLabel('Don Quijote', [japanWithoutChinese], '日本'),
    'Don Quijote / ドン・キホーテ'
  );
  assert.equal(
    resolver.resolveLocationPickerLabel('London Drugs', [canadaBrand], '加拿大'),
    '倫敦藥房 / London Drugs'
  );
});

test('where-to-buy picker supports custom country alias languages after Chinese and English', () => {
  assert.equal(typeof resolver.resolveLocationPickerLabel, 'function');
  const customBrand = {
    id: 'custom-shop',
    country: '越南',
    displayName: 'Custom Shop',
    aliases: [
      { language: '中文', value: '自訂商店' },
      { language: '英文', value: 'Custom Shop' },
      { language: '越南文', value: 'Cửa hàng' }
    ]
  };
  assert.equal(
    resolver.resolveLocationPickerLabel('Custom Shop', [customBrand], '越南'),
    '自訂商店 / Custom Shop / Cửa hàng'
  );
});

test('unmatched locations retain their original identity for display, picker, and Maps', () => {
  assert.equal(resolveLocationDisplayName('ABC Store', [japanBrand], '日本'), 'ABC Store');
  assert.equal(resolveLocationMapQuery('ABC Store', [japanBrand], '日本'), 'ABC Store');
  assert.equal(typeof resolver.resolveLocationPickerLabel, 'function');
  assert.equal(resolver.resolveLocationPickerLabel('ABC Store', [japanBrand], '日本'), 'ABC Store');
});
