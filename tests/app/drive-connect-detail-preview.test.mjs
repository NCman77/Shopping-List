import test from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  try {
    return await import('../../src/client/photos/drive-connect-detail-preview-bridge.js');
  } catch {
    return {};
  }
}

test('Drive connect bridge intercepts the legacy button handler and routes through the wrapped global hook', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.installDriveConnectDetailPreviewBridge, 'function');

  let handler = null;
  const button = {
    dataset: {},
    addEventListener(type, listener, options) {
      assert.equal(type, 'click');
      assert.equal(options, true);
      handler = listener;
    }
  };
  const calls = [];
  const windowRef = {
    connectGoogleDrive: async (interactive) => { calls.push(interactive); return 'token'; },
    backfillDetailPhotoPreviews: async () => ({ updated: 1 })
  };
  const documentRef = { getElementById: (id) => id === 'drive-connect-btn' ? button : null };

  assert.equal(mod.installDriveConnectDetailPreviewBridge({ windowRef, documentRef }), true);
  assert.equal(typeof handler, 'function');

  const event = {
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; }
  };
  await handler(event);

  assert.deepEqual(calls, [true]);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
});
