import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildManagedLocationValues,
  mergeManagedLocationOrder,
  buildBrandDeletionLocationPlan
} from '../../src/client/app/location-management-core.js';

test('managed location list contains only locations used by items while keeping configured order', () => {
  const items = [
    { id: 'a', locations: ['B', 'D'] },
    { id: 'b', locations: ['D', 'C'] }
  ];
  assert.deepEqual(buildManagedLocationValues(items, ['A', 'B', 'C']), ['B', 'C', 'D']);
});

test('reordering visible used locations preserves hidden configured locations', () => {
  assert.deepEqual(
    mergeManagedLocationOrder(['A', 'B', 'C', 'D'], ['D', 'B']),
    ['A', 'D', 'C', 'B']
  );
});

test('brand deletion removes every raw item location matching any alias and preserves unrelated locations', () => {
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
    { id: 'a', locations: ['ツルハドラッグ', 'Matsumoto Kiyoshi'] },
    { id: 'b', locations: ['TSURUHA'] },
    { id: 'c', locations: ['Don Quijote'] }
  ];
  const plan = buildBrandDeletionLocationPlan(items, ['ツルハドラッグ', 'TSURUHA', 'Don Quijote'], brand);

  assert.deepEqual(plan.matchedRawLocations.sort(), ['TSURUHA', 'ツルハドラッグ'].sort());
  assert.deepEqual(plan.nextConfiguredLocations, ['Don Quijote']);
  assert.equal(plan.affected.length, 2);
  assert.deepEqual(plan.affected[0], {
    id: 'a',
    patch: { locations: ['Matsumoto Kiyoshi'], location: 'Matsumoto Kiyoshi' }
  });
  assert.deepEqual(plan.affected[1], {
    id: 'b',
    patch: { locations: [], location: '' }
  });
});

test('location management sync module owns sorting-only rows and brand-driven deletion', async () => {
  const source = await readFile(new URL('../../src/client/app/location-management-brand-sync.js', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../../src/client/app/feature-bootstrap.js', import.meta.url), 'utf8');

  assert.match(source, /buildManagedLocationValues/);
  assert.match(source, /mergeManagedLocationOrder/);
  assert.match(source, /buildBrandDeletionLocationPlan/);
  assert.match(source, /名稱與刪除請至品牌字典管理/);
  assert.match(source, /writeBatch/);
  assert.match(source, /batch\.update\(itemRef, entry\.patch\)/);
  assert.match(source, /locations: plan\.nextConfiguredLocations/);
  assert.match(source, /brands: nextBrands/);
  assert.doesNotMatch(source, /couponDictionary/);
  assert.doesNotMatch(source, /resolveLocationMapQuery/);
  assert.match(bootstrap, /location-management-brand-sync\.js/);
  assert.match(bootstrap, /地點品牌同步管理/);
});
