import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildMapsScriptUrl,
  loadPlacesLibrary,
  loadPlacesLibraryWithFailover
} from '../../src/client/location/google-places-loader.js';

test('Maps script URL is created only from a supplied browser key and requests Places lazily', () => {
  const url = buildMapsScriptUrl('test-browser-key');
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://maps.googleapis.com');
  assert.equal(parsed.pathname, '/maps/api/js');
  assert.equal(parsed.searchParams.get('key'), 'test-browser-key');
  assert.equal(parsed.searchParams.get('loading'), 'async');
  assert.equal(parsed.searchParams.get('libraries'), 'places');
  assert.equal(parsed.searchParams.get('v'), 'weekly');
});

test('loadPlacesLibrary does not create a script until explicitly called and resolves through importLibrary', async () => {
  const scripts = [];
  const windowImpl = {};
  const documentImpl = {
    createElement(tag) {
      assert.equal(tag, 'script');
      return { dataset: {} };
    },
    head: {
      appendChild(script) {
        scripts.push(script);
        windowImpl.google = { maps: { importLibrary: async (name) => ({ name, Place: class Place {} }) } };
        queueMicrotask(() => script.onload?.());
      }
    }
  };

  assert.equal(scripts.length, 0);
  const library = await loadPlacesLibrary({ apiKey: 'lazy-key', documentImpl, windowImpl });
  assert.equal(scripts.length, 1);
  assert.equal(library.name, 'places');
  assert.match(scripts[0].src, /maps\.googleapis\.com\/maps\/api\/js/);
});

test('loader rejects missing keys without mutating the document', async () => {
  let created = 0;
  await assert.rejects(
    loadPlacesLibrary({ apiKey: ' ', documentImpl: { createElement() { created += 1; } }, windowImpl: {} }),
    /API Key/
  );
  assert.equal(created, 0);
});

test('failover returns primary without touching backup when primary loads successfully', async () => {
  const calls = [];
  const result = await loadPlacesLibraryWithFailover({
    primaryKey: 'primary',
    backupKey: 'backup',
    windowImpl: {},
    loadLibrary: async ({ apiKey }) => {
      calls.push(apiKey);
      return { apiKey };
    }
  });
  assert.deepEqual(calls, ['primary']);
  assert.equal(result.keySlot, 'primary');
  assert.deepEqual(result.library, { apiKey: 'primary' });
});

test('credential failure may try backup once before a usable global Maps library exists', async () => {
  const calls = [];
  const result = await loadPlacesLibraryWithFailover({
    primaryKey: 'primary',
    backupKey: 'backup',
    windowImpl: {},
    loadLibrary: async ({ apiKey }) => {
      calls.push(apiKey);
      if (apiKey === 'primary') throw new Error('InvalidKeyMapError');
      return { apiKey };
    }
  });
  assert.deepEqual(calls, ['primary', 'backup']);
  assert.equal(result.keySlot, 'backup');
});

test('quota and billing failures never rotate to the backup key', async () => {
  for (const message of ['OverQuotaMapError', 'BillingNotEnabledMapError']) {
    const calls = [];
    await assert.rejects(
      loadPlacesLibraryWithFailover({
        primaryKey: 'primary',
        backupKey: 'backup',
        windowImpl: {},
        loadLibrary: async ({ apiKey }) => {
          calls.push(apiKey);
          throw new Error(message);
        }
      }),
      new RegExp(message)
    );
    assert.deepEqual(calls, ['primary']);
  }
});

test('backup is attempted at most once and failover is blocked after Maps global becomes usable', async () => {
  const backupCalls = [];
  await assert.rejects(
    loadPlacesLibraryWithFailover({
      primaryKey: 'primary',
      backupKey: 'backup',
      windowImpl: {},
      loadLibrary: async ({ apiKey }) => {
        backupCalls.push(apiKey);
        throw new Error(apiKey === 'primary' ? 'InvalidKeyMapError' : 'RefererNotAllowedMapError');
      }
    }),
    /RefererNotAllowedMapError/
  );
  assert.deepEqual(backupCalls, ['primary', 'backup']);

  const windowImpl = {};
  const calls = [];
  await assert.rejects(
    loadPlacesLibraryWithFailover({
      primaryKey: 'primary',
      backupKey: 'backup',
      windowImpl,
      loadLibrary: async ({ apiKey }) => {
        calls.push(apiKey);
        windowImpl.google = { maps: { importLibrary() {} } };
        throw new Error('InvalidKeyMapError');
      }
    }),
    /重新載入|reload/i
  );
  assert.deepEqual(calls, ['primary']);
});

test('repository loader source never contains a hard-coded Google browser credential', async () => {
  const source = await readFile(new URL('../../src/client/location/google-places-loader.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(source, /YOUR_API_KEY/);
});
