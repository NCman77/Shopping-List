import { test, expect } from '@playwright/test';

test('homepage location button shows localized display name but opens Maps with local-language query', async ({ page }) => {
  await page.route('**/index.html', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <div id="location-filters">
        <button class="loc-btn" data-loc="Matsumoto Kiyoshi マツモトキヨシ">Matsumoto Kiyoshi マツモトキヨシ</button>
      </div>
      <div id="item-list">
        <div>
          <div class="enhanced-item-actions">
            <button id="location-map-button" type="button" aria-label="在 Google 地圖搜尋Matsumoto Kiyoshi マツモトキヨシ附近分店">
              <i class="fas fa-location-dot"></i>Matsumoto Kiyoshi マツモトキヨシ
            </button>
          </div>
        </div>
      </div>
      <script>
        window.shoppingListActiveTrip = { country: '日本' };
        window.__openedMaps = [];
        window.open = (url) => { window.__openedMaps.push(String(url)); };
        document.getElementById('location-map-button').addEventListener('click', () => {
          const raw = 'Matsumoto Kiyoshi マツモトキヨシ';
          window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(raw));
        });
      </script>
    </body></html>`
  }));
  await page.goto('/index.html');

  await page.evaluate(async () => {
    const { applyBrandLocationDisplay, installBrandLocationMapButtonHandler } = await import('/src/client/app/brand-location-display.js');
    const brands = [{
      id: 'matsukiyo',
      country: '日本',
      displayName: 'Matsumoto Kiyoshi',
      aliases: [
        { language: '中文', value: '松本清' },
        { language: '日文', value: 'マツモトキヨシ' },
        { language: '英文', value: 'Matsumoto Kiyoshi' }
      ]
    }];
    installBrandLocationMapButtonHandler({ documentRef: document, windowRef: window });
    applyBrandLocationDisplay({ documentRef: document, windowRef: window, brands });
  });

  await expect(page.locator('#location-filters .loc-btn')).toHaveText('松本清');
  await expect(page.locator('#location-map-button')).toContainText('松本清');

  await page.locator('#location-map-button').click();
  const opened = await page.evaluate(() => window.__openedMaps);
  expect(opened).toHaveLength(1);
  expect(opened[0]).toContain(encodeURIComponent('マツモトキヨシ'));
  expect(opened[0]).not.toContain(encodeURIComponent('松本清'));
});
