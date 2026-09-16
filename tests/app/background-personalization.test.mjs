import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isSupportedBackgroundFile, backgroundKindForMime } from '../../src/client/app/background-personalization.js';

test('background accepts common images, GIF, MP4 and WebM only', () => {
  assert.equal(isSupportedBackgroundFile({ type: 'image/jpeg', name: 'a.jpg' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'image/png', name: 'a.png' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'image/webp', name: 'a.webp' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'image/gif', name: 'a.gif' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'video/mp4', name: 'a.mp4' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'video/webm', name: 'a.webm' }), true);
  assert.equal(isSupportedBackgroundFile({ type: 'text/plain', name: 'a.txt' }), false);
  assert.equal(backgroundKindForMime('video/mp4'), 'video');
  assert.equal(backgroundKindForMime('image/gif'), 'image');
});

test('background editor contains non-destructive framing and pan controls', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /background-preview-viewport/);
  assert.match(source, /background-scale/);
  assert.match(source, /data-position-preset="center"/);
  assert.match(source, /data-position-preset="left"/);
  assert.match(source, /data-position-preset="right"/);
  assert.match(source, /data-position-preset="top"/);
  assert.match(source, /data-position-preset="bottom"/);
  assert.match(source, /background-pan-enabled/);
  assert.match(source, /background-pan-direction/);
  assert.match(source, /background-pan-iteration/);
});

test('video backgrounds are muted inline and Drive replacement is saved before old cleanup', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /playsInline = true/);
  assert.match(source, /muted = true/);
  assert.match(source, /uploadFile/);
  assert.match(source, /setDoc/);
  assert.match(source, /deletePhoto/);
  assert.ok(source.indexOf('await setDoc') < source.lastIndexOf('deletePhoto'));
  assert.match(source, /shopping-list:open-personalization/);
  assert.match(source, /shopping-list:drive-token-ready/);
});

test('background downloads and saves use captured auth operations and references', async () => {
  const source = await readFile(new URL('../../src/client/app/background-personalization.js', import.meta.url), 'utf8');
  assert.match(source, /createSessionOperationTracker/);
  assert.match(source, /tracker\.advance\(user\?\.uid\s*\|\|\s*''\)/);
  assert.match(source, /tracker\.nextRequest/);
  assert.match(source, /tracker\.isSessionCurrent/);
  assert.match(source, /tracker\.isLatestRequest/);
  assert.match(source, /const capturedSettingsRef/);
  assert.match(source, /driveServiceForUser/);
  assert.doesNotMatch(source, /await setDoc\(settingsRef\(\)/);
});
