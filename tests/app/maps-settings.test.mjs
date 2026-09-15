import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const accountUrl = new URL('../../src/client/app/account-settings.js', import.meta.url);

test('account settings expose an API settings view with masked primary and backup Maps browser keys', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, />API 設定</);
  assert.match(source, /Google Maps \/ Places/);
  assert.match(source, /account-maps-primary-key/);
  assert.match(source, /account-maps-backup-key/);
  assert.match(source, /type="password"/);
  assert.match(source, /主要 Browser API Key/);
  assert.match(source, /備用 Browser API Key/);
  assert.match(source, /account-maps-test-primary/);
  assert.match(source, /account-maps-test-backup/);
  assert.match(source, /account-maps-remove-backup/);
});

test('Maps key security and quota guidance is explicit and never asks for Cloud admin credentials', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /HTTP referrer/);
  assert.match(source, /Maps JavaScript API/);
  assert.match(source, /Places API \(New\)/);
  assert.match(source, /quota|配額/i);
  assert.match(source, /Cloud Console/);
  assert.match(source, /Service Account|服務帳戶/);
  assert.doesNotMatch(source, /private_key/);
  assert.doesNotMatch(source, /client_secret/);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
});

test('Maps keys are stored in the existing user preferences document with merge semantics and legacy read compatibility', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /normalizeMapsApiKeys/);
  assert.match(source, /mapsBrowserApiKey/);
  assert.match(source, /mapsApiKeys/);
  assert.match(source, /settingsRef\(\)/);
  assert.match(source, /setDoc\(settingsRef\(\),\s*\{\s*mapsApiKeys(?:\s*:|\s*,)/);
  assert.match(source, /\{ merge: true \}/);
  assert.match(source, /shopping-list:maps-settings-changed/);
});

test('runtime publishes primary backup and credential generation while retaining the legacy primary global', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /window\.shoppingListMapsApiKeys/);
  assert.match(source, /generation/);
  assert.match(source, /window\.shoppingListMapsBrowserApiKey\s*=\s*state\.mapsApiKeys\.primary/);
  assert.match(source, /detail:\s*\{[^}]*mapsApiKeys/s);
});

test('sign-out/account switch clears both in-memory Maps keys', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /state\.mapsApiKeys\s*=\s*\{\s*primary:\s*'',\s*backup:\s*''\s*\}/);
  assert.match(source, /window\.shoppingListMapsApiKeys\s*=\s*\{[^}]*primary:\s*''[^}]*backup:\s*''/s);
  assert.match(source, /window\.shoppingListMapsBrowserApiKey\s*=\s*''/);
});

test('an in-flight Maps key save cannot republish credentials after the account changes', async () => {
  const source = await readFile(accountUrl, 'utf8');
  assert.match(source, /const savingUserId\s*=\s*state\.userId/);
  assert.match(source, /const ref\s*=\s*settingsRef\(\)/);
  assert.match(source, /await setDoc\(ref,\s*\{\s*mapsApiKeys/);
  assert.match(source, /if \(state\.userId !== savingUserId \|\| auth\.currentUser\?\.uid !== savingUserId\) return/);
  const guardIndex = source.indexOf('state.userId !== savingUserId');
  const applyIndex = source.indexOf('applyMapsApiKeys(mapsApiKeys)', guardIndex);
  assert.ok(guardIndex >= 0 && applyIndex > guardIndex, 'account guard must run before publishing saved credentials');
});
