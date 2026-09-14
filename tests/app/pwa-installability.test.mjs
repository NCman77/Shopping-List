import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('manifest is standalone and safe for GitHub Pages subpath deployment', async () => {
  const manifest = JSON.parse(await text('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png' && icon.src.startsWith('./')));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png' && icon.src.startsWith('./')));
});

test('PWA registration dynamically installs manifest link and relative service worker', async () => {
  const source = await text('src/client/app/pwa-registration.js');
  assert.match(source, /manifest\.webmanifest/);
  assert.match(source, /serviceWorker\.register/);
  assert.match(source, /\.\/sw\.js/);
  assert.doesNotMatch(source, /register\(['"]\/sw\.js/);
});

test('service worker uses relative app shell and navigation fallback', async () => {
  const source = await text('sw.js');
  assert.match(source, /\.\/auth-session\.js/);
  assert.match(source, /request\.mode\s*===\s*['"]navigate['"]/);
  assert.match(source, /caches\.open/);
});

test('192 and 512 PNG app icons exist and are non-empty', async () => {
  const icon192 = await stat(new URL('icons/icon-192.png', root));
  const icon512 = await stat(new URL('icons/icon-512.png', root));
  assert.ok(icon192.size > 100);
  assert.ok(icon512.size > 100);
});

test('feature bootstrap loads PWA registration independently', async () => {
  const source = await text('src/client/app/feature-bootstrap.js');
  assert.match(source, /pwa-registration\.js/);
  assert.match(source, /registerShoppingListServiceWorker/);
});
