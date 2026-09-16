import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateContainedSize, calculateWidthBoundSize } from './image-compression.js';

test('normal uploads cap the longest edge at 1280 while preserving aspect ratio', () => {
  assert.deepEqual(calculateContainedSize(3000, 4500), { width: 853, height: 1280 });
  assert.deepEqual(calculateContainedSize(4000, 3000), { width: 1280, height: 960 });
  assert.deepEqual(calculateContainedSize(2000, 2000), { width: 1280, height: 1280 });
});

test('normal uploads never upscale images whose longest edge is already 1280 or less', () => {
  assert.deepEqual(calculateContainedSize(800, 1200), { width: 800, height: 1200 });
  assert.deepEqual(calculateContainedSize(1024, 768), { width: 1024, height: 768 });
  assert.deepEqual(calculateContainedSize(1280, 720), { width: 1280, height: 720 });
});

test('legacy width-bound sizing remains available without changing its behavior', () => {
  assert.deepEqual(calculateWidthBoundSize(4032, 3024, 1280), { width: 1280, height: 960 });
  assert.deepEqual(calculateWidthBoundSize(1024, 2048, 1280), { width: 1024, height: 2048 });
});

test('rejects invalid dimensions', () => {
  assert.throws(() => calculateContainedSize(0, 100), RangeError);
  assert.throws(() => calculateWidthBoundSize(0, 100, 1280), RangeError);
});
