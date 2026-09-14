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

test('index wires the same Google sign-in popup to Drive token persistence', async () => {
  const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(source, /configureGoogleProviderForDrive/);
  assert.match(source, /storeDriveAccessTokenFromSignIn/);
  assert.match(source, /const\s+result\s*=\s*await\s+signInWithPopup\(auth,\s*googleProvider\)/);
});
