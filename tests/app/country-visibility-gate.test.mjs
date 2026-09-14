import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowItemForCountry } from '../../src/client/app/country-isolation.js';

test('items stay hidden until country-isolation data has loaded', () => {
  assert.equal(shouldShowItemForCountry({ item: { country: '日本' }, activeCountry: '日本', itemsLoaded: false }), false);
  assert.equal(shouldShowItemForCountry({ item: null, activeCountry: '日本', itemsLoaded: false }), false);
});

test('loaded items are shown only when their resolved country matches', () => {
  assert.equal(shouldShowItemForCountry({ item: { name: 'legacy' }, activeCountry: '日本', itemsLoaded: true }), true);
  assert.equal(shouldShowItemForCountry({ item: { country: '韓國' }, activeCountry: '日本', itemsLoaded: true }), false);
  assert.equal(shouldShowItemForCountry({ item: { country: '韓國' }, activeCountry: '韓國', itemsLoaded: true }), true);
  assert.equal(shouldShowItemForCountry({ item: null, activeCountry: '日本', itemsLoaded: true }), false);
});
