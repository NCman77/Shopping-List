import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  '../../src/client/app/background-personalization.js',
  '../../src/client/app/header-background-personalization.js',
  '../../src/client/app/item-card-personalization.js'
];

test('all three personalization background modules initialize Firebase Storage', async () => {
  for (const path of files) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /firebasejs\/11\.6\.1\/firebase-storage\.js/);
    assert.match(source, /createFirebaseBackgroundStorageService/);
    assert.match(source, /createBackgroundMediaService/);
  }
});

test('new personalization uploads use Firebase media service and Drive is retained only for legacy migration', async () => {
  for (const path of files) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /migrateLegacy/);
    assert.match(source, /mediaService/);
  }
});

test('background UI no longer describes normal backgrounds as stored in Google Drive', async () => {
  for (const path of files) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /背景仍儲存在 Google Drive/);
    assert.doesNotMatch(source, /橫幅背景仍儲存在 Google Drive/);
    assert.doesNotMatch(source, /小卡背景仍儲存在 Google Drive/);
  }
});
