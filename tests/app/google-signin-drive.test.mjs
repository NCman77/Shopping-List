import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadModule() {
  try {
    return await import('../../src/client/auth/google-drive-signin.js');
  } catch {
    return {};
  }
}

test('Google sign-in provider requests Drive appData scope in the same popup', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.configureGoogleProviderForDrive, 'function');

  const scopes = [];
  const provider = { addScope(scope) { scopes.push(scope); } };
  mod.configureGoogleProviderForDrive(provider);

  assert.deepEqual(scopes, ['https://www.googleapis.com/auth/drive.appdata']);
});

test('Google sign-in result stores the Drive access token for the signed-in user', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.storeDriveAccessTokenFromSignIn, 'function');

  const writes = [];
  const token = mod.storeDriveAccessTokenFromSignIn({
    result: { user: { uid: 'user-1' } },
    credentialFromResult: () => ({ accessToken: 'drive-token' }),
    sessionStorageImpl: { setItem(key, value) { writes.push([key, value]); } }
  });

  assert.equal(token, 'drive-token');
  assert.deepEqual(writes, [['shopping-list:drive-token:user-1', 'drive-token']]);
});

test('Drive-aware sign-in intercepts the existing button and uses one scoped popup', async () => {
  const mod = await loadModule();
  assert.equal(typeof mod.installGoogleDriveSignIn, 'function');

  let clickHandler;
  const label = { textContent: '使用 Google 登入' };
  const driveButton = { classList: { add() {} } };
  const button = {
    dataset: {},
    disabled: false,
    addEventListener(type, handler, options) {
      if (type === 'click') clickHandler = { handler, options };
    },
    removeEventListener() {}
  };
  const documentRef = {
    getElementById(id) {
      if (id === 'google-sign-in-btn') return button;
      if (id === 'google-sign-in-label') return label;
      if (id === 'drive-connect-btn') return driveButton;
      return null;
    }
  };
  const writes = [];
  const windowRef = {
    sessionStorage: { setItem(key, value) { writes.push([key, value]); } },
    dispatchEvent() {}
  };
  const providers = [];
  class GoogleAuthProvider {
    constructor() { this.scopes = []; providers.push(this); }
    addScope(scope) { this.scopes.push(scope); }
    static credentialFromResult() { return { accessToken: 'drive-token' }; }
  }
  const popupCalls = [];
  const authSdk = {
    getAuth: () => ({ id: 'auth' }),
    GoogleAuthProvider,
    signInWithPopup: async (auth, provider) => {
      popupCalls.push({ auth, provider });
      return { user: { uid: 'user-1' } };
    }
  };
  const appSdk = { getApps: () => [{}], getApp: () => ({}) };

  mod.installGoogleDriveSignIn({
    windowRef,
    documentRef,
    importAppSdk: async () => appSdk,
    importAuthSdk: async () => authSdk
  });

  assert.equal(clickHandler.options.capture, true);
  let stopped = false;
  await clickHandler.handler({
    preventDefault() {},
    stopImmediatePropagation() { stopped = true; }
  });

  assert.equal(stopped, true);
  assert.equal(popupCalls.length, 1);
  assert.deepEqual(providers[0].scopes, ['https://www.googleapis.com/auth/drive.appdata']);
  assert.deepEqual(writes, [['shopping-list:drive-token:user-1', 'drive-token']]);
  assert.equal(button.disabled, false);
  assert.equal(label.textContent, '使用 Google 登入');
});

test('auth bootstrap installs the Drive-aware Google sign-in handler before normal app use', async () => {
  const source = await readFile(new URL('../../src/client/app/auth-session.js', import.meta.url), 'utf8');
  assert.match(source, /google-drive-signin\.js/);
  assert.match(source, /installGoogleDriveSignIn/);
});
