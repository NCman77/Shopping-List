import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');

function sectionBetween(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('item save never opens a Google Drive auth popup implicitly', () => {
  const ensureDriveAccess = sectionBetween(
    'async function ensureDriveAccess()',
    'function activePhotosForItem'
  );

  assert.doesNotMatch(ensureDriveAccess, /connectGoogleDrive\s*\(/);
  assert.doesNotMatch(ensureDriveAccess, /reauthenticateWithPopup/);
  assert.match(ensureDriveAccess, /throw new DriveAuthorizationError/);
  assert.match(ensureDriveAccess, /drive-connect-btn/);
});

test('Drive reconnect is single-flight so repeated taps cannot overlap Firebase auth popups', () => {
  const connectGoogleDrive = sectionBetween(
    'async function connectGoogleDrive',
    'async function ensureDriveAccess()'
  );

  assert.match(source, /let driveConnectPromise\s*=\s*null/);
  assert.match(connectGoogleDrive, /if\s*\(driveConnectPromise\)\s*return driveConnectPromise/);
  assert.match(connectGoogleDrive, /driveConnectPromise\s*=/);
  assert.match(connectGoogleDrive, /finally\s*\{/);
  assert.match(connectGoogleDrive, /driveConnectPromise\s*=\s*null/);
});
