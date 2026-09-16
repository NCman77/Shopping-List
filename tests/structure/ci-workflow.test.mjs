import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowPath = new URL('../../.github/workflows/feature-tests.yml', import.meta.url);

test('CI runs on pull requests to main and Codex maintenance pushes', async () => {
  const source = await readFile(workflowPath, 'utf8');
  assert.match(source, /pull_request:/);
  assert.match(source, /branches:\s*\n\s*-\s*main/);
  assert.match(source, /-\s*['"]codex\/\*\*['"]/);
});
