import { test, expect } from '@playwright/test';

test('item workflow leaves the browser responsive when the item list is empty', async ({ page }) => {
  const firebaseMocks = {
    'firebase-app.js': 'export const getApps = () => [{}]; export const getApp = () => ({});',
    'firebase-auth.js': 'export const getAuth = () => ({}); export const onAuthStateChanged = (_auth, listener) => { listener(null); return () => {}; };',
    'firebase-firestore.js': 'export const getFirestore = () => ({}); export const collection = () => ({}); export const doc = () => ({}); export const onSnapshot = () => () => {}; export const updateDoc = async () => {};'
  };
  await page.route('**/index.html', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><div id="item-list"></div><input id="item-website"></body></html>'
  }));
  await page.route('https://www.gstatic.com/firebasejs/11.6.1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: firebaseMocks[name] || 'export {};' });
  });
  await page.goto('/index.html');
  await page.evaluate(() => { window.connectGoogleDrive = () => {}; });

  await page.evaluate(async () => {
    const { initItemWorkflowEnhancements } = await import('/src/client/app/item-workflow-enhancements.js');
    await initItemWorkflowEnhancements();
  });

  await expect(page.locator('#workflow-empty-state')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => setTimeout(() => resolve('responsive'), 0))), { timeout: 2000 }).toBe('responsive');
});
