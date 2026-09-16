import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptCompressedPhoto } from '../../src/client/photos/photo-selection.js';

test('stale compressed photo is discarded and its preview URL is revoked', () => {
  const compressed = { previewUrl: 'blob:stale' };
  const revoked = [];

  const result = acceptCompressedPhoto({
    selectionGeneration: 4,
    currentGeneration: 5,
    compressed,
    revoke: (photo) => revoked.push(photo.previewUrl)
  });

  assert.equal(result, null);
  assert.deepEqual(revoked, ['blob:stale']);
});

test('current compressed photo is accepted without revocation', () => {
  const compressed = { previewUrl: 'blob:current' };
  const revoked = [];

  const result = acceptCompressedPhoto({
    selectionGeneration: 4,
    currentGeneration: 4,
    compressed,
    revoke: (photo) => revoked.push(photo.previewUrl)
  });

  assert.equal(result, compressed);
  assert.deepEqual(revoked, []);
});
