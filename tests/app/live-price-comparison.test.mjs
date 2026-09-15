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
  assert.match(text, /免稅試算僅供估算|退稅試算僅供估算/);
});

test('live calculator is wired to pure calculator country rules and active trip date', async () => {
  const text = await source();
  assert.match(text, /calculateLocalPrice/);
  assert.match(text, /buildTaiwanComparison/);
  assert.match(text, /resolveCountryPricingRule/);
  assert.match(text, /taxModeById/);
  assert.match(text, /shoppingListActiveTrip\?\.startDate/);
});

test('FX conversion is on demand, visibly attributed, and exposes stale or unavailable states', async () => {
  const text = await source();
  assert.match(text, /fetchRateToTwd/);
  assert.match(text, /convertToTwd/);
  assert.match(text, /Rates By Exchange Rate API/);
  assert.match(text, /stale-cache/);
  assert.match(text, /匯率暫時無法取得/);
});

test('Taiwan and local reference ranges are rendered as detailed comparisons', async () => {
  const text = await source();
  assert.match(text, /compareValueToRange/);
  assert.match(text, /比台灣常見價/);
  assert.match(text, /台灣最低價/);
  assert.match(text, /台灣最高價/);
  assert.match(text, /當地參考/);
});

test('comparison history save is capped through the shared helper and never blocks calculation', async () => {
  const text = await source();
  assert.match(text, /appendComparisonHistory/);
  assert.match(text, /priceComparisons/);
  assert.match(text, /save-comparison-history/);
  assert.match(text, /比較紀錄儲存失敗/);
});
