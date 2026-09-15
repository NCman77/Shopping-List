import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLocationPickerModel } from '../../src/client/app/location-picker-chips.js';

const pickerPath = new URL('../../src/client/app/location-picker-chips.js', import.meta.url);
const bootstrapPath = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

function fakeButton(location, { selected = false, old = false } = {}) {
  return {
    dataset: { location },
    textContent: old ? `${location}（舊）` : location,
    getAttribute(name) {
      return name === 'aria-pressed' ? (selected ? 'true' : 'false') : null;
    }
  };
}

function fakeRoot(buttons) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '.multi-location-choice[data-location]');
      return buttons;
    }
  };
}

test('where-to-buy uses a compact select plus removable selected-location chips', async () => {
  const [source, bootstrap] = await Promise.all([
    readFile(pickerPath, 'utf8'),
    readFile(bootstrapPath, 'utf8')
  ]);

  assert.match(source, /id="item-multi-location-select"/);
  assert.match(source, /id="item-multi-location-chips"/);
  assert.match(source, /multi-location-remove/);
  assert.match(source, /選擇購買地點/);
  assert.match(source, /addLocationSelection/);
  assert.match(source, /removeLocationSelection/);
  assert.match(bootstrap, /location-picker-chips\.js/);
  assert.match(bootstrap, /initLocationPickerChips/);
});

test('view mode hides picker and remove controls while keeping selected chips visible', async () => {
  const source = await readFile(pickerPath, 'utf8');

  assert.match(source, /\.workflow-view-mode #item-multi-location-select-wrapper\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(source, /\.workflow-view-mode \.multi-location-remove\s*\{[^}]*display:\s*none\s*!important/s);
  assert.doesNotMatch(source, /\.workflow-view-mode #item-multi-location-chips\s*\{[^}]*display:\s*none/s);
});

test('picker model excludes selected and legacy-only locations from dropdown choices', () => {
  const model = buildLocationPickerModel(fakeRoot([
    fakeButton('新宿'),
    fakeButton('澀谷', { selected: true }),
    fakeButton('已刪除店家', { selected: true, old: true })
  ]));

  assert.deepEqual(model.definitions, ['新宿', '澀谷']);
  assert.deepEqual(model.selected, ['澀谷', '已刪除店家']);
  assert.deepEqual(model.selectable, ['新宿']);
});

test('legacy selected locations remain visible as removable chips but are never selectable again', async () => {
  const source = await readFile(pickerPath, 'utf8');
  assert.match(source, /activeDefinitions\.has\(location\) \? location : `\$\{location\}（舊）`/);
  assert.match(source, /remove\.dataset\.location = location/);
  assert.match(source, /#item-multi-location-options \{ display: none !important; \}/);
});
