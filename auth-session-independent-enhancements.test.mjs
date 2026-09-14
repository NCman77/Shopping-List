import test from 'node:test';
import assert from 'node:assert/strict';
import { runEnhancementsIndependently } from './auth-session.js';

test('home UI still initializes when Drive enhancements fail', async () => {
  const calls = [];

  const results = await runEnhancementsIndependently(
    async () => {
      calls.push('home');
      return 'home-ready';
    },
    async () => {
      calls.push('drive');
      throw new Error('Drive initialization failed');
    }
  );

  assert.deepEqual(calls.sort(), ['drive', 'home']);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[0].value, 'home-ready');
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /Drive initialization failed/);
});
