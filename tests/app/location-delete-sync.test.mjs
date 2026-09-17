import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildLocationDeletionItemPatch,
  buildLocationDeletionPlan,
  buildDeletionImpact
} from '../../src/client/filters/filter-management.js';

const homeSource = await readFile(new URL('../../src/client/app/home-ui-enhancements.js', import.meta.url), 'utf8');
const brandSource = await readFile(new URL('../../src/client/app/brand-dictionary-ui.js', import.meta.url), 'utf8');

test('deleting one raw location helper still preserves the other selected locations and legacy first location', () => {
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

test('item with only deleted location helper becomes locationless but is not deleted', () => {
  const patch = buildLocationDeletionItemPatch({ id: 'a', locations: ['A'], location: 'A' }, 'A');
  assert.deepEqual(patch, { locations: [], location: '' });
});

test('location deletion helper plan counts only affected items', () => {
  const plan = buildLocationDeletionPlan([
    { id: 'a', locations: ['A', 'B'] },
    { id: 'b', locations: ['B'] }
  ], 'A');
  assert.equal(plan.writeCount, 1);
  assert.deepEqual(plan.affected.map((entry) => entry.id), ['a']);
});

test('legacy location deletion impact helper remains descriptive for compatibility', () => {
  const impact = buildDeletionImpact([{ id: 'a', name: '商品A', locations: ['A'] }], 'location', 'A');
  assert.match(impact.retainNote, /商品.*移除/);
});

test('homepage no longer owns location deletion while Brand Dictionary owns the synchronized delete batch', () => {
  assert.doesNotMatch(homeSource, /buildLocationDeletionPlan/);
  assert.doesNotMatch(homeSource, /plan\.writeCount\s*>\s*499/);
  assert.match(brandSource, /buildBrandDeletionPlan/);
  assert.match(brandSource, /plan\.writeCount\s*>\s*498/);
  assert.match(brandSource, /batch\.set\(brandDictionaryRef\(\)/);
  assert.match(brandSource, /batch\.set\(settingsRef\(\)/);
  assert.match(brandSource, /batch\.update\(/);
});
