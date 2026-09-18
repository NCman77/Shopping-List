import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configureGoogleProviderForDrive } from '../../src/client/auth/google-drive-signin.js';

test('Drive provider adds appData scope without forcing a repeated consent prompt', () => {
  const scopes = [];
  const customParameters = [];
  const provider = {
    addScope(scope) { scopes.push(scope); },
    setCustomParameters(params) { customParameters.push(params); }
  };
  configureGoogleProviderForDrive(provider, { loginHint: 'user@example.com' });
  assert.deepEqual(scopes, ['https://www.googleapis.com/auth/drive.appdata']);
  assert.deepEqual(customParameters, [{ login_hint: 'user@example.com' }]);
  assert.equal('prompt' in customParameters[0], false);
});

test('all Drive reconnect flows reuse the shared provider configuration and never force consent', async () => {
  const paths = [
    '../../src/client/app/app-enhancements.js',
    '../../src/client/app/background-personalization.js',
    '../../src/client/app/header-background-personalization.js',
    '../../src/client/app/item-card-personalization.js'
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /configureGoogleProviderForDrive/);
    assert.doesNotMatch(source, /prompt:\s*['"]consent['"]/);
  }
});
