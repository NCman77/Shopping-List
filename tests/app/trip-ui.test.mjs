import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { groupTripsForUi, formatTripDateRange, canChangeTripCountry, canDeleteTrip, collapsedTripLabel, expandedTripLabel } from '../../src/client/app/trip-ui.js';

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
  assert.match(source, /已結束旅程/);
  assert.match(source, /既有清單/);
});



test('homepage trip selector lives in the 52px header toolbar and uses a glass pill', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /getElementById\(['"]header-toolbar['"]\)/);
  assert.match(source, /toolbar\.prepend\(shell\)/);
  assert.doesNotMatch(source, /#active-trip-shell\s*\{[^}]*position:\s*absolute/s);
  assert.match(source, /backdrop-blur-sm/);
  assert.match(source, /bg-white\/25/);
  assert.doesNotMatch(source, /bg-\[#F5E6D3\]/);
});

test('top-left trip selector uses the same 2.5rem outer height as the account avatar', async () => {
  const tripSource = await readFile(sourcePath, 'utf8');
  const homeSource = await readFile(new URL('../../src/client/app/home-ui-enhancements.js', import.meta.url), 'utf8');
  assert.match(homeSource, /#user-panel #user-avatar,[\s\S]*?height:\s*2\.5rem\s*!important/);
  assert.match(tripSource, /#active-trip-selector\s*\{[^}]*height:\s*2\.5rem/s);
  assert.doesNotMatch(tripSource, /#active-trip-selector\s*\{[^}]*min-height:\s*2\.5rem/s);
});

test('top-left trip selector keeps the airplane icon inside the glass control', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /fa-plane/);
  assert.doesNotMatch(source, /fa-suitcase-rolling/);
  assert.match(source, /bg-white\/25/);
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
  assert.match(source, /transaction\.delete\(tripRef\)/);
  assert.match(source, /runTransaction/);
  assert.match(source, /getDocsFromServer/);
  assert.match(source, /deletingToken/);
  assert.match(source, /where\(['"]tripId['"]/);
  assert.match(source, /limit\(1\)/);
  assert.match(source, /setDoc/);
});

test('feature bootstrap loads trip UI independently', async () => {
  const source = await readFile(bootstrapPath, 'utf8');
  assert.match(source, /trip-ui\.js/);
  assert.match(source, /initTripUi/);
  assert.match(source, /旅程介面/);
});


test('compact trip selector shows country only and expanded selector shows the full trip title', () => {
  const trip = { kind: 'trip', country: '日本', title: '東京', startDate: '2026-09-21', endDate: '2026-09-27' };
  assert.equal(collapsedTripLabel(trip), '日本');
  assert.equal(expandedTripLabel(trip), '日本 · 東京');
});

test('trip selector expands on first click, auto-collapses after three seconds, and second click opens picker', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /is-expanded/);
  assert.match(source, /setTimeout\([^,]+,\s*3000\)/s);
  assert.match(source, /selectorExpanded/);
  assert.match(source, /if \(!selectorExpanded\)[\s\S]*expandSelector\(\)[\s\S]*return/s);
  assert.match(source, /openModal\('picker'\)/);
});

test('compact trip selector is more transparent than before', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /bg-white\/25/);
  assert.match(source, /backdrop-blur-sm/);
  assert.doesNotMatch(source, /bg-white\/60/);
});

test('ended trips remain below ongoing and upcoming trips and are date-sorted newest first', () => {
  const groups = groupTripsForUi([
    { id: 'past-old', kind: 'trip', country: '日本', startDate: '2026-01-01', endDate: '2026-01-05' },
    { id: 'future-late', kind: 'trip', country: '韓國', startDate: '2026-12-01', endDate: '2026-12-05' },
    { id: 'past-new', kind: 'trip', country: '泰國', startDate: '2026-08-01', endDate: '2026-08-05' },
    { id: 'future-soon', kind: 'trip', country: '日本', startDate: '2026-10-01', endDate: '2026-10-05' }
  ], '2026-09-18');
  assert.deepEqual(groups.upcoming.map((trip) => trip.id), ['future-soon', 'future-late']);
  assert.deepEqual(groups.past.map((trip) => trip.id), ['past-new', 'past-old']);
});


test('account travel records opens the trip picker before management', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const entryIndex = source.indexOf("accountEntry.addEventListener('click'");
  const closeIndex = source.indexOf("document.getElementById('trip-modal-close')", entryIndex);
  assert.ok(entryIndex >= 0 && closeIndex > entryIndex);
  const slice = source.slice(entryIndex, closeIndex);
  assert.match(slice, /openModal\('picker', \{ fromSettings: true \}\)/);
  assert.doesNotMatch(slice, /openModal\('manage'\)/);
  assert.match(source, /manage\.addEventListener\('click', \(\) => \{ setView\('manage'\); renderManage\(\); \}\)/);
});

test('trip form returns to the view it came from instead of forcing management', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /formReturnView:\s*'picker'/);
  assert.match(source, /const returnView = state\.view === 'manage' \? 'manage' : 'picker'/);
  assert.match(source, /setView\(state\.formReturnView\)/);
  assert.doesNotMatch(source, /if \(state\.view === 'form'\) \{ setView\('manage'\); renderManage\(\); \}/);
});

test('trip picker cards have visible vertical spacing', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /#trip-picker-view \.trip-picker-row \{ margin-bottom: \.55rem; \}/);
});


test('trip form country options do not inject Japan when no configured or active country exists', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.doesNotMatch(source, /countries:\s*\[DEFAULT_COUNTRY\]/);
  assert.doesNotMatch(source, /normalizeCountries\(\[\.\.\.state\.countries, selectedCountry \|\| DEFAULT_COUNTRY\]\)/);
  assert.doesNotMatch(source, /window\.shoppingListActiveCountry \|\| DEFAULT_COUNTRY/);
});


test('travel records opened from settings can go back to account settings from the picker', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /openedFromSettings/);
  assert.match(source, /shopping-list:open-account-settings/);
  assert.match(source, /backButton\.classList\.toggle\('hidden',[\s\S]*openedFromSettings/);
});


test('travel records header matches personalization styling and trip rows use country flags', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /id="trip-modal-header"[^>]*bg-pastelBlue[^>]*border-b-4[^>]*px-5 py-4/);
  assert.match(source, /id="trip-modal-title" class="text-xl font-bold text-warmBrown"/);
  assert.match(source, /id="trip-modal-subtitle" class="text-\[11px\] text-warmBrown\/60 font-bold mt-1"/);
  assert.match(source, /trip-row-icon/);
  assert.match(source, /createCountryFlagElement/);
});


test('trip picker routes creation through management instead of showing a duplicate add-trip action', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const picker = source.match(/function renderPicker\(\) \{([\s\S]*?)\n  \}\n\n  function renderManage/)?.[1] || '';
  const manage = source.match(/function renderManage\(\) \{([\s\S]*?)\n  \}\n\n  function renderCountryOptions/)?.[1] || '';
  assert.doesNotMatch(picker, /＋ 新增旅程/);
  assert.match(picker, /管理旅遊紀錄/);
  assert.match(manage, /＋ 新增旅程/);
});


test('travel record rows use each trip country PNG flag instead of the plane icon', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const row = source.match(/function makeTripRow\(trip,[\s\S]*?\n  \}\n\n  function appendSection/)?.[0] || '';
  assert.match(source, /createCountryFlagElement/);
  assert.match(row, /createCountryFlagElement\(document,\s*trip\.country/);
  assert.doesNotMatch(row, /fa-plane/);
});
