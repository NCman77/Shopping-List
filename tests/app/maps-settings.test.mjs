import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const accountUrl = new URL('../../src/client/app/account-settings.js', import.meta.url);

test('account settings expose a Google Maps / Places browser key editor', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /Google Maps \/ Places/);
  assert.match(source, /account-maps-api-key/);
  assert.match(source, /type="password"/);
  assert.match(source, /HTTP referrer/);
  assert.match(source, /Maps JavaScript API/);
  assert.match(source, /Places API \(New\)/);
});

test('Maps browser key is stored only in the existing user preferences document with merge semantics', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /mapsBrowserApiKey/);
  assert.match(source, /settingsRef\(\)/);
  assert.match(source, /setDoc\(settingsRef\(\),\s*\{\s*mapsBrowserApiKey:/);
  assert.match(source, /\{ merge: true \}/);
  assert.match(source, /shopping-list:maps-settings-changed/);
  assert.match(source, /window\.shoppingListMapsBrowserApiKey/);
});

test('sign-out/account switch clears the in-memory Maps key', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /window\.shoppingListMapsBrowserApiKey\s*=\s*''/);
});
