import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSourcePath = new URL('../../src/client/app/app-enhancements.js', import.meta.url);
const workflowSourcePath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);

test('new photo uploads use width-bound 1280px compression', async () => {
  const source = await readFile(appSourcePath, 'utf8');

  assert.match(source, /compressImageToWidth/);
  assert.match(source, /compressImageToWidth\(file,\s*\{\s*maxWidth:\s*1280\s*\}\)/);
});

test('view mode hides upload controls and uses a centered natural-ratio photo column', async () => {
  const source = await readFile(workflowSourcePath, 'utf8');

  assert.match(source, /\.workflow-view-mode #item-photo-upload-label\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-upload-toolbar\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid\s*\{[^}]*display:\s*flex\s*!important[^}]*flex-direction:\s*column[^}]*align-items:\s*center/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid > div\s*\{[^}]*width:\s*100%[^}]*border:\s*0\s*!important[^}]*background:\s*transparent\s*!important/s);
  assert.match(source, /\.workflow-view-mode #photo-preview-grid img\s*\{[^}]*width:\s*auto\s*!important[^}]*max-width:\s*100%[^}]*height:\s*auto\s*!important[^}]*object-fit:\s*contain/s);
});

test('photo upload toolbar has a stable id so view mode can hide it without hiding photos', async () => {
  const source = await readFile(appSourcePath, 'utf8');
  assert.match(source, /id=["']photo-upload-toolbar["']/);
});
