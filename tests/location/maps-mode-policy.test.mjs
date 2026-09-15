import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMapsPlacesEnabled } from '../../src/client/location/places-usage-policy.js';

test('Maps Places mode respects an explicit switch and otherwise defaults from the primary key', () => {
  assert.equal(resolveMapsPlacesEnabled({ mapsPlacesEnabled: false, mapsApiKeys: { primary: 'key' } }), false);
  assert.equal(resolveMapsPlacesEnabled({ mapsPlacesEnabled: true, mapsApiKeys: { primary: '' } }), true);
  assert.equal(resolveMapsPlacesEnabled({ mapsApiKeys: { primary: 'key' } }), true);
  assert.equal(resolveMapsPlacesEnabled({ mapsBrowserApiKey: 'legacy-key' }), true);
  assert.equal(resolveMapsPlacesEnabled({}), false);
});
