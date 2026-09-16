import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexPath = new URL('../../index.html', import.meta.url);
const appEnhancementsPath = new URL('../../src/client/app/app-enhancements.js', import.meta.url);
const itemWorkflowPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);
const homeLocationDisplayPath = new URL('../../src/client/app/home-location-display.js', import.meta.url);

async function source(path) {
  return readFile(path, 'utf8');
}

test('core home cards render every selected location and never append a country to Maps queries', async () => {
  const text = await source(indexPath);

  assert.match(text, /import \{ resolveItemLocations \} from "\.\/src\/client\/pricing\/location-selection\.js";/);
  assert.match(text, /import \{ createGoogleMapsUrl \} from "\.\/src\/client\/utils\/url-utils\.js";/);
  assert.match(text, /const itemLocations = resolveItemLocations\(item\);/);
  assert.match(text, /card\.dataset\.itemId = String\(item\.id\);/);
  assert.match(text, /for \(const itemLocation of itemLocations\)/);
  assert.match(text, /location\.href = createGoogleMapsUrl\(itemLocation\);/);
  assert.match(text, /locationLabel\.textContent = itemLocation;/);
  assert.doesNotMatch(text, /\(item\.location \|\| ''\) \+ ' 日本'/);
});

test('enhancement layers can identify modern home cards by their data item id', async () => {
  const appEnhancements = await source(appEnhancementsPath);
  const workflow = await source(itemWorkflowPath);

  assert.match(appEnhancements, /card\?\.dataset\?\.itemId/);
  assert.match(workflow, /card\?\.dataset\?\.itemId/);
});

test('home location reconciliation removes every legacy Maps location before inserting enhanced actions', async () => {
  const display = await source(homeLocationDisplayPath);

  assert.match(display, /function legacyLocationLinks\(card\)/);
  assert.match(display, /for \(const legacyLink of legacyLinks\) legacyLink\.remove\(\);/);
});
