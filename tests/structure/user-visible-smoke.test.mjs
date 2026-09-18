import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const html = read('index.html');
const app = read('src/client/app/app-enhancements.js');
const home = read('src/client/app/home-ui-enhancements.js');
const auth = read('src/client/app/auth-session.js');
const photoVisibility = read('src/client/photos/photo-visibility-enhancements.js');
const driveSignin = read('src/client/auth/google-drive-signin.js');

test('core shopping-list DOM anchors still exist after the refactor', () => {
  for (const id of ['auth-gate', 'user-panel', 'user-avatar', 'category-filters', 'location-filters', 'item-list', 'add-item-btn', 'add-modal', 'item-photo']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test('existing enhanced item features remain wired', () => {
  for (const marker of ['item-website', 'item-address', '觀看介紹', 'itemPhotos', 'connectGoogleDrive', 'configureGoogleProviderForDrive']) {
    assert.match(app, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\test('existing enhanced item features remain wired', () => {
  for (const marker of ['item-website', 'item-address', '觀看介紹', 'drive.appdata', 'itemPhotos', 'connectGoogleDrive']) {
    assert.match(app, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing app marker ${marker}`);
  }
});')), `missing app marker ${marker}`);
  }
  assert.match(driveSignin, /drive\.appdata/);
});

test('homepage management and isolated startup remain wired', () => {
  assert.match(home, /category: '分類'/);
  assert.match(home, /location: '地點'/);
  assert.match(home, /`管理\$\{LABEL_BY_KIND\[kind\]\}`/);
  assert.match(home, /仍要刪除/);
  assert.match(auth, /applyCoreHomeShell/);
  assert.match(auth, /runEnhancementsIndependently/);
});

test('Drive photo recovery remains user-visible instead of silently empty', () => {
  assert.match(photoVisibility, /照片仍在 Drive/);
  assert.match(photoVisibility, /點此顯示/);
  assert.match(photoVisibility, /photoThumbCoverId/);
});
