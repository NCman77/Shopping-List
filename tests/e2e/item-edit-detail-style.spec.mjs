import { test, expect } from '@playwright/test';

test('existing-item edit mode renders a real detail-style editable card without replacing controls', async ({ page }) => {
  await page.route('**/index.html', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head></head><body>
      <div id="add-modal-content" class="workflow-edit-mode">
        <div id="item-edit-form-scroll">
          <div id="item-edit-photo-field"><label for="item-photo"><input id="item-photo" type="file"></label></div>
          <div id="item-edit-photo-controls"><div id="photo-preview-grid"></div></div>
          <div id="item-edit-name-field"><label>商品名稱</label><input id="item-name" value="測試商品"></div>
          <div id="item-purchase-meta-row" class="item-edit-purchase-card">
            <div><label>分類</label><select id="item-category"><option>美妝</option></select></div>
            <div id="item-multi-location-field"><label>哪裡買</label><div id="item-multi-location-options"></div></div>
          </div>
          <div id="item-multi-location-chips-row"><div id="item-multi-location-chips"></div></div>
          <section id="price-research-section"><input class="price-edit-control" value="100"></section>
          <div id="item-edit-address-field"><label>地址</label><input id="item-address" value="東京"></div>
          <div id="item-edit-website-field"><label>網站</label><input id="item-website" value="example.com"></div>
          <div id="item-edit-notes-field"><label>我的筆記</label><textarea id="item-desc">筆記</textarea></div>
        </div>
      </div>
    </body></html>`
  }));
  await page.goto('/index.html');
  await page.evaluate(async () => {
    const { applyItemEditDetailStyle } = await import('/src/client/app/item-modal-layout.js');
    applyItemEditDetailStyle(document);
  });

  await expect(page.locator('#item-edit-detail-card')).toHaveCount(1);
  await expect(page.locator('#item-edit-detail-card #item-name')).toHaveCount(1);
  await expect(page.locator('#item-edit-detail-card #item-category')).toHaveCount(1);
  await expect(page.locator('#item-edit-detail-card #item-multi-location-field')).toHaveCount(1);
  await expect(page.locator('#item-edit-detail-card #price-research-section')).toHaveCount(1);
  await expect(page.locator('#item-edit-detail-card #item-address')).toHaveCount(1);
  await expect(page.locator('#item-edit-detail-card #item-website')).toHaveCount(1);
  await expect(page.locator('#item-edit-detail-card #item-desc')).toHaveCount(1);

  const style = await page.locator('#item-edit-detail-card').evaluate((node) => ({
    borderTopWidth: getComputedStyle(node).borderTopWidth,
    borderRadius: getComputedStyle(node).borderRadius
  }));
  expect(style.borderTopWidth).toBe('2px');
  expect(style.borderRadius).not.toBe('0px');
  expect(await page.locator('#item-name').inputValue()).toBe('測試商品');
});
