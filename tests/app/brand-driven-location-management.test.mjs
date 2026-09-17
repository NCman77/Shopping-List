import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  deriveUsedManagedLocations,
  mergeManagedLocationOrder,
  buildBrandDeletionPlan
} from '../../src/client/app/brand-driven-location-management.js';

test('managed locations only include raw locations currently used by items and preserve preferred order', () => {
  const items = [
    { id: 'a', locations: ['B', 'A'] },
    { id: 'b', locations: ['C'] }
  ];
  assert.deepEqual(
    deriveUsedManagedLocations(items, ['A', 'Unused', 'C', 'B']),
    ['A', 'C', 'B']
  );
});

test('reordering used locations preserves unused preference definitions in place', () => {
  assert.deepEqual(
    mergeManagedLocationOrder(
      ['A', 'Unused', 'C', 'B'],
      ['A', 'C', 'B'],
      ['B', 'A', 'C']
    ),
    ['B', 'Unused', 'A', 'C']
  );
});

test('brand deletion removes every matching raw alias including mixed local and English names', () => {
  const brand = {
    id: 'tsuruha',
    country: '日本',
    displayName: '鶴羽藥妝',
    aliases: [
      { language: '中文', value: '鶴羽藥妝' },
      { language: '日文', value: 'ツルハドラッグ' },
      { language: '英文', value: 'TSURUHA' }
    ]
  };
  const items = [
    { id: 'a', locations: ['ツルハドラッグ', '松本清'] },
    { id: 'b', locations: ['ツルハドラッグ TSURUHA'] },
    { id: 'c', locations: ['唐吉訶德'] }
  ];
  const plan = buildBrandDeletionPlan(items, ['ツルハドラッグ', 'ツルハドラッグ TSURUHA', '松本清'], brand, '日本');

  assert.deepEqual(plan.nextPreferenceLocations, ['松本清']);
  assert.equal(plan.affected.length, 2);
  assert.deepEqual(plan.affected.find((entry) => entry.id === 'a')?.patch.locations, ['松本清']);
  assert.deepEqual(plan.affected.find((entry) => entry.id === 'b')?.patch.locations, []);
});

test('homepage location management is reorder-only while category management keeps rename/delete controls', async () => {
  const home = await readFile(new URL('../../src/client/app/home-ui-enhancements.js', import.meta.url), 'utf8');
  const rename = await readFile(new URL('../../src/client/app/filter-rename-enhancements.js', import.meta.url), 'utf8');

  assert.match(home, /deriveUsedManagedLocations/);
  assert.match(home, /kind === 'location'/);
  assert.match(home, /delete-option/);
  assert.match(rename, /if \(kind === 'location'\) return/);
});

test('brand deletion uses one atomic batch for dictionary, preferences and affected items', async () => {
  const source = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');
  assert.match(source, /buildBrandDeletionPlan/);
  assert.match(source, /writeBatch\(db\)/);
  assert.match(source, /plan\.affected/);
  assert.match(source, /plan\.writeCount > 498/);
  assert.match(source, /brandDictionaryRef\(\)/);
  assert.match(source, /settingsRef\(\)/);
});
