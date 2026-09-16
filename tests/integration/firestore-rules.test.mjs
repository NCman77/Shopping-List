import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const root = 'artifacts/japan-shopping-app/users';
const rulesTest = process.env.FIRESTORE_EMULATOR_HOST ? test : test.skip;
let env;

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) return;
  env = await initializeTestEnvironment({
    projectId: 'demo-shopping-list',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8')
    }
  });
});

after(async () => {
  await env?.cleanup();
});

rulesTest('item membership requires an existing unlocked trip owned by the same user', async () => {
  await env.clearFirestore();
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const trip = doc(alice, `${root}/alice/trips/t1`);
  const item = doc(alice, `${root}/alice/items/i1`);
  await setDoc(trip, { kind: 'trip', country: '日本' });
  await setDoc(item, { name: 'A', tripId: 't1' });
  assert.equal((await getDoc(item)).data().tripId, 't1');
  await assertFails(setDoc(doc(alice, `${root}/alice/items/unassigned`), { name: 'Unassigned' }));
  await assertFails(setDoc(doc(alice, `${root}/alice/items/i2`), { name: 'B', tripId: 'missing' }));
  await assertFails(getDoc(doc(bob, `${root}/alice/items/i1`)));
});

rulesTest('deletion lock prevents a concurrent item add while existing items remain editable', async () => {
  await env.clearFirestore();
  const alice = env.authenticatedContext('alice').firestore();
  const trip = doc(alice, `${root}/alice/trips/t1`);
  const item = doc(alice, `${root}/alice/items/i1`);
  await setDoc(trip, { kind: 'trip', country: '日本' });
  await setDoc(item, { name: 'A', tripId: 't1' });
  await assertFails(deleteDoc(trip));
  await updateDoc(trip, { deleting: true, deletingToken: 'lock-1', deletingAt: serverTimestamp() });
  await assertFails(setDoc(doc(alice, `${root}/alice/items/i2`), { name: 'B', tripId: 't1' }));
  await updateDoc(item, { name: 'A revised' });
  await updateDoc(trip, { deleting: false, deletingToken: '', deletingAt: null });
  await setDoc(doc(alice, `${root}/alice/items/i2`), { name: 'B', tripId: 't1' });
});

rulesTest('an empty locked trip can be deleted and its ID cannot be reused by an item', async () => {
  await env.clearFirestore();
  const alice = env.authenticatedContext('alice').firestore();
  const trip = doc(alice, `${root}/alice/trips/t1`);
  await setDoc(trip, { kind: 'trip', country: '日本' });
  await updateDoc(trip, { deleting: true, deletingToken: 'lock-1', deletingAt: serverTimestamp() });
  await deleteDoc(trip);
  await assertFails(setDoc(doc(alice, `${root}/alice/items/i1`), { name: 'A', tripId: 't1' }));
});

rulesTest('legacy migration can create a trip and assign its existing item in one batch', async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `${root}/alice/items/old`), { name: 'Old item', country: '日本' });
  });
  const alice = env.authenticatedContext('alice').firestore();
  const batch = writeBatch(alice);
  batch.set(doc(alice, `${root}/alice/trips/legacy-japan`), { kind: 'legacy', country: '日本' });
  batch.update(doc(alice, `${root}/alice/items/old`), { tripId: 'legacy-japan' });
  await batch.commit();
  assert.equal((await getDoc(doc(alice, `${root}/alice/items/old`))).data().tripId, 'legacy-japan');
});

rulesTest('client error reports are bounded, append-only, and private', async () => {
  await env.clearFirestore();
  const alice = env.authenticatedContext('alice').firestore();
  const path = 'artifacts/japan-shopping-app/clientErrors';
  const report = doc(alice, `${path}/e1`);
  await setDoc(report, {
    name: 'Error', message: 'Test', stack: '', source: 'window.error', path: '/index.html',
    line: null, column: null, createdAt: serverTimestamp()
  });
  await assertFails(getDoc(report));
  await assertFails(updateDoc(report, { message: 'Changed' }));
  await assertFails(deleteDoc(report));
  await assertFails(setDoc(doc(alice, `${path}/e2`), { name: 'Error', message: 'x'.repeat(301) }));
});
