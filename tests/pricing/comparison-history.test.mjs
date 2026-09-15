import test from 'node:test';
import assert from 'node:assert/strict';
import { appendComparisonHistory } from '../../src/client/pricing/comparison-history.js';

test('comparison history keeps newest records first and caps at 20', () => {
  const existing = Array.from({ length: 25 }, (_, index) => ({ createdAt: index + 1, storePrice: index + 100 }));
  const result = appendComparisonHistory(existing, { createdAt: 100, storePrice: 999 });
  assert.equal(result.length, 20);
  assert.equal(result[0].createdAt, 100);
  assert.equal(result[1].createdAt, 25);
  assert.equal(result.at(-1).createdAt, 7);
});

test('history helper does not mutate caller data', () => {
  const existing = [{ createdAt: 2 }, { createdAt: 1 }];
  const snapshot = structuredClone(existing);
  appendComparisonHistory(existing, { createdAt: 3 });
  assert.deepEqual(existing, snapshot);
});
