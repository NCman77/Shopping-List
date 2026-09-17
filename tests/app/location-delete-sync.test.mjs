import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildLocationDeletionItemPatch,
  buildLocationDeletionPlan,
  buildDeletionImpact
} from '../../src/client/filters/filter-management.js';

const homeSource = await readFile(new URL('../../src/client/app/home-ui-enhancements.js', import.meta.url), 'utf8');

test('deleting one raw location preserves the other selected locations and legacy first location', () => {
  const patch = buildLocationDeletionItemPatch({
    id: 'a',
    locations: ['Matsumoto Kiyoshi', 'ツルハドラッグ TSURUHA'],
    location: 'Matsumoto Kiyoshi'
  }, 'ツルハドラッグ TSURUHA');
  assert.deepEqual(patch, {
    locations: ['Matsumoto Kiyoshi'],
    location: 'Matsumoto Kiyoshi'
  });
});

test('item with only deleted location becomes locationless but is not deleted', () => {
  const patch = buildLocationDeletionItemPatch({ id: 'a', locations: ['A'], location: 'A' }, 'A');
  assert.deepEqual(patch, { locations: [], location: '' });
});

test('location deletion plan counts only affected items', () => {
  const plan = buildLocationDeletionPlan([
    { id: 'a', locations: ['A', 'B'] },
    { id: 'b', locations: ['B'] }
  ], 'A');
  assert.equal(plan.writeCount, 1);
  assert.deepEqual(plan.affected.map((entry) => entry.id), ['a']);
});

test('location deletion warning says affected products lose the raw location but central brand/coupon data stay', () => {
  const impact = buildDeletionImpact([{ id: 'a', name: '商品A', locations: ['A'] }], 'location', 'A');
  assert.match(impact.retainNote, /商品.*移除/);
  assert.match(impact.retainNote, /品牌字典/);
  assert.match(impact.retainNote, /優惠券/);
});

test('homepage deletion uses one atomic batch and guards the 499 affected-item limit before writes', () => {
  assert.match(homeSource, /buildLocationDeletionPlan/);
  assert.match(homeSource, /writeBatch/);
  assert.match(homeSource, /plan\.writeCount\s*>\s*499/);
  assert.match(homeSource, /batch\.set\(settingsRef/);
  assert.match(homeSource, /batch\.update\(/);
  assert.match(homeSource, /await batch\.commit\(\)/);
  assert.doesNotMatch(homeSource, /brandDictionary[^\n]*batch|couponDictionary[^\n]*batch/);
});
