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
  expect(pageErrors).toEqual([]);
});
