import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const displaySource = fs.readFileSync(new URL('../../src/client/app/brand-location-display.js', import.meta.url), 'utf8');
const renameSource = fs.readFileSync(new URL('../../src/client/app/filter-rename-enhancements.js', import.meta.url), 'utf8');

test('brand display sync covers management and item location UI without replacing raw identity', () => {
  assert.match(displaySource, /manage-option-name/);
  assert.match(displaySource, /item-multi-location-select/);
  assert.match(displaySource, /item-multi-location-chips/);
  assert.match(displaySource, /item-detail-view/);
  assert.match(displaySource, /location-duplicate-confirm-modal/);
  assert.match(displaySource, /filter-delete-warning-modal/);
  assert.match(displaySource, /brandLocationRaw/);
});

test('brand display sync hands multilingual picker labels to the source choices that rebuild the visible select', () => {
  assert.match(displaySource, /multi-location-choice\[data-location\]/);
  assert.match(displaySource, /brandLocationPickerLabel/);
  assert.match(displaySource, /resolveLocationPickerLabel/);
});

test('filter rename reads the preserved raw management value instead of translated text', () => {
  assert.match(renameSource, /dataset\?\.manageValue|dataset\.manageValue/);
});

test('brand display module keeps map queries delegated to the existing resolver', () => {
  assert.match(displaySource, /resolveLocationMapQuery/);
  assert.match(displaySource, /const mapQuery = resolveLocationMapQuery\(raw, brands, country\) \|\| raw/);
});
