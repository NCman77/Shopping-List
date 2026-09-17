import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyBrandInputAliases,
  findBrandForLocationInput,
  preferredBrandDisplayName,
  preferredBrandMapSearchName,
  brandNeedsLanguageCompletion
} from '../../src/client/app/brand-dictionary-core.js';

const matsumoto = {
  id: 'jp-matsu',
  country: '日本',
  displayName: 'Matsumoto Kiyoshi',
  aliases: [
    { language: '中文', value: '松本清' },
    { language: '日文', value: 'マツモトキヨシ' },
    { language: '英文', value: 'Matsumoto Kiyoshi' }
  ]
};

test('mixed Japanese input is prefilled into Japanese and English fields', () => {
  assert.deepEqual(classifyBrandInputAliases('Matsumoto Kiyoshi マツモトキヨシ', '日本'), [
    { language: '英文', value: 'Matsumoto Kiyoshi' },
    { language: '日文', value: 'マツモトキヨシ' }
  ]);
});

test('brand lookup matches a partial alias but remains country scoped', () => {
  assert.equal(findBrandForLocationInput([matsumoto], 'Matsumoto Kiyoshi', '日本')?.id, 'jp-matsu');
  assert.equal(findBrandForLocationInput([matsumoto], 'マツモトキヨシ', '日本')?.id, 'jp-matsu');
  assert.equal(findBrandForLocationInput([matsumoto], 'Matsumoto Kiyoshi マツモトキヨシ', '日本')?.id, 'jp-matsu');
  assert.equal(findBrandForLocationInput([matsumoto], 'Matsumoto Kiyoshi', '加拿大'), null);
});

test('home display prefers Chinese then destination-local language then English', () => {
  assert.equal(preferredBrandDisplayName(matsumoto, '日本', 'raw'), '松本清');
  assert.equal(preferredBrandDisplayName({
    country: '西班牙',
    aliases: [
      { language: '英文', value: 'English Name' },
      { language: '西班牙文', value: 'Nombre Español' },
      { language: '中文', value: '中文店名' }
    ]
  }, '西班牙', 'raw'), '中文店名');
  assert.equal(preferredBrandDisplayName({
    country: '德國',
    aliases: [
      { language: '英文', value: 'English Name' },
      { language: '德文', value: 'Deutscher Name' }
    ]
  }, '德國', 'raw'), 'Deutscher Name');
});

test('Google Maps search prefers destination-local language and never Chinese first', () => {
  assert.equal(preferredBrandMapSearchName(matsumoto, '日本', 'Matsumoto Kiyoshi マツモトキヨシ'), 'マツモトキヨシ');
  assert.equal(preferredBrandMapSearchName({
    country: '加拿大',
    aliases: [
      { language: '中文', value: '中文店名' },
      { language: '法文', value: 'Nom Français' },
      { language: '英文', value: 'English Name' }
    ]
  }, '加拿大', 'raw'), 'English Name');
  assert.equal(preferredBrandMapSearchName({
    country: '西班牙',
    aliases: [
      { language: '中文', value: '中文店名' },
      { language: '英文', value: 'English Name' },
      { language: '西班牙文', value: 'Nombre Español' }
    ]
  }, '西班牙', 'raw'), 'Nombre Español');
});

test('new brand must be created when no dictionary match exists; existing incomplete brand may be supplemented', () => {
  assert.equal(brandNeedsLanguageCompletion({
    country: '日本', aliases: [{ language: '英文', value: 'Matsumoto Kiyoshi' }]
  }, '日本'), true);
  assert.equal(brandNeedsLanguageCompletion(matsumoto, '日本'), false);
});

test('location onboarding reuses the existing brand editor and only existing brands can skip supplementation', async () => {
  const source = await readFile(new URL('../../src/client/app/location-brand-onboarding.js', import.meta.url), 'utf8');
  assert.match(source, /account-open-brand-dictionary/);
  assert.match(source, /brand-add/);
  assert.match(source, /brand-editor-save/);
  assert.match(source, /if \(brand && !required\)/);
  assert.match(source, /略過補充，直接加入地點/);
  assert.match(source, /新增品牌並加入地點/);
});

test('localized presentation keeps raw filter identity but intercepts brand Maps actions with the local-language query', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-location-presentation.js', import.meta.url), 'utf8');
  assert.match(source, /const raw = clean\(button\.dataset\.loc\)/);
  assert.match(source, /button\.dataset\.filterPickerLabel = display/);
  assert.doesNotMatch(source, /button\.dataset\.loc = display/);
  assert.match(source, /button\.dataset\.brandMapSearch = mapSearch/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /windowRef\.open\(url, '_blank'/);
});
