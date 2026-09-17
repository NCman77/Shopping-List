import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexPath = new URL('../../index.html', import.meta.url);
const brandStoreSyncPath = new URL('../../src/client/app/brand-store-sync.js', import.meta.url);

test('global showMsg raises the system message above every currently visible overlay', async () => {
  const source = await readFile(indexPath, 'utf8');
  assert.match(source, /highestVisibleOverlayZIndex/);
  assert.match(source, /getComputedStyle/);
  assert.match(source, /modal\.style\.zIndex\s*=\s*String\(Math\.max\(200,/);
});

test('brand dictionary no longer owns a one-off global message z-index workaround', async () => {
  const source = await readFile(brandStoreSyncPath, 'utf8');
  assert.doesNotMatch(source, /priorMsgZIndex|applyAlertLayer|restoreAlertLayer/);
});
