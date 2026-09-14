import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const p = (...parts) => resolve(root, ...parts);

const productionFiles = [
  'src/client/app/app-enhancements.js',
  'src/client/app/auth-session.js',
  'src/client/app/home-ui-enhancements.js',
  'src/client/filters/filter-management.js',
  'src/client/photos/drive-photo-service.js',
  'src/client/photos/drive-upload-rollback-fetch.js',
  'src/client/photos/image-compression.js',
  'src/client/photos/photo-metadata.js',
  'src/client/photos/photo-upload-transaction.js',
  'src/client/photos/photo-visibility-enhancements.js',
  'src/client/photos/photo-visibility-state.js',
  'src/client/utils/url-utils.js'
];

const legacyRootFiles = [
  'app-enhancements.js', 'auth-session.js', 'home-ui-enhancements.js',
  'filter-management.js', 'drive-photo-service.js', 'drive-upload-rollback-fetch.js',
  'image-compression.js', 'photo-metadata.js', 'photo-upload-transaction.js',
  'photo-visibility-enhancements.js', 'photo-visibility-state.js', 'url-utils.js'
];

test('production modules live under src/client by domain', () => {
  for (const file of productionFiles) assert.equal(existsSync(p(file)), true, `missing ${file}`);
  for (const file of legacyRootFiles) assert.equal(existsSync(p(file)), false, `legacy root file remains: ${file}`);
});

test('index loads the new app bootstrap entry', () => {
  const html = readFileSync(p('index.html'), 'utf8');
  assert.match(html, /src\/client\/app\/auth-session\.js/);
  assert.doesNotMatch(html, /src=["']\.\/auth-session\.js["']/);
});

test('Firestore schema stays on the existing artifacts path', () => {
  const rules = readFileSync(p('firebase/firestore.rules'), 'utf8');
  assert.match(rules, /artifacts\/\{appId\}\/users\/\{userId\}/);
  const sources = productionFiles.map((file) => readFileSync(p(file), 'utf8')).join('\n');
  assert.match(sources, /japan-shopping-app/);
  assert.doesNotMatch(rules, /match \/users\/\{userId\}/);
});

test('every relative JavaScript import resolves to an existing file', () => {
  const importPattern = /(?:from\s+|import\s*\()\s*['"](\.[^'"]+)['"]/g;
  for (const file of productionFiles) {
    const abs = p(file);
    const source = readFileSync(abs, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const target = resolve(dirname(abs), match[1]);
      assert.equal(existsSync(target), true, `${file} imports missing ${match[1]}`);
    }
  }
});
