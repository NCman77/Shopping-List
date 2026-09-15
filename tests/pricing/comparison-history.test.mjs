import test from 'node:test';
import assert from 'node:assert/strict';
import * as history from '../../src/client/pricing/comparison-history.js';

test('comparison history keeps newest records first and caps at 20', () => {
  const existing = Array.from({ length: 25 }, (_, index) => ({ createdAt: index + 1, storePrice: index + 100 }));
  const result = history.appendComparisonHistory(existing, { createdAt: 100, storePrice: 999 });
  assert.equal(result.length, 20);
  assert.equal(result[0].createdAt, 100);
  assert.equal(result[1].createdAt, 25);
  assert.equal(result.at(-1).createdAt, 7);
});

test('history helper does not mutate caller data', () => {
  const existing = [{ createdAt: 2 }, { createdAt: 1 }];
  const snapshot = structuredClone(existing);
  history.appendComparisonHistory(existing, { createdAt: 3 });
  assert.deepEqual(existing, snapshot);
});

test('delete helper removes only the newest comparison and keeps older records', () => {
  assert.equal(typeof history.removeNewestComparisonHistory, 'function');
  const existing = [
    { createdAt: 10, storePrice: 1000 },
    { createdAt: 30, storePrice: 3000 },
    { createdAt: 20, storePrice: 2000 }
  ];
  const snapshot = structuredClone(existing);
  const result = history.removeNewestComparisonHistory(existing);
  assert.deepEqual(result.map((record) => record.createdAt), [20, 10]);
  assert.deepEqual(existing, snapshot);
});
