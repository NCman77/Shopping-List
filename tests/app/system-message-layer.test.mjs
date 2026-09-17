import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  highestVisibleOverlayZIndex,
  initSystemMessageLayer,
  nextSystemMessageZIndex
} from '../../src/client/app/system-message-layer.js';

const brandStoreSyncPath = new URL('../../src/client/app/brand-store-sync.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

function fakeNode({ zIndex = 'auto', hidden = false, display = 'block', visibility = 'visible' } = {}) {
  return {
    classList: { contains: (name) => name === 'hidden' && hidden },
    computedStyle: { zIndex, display, visibility }
  };
}

test('global system messages rise above the highest currently visible fixed overlay', () => {
  const lower = fakeNode({ zIndex: '97' });
  const highest = fakeNode({ zIndex: '110' });
  const hidden = fakeNode({ zIndex: '999', hidden: true });
  const excluded = fakeNode({ zIndex: '70' });
  const documentRef = {
    querySelectorAll: () => [lower, highest, hidden, excluded]
  };
  const windowRef = {
    getComputedStyle: (node) => node.computedStyle
  };

  assert.equal(highestVisibleOverlayZIndex({ documentRef, windowRef, excluded }), 110);
  assert.equal(nextSystemMessageZIndex({ documentRef, windowRef, excluded }), 200);

  highest.computedStyle.zIndex = '250';
  assert.equal(nextSystemMessageZIndex({ documentRef, windowRef, excluded }), 260);
});

test('system message layer waits for index module to define showMsg before wrapping it', async () => {
  const modal = { style: {}, classList: { contains: () => false } };
  const documentRef = {
    getElementById: (id) => id === 'msg-modal' ? modal : null,
    querySelectorAll: () => [modal]
  };
  const windowRef = {
    getComputedStyle: () => ({ zIndex: '70', display: 'block', visibility: 'visible' })
  };
  const originalShowMsg = () => 'shown';

  const ready = initSystemMessageLayer({ documentRef, windowRef });
  setTimeout(() => { windowRef.showMsg = originalShowMsg; }, 10);
  const cleanup = await ready;

  assert.equal(typeof cleanup, 'function');
  assert.notEqual(windowRef.showMsg, originalShowMsg);
  windowRef.showMsg('訊息', '內容');
  assert.equal(modal.style.zIndex, '200');
  cleanup();
  assert.equal(windowRef.showMsg, originalShowMsg);
});

test('system message layer is bootstrapped globally', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /system-message-layer\.js/);
  assert.match(source, /initSystemMessageLayer/);
});

test('brand dictionary no longer owns a one-off global message z-index workaround', async () => {
  const source = await readFile(brandStoreSyncPath, 'utf8');
  assert.doesNotMatch(source, /priorMsgZIndex|applyAlertLayer|restoreAlertLayer/);
});
