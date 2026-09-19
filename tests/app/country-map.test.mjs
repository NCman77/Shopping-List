import test from 'node:test';
import assert from 'node:assert/strict';
import { createCountryMapsSearchUrl } from '../../src/client/app/country-isolation.js';

test('location map searches use only the selected store name without appending country or city', () => {
  assert.equal(
    createCountryMapsSearchUrl('明洞', { country: '韓國' }),
    'https://www.google.com/maps/search/?api=1&query=%E6%98%8E%E6%B4%9E'
  );
  assert.equal(
    createCountryMapsSearchUrl('新宿', {}),
    'https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E5%AE%BF'
  );
  assert.equal(createCountryMapsSearchUrl('', { country: '泰國' }), '');
});
