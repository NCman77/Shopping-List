import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateContainedSize, calculateWidthBoundSize } from './image-compression.js';

test('shrinks a landscape image to a 1600px longest edge', () => {
  assert.deepEqual(calculateContainedSize(4000, 3000), { width: 1600, height: 1200 });
});

test('shrinks a portrait image and does not upscale small images', () => {
  assert.deepEqual(calculateContainedSize(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(calculateContainedSize(800, 600), { width: 800, height: 600 });
});

test('detail preview limits width to 1280 while preserving the original aspect ratio', () => {
  assert.deepEqual(calculateWidthBoundSize(4032, 3024, 1280), { width: 1280, height: 960 });
  assert.deepEqual(calculateWidthBoundSize(3000, 3000, 1280), { width: 1280, height: 1280 });
  assert.deepEqual(calculateWidthBoundSize(3024, 4032, 1280), { width: 1280, height: 1707 });
});

test('detail preview never upscales an image whose width is already 1280 or less', () => {
  assert.deepEqual(calculateWidthBoundSize(1024, 2048, 1280), { width: 1024, height: 2048 });
  assert.deepEqual(calculateWidthBoundSize(1280, 720, 1280), { width: 1280, height: 720 });
});

test('rejects invalid dimensions', () => {
  assert.throws(() => calculateContainedSize(0, 100), RangeError);
  assert.throws(() => calculateWidthBoundSize(0, 100, 1280), RangeError);
});
