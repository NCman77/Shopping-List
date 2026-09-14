import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateContainedSize } from './image-compression.js';

test('shrinks a landscape image to a 1600px longest edge', () => {
  assert.deepEqual(calculateContainedSize(4000, 3000), { width: 1600, height: 1200 });
});

test('shrinks a portrait image and does not upscale small images', () => {
  assert.deepEqual(calculateContainedSize(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(calculateContainedSize(800, 600), { width: 800, height: 600 });
});

test('rejects invalid dimensions', () => {
  assert.throws(() => calculateContainedSize(0, 100), RangeError);
});
