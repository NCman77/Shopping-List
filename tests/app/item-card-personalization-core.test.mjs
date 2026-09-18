import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ITEM_CARD_PERSONALIZATION,
  normalizeItemCardPersonalization
} from '../../src/client/app/item-card-personalization-core.js';

test('item card personalization normalizes default, color, and media settings', () => {
  assert.deepEqual(normalizeItemCardPersonalization(), DEFAULT_ITEM_CARD_PERSONALIZATION);

  const color = normalizeItemCardPersonalization({ mode: 'color', color: '#abc123' });
  assert.equal(color.mode, 'color');
  assert.equal(color.color, '#ABC123');

  const media = normalizeItemCardPersonalization({
    mode: 'media',
    backgroundFileId: ' file-1 ',
    backgroundFileName: 'bg.gif',
    backgroundMimeType: 'image/gif',
    positionX: 120,
    positionY: -2,
    scale: 8
  });
  assert.equal(media.mode, 'media');
  assert.equal(media.backgroundFileId, 'file-1');
  assert.equal(media.positionX, 100);
  assert.equal(media.positionY, 0);
  assert.equal(media.scale, 3);
});

test('invalid color or media-without-file falls back safely', () => {
  assert.equal(normalizeItemCardPersonalization({ mode: 'color', color: 'red' }).color, '#FFFFFF');
  assert.equal(normalizeItemCardPersonalization({ mode: 'media' }).mode, 'default');
});
