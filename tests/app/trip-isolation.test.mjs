import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { itemMatchesActiveTrip } from '../../src/client/app/travel-trip.js';

const workflowPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);
const countryIsolationPath = new URL('../../src/client/app/country-isolation.js', import.meta.url);

test('same-country products from different trips remain isolated', () => {
  const active = { id: 'jp-sep', country: '日本' };
  assert.equal(itemMatchesActiveTrip({ tripId: 'jp-sep', country: '日本' }, active), true);
  assert.equal(itemMatchesActiveTrip({ tripId: 'jp-dec', country: '日本' }, active), false);
});

test('item workflow fails closed before trip context is ready and filters by active trip', async () => {
  const source = await readFile(workflowPath, 'utf8');
  assert.match(source, /itemMatchesActiveTrip/);
  assert.match(source, /shoppingListTripContextReady/);
  assert.match(source, /shoppingListActiveTrip/);
  assert.doesNotMatch(source, /resolveItemCountry\(item\)\s*!==\s*country/);
});

test('switching active trip resets workflow status filter and pagination', async () => {
  const source = await readFile(workflowPath, 'utf8');
  const eventIndex = source.indexOf("shopping-list:active-trip-changed");
  assert.ok(eventIndex >= 0);
  const slice = source.slice(eventIndex, eventIndex + 500);
  assert.match(slice, /state\.filter\s*=\s*'all'/);
  assert.match(slice, /state\.page\s*=\s*1/);
});

test('country isolation no longer owns card visibility once trips are authoritative', async () => {
  const source = await readFile(countryIsolationPath, 'utf8');
  assert.doesNotMatch(source, /country-filter-hidden/);
  assert.doesNotMatch(source, /card\.style\.display\s*=/);
  assert.match(source, /createCountryMapsSearchUrl/);
});
