import test from 'node:test';
import assert from 'node:assert/strict';
import { createCountryMapsSearchUrl } from '../../src/client/app/country-isolation.js';

test('location map searches use each item country instead of hard-coded Japan', () => {
  assert.equal(
    createCountryMapsSearchUrl('明洞', { country: '韓國' }),
    'https://www.google.com/maps/search/?api=1&query=%E6%98%8E%E6%B4%9E%20%E9%9F%93%E5%9C%8B'
  );
  assert.equal(
    createCountryMapsSearchUrl('新宿', {}),
    'https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E5%AE%BF%20%E6%97%A5%E6%9C%AC'
  );
  assert.equal(createCountryMapsSearchUrl('', { country: '泰國' }), '');
});
