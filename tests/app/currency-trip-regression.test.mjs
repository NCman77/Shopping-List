import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currencyForCountry, currencyMeta, formatMoney, tripHasLocalMoney } from '../../src/client/app/currency.js';
import { normalizeTrip } from '../../src/client/app/travel-trip.js';

const tripUiUrl = new URL('../../src/client/app/trip-ui.js', import.meta.url);

test('common trip countries infer the expected local currency', () => {
  assert.equal(currencyForCountry('日本'), 'JPY');
  assert.equal(currencyForCountry('加拿大'), 'CAD');
  assert.equal(currencyForCountry('美國'), 'USD');
  assert.equal(currencyForCountry('歐洲'), 'EUR');
  assert.equal(currencyForCountry('英國'), 'GBP');
  assert.equal(currencyForCountry('韓國'), 'KRW');
  assert.equal(currencyForCountry('未知國家'), '');
});

test('currency metadata controls display symbols and supported decimals', () => {
  assert.deepEqual(currencyMeta('JPY'), { code: 'JPY', label: '日圓', symbol: '¥', digits: 0 });
  assert.equal(currencyMeta('CAD').digits, 2);
  assert.equal(formatMoney(1280.4, 'JPY'), '¥1,280');
  assert.equal(formatMoney(18.99, 'CAD'), 'CA$18.99');
});

test('legacy trips derive currency while an explicit persisted currency wins', () => {
  assert.equal(normalizeTrip({ country: '日本' }).currencyCode, 'JPY');
  assert.equal(normalizeTrip({ country: '日本', currencyCode: 'USD' }).currencyCode, 'USD');
});

test('trip currency becomes locked only after trip-local monetary data exists', () => {
  const items = [
    { tripId: 'a', priceTwdMin: 399 },
    { tripId: 'b', priceLocalMin: 1280 },
    { tripId: 'c', onsitePriceLocal: 980 }
  ];
  assert.equal(tripHasLocalMoney(items, 'a'), false);
  assert.equal(tripHasLocalMoney(items, 'b'), true);
  assert.equal(tripHasLocalMoney(items, 'c'), true);
});

test('trip UI exposes currency selection, country suggestion, persistence, and monetary lock', async () => {
  const source = await readFile(tripUiUrl, 'utf8');
  assert.match(source, /trip-form-currency/);
  assert.match(source, /currencyCode/);
  assert.match(source, /currencyForCountry/);
  assert.match(source, /tripHasLocalMoney/);
  assert.match(source, /currencySelect\.disabled/);
  assert.match(source, /使用幣別/);
});
