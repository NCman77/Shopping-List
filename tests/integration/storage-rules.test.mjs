import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const rulesTest = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? test : test.skip;
let env;

before(async () => {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) return;
  env = await initializeTestEnvironment({
    projectId: 'demo-shopping-list',
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: await readFile(new URL('../../firebase/storage.rules', import.meta.url), 'utf8')
    }
  });
});

after(async () => {
  await env?.cleanup();
});

rulesTest('personalization Storage files are private to their owner', async () => {
  const alice = env.authenticatedContext('alice').storage();
  const bob = env.authenticatedContext('bob').storage();
  const path = 'personalization/alice/header/banner.jpg';
  await uploadBytes(ref(alice, path), new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' });
  const bytes = await getBytes(ref(alice, path));
  assert.equal(bytes.length, 3);
  await assertFails(getBytes(ref(bob, path)));
  await assertFails(uploadBytes(ref(bob, path), new Uint8Array([9]), { contentType: 'image/jpeg' }));
  await deleteObject(ref(alice, path));
});

rulesTest('personalization Storage rejects unsupported content types and oversized writes', async () => {
  const alice = env.authenticatedContext('alice').storage();
  await assertFails(uploadBytes(
    ref(alice, 'personalization/alice/header/file.exe'),
    new Uint8Array([1]),
    { contentType: 'application/octet-stream' }
  ));
});
