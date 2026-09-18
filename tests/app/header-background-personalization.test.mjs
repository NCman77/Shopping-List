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
  assert.match(source, /\.header-background-media\s*\{/);
  assert.match(source, /width:\s*calc\(100% \+ \$\{HEADER_OVERSCAN_PERCENT\}%\)/);
  assert.match(source, /height:\s*calc\(100% \+ \$\{HEADER_OVERSCAN_PERCENT\}%\)/);
  assert.match(source, /object-fit:\s*cover/);
  assert.match(source, /#header-background-preview-media\s*\{/);
  assert.match(source, /object-fit:\s*cover/);
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


test('every header photo uses overscan positioning so both axes visibly move', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /HEADER_OVERSCAN_PERCENT/);
  assert.match(source, /headerBackgroundTransform/);
  assert.match(source, /translate\(/);
  assert.match(source, /objectPosition = ['"]50% 50%['"]/);
});

test('header uploader separates replace and append actions', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /header-background-replace/);
  assert.match(source, /重新上傳/);
  assert.match(source, /header-background-append/);
  assert.match(source, /繼續上傳/);
  assert.match(source, /uploadMode/);
  assert.match(source, /appendPendingFiles/);
});

test('header thumbnails support long-press reordering and playlist order follows the thumbnails', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /LONG_PRESS_MS\s*=\s*450/);
  assert.match(source, /pointerdown/);
  assert.match(source, /pointermove/);
  assert.match(source, /reorderBackgroundFiles/);
  assert.match(source, /data-header-background-index/);
});

test('header background exposes a reconnect action when a browser has no Drive token', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /header-background-auth-required/);
  assert.match(source, /authorization-required/);
  assert.match(source, /connectDrive/);
});


test('header preview overscan is not clamped by global image max-width and supports pinch zoom', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /#header-background-preview-media\s*\{[\s\S]*max-width:\s*none[\s\S]*max-height:\s*none/);
  assert.match(source, /\.header-background-media\s*\{[\s\S]*max-width:\s*none[\s\S]*max-height:\s*none/);
  assert.match(source, /scaleForPinch/);
  assert.match(source, /previewPointers/);
  assert.match(source, /pinch/);
});

test('pinch scale follows finger distance and clamps to the supported 1x-3x range', async () => {
  const mod = await import('../../src/client/app/header-background-personalization.js');
  assert.equal(mod.scaleForPinch({ startScale: 1, startDistance: 100, currentDistance: 150 }), 1.5);
  assert.equal(mod.scaleForPinch({ startScale: 2.5, startDistance: 100, currentDistance: 200 }), 3);
  assert.equal(mod.scaleForPinch({ startScale: 1.2, startDistance: 100, currentDistance: 10 }), 1);
});


test('header thumbnail long-press disables browser image callouts and captures the dragged thumbnail', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /-webkit-touch-callout:\s*none/);
  assert.match(source, /user-select:\s*none/);
  assert.match(source, /image\.draggable\s*=\s*false/);
  assert.match(source, /contextmenu/);
  assert.match(source, /preventDefault\(\)/);
  assert.match(source, /button\.setPointerCapture\?\.\(event\.pointerId\)/);
});


test('header thumbnail reorder keeps the captured DOM node alive until pointer release', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /moveThumbnailDom/);
  const moveStart = source.indexOf("thumbnailsRoot.addEventListener('pointermove'");
  const moveEnd = source.indexOf("thumbnailsRoot.addEventListener('pointerup'", moveStart);
  const moveHandler = source.slice(moveStart, moveEnd > moveStart ? moveEnd : source.length);
  assert.doesNotMatch(moveHandler, /renderEditorPreview\(\)/);
  const finishStart = source.indexOf('function finishThumbnailReorder');
  const finishEnd = source.indexOf("thumbnailsRoot.addEventListener('pointerdown'", finishStart);
  const finishHandler = source.slice(finishStart, finishEnd > finishStart ? finishEnd : source.length);
  assert.match(finishHandler, /renderEditorPreview\(\)/);
});


test('header background editor uses the unified color and custom-image tabs with reusable color controls', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /data-header-background-mode="color"[^>]*>單色</);
  assert.match(source, /data-header-background-mode="media"[^>]*>自訂圖片</);
  assert.match(source, /header-background-color-panel/);
  assert.match(source, /header-background-color-hex/);
  assert.match(source, /header-background-color-presets/);
  assert.match(source, /header-background-reset-default/);
  assert.match(source, /#FCD5CE/);
  assert.match(source, /header-background-back/);
  assert.match(source, /shopping-list:open-personalization/);
});

test('header custom-image mode remains multi-photo with slideshow support', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /id="header-background-file-input"[^>]*multiple/);
  assert.match(source, /id="header-background-rotation-interval"/);
});


test('header background quick-position buttons update their selected highlight', async () => {
  const source = await sourceOrFail('../../src/client/app/header-background-personalization.js', 'header background module is missing');
  assert.match(source, /syncPositionPresetButtons/);
  assert.match(source, /data-header-position-preset/);
  assert.match(source, /classList\.toggle\('bg-pastelYellow',\s*active\)/);
  assert.match(source, /classList\.toggle\('bg-shinBg',\s*!active\)/);
});
