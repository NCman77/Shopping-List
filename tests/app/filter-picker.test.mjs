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

test('picker keeps horizontal filters and moves complete-option entry into the native all chips', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /category-filters/);
  assert.match(source, /location-filters/);
  assert.match(source, /filter-picker-modal/);
  assert.match(source, /filter-picker-search/);
  assert.match(source, /iconClass:\s*'fas fa-tag'/);
  assert.match(source, /iconClass:\s*'fas fa-map-marker-alt'/);
  assert.match(source, /config\.iconClass/);
  assert.match(source, /全部\s*<i class="fas fa-chevron-down/);
  assert.doesNotMatch(source, /filter-picker-open/);
  assert.doesNotMatch(source, /全部選項/);
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

test('user all-chip activation opens picker while internal trip reset bypasses picker', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /function enhanceAllChip\(type\)/);
  assert.match(source, /button\.dataset\.filterPickerAll = type/);
  assert.match(source, /event\.isTrusted/);
  assert.match(source, /openModal\(type\)/);
  assert.match(source, /function selectAllWithoutPicker\(type\)/);
  assert.match(source, /selectAllWithoutPicker\('category'\)/);
  assert.match(source, /selectAllWithoutPicker\('location'\)/);
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


test('homepage filter kind icons move into each all chip and the old standalone markers are hidden', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const source = await readFile(sourcePath, 'utf8');
  assert.match(html, /data-filter-kind-icon="category"/);
  assert.match(html, /data-filter-kind-icon="location"/);
  assert.match(source, /querySelectorAll\('\[data-filter-kind-icon="category"\], \[data-filter-kind-icon="location"\]'\)/);
  assert.match(source, /icon\.classList\.add\('hidden'\)/);
  assert.match(source, /iconClass:\s*'fas fa-tag'/);
  assert.match(source, /iconClass:\s*'fas fa-map-marker-alt'/);
});

test('all picker includes a manage action that delegates to existing filter management', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /filter-picker-manage/);
  assert.match(source, /shopping-list:manage-filter/);
  assert.match(source, /const kind = state\.activeType/);
  assert.match(source, /detail:\s*\{\s*kind\s*\}/);
});

test('home management listens to picker manage requests instead of enhancing the old left label', async () => {
  const source = await readFile(new URL('../../src/client/app/home-ui-enhancements.js', import.meta.url), 'utf8');
  assert.match(source, /shopping-list:manage-filter/);
  assert.doesNotMatch(source, /setupTrigger\('category-filters'/);
  assert.doesNotMatch(source, /setupTrigger\('location-filters'/);
});


test('opening the all picker does not autofocus search on mobile', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.doesNotMatch(source, /filter-picker-search[^\n]*focus|search\?\.focus\(\)/s);
});
