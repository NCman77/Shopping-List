import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveShoppingStatus,
  statusWritePatch,
  filterByShoppingStatus,
  sortForHomepage,
  paginateItems,
  nextPageForSwipe,
  shouldReorderIds,
  shouldShowWorkflowEmpty
} from '../../src/client/app/item-workflow.js';

test('legacy purchased items resolve without migration', () => {
  assert.equal(resolveShoppingStatus({ purchased: true }), 'purchased');
  assert.equal(resolveShoppingStatus({ purchased: false }), 'wanted');
  assert.equal(resolveShoppingStatus({}), 'wanted');
});

test('explicit shopping status wins over legacy purchased flag', () => {
  assert.equal(resolveShoppingStatus({ shoppingStatus: 'not_wanted', purchased: true }), 'not_wanted');
  assert.equal(resolveShoppingStatus({ shoppingStatus: 'wanted', purchased: true }), 'wanted');
  assert.equal(resolveShoppingStatus({ shoppingStatus: 'purchased', purchased: false }), 'purchased');
});

test('status patches keep purchased boolean compatible', () => {
  assert.deepEqual(statusWritePatch('purchased'), { shoppingStatus: 'purchased', purchased: true });
  assert.deepEqual(statusWritePatch('wanted'), { shoppingStatus: 'wanted', purchased: false });
  assert.deepEqual(statusWritePatch('not_wanted'), { shoppingStatus: 'not_wanted', purchased: false });
  assert.throws(() => statusWritePatch('invalid'), /Invalid shopping status/);
});

test('status filtering supports all wanted purchased and not wanted', () => {
  const items = [
    { id: 'wanted', purchased: false },
    { id: 'purchased', purchased: true },
    { id: 'not-wanted', shoppingStatus: 'not_wanted', purchased: false }
  ];
  assert.deepEqual(filterByShoppingStatus(items, 'all').map((item) => item.id), ['wanted', 'purchased', 'not-wanted']);
  assert.deepEqual(filterByShoppingStatus(items, 'wanted').map((item) => item.id), ['wanted']);
  assert.deepEqual(filterByShoppingStatus(items, 'purchased').map((item) => item.id), ['purchased']);
  assert.deepEqual(filterByShoppingStatus(items, 'not_wanted').map((item) => item.id), ['not-wanted']);
});

test('homepage sorting puts wanted first, not wanted second, purchased last and newest first within each group', () => {
  const items = [
    { id: 'p1', createdAt: 50, purchased: true },
    { id: 'w-old', createdAt: 10, purchased: false },
    { id: 'n-new', createdAt: 40, shoppingStatus: 'not_wanted', purchased: false },
    { id: 'w-new', createdAt: 30, purchased: false },
    { id: 'n-old', createdAt: 20, shoppingStatus: 'not_wanted', purchased: false },
    { id: 'p2', createdAt: 60, shoppingStatus: 'purchased', purchased: true }
  ];
  assert.deepEqual(sortForHomepage(items).map((item) => item.id), ['w-new', 'w-old', 'n-new', 'n-old', 'p2', 'p1']);
});

test('pagination uses ten items, reports totals, and clamps requested page', () => {
  const items = Array.from({ length: 23 }, (_, index) => ({ id: String(index + 1) }));
  assert.deepEqual(paginateItems(items, 1), {
    items: items.slice(0, 10),
    page: 1,
    pageSize: 10,
    totalItems: 23,
    totalPages: 3
  });
  assert.equal(paginateItems(items, 2).items.length, 10);
  assert.equal(paginateItems(items, 99).page, 3);
  assert.equal(paginateItems([], 5).page, 1);
  assert.equal(paginateItems([], 5).totalPages, 1);
});

test('swipe mapping follows pager convention: left next and right previous without wrapping', () => {
  assert.equal(nextPageForSwipe({ direction: 'left', page: 2, totalPages: 4 }), 3);
  assert.equal(nextPageForSwipe({ direction: 'right', page: 2, totalPages: 4 }), 1);
  assert.equal(nextPageForSwipe({ direction: 'right', page: 1, totalPages: 4 }), 1);
  assert.equal(nextPageForSwipe({ direction: 'left', page: 4, totalPages: 4 }), 4);
});

test('card DOM order is only changed when candidate order actually differs', () => {
  assert.equal(shouldReorderIds(['a', 'b', 'c'], ['a', 'b', 'c']), false);
  assert.equal(shouldReorderIds(['a', 'c', 'b'], ['a', 'b', 'c']), true);
  assert.equal(shouldReorderIds(['a', 'b'], ['a', 'b', 'c']), true);
});

test('filtered empty state only appears after item data has loaded', () => {
  assert.equal(shouldShowWorkflowEmpty({ loaded: false, count: 0 }), false);
  assert.equal(shouldShowWorkflowEmpty({ loaded: true, count: 1 }), false);
  assert.equal(shouldShowWorkflowEmpty({ loaded: true, count: 0 }), true);
});
