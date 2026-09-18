import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const htmlPath = new URL('../../index.html', import.meta.url);
const workflowPath = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);

test('mobile app shell uses dynamic viewport height and prevents outer-page scrolling', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /100dvh/);
  assert.match(html, /overflow:\s*hidden/);
  assert.match(html, /#shopping-app-shell/);
  assert.match(html, /overscroll-behavior:\s*none/);
});

test('item list keeps only the pager-sized bottom inset instead of the old pb-20 blank area', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.doesNotMatch(html, /id="item-list"[^>]*\bpb-20\b/);
  assert.match(html, /#item-list\s*\{[^}]*padding-bottom:\s*calc\(/s);
  assert.match(html, /#item-list\s*\{[^}]*overscroll-behavior:\s*contain/s);
});

test('fixed pager uses the same bottom inset variable as the item list', async () => {
  const [html, workflow] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readFile(workflowPath, 'utf8')
  ]);
  assert.match(html, /--homepage-pager-inset:/);
  assert.match(workflow, /var\(--homepage-pager-inset\)/);
});
