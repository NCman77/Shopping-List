import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/client/app/app-enhancements.js', import.meta.url), 'utf8');

test('Drive connect button delegates through the global hook so detail preview backfill runs after authorization', () => {
  assert.match(
    source,
    /drive-connect-btn'\)\.addEventListener\('click',\s*\(\)\s*=>\s*window\.connectGoogleDrive\?\.\(true\)/
  );
  assert.doesNotMatch(
    source,
    /drive-connect-btn'\)\.addEventListener\('click',\s*\(\)\s*=>\s*connectGoogleDrive\(true\)/
  );
});
