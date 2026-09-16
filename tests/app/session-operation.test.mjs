import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionOperationTracker } from '../../src/client/app/session-operation.js';

test('auth changes invalidate older operations', () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const oldOperation = tracker.capture('user-a');
  tracker.advance('user-b');
  assert.equal(tracker.isSessionCurrent(oldOperation, 'user-b'), false);
});

test('a repeated auth callback for the same user invalidates the older generation', () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const oldOperation = tracker.capture('user-a');

  tracker.advance('user-a');

  assert.equal(tracker.isSessionCurrent(oldOperation, 'user-a'), false);
  assert.equal(tracker.isSessionCurrent(tracker.capture('user-a'), 'user-a'), true);
});

test('only the newest request in one channel and auth generation is current', () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const save = tracker.capture('user-a');
  const first = tracker.nextRequest('background-load', 'user-a');
  const second = tracker.nextRequest('background-load', 'user-a');
  assert.equal(tracker.isLatestRequest(first, 'user-a'), false);
  assert.equal(tracker.isLatestRequest(second, 'user-a'), true);
  assert.equal(tracker.isSessionCurrent(save, 'user-a'), true);
});

test('request ordering is independent between channels', () => {
  const tracker = createSessionOperationTracker();
  tracker.advance('user-a');
  const firstLoad = tracker.nextRequest('background-load', 'user-a');
  const save = tracker.nextRequest('background-save', 'user-a');
  const secondLoad = tracker.nextRequest('background-load', 'user-a');

  assert.equal(tracker.isLatestRequest(firstLoad, 'user-a'), false);
  assert.equal(tracker.isLatestRequest(secondLoad, 'user-a'), true);
  assert.equal(tracker.isLatestRequest(save, 'user-a'), true);
});
