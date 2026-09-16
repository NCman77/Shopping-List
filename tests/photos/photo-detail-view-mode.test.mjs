import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const compressionAdapterPath = new URL('../../src/client/app/image-compression.js', import.meta.url);
const detailLayoutPath = new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url);
const photoUiFixesPath = new URL('../../src/client/app/photo-ui-fixes.js', import.meta.url);

test('app photo compression adapter maps normal uploads to the width-bound 1280px compressor', async () => {
  const source = await readFile(compressionAdapterPath, 'utf8');

  assert.match(source, /compressImageToWidth\s+as\s+compressImage/);
  assert.match(source, /compressImageToWidth/);
});

test('view mode keeps the edit-mode desktop thumbnail width without forcing photos into square crops', async () => {
  const [source, photoUiFixes] = await Promise.all([
    readFile(detailLayoutPath, 'utf8'),
    readFile(photoUiFixesPath, 'utf8')
  ]);

  assert.match(photoUiFixes, /grid\.classList\.add\('lg:max-w-md'\)/);
  assert.match(photoUiFixes, /grid\.classList\.add\('lg:mx-auto'\)/);
  assert.match(source, /\.workflow-view-mode #item-photo-upload-label\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-upload-status[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode #drive-connect-btn[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid\s*\{[^}]*display:\s*grid\s*!important[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid > div\s*\{[^}]*display:\s*block\s*!important[^}]*width:\s*100%[^}]*height:\s*auto\s*!important/s);
  assert.doesNotMatch(source, /\.workflow-view-mode #photo-preview-grid > div\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid img\s*\{[^}]*position:\s*static\s*!important[^}]*width:\s*100%\s*!important[^}]*height:\s*auto\s*!important[^}]*object-fit:\s*contain\s*!important/s);
});

test('edit mode and homepage photo behavior are not rewritten by the view-mode override', async () => {
  const source = await readFile(detailLayoutPath, 'utf8');

  assert.match(source, /\.workflow-view-mode #photo-preview-grid/);
  assert.doesNotMatch(source, /^\s*#photo-preview-grid\s*\{[^}]*display:\s*grid\s*!important/gm);
  assert.doesNotMatch(source, /classList\.remove\(['"]aspect-square['"]\)/);
  assert.doesNotMatch(source, /classList\.remove\([^\n]*object-cover/);
  assert.doesNotMatch(source, /#item-list[^}]*aspect-ratio/);
});

test('view mode keeps the Drive reconnect/load action visible', async () => {
  const source = await readFile(detailLayoutPath, 'utf8');
  assert.match(source, /button:not\(\[data-detail-load-action\]\)/);
  assert.match(source, /button\[data-detail-load-action\][^{]*\{[^}]*display:\s*flex\s*!important/s);
});
