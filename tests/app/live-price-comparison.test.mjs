import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pricingUiPath = new URL('../../src/client/app/price-comparison-enhancements.js', import.meta.url);

async function source() {
  return readFile(pricingUiPath, 'utf8');
}

test('every product card can receive a status-independent compare action', async () => {
  const text = await source();
  assert.match(text, /price-compare-action/);
  assert.match(text, />比價</);
  assert.match(text, /custom-checkbox/);
  assert.doesNotMatch(text, /resolveShoppingStatus/);
  assert.doesNotMatch(text, /shoppingStatus\s*:/);
});

test('live comparison modal contains store price coupon tax mode and estimate output surfaces', async () => {
  const text = await source();
  assert.match(text, /price-comparison-modal/);
  assert.match(text, /compare-store-price/);
  assert.match(text, /compare-coupon-percent/);
  assert.match(text, /compare-tax-mode/);
  assert.match(text, /compare-final-local/);
  assert.match(text, /compare-final-twd/);
  assert.match(text, /預估到手價/);
  assert.doesNotMatch(text, /免稅試算僅供估算/);
  assert.doesNotMatch(text, /compare-tax-notice/);
});

test('live comparison keeps store price coupon and tax mode on one row and uses requested labels', async () => {
  const text = await source();
  assert.match(text, /grid grid-cols-3[\s\S]*compare-store-price[\s\S]*compare-coupon-percent[\s\S]*compare-tax-mode/);
  assert.match(text, />免稅\/退稅\s*</);
  assert.doesNotMatch(text, /免稅／退稅方式/);
});

test('research live compare and estimate cards use full-width framed surfaces with non-green live compare background', async () => {
  const text = await source();
  assert.match(text, /id="compare-research-card"[^>]*class="[^"]*w-full/);
  assert.match(text, /id="compare-live-card"[^>]*class="[^"]*w-full[^"]*border-4[^"]*bg-pastelBlue/);
  assert.match(text, /id="compare-estimate-card"[^>]*class="[^"]*w-full/);
});

test('live calculator is wired to pure calculator country rules and active trip date', async () => {
  const text = await source();
  assert.match(text, /calculateLocalPrice/);
  assert.match(text, /buildTaiwanComparison/);
  assert.match(text, /resolveCountryPricingRule/);
  assert.match(text, /taxModeById/);
  assert.match(text, /shoppingListActiveTrip\?\.startDate/);
});

test('FX conversion stays on demand while attribution is outside the comparison modal and retained in account settings', async () => {
  const text = await source();
  const modalSource = text.match(/function ensureComparisonModal\(\)[\s\S]*?return modal;\n}/)?.[0] || '';
  assert.match(text, /fetchRateToTwd/);
  assert.match(text, /convertToTwd/);
  assert.match(text, /stale-cache/);
  assert.match(text, /匯率暫時無法取得/);
  assert.doesNotMatch(modalSource, /Rates By Exchange Rate API/);
  assert.match(text, /account-settings-root[\s\S]*Rates By Exchange Rate API/);
  assert.match(text, /function ensureRateAttribution\(\)[\s\S]*const attribution = document\.createElement\('p'\)/);
  assert.match(text, /attribution\.id = ['"]exchange-rate-attribution['"]/);
  assert.match(text, /attribution\.textContent = ['"]匯率來源：Rates By Exchange Rate API['"]/);
});

test('stale FX responses are rejected before mutating comparison state', async () => {
  const text = await source();
  const assignment = text.indexOf('state.compareFx = fx;');
  const fetch = text.indexOf('const fx = await fetchRateToTwd');
  const guard = text.indexOf('if (requestId !== state.compareRequestId || state.compareItemId !== item.id) return;');
  assert.ok(fetch >= 0 && assignment >= 0 && guard >= 0 && fetch < guard && guard < assignment, 'request identity must be checked before compareFx assignment');
});

test('Taiwan and local reference ranges are rendered as detailed comparisons', async () => {
  const text = await source();
  assert.match(text, /compareValueToRange/);
  assert.match(text, /比台灣常見價/);
  assert.match(text, /台灣最低價/);
  assert.match(text, /台灣最高價/);
  assert.match(text, /當地參考/);
});

test('comparison history provides compact save and delete controls and both use the shared helpers', async () => {
  const text = await source();
  assert.match(text, /appendComparisonHistory/);
  assert.match(text, /removeNewestComparisonHistory/);
  assert.match(text, /priceComparisons/);
  assert.match(text, /id="save-comparison-history"[^>]*>保存<\/button>/);
  assert.match(text, /id="delete-comparison-history"[^>]*>刪除<\/button>/);
  assert.match(text, /比較紀錄儲存失敗/);
  assert.match(text, /比較紀錄刪除失敗/);
});

test('a valid zero final price from a 100 percent coupon can still be saved to history', async () => {
  const text = await source();
  assert.doesNotMatch(text, /!current\?\.calculation\?\.estimatedFinalPrice/);
  assert.match(text, /current\?\.calculation\?\.estimatedFinalPrice\s*==\s*null/);
});
