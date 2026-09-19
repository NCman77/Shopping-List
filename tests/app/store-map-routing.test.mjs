import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCountryMapsSearchUrl } from '../../src/client/app/country-isolation.js';
import { resolveLocationMapQuery } from '../../src/client/app/brand-location-resolver.js';
import { createGoogleMapsUrl } from '../../src/client/utils/url-utils.js';

test('homepage store search never appends the trip country or city to the Maps query', () => {
  assert.equal(
    createCountryMapsSearchUrl('松本清', { country: '日本' }),
    'https://www.google.com/maps/search/?api=1&query=%E6%9D%BE%E6%9C%AC%E6%B8%85'
  );
});

test('brand dictionary may translate a store label to its local store name without adding geography', () => {
  const brands = [{
    id: 'matsukiyo',
    country: '日本',
    displayName: '松本清',
    aliases: [
      { language: '中文', value: '松本清' },
      { language: '日文', value: 'マツモトキヨシ' }
    ]
  }];
  const query = resolveLocationMapQuery('松本清', brands, '日本');
  assert.equal(query, 'マツモトキヨシ');
  const url = new URL(createGoogleMapsUrl(query));
  assert.equal(url.searchParams.get('query'), 'マツモトキヨシ');
});

test('enhanced homepage store controls are real Google Maps links instead of popup-only buttons', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  const start = source.indexOf('for (const location of resolveItemLocations(item))');
  const end = source.indexOf('if (item.address)', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /createElement\('a'\)/);
  assert.match(block, /href\s*=\s*createGoogleMapsUrl\(location\)/);
  assert.match(block, /target\s*=\s*'_blank'/);
  assert.match(block, /rel\s*=\s*'noopener noreferrer'/);
  assert.doesNotMatch(block, /window\.open/);
});

test('country isolation never rewrites homepage store Maps links after brand mapping', async () => {
  const source = await readFile(new URL('../../src/client/app/country-isolation.js', import.meta.url), 'utf8');
  const initStart = source.indexOf('export async function initCountryIsolation');
  assert.ok(initStart >= 0);
  const init = source.slice(initStart);
  assert.doesNotMatch(init, /mapAnchor/);
  assert.doesNotMatch(init, /google\.com\/maps\/search/);
});

test('the separate address action still searches the exact saved address', async () => {
  const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');
  const start = source.indexOf('if (item.address)');
  const end = source.indexOf('const cover =', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /createGoogleMapsUrl\(item\.address\)/);
  assert.doesNotMatch(block, /resolveLocationMapQuery|resolveItemCountry|shoppingListActiveCountry/);
});
