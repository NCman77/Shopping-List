import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authSource = await readFile(new URL('./auth-session.js', import.meta.url), 'utf8');

test('photo visibility recovery boots independently from Drive upload initialization', () => {
  assert.match(authSource, /photo-visibility-enhancements\.js/);
  assert.match(authSource, /initPhotoVisibilityEnhancements/);
});

test('photo visibility recovery offers authorization instead of silently showing no photo and backfills a thumbnail', async () => {
  let source = '';
  try {
    source = await readFile(new URL('./photo-visibility-enhancements.js', import.meta.url), 'utf8');
  } catch (error) {
    assert.fail(`photo-visibility-enhancements.js should exist: ${error.message}`);
  }
  assert.match(source, /authorization-required/);
  assert.match(source, /connectGoogleDrive/);
  assert.match(source, /updateDoc/);
  assert.match(source, /photoUrl/);
  assert.match(source, /compressImage/);
});
