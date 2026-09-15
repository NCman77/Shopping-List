import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveItemLocations } from '../../src/client/pricing/location-selection.js';
import { createGoogleMapsUrl } from '../../src/client/utils/url-utils.js';

const appPath = new URL('../../src/client/app/app-enhancements.js', import.meta.url);

test('home card location actions use every selected location instead of only the legacy first location', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /import \{[^}]*resolveItemLocations[^}]*\} from '\.\.\/pricing\/location-selection\.js'/s);
  assert.match(source, /for \(const location of resolveItemLocations\(item\)\)/);
  assert.match(source, /createGoogleMapsUrl\(location\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /actions\.appendChild\(locationMap\)/);
});

test('selected multi-location values preserve order and each produces its own Google Maps search URL', () => {
  const item = {
    location: '松本清',
    locations: ['松本清', '唐吉訶德', 'Bic Camera']
  };

  const locations = resolveItemLocations(item);
  assert.deepEqual(locations, ['松本清', '唐吉訶德', 'Bic Camera']);
  assert.deepEqual(
    locations.map((location) => createGoogleMapsUrl(location)),
    [
      'https://www.google.com/maps/search/?api=1&query=%E6%9D%BE%E6%9C%AC%E6%B8%85',
      'https://www.google.com/maps/search/?api=1&query=%E5%94%90%E5%90%89%E8%A8%B6%E5%BE%B7',
      'https://www.google.com/maps/search/?api=1&query=Bic%20Camera'
    ]
  );
});

test('legacy single-location items still get one map-search location', () => {
  assert.deepEqual(resolveItemLocations({ location: '藥妝' }), ['藥妝']);
});
