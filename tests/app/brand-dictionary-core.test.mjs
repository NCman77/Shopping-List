import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultLanguageFieldsForCountry,
  effectiveLanguageFields,
  parseAliasValues,
  findBrandAliasConflict,
  detectLocationDuplicate,
  kanaToRomaji
} from '../../src/client/app/brand-dictionary-core.js';

test('country language templates differ by travel country and retain other', () => {
  assert.deepEqual(defaultLanguageFieldsForCountry('日本'), ['日文', '英文', '中文', '其他']);
  assert.deepEqual(defaultLanguageFieldsForCountry('Canada'), ['英文', '法文', '中文', '其他']);
  assert.deepEqual(defaultLanguageFieldsForCountry('西班牙'), ['西班牙文', '英文', '中文', '其他']);
  assert.deepEqual(defaultLanguageFieldsForCountry('自訂國家'), ['英文', '中文', '其他']);
  assert.deepEqual(effectiveLanguageFields('日本', ['日文', '英文', '德文']), ['日文', '英文', '德文', '其他']);
});

test('other alias input can contain multiple names without altering display text', () => {
  assert.deepEqual(parseAliasValues('Donki, ドンキ、DON QUIJOTE\n驚安殿堂'), ['Donki', 'ドンキ', 'DON QUIJOTE', '驚安殿堂']);
});

test('same-country brand alias conflicts are detected but other countries remain independent', () => {
  const brands = [
    { id: 'jp-1', country: '日本', displayName: 'Matsumoto Kiyoshi', aliases: [{ language: '日文', value: 'マツモトキヨシ' }] },
    { id: 'ca-1', country: '加拿大', displayName: 'Example', aliases: [{ language: '英文', value: 'Matsumoto Kiyoshi' }] }
  ];
  assert.equal(findBrandAliasConflict(brands, ['マツモトキヨシ'], '', '日本')?.id, 'jp-1');
  assert.equal(findBrandAliasConflict(brands, ['Matsumoto Kiyoshi'], '', '日本')?.id, 'jp-1');
  assert.equal(findBrandAliasConflict(brands, ['Example'], '', '日本'), null);
});

test('certain duplicate matching ignores case, width, punctuation and bilingual order', () => {
  assert.equal(detectLocationDuplicate({
    input: 'matsumoto   kiyoshi',
    existingLocations: ['Matsumoto Kiyoshi'],
    brands: [],
    country: '日本'
  }).kind, 'exact');

  assert.equal(detectLocationDuplicate({
    input: 'Matsumoto Kiyoshi マツモトキヨシ',
    existingLocations: ['マツモトキヨシ　Matsumoto Kiyoshi'],
    brands: [],
    country: '日本'
  }).kind, 'exact');

  assert.equal(detectLocationDuplicate({
    input: 'マツモトキヨシ Matsumoto Kiyoshi',
    existingLocations: ['Matsumoto Kiyoshi'],
    brands: [],
    country: '日本'
  }).kind, 'exact');
});

test('kana and romaji strong similarity warns instead of blocking', () => {
  assert.equal(kanaToRomaji('マツモトキヨシ'), 'matsumotokiyoshi');
  const result = detectLocationDuplicate({
    input: 'マツモトキヨシ',
    existingLocations: ['Matsumoto Kiyoshi'],
    brands: [],
    country: '日本'
  });
  assert.equal(result.kind, 'similar');
  assert.equal(result.existing, 'Matsumoto Kiyoshi');
});

test('brand dictionary explicitly links Han, English and Kana aliases only within active country', () => {
  const brands = [{
    id: 'jp-1',
    country: '日本',
    displayName: 'Matsumoto Kiyoshi',
    aliases: [
      { language: '中文', value: '松本清' },
      { language: '英文', value: 'Matsumoto Kiyoshi' },
      { language: '日文', value: 'マツモトキヨシ' }
    ]
  }];

  const linked = detectLocationDuplicate({
    input: '松本清',
    existingLocations: ['Matsumoto Kiyoshi'],
    brands,
    country: '日本'
  });
  assert.equal(linked.kind, 'dictionary');
  assert.equal(linked.existing, 'Matsumoto Kiyoshi');

  assert.equal(detectLocationDuplicate({
    input: '松本清',
    existingLocations: ['Matsumoto Kiyoshi'],
    brands,
    country: '西班牙'
  }).kind, 'none');
});

test('Han and English are not guessed across languages without an explicit dictionary link', () => {
  assert.equal(detectLocationDuplicate({
    input: '松本清',
    existingLocations: ['Matsumoto Kiyoshi'],
    brands: [],
    country: '日本'
  }).kind, 'none');
});
