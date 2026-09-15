import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMapsScriptUrl, loadPlacesLibrary } from '../../src/client/location/google-places-loader.js';

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

test('repository loader source never contains a hard-coded Google browser credential', async () => {
  const source = await readFile(new URL('../../src/client/location/google-places-loader.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(source, /YOUR_API_KEY/);
});
