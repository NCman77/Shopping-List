import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('brand dictionary display sync covers all user-visible location surfaces while raw identity stays separate', async () => {
  const displaySource = await read('src/client/app/brand-location-display.js');
  const renameSource = await read('src/client/app/filter-rename-enhancements.js');
  const detailSource = await read('src/client/app/item-detail-view.js');
  const duplicateSource = await read('src/client/app/location-duplicate-guard.js');

  assert.match(displaySource, /manage-option-name/);
  assert.match(displaySource, /manageIndex/);
  assert.match(displaySource, /item-multi-location-select/);
  assert.match(displaySource, /item-multi-location-chips/);
  assert.match(displaySource, /item-detail-view/);
  assert.match(displaySource, /filter-delete-warning-modal/);

  assert.match(renameSource, /dataset\?\.brandLocationRaw|dataset\.brandLocationRaw/);
  assert.match(detailSource, /dataset\.brandLocationRaw\s*=\s*location/);
  assert.match(duplicateSource, /resolveLocationDisplayName/);
});

test('Google Maps resolver still prefers the local Japanese alias', async () => {
  const { resolveLocationMapQuery } = await import('../../src/client/app/brand-location-resolver.js');
  const brand = {
    id: 'tsuruha',
    country: '日本',
    displayName: 'TSURUHA',
    aliases: [
      { language: '中文', value: '鶴羽藥妝' },
      { language: '日文', value: 'ツルハドラッグ' },
      { language: '英文', value: 'TSURUHA' }
    ]
  };

  assert.equal(resolveLocationMapQuery('ツルハドラッグ TSURUHA', [brand], '日本'), 'ツルハドラッグ');
});
