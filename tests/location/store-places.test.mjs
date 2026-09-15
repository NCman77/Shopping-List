import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchStoreSuggestions,
  resolveStoreSuggestion,
  searchStoresByText,
  resolveAddressPlace
} from '../../src/client/location/store-places.js';

test('autocomplete requests predictions with the supplied origin and returns place predictions only', async () => {
  let requestSeen;
  class AutocompleteSuggestion {
    static async fetchAutocompleteSuggestions(request) {
      requestSeen = request;
      return {
        suggestions: [
          { placePrediction: { text: { toString: () => '松本清 新宿店' }, toPlace() {} } },
          { queryPrediction: { text: 'ignore me' } }
        ]
      };
    }
  }
  const token = { id: 'session' };
  const results = await fetchStoreSuggestions({
    input: '松本清',
    origin: { lat: 35.68, lng: 139.76 },
    placesLibrary: { AutocompleteSuggestion },
    sessionToken: token
  });
  assert.equal(requestSeen.input, '松本清');
  assert.deepEqual(requestSeen.origin, { lat: 35.68, lng: 139.76 });
  assert.equal(requestSeen.sessionToken, token);
  assert.equal(results.length, 1);
  assert.equal(results[0].label, '松本清 新宿店');
});

test('selected prediction fetches only canonical store fields and normalizes the place', async () => {
  let fieldsSeen;
  const place = {
    id: 'place-1',
    displayName: '松本清 新宿店',
    formattedAddress: '東京都新宿区',
    location: { lat: 35.69, lng: 139.70 },
    businessStatus: 'OPERATIONAL',
    async fetchFields({ fields }) { fieldsSeen = fields; }
  };
  const result = await resolveStoreSuggestion({ prediction: { toPlace: () => place } });
  assert.deepEqual(fieldsSeen, ['id', 'displayName', 'formattedAddress', 'location', 'businessStatus']);
  assert.equal(result.placeId, 'place-1');
  assert.equal(result.address, '東京都新宿区');
});

test('text search requests minimal fields, biases to current position, filters closed duplicates and sorts nearest first', async () => {
  let requestSeen;
  class Place {
    static async searchByText(request) {
      requestSeen = request;
      return { places: [
        { id: 'far', displayName: '松本清 遠店', formattedAddress: 'far', location: { lat: 35.69, lng: 139.70 }, businessStatus: 'OPERATIONAL' },
        { id: 'near', displayName: '松本清 近店', formattedAddress: 'near', location: { lat: 35.6814, lng: 139.7672 }, businessStatus: 'OPERATIONAL' },
        { id: 'near', displayName: 'duplicate', formattedAddress: 'dup', location: { lat: 35.6815, lng: 139.7673 }, businessStatus: 'OPERATIONAL' },
        { id: 'closed', displayName: 'closed', formattedAddress: 'closed', location: { lat: 35.6813, lng: 139.7672 }, businessStatus: 'CLOSED_PERMANENTLY' }
      ] };
    }
  }
  const origin = { lat: 35.681236, lng: 139.767125 };
  const results = await searchStoresByText({ query: '松本清', origin, placesLibrary: { Place } });
  assert.equal(requestSeen.textQuery, '松本清');
  assert.deepEqual(requestSeen.fields, ['id', 'displayName', 'formattedAddress', 'location', 'businessStatus']);
  assert.deepEqual(requestSeen.locationBias, origin);
  assert.deepEqual(results.map((place) => place.placeId), ['near', 'far']);
});

test('legacy address resolution uses text search safely and returns the first operational match', async () => {
  let requestSeen;
  class Place {
    static async searchByText(request) {
      requestSeen = request;
      return { places: [{ id: 'resolved', displayName: 'Store', formattedAddress: 'Tokyo', location: { lat: 35.68, lng: 139.76 }, businessStatus: 'OPERATIONAL' }] };
    }
  }
  const result = await resolveAddressPlace({ address: '新宿3-1', country: '日本', placesLibrary: { Place } });
  assert.match(requestSeen.textQuery, /新宿3-1/);
  assert.match(requestSeen.textQuery, /日本/);
  assert.equal(requestSeen.maxResultCount, 1);
  assert.equal(result.placeId, 'resolved');
});
