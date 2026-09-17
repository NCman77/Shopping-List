import test from 'node:test';
import assert from 'node:assert/strict';

import {
  displayLanguagePriorityForCountry,
  mapLanguagePriorityForCountry,
  inferAliasesFromLocation,
  findBrandForLocation,
  resolveLocationDisplayName,
  resolveLocationMapQuery
} from '../../src/client/app/brand-location-resolver.js';

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

test('Japanese mixed input is split into English and Japanese aliases', () => {
  assert.deepEqual(inferAliasesFromLocation('Matsumoto Kiyoshi マツモトキヨシ', '日本'), [
    { language: '英文', value: 'MatsumotoKiyoshi' },
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

test('unmatched locations retain their original identity for display and Maps', () => {
  assert.equal(resolveLocationDisplayName('ABC Store', [japanBrand], '日本'), 'ABC Store');
  assert.equal(resolveLocationMapQuery('ABC Store', [japanBrand], '日本'), 'ABC Store');
});
