import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const compressionAdapterPath = new URL('../../src/client/app/image-compression.js', import.meta.url);
const detailLayoutPath = new URL('../../src/client/photos/photo-detail-layout.js', import.meta.url);

test('app photo compression adapter maps normal uploads to the width-bound 1280px compressor', async () => {
  const source = await readFile(compressionAdapterPath, 'utf8');

  assert.match(source, /compressImageToWidth\s+as\s+compressImage/);
  assert.match(source, /compressImageToWidth/);
});

test('view mode hides upload UI and renders photos as a full-width natural-ratio column', async () => {
  const source = await readFile(detailLayoutPath, 'utf8');

  assert.match(source, /\.workflow-view-mode #item-photo-upload-label\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-upload-status[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode #drive-connect-btn[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid\s*\{[^}]*display:\s*flex\s*!important[^}]*flex-direction:\s*column[^}]*align-items:\s*stretch/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid > div\s*\{[^}]*display:\s*block\s*!important[^}]*width:\s*100%[^}]*aspect-ratio:\s*auto\s*!important[^}]*height:\s*auto\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid img\s*\{[^}]*position:\s*static\s*!important[^}]*width:\s*100%\s*!important[^}]*height:\s*auto\s*!important[^}]*object-fit:\s*contain/s);
});

test('edit mode keeps the existing square photo-grid classes because all natural-ratio styling is scoped to workflow-view-mode', async () => {
  const source = await readFile(detailLayoutPath, 'utf8');

  assert.match(source, /\.workflow-view-mode #photo-preview-grid/);
  assert.doesNotMatch(source, /^\s*#photo-preview-grid\s*\{[^}]*display:\s*flex\s*!important/gm);
  assert.doesNotMatch(source, /classList\.remove\(['"]aspect-square['"]\)/);
  assert.doesNotMatch(source, /classList\.remove\([^\n]*object-cover/);
});
