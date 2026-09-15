import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlace, dedupeAndSortPlaces } from '../../src/client/location/store-place.js';

test('normalizes Places fields into the app store shape', () => {
  const place = normalizePlace({
    id: 'place-1',
    displayName: '松本清 新宿店',
    formattedAddress: '東京都新宿区1-2-3',
    location: { lat: () => 35.6901, lng: () => 139.7001 },
    businessStatus: 'OPERATIONAL'
  });

  assert.deepEqual(place, {
    placeId: 'place-1',
    displayName: '松本清 新宿店',
    address: '東京都新宿区1-2-3',
    lat: 35.6901,
    lng: 139.7001,
    businessStatus: 'OPERATIONAL'
  });
});

test('place normalization accepts plain numeric coordinates and rejects missing identity/location', () => {
  assert.deepEqual(normalizePlace({
    id: 'plain',
    displayName: { text: 'Plain Store' },
    formattedAddress: 'Tokyo',
    location: { lat: 35.68, lng: 139.76 }
  }), {
    placeId: 'plain',
    displayName: 'Plain Store',
    address: 'Tokyo',
    lat: 35.68,
    lng: 139.76,
    businessStatus: ''
  });
  assert.equal(normalizePlace({ displayName: 'Missing ID', location: { lat: 1, lng: 2 } }), null);
  assert.equal(normalizePlace({ id: 'missing-location', displayName: 'No Coordinates' }), null);
});

test('branch results remove duplicate and non-operational places then sort nearest first', () => {
  const origin = { lat: 35.681236, lng: 139.767125 };
  const places = [
    { id: 'far', displayName: 'Far', formattedAddress: 'Far address', location: { lat: 35.689592, lng: 139.700413 }, businessStatus: 'OPERATIONAL' },
    { id: 'near', displayName: 'Near', formattedAddress: 'Near address', location: { lat: 35.6815, lng: 139.7672 }, businessStatus: 'OPERATIONAL' },
    { id: 'near', displayName: 'Near duplicate', formattedAddress: 'Duplicate', location: { lat: 35.6816, lng: 139.7673 }, businessStatus: 'OPERATIONAL' },
    { id: 'closed', displayName: 'Closed', formattedAddress: 'Closed address', location: { lat: 35.6813, lng: 139.7672 }, businessStatus: 'CLOSED_PERMANENTLY' }
  ];

  const results = dedupeAndSortPlaces(places, origin);
  assert.deepEqual(results.map((place) => place.placeId), ['near', 'far']);
  assert.ok(results[0].distanceMeters < results[1].distanceMeters);
});
