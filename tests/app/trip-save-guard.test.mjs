import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveTripMembershipForSave } from '../../src/client/app/trip-save-guard.js';

const guardPath = new URL('../../src/client/app/trip-save-guard.js', import.meta.url);
const appPath = new URL('../../src/client/app/app-enhancements.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('new item membership comes from active trip', () => {
  assert.deepEqual(resolveTripMembershipForSave({
    existingItem: null,
    activeTrip: { id: 'trip-jp-fall', country: '日本' }
  }), { tripId: 'trip-jp-fall', country: '日本' });
});

test('editing preserves existing trip membership even when another trip is active', () => {
  assert.deepEqual(resolveTripMembershipForSave({
    existingItem: { tripId: 'trip-old', country: '韓國' },
    activeTrip: { id: 'trip-new', country: '日本' }
  }), { tripId: 'trip-old', country: '韓國' });
});

test('existing unassigned item does not get silently moved to active trip', () => {
  assert.deepEqual(resolveTripMembershipForSave({
    existingItem: { country: '日本' },
    activeTrip: { id: 'trip-new', country: '日本' }
  }), { tripId: '', country: '日本' });
});

test('trip save guard blocks new save without resolved active trip and injects membership before the original save', async () => {
  const source = await readFile(guardPath, 'utf8');
  assert.match(source, /shoppingListTripContextReady/);
  assert.match(source, /shoppingListActiveTrip/);
  assert.match(source, /請先新增或選擇一趟旅程/);
  assert.match(source, /shoppingListPendingMembership/);
  assert.match(source, /await originalSave/);
  assert.match(source, /generatedNewId/);
});

test('base item save writes pending trip membership in the same Firestore batch as the item', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /shoppingListPendingMembership/);
  assert.match(source, /tripId:\s*pendingMembership\.tripId/);
  assert.match(source, /country:\s*pendingMembership\.country/);
  const dataIndex = source.indexOf('const itemData =');
  const batchIndex = source.indexOf('batch.set(itemRef, itemData');
  assert.ok(dataIndex >= 0 && batchIndex > dataIndex);
});

test('bootstrap uses trip save guard instead of competing country save guard', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /trip-save-guard\.js/);
  assert.match(source, /initTripSaveGuard/);
  assert.doesNotMatch(source, /initCountrySaveGuard/);
  assert.match(source, /商品旅程儲存/);
});
