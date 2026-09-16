import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeClientError } from '../../src/client/app/error-monitor.js';

const sourcePath = new URL('../../src/client/app/error-monitor.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('client error payload removes credentials, query strings, and excessive stack data', () => {
  const payload = sanitizeClientError({
    name: 'Error',
    message: 'token=secret user@example.com',
    stack: 'Error: token=secret\n at https://example.com/app.js?token=secret:1:2'
  }, 'window.error');
  assert.equal(payload.message, '[redacted] [redacted]');
  assert.doesNotMatch(payload.stack, /secret|user@example\.com/);
  assert.doesNotMatch(payload.path, /\?/);
  assert.equal(payload.source, 'window.error');
});

test('error monitor installs global handlers and is bootstrapped independently', async () => {
  const [source, bootstrap] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(bootstrapPath, 'utf8')
  ]);
  assert.match(source, /unhandledrejection/);
  assert.match(source, /clientErrors/);
  assert.match(source, /addDoc/);
  assert.match(bootstrap, /error-monitor\.js/);
  assert.match(bootstrap, /initClientErrorMonitoring/);
});
