import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenameItemPatch,
  renameOption
} from '../../src/client/filters/filter-management.js';

test('renaming a category replaces the definition without changing order', () => {
  assert.deepEqual(
    renameOption(['美妝', '髮品', '藥品'], '髮品', '護髮'),
    ['美妝', '護髮', '藥品']
  );
});

test('category rename patch updates only items using the old category', () => {
  assert.deepEqual(
    buildRenameItemPatch({ category: '髮品' }, 'category', '髮品', '護髮'),
    { category: '護髮' }
  );
  assert.equal(buildRenameItemPatch({ category: '美妝' }, 'category', '髮品', '護髮'), null);
});

test('location rename patch updates locations and legacy location together and removes duplicates', () => {
  assert.deepEqual(
    buildRenameItemPatch(
      { locations: ['松本清', '唐吉訶德', 'Matsumoto Kiyoshi'], location: '松本清' },
      'location',
      '松本清',
      'Matsumoto Kiyoshi'
    ),
    {
      locations: ['Matsumoto Kiyoshi', '唐吉訶德'],
      location: 'Matsumoto Kiyoshi'
    }
  );
});

test('legacy-only location is migrated consistently when renamed', () => {
  assert.deepEqual(
    buildRenameItemPatch({ location: '松本清' }, 'location', '松本清', 'Matsumoto Kiyoshi'),
    {
      locations: ['Matsumoto Kiyoshi'],
      location: 'Matsumoto Kiyoshi'
    }
  );
});
