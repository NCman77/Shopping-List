import { test, expect } from '@playwright/test';

test('multi-location item detail shows every active brand coupon and opens exact live URL', async ({ page }) => {
  await page.route('**/index.html', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <div id="item-detail-view"></div>
      <script>
        window.shoppingListActiveTrip = { country: '日本' };
        window.__openedCoupons = [];
        window.open = (...args) => { window.__openedCoupons.push(args); };
        window.shoppingListCouponManager = {
          brands: () => ([
            { id: 'matsukiyo', country: '日本', aliases: [
              { language: '中文', value: '松本清' },
              { language: '日文', value: 'マツモトキヨシ' },
              { language: '英文', value: 'Matsumoto Kiyoshi' }
            ] },
            { id: 'tsuruha', country: '日本', aliases: [
              { language: '中文', value: '鶴羽藥妝' },
              { language: '日文', value: 'ツルハドラッグ' },
              { language: '英文', value: 'TSURUHA' }
            ] }
          ]),
          coupons: () => ([
            { brandId: 'matsukiyo', country: '日本', couponUrl: 'https://example.jp/matsukiyo?campaign=tourist#coupon', validFrom: '2026-09-01', validUntil: '2026-09-30' },
            { brandId: 'tsuruha', country: '日本', couponUrl: 'https://example.jp/tsuruha/use?lang=ja&src=app#barcode', validFrom: '2026-09-10', validUntil: '2026-10-01' }
          ]),
          todayKey: () => '2026-09-17'
        };
      </script>
    </body></html>`
  }));
  await page.goto('/index.html');

  await page.evaluate(async () => {
    const { renderItemDetailCoupons } = await import('/src/client/app/item-coupon-ui.js');
    renderItemDetailCoupons(document.getElementById('item-detail-view'), {
      country: '日本',
      locations: ['Matsumoto Kiyoshi', 'マツモトキヨシ', 'ツルハドラッグ TSURUHA']
    }, { windowRef: window });
  });

  const cards = page.locator('#item-detail-coupon-section > div > div');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('#item-detail-coupon-section')).toContainText('松本清');
  await expect(page.locator('#item-detail-coupon-section')).toContainText('鶴羽藥妝');

  await page.getByRole('button', { name: '開啟優惠券' }).nth(1).click();
  const opened = await page.evaluate(() => window.__openedCoupons);
  expect(opened).toEqual([[
    'https://example.jp/tsuruha/use?lang=ja&src=app#barcode',
    '_blank',
    'noopener,noreferrer'
  ]]);
});
