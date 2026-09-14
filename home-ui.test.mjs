import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('auth session loads the home UI enhancements in the browser', async () => {
  const source = await readFile(new URL('./auth-session.js', import.meta.url), 'utf8');
  assert.match(source, /import\('\.\/home-ui-enhancements\.js'\)/);
});

test('home UI enhancements include fixed add button, account avatar menu, and filter manager hooks', async () => {
  let source = '';
  try {
    source = await readFile(new URL('./home-ui-enhancements.js', import.meta.url), 'utf8');
  } catch (error) {
    assert.fail(`home-ui-enhancements.js should exist: ${error.message}`);
  }
  assert.match(source, /position:\s*fixed/i);
  assert.match(source, /Shin-chan Style/);
  assert.match(source, /manage-filter-modal/);
  assert.match(source, /user-name/);
  assert.match(source, /sign-out-btn/);
});
