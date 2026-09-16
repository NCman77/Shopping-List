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
