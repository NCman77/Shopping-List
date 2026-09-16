import { test, expect } from '@playwright/test';

test('homepage shell and photo interface repair load without browser exceptions', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('https://www.gstatic.com/**', (route) => route.abort());
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#auth-gate')).toBeVisible();
  await expect(page.locator('#item-list')).toHaveCount(1);
  await expect(page.locator('#add-modal')).toHaveCount(1);
  await expect(page.locator('#item-photo')).toHaveCount(1);
  await page.evaluate(async () => {
    document.getElementById('photo-placeholder').classList.add('hidden');
    const { initPhotoUiFixes } = await import('/src/client/app/photo-ui-fixes.js');
    await initPhotoUiFixes();
  });
  expect(await page.locator('#photo-placeholder').evaluate((element) => element.classList.contains('hidden'))).toBe(false);
  await expect(page.locator('#photo-placeholder')).toContainText('新增照片');
  await page.evaluate(async () => {
    const preview = document.getElementById('photo-preview');
    const placeholder = document.getElementById('photo-placeholder');
    preview.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect(await page.locator('#photo-placeholder').evaluate((element) => element.classList.contains('hidden'))).toBe(true);
  await page.evaluate(async () => {
    document.getElementById('photo-preview').classList.add('hidden');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect(await page.locator('#photo-placeholder').evaluate((element) => element.classList.contains('hidden'))).toBe(false);
  expect(pageErrors).toEqual([]);
});
