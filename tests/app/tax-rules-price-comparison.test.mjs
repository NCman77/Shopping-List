import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuleDate, rulesFor } from '../../src/client/app/tax-rules.js';
import { calculateComparison } from '../../src/client/app/price-comparison.js';

test('rule date uses today during trip, start for future trip, and end for past trip', () => {
  const trip = { startDate: '2026-09-21', endDate: '2026-09-27' };
  assert.equal(resolveRuleDate(trip, '2026-09-23'), '2026-09-23');
  assert.equal(resolveRuleDate(trip, '2026-09-15'), '2026-09-21');
  assert.equal(resolveRuleDate(trip, '2026-10-01'), '2026-09-27');
});

test('Japan before November 2026 exposes current 10% and 8% tax-free estimates', () => {
  const rules = rulesFor({ country: '日本', currencyCode: 'JPY', purchaseDate: '2026-09-23' });
  assert.equal(rules.mode, 'jp-pre-refund');
  assert.deepEqual(rules.options.map((option) => option.id), ['none', 'jp-pre-std-10', 'jp-pre-reduced-8']);
  assert.equal(rules.options[1].rate, 0.10);
  assert.equal(rules.options[2].rate, 0.08);
  assert.match(rules.notices.join(' '), /5,000/);
  assert.match(rules.notices.join(' '), /500,000/);
});

test('Japan on and after 2026-11-01 switches to refund-method wording and keeps effective tax estimates', () => {
  const rules = rulesFor({ country: '日本', currencyCode: 'JPY', purchaseDate: '2026-11-01' });
  assert.equal(rules.mode, 'jp-refund');
  assert.deepEqual(rules.options.map((option) => option.id), ['none', 'jp-refund-std-10', 'jp-refund-reduced-8']);
  assert.match(rules.notices.join(' '), /先支付含稅價/);
  assert.match(rules.notices.join(' '), /90/);
});

test('countries without a researched tourist tax rule expose no invented tax discount', () => {
  for (const [country, currencyCode] of [['加拿大', 'CAD'], ['美國', 'USD'], ['法國', 'EUR']]) {
    const rules = rulesFor({ country, currencyCode, purchaseDate: '2026-09-23' });
    assert.deepEqual(rules.options.map((option) => option.id), ['none']);
    assert.equal(rules.mode, 'none');
  }
});

test('onsite comparison applies coupon before removing included 10% tax', () => {
  const result = calculateComparison({
    onsitePriceLocal: 1480,
    couponDiscountPct: 10,
    selectedTaxRule: { id: 'jp-pre-std-10', rate: 0.10 },
    taiwanReference: { min: 399, max: 699 },
    localReference: { min: 1280, max: 1680 },
    localToTwdRate: 0.215
  });
  assert.equal(Math.round(result.discountedGrossLocal), 1332);
  assert.equal(Math.round(result.estimatedNetLocal), 1211);
  assert.equal(Math.round(result.estimatedTwd), 260);
  assert.equal(result.taiwanBaseline, 549);
  assert.equal(result.source, 'onsite');
  assert.equal(result.headline.direction, 'cheaper');
  assert.equal(result.headline.percent, 53);
});

test('8% tax removal divides by 1.08 rather than subtracting eight percent', () => {
  const result = calculateComparison({
    onsitePriceLocal: 1080,
    couponDiscountPct: 0,
    selectedTaxRule: { id: 'jp-pre-reduced-8', rate: 0.08 },
    taiwanReference: { min: 300, max: null },
    localToTwdRate: 0.215
  });
  assert.equal(result.estimatedNetLocal, 1000);
  assert.equal(result.estimatedTwd, 215);
});

test('without onsite price local-reference midpoint becomes the comparison source', () => {
  const result = calculateComparison({
    onsitePriceLocal: null,
    localReference: { min: 1000, max: 1400 },
    taiwanReference: { min: 300, max: 500 },
    localToTwdRate: 0.2
  });
  assert.equal(result.source, 'reference');
  assert.equal(result.comparedLocal, 1200);
  assert.equal(result.estimatedTwd, 240);
  assert.equal(result.taiwanBaseline, 400);
  assert.deepEqual(result.headline, { direction: 'cheaper', percent: 40, label: '比台灣常見價便宜 40%' });
});

test('Taiwan range detail reports against low and high endpoints with correct cheaper/more-expensive wording', () => {
  const result = calculateComparison({
    onsitePriceLocal: 500,
    selectedTaxRule: { id: 'none', rate: 0 },
    taiwanReference: { min: 399, max: 699 },
    localToTwdRate: 1
  });
  assert.equal(result.endpointComparisons.length, 2);
  assert.equal(result.endpointComparisons[0].direction, 'expensive');
  assert.equal(result.endpointComparisons[1].direction, 'cheaper');
});

test('missing Taiwan reference or FX suppresses savings instead of inventing a comparison', () => {
  const noTaiwan = calculateComparison({ onsitePriceLocal: 1000, localToTwdRate: 0.2, taiwanReference: { min: null, max: null } });
  assert.equal(noTaiwan.headline, null);
  const noFx = calculateComparison({ onsitePriceLocal: 1000, localToTwdRate: null, taiwanReference: { min: 399, max: null } });
  assert.equal(noFx.estimatedTwd, null);
  assert.equal(noFx.headline, null);
});

test('coupon validation rejects impossible percentages', () => {
  assert.throws(() => calculateComparison({ onsitePriceLocal: 1000, couponDiscountPct: 100 }), /優惠券折扣/);
  assert.throws(() => calculateComparison({ onsitePriceLocal: 1000, couponDiscountPct: -1 }), /優惠券折扣/);
});
