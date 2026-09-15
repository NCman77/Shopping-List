import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentPosition, watchPosition, clearPositionWatch } from '../../src/client/location/browser-location.js';

test('one-shot browser location resolves normalized coordinates without persistence', async () => {
  const navigatorImpl = {
    geolocation: {
      getCurrentPosition(success, _failure, options) {
        assert.equal(options.enableHighAccuracy, true);
        success({ coords: { latitude: 35.681236, longitude: 139.767125, accuracy: 12 } });
      }
    }
  };
  assert.deepEqual(await getCurrentPosition({ navigatorImpl }), {
    lat: 35.681236,
    lng: 139.767125,
    accuracy: 12
  });
});

test('one-shot browser location rejects cleanly when geolocation is unavailable or denied', async () => {
  await assert.rejects(getCurrentPosition({ navigatorImpl: {} }), /定位/);
  const navigatorImpl = {
    geolocation: {
      getCurrentPosition(_success, failure) {
        failure({ code: 1, message: 'denied' });
      }
    }
  };
  await assert.rejects(getCurrentPosition({ navigatorImpl }), /權限|定位/);
});

test('watch and clear delegate to browser geolocation and emit normalized positions', () => {
  let successCallback;
  let clearedId = null;
  const navigatorImpl = {
    geolocation: {
      watchPosition(success) {
        successCallback = success;
        return 77;
      },
      clearWatch(id) { clearedId = id; }
    }
  };
  const seen = [];
  const watchId = watchPosition({ navigatorImpl, onPosition: (position) => seen.push(position) });
  assert.equal(watchId, 77);
  successCallback({ coords: { latitude: 35.68, longitude: 139.76, accuracy: 30 } });
  assert.deepEqual(seen, [{ lat: 35.68, lng: 139.76, accuracy: 30 }]);
  clearPositionWatch(watchId, { navigatorImpl });
  assert.equal(clearedId, 77);
});
