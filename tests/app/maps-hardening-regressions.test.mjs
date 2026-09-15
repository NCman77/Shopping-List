import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storePath = new URL('../../src/client/app/store-location-enhancements.js', import.meta.url);
const nearbyPath = new URL('../../src/client/app/nearby-sort.js', import.meta.url);
const workflowPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);

test('duplicate nearby Search reuses the in-flight promise before invalidating its request id', async () => {
  const source = await readFile(storePath, 'utf8');
  const start = source.indexOf('async function runBranchSearch()');
  const end = source.indexOf('async function testMapsKey', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  const duplicateCheck = body.indexOf('branchSearchInFlight?.earlyKey === earlyKey');
  const requestIncrement = body.indexOf('++state.branchRequest');
  assert.ok(duplicateCheck >= 0 && requestIncrement >= 0);
  assert.ok(duplicateCheck < requestIncrement, 'duplicate check must happen before incrementing branchRequest');
});

test('nearby tracking async work is generation/user scoped and persistence cannot drift to a new account', async () => {
  const source = await readFile(nearbyPath, 'utf8');
  assert.match(source, /trackingGeneration/);
  assert.match(source, /function trackingAttemptIsCurrent/);
  assert.match(source, /const trackingUserId = state\.userId/);
  assert.match(source, /const trackingGeneration = \+\+state\.trackingGeneration/);
  assert.match(source, /trackingAttemptIsCurrent\(\{ userId: trackingUserId, generation: trackingGeneration \}, state\)/);
  assert.match(source, /persistEnabled\(true, trackingUserId\)/);
  assert.match(source, /function persistEnabled\(enabled, userId = state\.userId\)/);
  assert.match(source, /if \(state\.starting\)/, 'a second toggle must be able to cancel an in-flight initial location request');
});

test('homepage nearby ordering consumes the freshness-vetted public distance map instead of raw stored coordinates', async () => {
  const source = await readFile(workflowPath, 'utf8');
  assert.match(source, /sortItemsByStatusAndDistanceMap/);
  assert.match(source, /nearbyState\?\.distancesByItemId/);
  assert.doesNotMatch(source, /sortItemsByStatusAndDistance\(candidateItems, nearbyState\.origin\)/);
});
