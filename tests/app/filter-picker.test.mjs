import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterOptionsByQuery } from '../../src/client/app/filter-picker.js';

const sourcePath = new URL('../../src/client/app/filter-picker.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('filter option search is case-insensitive and preserves original order', () => {
  const options = [
    { value: 'all', label: '全部' },
    { value: '藥妝', label: '藥妝' },
    { value: 'Shinjuku', label: 'Shinjuku' },
    { value: 'Shibuya', label: 'Shibuya' }
  ];
  assert.deepEqual(filterOptionsByQuery(options, 'shin').map((option) => option.value), ['Shinjuku']);
  assert.deepEqual(filterOptionsByQuery(options, '').map((option) => option.value), ['all', '藥妝', 'Shinjuku', 'Shibuya']);
});

test('picker keeps horizontal filters and adds complete-option controls for category and location', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /category-filters/);
  assert.match(source, /location-filters/);
  assert.match(source, /filter-picker-open/);
  assert.match(source, /全部選項/);
  assert.match(source, /filter-picker-modal/);
  assert.match(source, /filter-picker-search/);
});

test('picker reads only currently visible existing filter buttons and delegates selection back to their click handler', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /\.cat-btn/);
  assert.match(source, /\.loc-btn/);
  assert.match(source, /classList\.contains\('hidden'\)/);
  assert.match(source, /sourceButton\.click\(\)/);
  assert.match(source, /data-cat/);
  assert.match(source, /data-loc/);
});

test('picker tracks existing filter selection and closes/rebuilds safely when trips or filter options change', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /shopping-list:active-trip-changed/);
  assert.match(source, /shopping-list:trips-changed/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /selected/);
});

test('filter picker is bootstrapped independently and does not persist a competing category/location model', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /filter-picker\.js/);
  assert.match(source, /initFilterPicker/);
  const pickerSource = await readFile(sourcePath, 'utf8');
  assert.doesNotMatch(pickerSource, /setDoc\(|updateDoc\(|addDoc\(/);
});
