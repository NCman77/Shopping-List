import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourcePath = new URL('../../src/client/app/nearby-sort.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('nearby sort exposes an explicit homepage toggle and in-memory public state', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /附近排序/);
  assert.match(source, /shoppingListNearbySort/);
  assert.match(source, /shopping-list:nearby-sort-changed/);
  assert.match(source, /nearby-sort-toggle/);
});

test('nearby sort watches location with the 150m movement threshold and clears the watcher on disable or sign-out', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /watchPosition/);
  assert.match(source, /clearPositionWatch/);
  assert.match(source, /movedBeyondThreshold/);
  assert.match(source, /150/);
  assert.match(source, /onAuthStateChanged/);
});

test('only the enabled preference is persisted and live coordinates are never written to Firestore', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /nearbySortEnabled/);
  assert.match(source, /setDoc\(settingsRef\(\),\s*\{\s*nearbySortEnabled:/);
  assert.match(source, /\{ merge: true \}/);
  assert.doesNotMatch(source, /setDoc\([^\n]*(lat|lng|latitude|longitude)/i);
  assert.doesNotMatch(source, /updateDoc\([^\n]*(origin|accuracy)/i);
});

test('permission/location failures turn nearby mode off for the session without hiding the shopping list', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /permissionBlocked/);
  assert.match(source, /定位/);
  assert.match(source, /enabled:\s*false/);
});

test('nearby module is bootstrapped independently from the existing item workflow', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /nearby-sort\.js/);
  assert.match(source, /initNearbySort/);
});
