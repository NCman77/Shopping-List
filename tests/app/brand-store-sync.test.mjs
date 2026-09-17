import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexPath = new URL('../../index.html', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('homepage no longer exposes a standalone add-location button', async () => {
  const source = await readFile(indexPath, 'utf8');
  assert.doesNotMatch(source, /openInputModal\('新增地點', '輸入新地點\.\.\.', handleAddLocation\)/);
});

test('brand store synchronization is bootstrapped as an independent feature', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /brand-store-sync\.js/);
  assert.match(source, /initBrandStoreSync/);
  assert.match(source, /品牌商店同步/);
});
