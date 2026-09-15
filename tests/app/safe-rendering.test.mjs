import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safePersistedImageSource } from '../../src/client/app/safe-rendering.js';

test('allows only supported persisted image sources', () => {
  assert.equal(safePersistedImageSource('https://example.test/photo.webp'), 'https://example.test/photo.webp');
  assert.equal(safePersistedImageSource('blob:https://example.test/id'), 'blob:https://example.test/id');
  assert.equal(safePersistedImageSource('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(safePersistedImageSource('javascript:alert(1)'), '');
  assert.equal(safePersistedImageSource('data:image/svg+xml,<svg onload=alert(1)>'), '');
  assert.equal(safePersistedImageSource('http://example.test/photo.jpg'), '');
});

test('persisted filters, options and item cards use DOM text and listeners', async () => {
  const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const start = source.indexOf('function renderFilterTabs()');
  const end = source.indexOf('// 將互動函式掛載至 window');
  const rendering = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(rendering, /innerHTML\s*\+=/);
  assert.doesNotMatch(rendering, /onclick=/);
  assert.doesNotMatch(rendering, /onchange=/);
  assert.doesNotMatch(rendering, /\$\{item\.(?:name|category|location|description|id|photoUrl)\}/);
  assert.match(rendering, /textContent/);
  assert.match(rendering, /addEventListener/);
  assert.match(source, /safePersistedImageSource/);
});
