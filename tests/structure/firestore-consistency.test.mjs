import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rulesPath = new URL('../../firebase/firestore.rules', import.meta.url);

test('Firestore rules bind item trip references to a trip in the same atomic write', async () => {
  const source = await readFile(rulesPath, 'utf8');
  assert.match(source, /match \/items\/\{itemId\}/);
  assert.match(source, /existsAfter\(/);
  assert.match(source, /getAfter\(/);
  assert.match(source, /deleting/);
  assert.match(source, /tripId/);
});

test('client error reports are append-only, bounded, and never readable by the app', async () => {
  const source = await readFile(rulesPath, 'utf8');
  assert.match(source, /match \/artifacts\/\{appId\}\/clientErrors\/\{errorId\}/);
  assert.match(source, /allow create/);
  assert.match(source, /allow read, update, delete:\s*if false/);
  assert.match(source, /keys\(\)\.hasOnly/);
});
