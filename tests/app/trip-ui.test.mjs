import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { groupTripsForUi, formatTripDateRange, canChangeTripCountry, canDeleteTrip } from '../../src/client/app/trip-ui.js';

const sourcePath = new URL('../../src/client/app/trip-ui.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('trip UI groups trips into ongoing upcoming past and legacy sections', () => {
  const groups = groupTripsForUi([
    { id: 'legacy', kind: 'legacy', country: '日本' },
    { id: 'past', kind: 'trip', country: '日本', startDate: '2026-08-01', endDate: '2026-08-05' },
    { id: 'ongoing', kind: 'trip', country: '日本', startDate: '2026-09-10', endDate: '2026-09-20' },
    { id: 'future', kind: 'trip', country: '日本', startDate: '2026-10-01', endDate: '2026-10-05' }
  ], '2026-09-15');
  assert.deepEqual(groups.ongoing.map((trip) => trip.id), ['ongoing']);
  assert.deepEqual(groups.upcoming.map((trip) => trip.id), ['future']);
  assert.deepEqual(groups.past.map((trip) => trip.id), ['past']);
  assert.deepEqual(groups.legacy.map((trip) => trip.id), ['legacy']);
});

test('trip date range is compact and legacy has no fake date', () => {
  assert.equal(formatTripDateRange({ kind: 'trip', startDate: '2026-09-21', endDate: '2026-09-27' }), '9/21 – 9/27');
  assert.equal(formatTripDateRange({ kind: 'trip', startDate: '2026-12-30', endDate: '2027-01-02' }), '2026/12/30 – 2027/1/2');
  assert.equal(formatTripDateRange({ kind: 'legacy', startDate: null, endDate: null }), '既有清單');
});

test('country changes and deletion are allowed only for empty normal trips', () => {
  assert.equal(canChangeTripCountry({ kind: 'trip' }, 0), true);
  assert.equal(canChangeTripCountry({ kind: 'trip' }, 1), false);
  assert.equal(canChangeTripCountry({ kind: 'legacy' }, 0), false);
  assert.equal(canDeleteTrip({ kind: 'trip' }, 0), true);
  assert.equal(canDeleteTrip({ kind: 'trip' }, 2), false);
  assert.equal(canDeleteTrip({ kind: 'legacy' }, 0), false);
});

test('homepage exposes an always-visible active trip selector and empty onboarding action', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /active-trip-shell/);
  assert.match(source, /active-trip-selector/);
  assert.match(source, /新增第一趟旅程/);
  assert.match(source, /新增旅程/);
  assert.match(source, /管理旅遊紀錄/);
  assert.match(source, /旅行中/);
  assert.match(source, /即將出發/);
  assert.match(source, /過去旅程/);
  assert.match(source, /既有清單/);
});

test('first-trip onboarding makes the trip form modal visible', async () => {
  const source = (await readFile(sourcePath, 'utf8')).replace(/\r\n?/g, '\n');
  const openFormBody = source.match(/function openForm\(trip\) \{([\s\S]*?)\n  \}\n\n  async function saveTrip/)?.[1] || '';
  assert.match(openFormBody, /modal\.classList\.remove\('hidden'\)/);
  assert.match(openFormBody, /modal\.classList\.add\('flex'\)/);
});

test('avatar account menu receives a travel records entry', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /account-open-trips/);
  assert.match(source, /旅遊紀錄/);
  assert.match(source, /account-settings-root/);
});

test('trip form validates dates and locks occupied-trip country and delete controls', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /validateTripDraft/);
  assert.match(source, /canChangeTripCountry/);
  assert.match(source, /canDeleteTrip/);
  assert.match(source, /deleteDoc/);
  assert.match(source, /setDoc/);
});

test('feature bootstrap loads trip UI independently', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /trip-ui\.js/);
  assert.match(source, /initTripUi/);
  assert.match(source, /旅程介面/);
});
