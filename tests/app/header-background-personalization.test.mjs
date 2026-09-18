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

test('header background fills a fixed-height banner and its editor mirrors the cover behavior', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<header[^>]*h-\[196px\]/);
  assert.match(source, /aspect-\[16\/9\]/);
  assert.match(source, /\.header-background-media\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/s);
  assert.match(source, /#header-background-preview-media\s*\{[^}]*object-fit:\s*cover/s);
});

test('header background editor accepts multiple files and exposes a slideshow interval', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /id="header-background-file-input"[^>]*multiple/);
  assert.match(source, /id="header-background-rotation-interval"/);
  assert.match(source, /rotationIntervalSeconds/);
  assert.match(source, /setInterval/);
});


test('header editor has per-photo thumbnails and no pan controls', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /header-background-thumbnails/);
  assert.match(source, /data-header-background-index/);
  assert.match(source, /header-background-delete-current/);
  assert.doesNotMatch(source, /header-background-pan-enabled/);
  assert.doesNotMatch(source, /header-background-pan-direction/);
  assert.doesNotMatch(source, /header-background-pan-iteration/);
  assert.doesNotMatch(source, /buildPanStyle/);
});


test('header slideshow interval can be cleared temporarily without immediately restoring a number', async () => {
  const source = await readFile(new URL('../../src/client/app/header-background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /normalizeRotationIntervalDraft/);
  assert.match(source, /header-background-rotation-interval/);
  assert.match(source, /if \(nextInterval === null\) return/);
});
