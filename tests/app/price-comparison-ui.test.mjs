import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildComparisonSnapshotPatch } from '../../src/client/app/price-comparison.js';

const uiUrl = new URL('../../src/client/app/price-comparison-ui.js', import.meta.url);
const workflowUrl = new URL('../../src/client/app/item-workflow-enhancements.js', import.meta.url);
const bootstrapUrl = new URL('../../src/client/app/feature-bootstrap.js', import.meta.url);

test('latest comparison snapshot persists only user-entered onsite fields', () => {
  const patch = buildComparisonSnapshotPatch({
    onsitePriceLocal: '1480',
    couponDiscountPct: '10',
    selectedTaxRuleId: 'jp-pre-std-10',
    now: 123456
  });
  assert.deepEqual(patch, {
    onsitePriceLocal: 1480,
    couponDiscountPct: 10,
    selectedTaxRuleId: 'jp-pre-std-10',
    comparisonUpdatedAt: 123456
  });
  assert.equal('estimatedTwd' in patch, false);
  assert.equal('estimatedNetLocal' in patch, false);
  assert.equal('savingsPct' in patch, false);
});

test('blank onsite comparison snapshot remains optional', () => {
  assert.deepEqual(buildComparisonSnapshotPatch({ onsitePriceLocal: '', couponDiscountPct: '', selectedTaxRuleId: 'none', now: 5 }), {
    onsitePriceLocal: null,
    couponDiscountPct: null,
    selectedTaxRuleId: 'none',
    comparisonUpdatedAt: 5
  });
});

test('product cards expose an independent comparison action before shopping status controls', async () => {
  const source = await readFile(workflowUrl, 'utf8');
  assert.match(source, /price-comparison-action/);
  assert.match(source, />比價</);
  assert.match(source, /ensurePriceComparisonAction/);
  assert.ok(source.indexOf('ensurePriceComparisonAction') < source.indexOf('ensureCardAction'));
});

test('comparison modal contains reference, onsite, coupon, tax, estimated-final and Taiwan comparison sections', async () => {
  const source = await readFile(uiUrl, 'utf8');
  assert.match(source, /price-comparison-modal/);
  assert.match(source, /台灣參考價/);
  assert.match(source, /price-comparison-onsite/);
  assert.match(source, /優惠券/);
  assert.match(source, /price-comparison-tax/);
  assert.match(source, /預估到手價/);
  assert.match(source, /比台灣常見價/);
  assert.match(source, /ExchangeRate-API/);
  assert.match(source, /Rates By Exchange Rate API/);
});

test('comparison UI uses cached FX and researched tax rules, and does not invent conversions when FX is unavailable', async () => {
  const source = await readFile(uiUrl, 'utf8');
  assert.match(source, /createExchangeRateService/);
  assert.match(source, /convertLocalToTwd/);
  assert.match(source, /rulesFor/);
  assert.match(source, /resolveRuleDate/);
  assert.match(source, /veryStale/);
  assert.match(source, /unavailable/);
});

test('comparison save is user and item scoped and writes only the latest snapshot fields', async () => {
  const source = await readFile(uiUrl, 'utf8');
  assert.match(source, /const savingUserId/);
  assert.match(source, /const savingItemId/);
  assert.match(source, /state\.userId !== savingUserId/);
  assert.match(source, /state\.activeItemId !== savingItemId/);
  assert.match(source, /buildComparisonSnapshotPatch/);
  assert.match(source, /updateDoc/);
  assert.doesNotMatch(source, /updateDoc\([^\n]*(estimatedTwd|estimatedNetLocal|savingsPct)/);
});

test('comparison UI is bootstrapped after the item workflow enhancement', async () => {
  const source = await readFile(bootstrapUrl, 'utf8');
  assert.match(source, /initPriceComparisonUi/);
  assert.ok(source.indexOf('initItemWorkflowEnhancements') < source.indexOf('initPriceComparisonUi'));
});
