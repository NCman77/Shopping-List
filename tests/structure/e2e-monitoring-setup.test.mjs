import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Playwright E2E is part of the CI workflow and has a local web server', async () => {
  const [workflow, config, spec] = await Promise.all([
    readFile(new URL('../../.github/workflows/feature-tests.yml', import.meta.url), 'utf8'),
    readFile(new URL('../../playwright.config.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../tests/e2e/homepage.spec.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(workflow, /npm run test:e2e/);
  assert.match(config, /webServer/);
  assert.match(spec, /page\.on\(['"]pageerror['"]/);
});
