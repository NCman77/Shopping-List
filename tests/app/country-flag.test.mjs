import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function flagModule() {
  try {
    return await import('../../src/client/app/country-flag.js');
  } catch (error) {
    assert.fail('country flag module is missing: ' + error.message);
  }
}

test('country flag resolver maps Chinese English and ISO country names to uploaded PNG files', async () => {
  const mod = await flagModule();
  assert.equal(mod.countryFlagPath('日本'), './assets/flags/JP_Japan.png');
  assert.equal(mod.countryFlagPath('Japan'), './assets/flags/JP_Japan.png');
  assert.equal(mod.countryFlagPath('JP'), './assets/flags/JP_Japan.png');
  assert.equal(mod.countryFlagPath('韓國'), './assets/flags/KR_South_Korea.png');
  assert.equal(mod.countryFlagPath('南韓'), './assets/flags/KR_South_Korea.png');
  assert.equal(mod.countryFlagPath('美國'), './assets/flags/US_United_States.png');
  assert.equal(mod.countryFlagPath('United States'), './assets/flags/US_United_States.png');
  assert.equal(mod.countryFlagPath('不存在國家'), '');
});

test('resolved country flag filenames exist in the uploaded manifest', async () => {
  const mod = await flagModule();
  const manifest = await readFile(new URL('../../assets/flags/manifest.csv', import.meta.url), 'utf8');
  for (const country of ['日本', '韓國', '台灣', '泰國', '美國', '加拿大', '英國', '新加坡', '澳洲']) {
    const path = mod.countryFlagPath(country);
    assert.ok(path, 'missing path for ' + country);
    assert.ok(manifest.includes(path.split('/').pop()), 'manifest missing ' + path);
  }
});

test('country flag element falls back to the earth icon only when a flag cannot be resolved or loaded', async () => {
  const mod = await flagModule();
  assert.equal(typeof mod.createCountryFlagElement, 'function');
  const source = await readFile(new URL('../../src/client/app/country-flag.js', import.meta.url), 'utf8');
  assert.match(source, /fa-earth-asia/);
  assert.match(source, /addEventListener\('error'/);
  assert.match(source, /createElement\('img'\)/);
});
