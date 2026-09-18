import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PERSONALIZATION,
  normalizePersonalization,
  positionPreset,
  buildPanStyle
} from '../../src/client/app/personalization-preferences.js';

test('normalizes background positioning, scale, pan direction and iteration', () => {
  const value = normalizePersonalization({
    backgroundFileId: ' file-1 ',
    backgroundFileName: 'bg.gif',
    backgroundMimeType: 'image/gif',
    positionX: 120,
    positionY: -4,
    scale: 8,
    panEnabled: true,
    panDirection: 'wrong',
    panIteration: 'wrong'
  });
  assert.equal(value.backgroundFileId, 'file-1');
  assert.equal(value.positionX, 100);
  assert.equal(value.positionY, 0);
  assert.equal(value.scale, 3);
  assert.equal(value.panDirection, 'left');
  assert.equal(value.panIteration, 'infinite');
});

test('defaults are stable and do not enable motion', () => {
  const value = normalizePersonalization();
  assert.deepEqual(value, DEFAULT_PERSONALIZATION);
  assert.equal(value.positionX, 50);
  assert.equal(value.positionY, 50);
  assert.equal(value.scale, 1);
  assert.equal(value.panEnabled, false);
});

test('position presets cover center, edges and vertical alignment', () => {
  assert.deepEqual(positionPreset('center'), { positionX: 50, positionY: 50 });
  assert.deepEqual(positionPreset('left'), { positionX: 0, positionY: 50 });
  assert.deepEqual(positionPreset('right'), { positionX: 100, positionY: 50 });
  assert.deepEqual(positionPreset('top'), { positionX: 50, positionY: 0 });
  assert.deepEqual(positionPreset('bottom'), { positionX: 50, positionY: 100 });
});

test('pan style encodes direction and one-time/infinite playback', () => {
  assert.deepEqual(buildPanStyle({ panEnabled: false }), { animationName: 'none', animationIterationCount: '1' });
  assert.deepEqual(buildPanStyle({ panEnabled: true, panDirection: 'left', panIteration: 'once' }), {
    animationName: 'shopping-bg-pan-left',
    animationIterationCount: '1'
  });
  assert.deepEqual(buildPanStyle({ panEnabled: true, panDirection: 'right', panIteration: 'infinite' }), {
    animationName: 'shopping-bg-pan-right',
    animationIterationCount: 'infinite'
  });
});


test('normalizes multiple background files and slideshow interval while keeping legacy single-file data', () => {
  const multi = normalizePersonalization({
    backgroundFiles: [
      { fileId: ' a ', fileName: 'one.jpg', mimeType: 'image/jpeg' },
      { fileId: 'b', fileName: 'two.png', mimeType: 'image/png' }
    ],
    rotationIntervalSeconds: 1
  });
  assert.deepEqual(multi.backgroundFiles, [
    { fileId: 'a', fileName: 'one.jpg', mimeType: 'image/jpeg' },
    { fileId: 'b', fileName: 'two.png', mimeType: 'image/png' }
  ]);
  assert.equal(multi.backgroundFileId, 'a');
  assert.equal(multi.rotationIntervalSeconds, 2);

  const legacy = normalizePersonalization({
    backgroundFileId: 'legacy-id',
    backgroundFileName: 'legacy.jpg',
    backgroundMimeType: 'image/jpeg'
  });
  assert.deepEqual(legacy.backgroundFiles, [
    { fileId: 'legacy-id', fileName: 'legacy.jpg', mimeType: 'image/jpeg' }
  ]);
  assert.equal(legacy.rotationIntervalSeconds, 8);
});
