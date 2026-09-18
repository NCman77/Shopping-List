import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function sourceOrFail(path, message) {
  try {
    return await readFile(new URL(path, import.meta.url), 'utf8');
  } catch {
    assert.fail(message);
  }
}

test('header background has an independent layer and settings field', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /header-background-layer/);
  assert.match(source, /headerPersonalization/);
  assert.match(source, /shopping-list:open-header-background/);
  assert.match(source, /kind:\s*['"]header-background['"]/);
});

test('header editor uses a landscape preview and does not crop the full image at default scale', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /aspect-\[16\/9\]/);
  assert.match(source, /object-fit:\s*contain/);
  assert.match(source, /header-background-preview-media/);
});
