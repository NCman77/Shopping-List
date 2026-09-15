import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currencyCodeForCountry,
  resolveCountryPricingRule,
  taxModeById
} from '../../src/client/pricing/country-rules.js';

test('known travel countries resolve to expected currencies', () => {
  assert.equal(currencyCodeForCountry('日本'), 'JPY');
  assert.equal(currencyCodeForCountry('加拿大'), 'CAD');
  assert.equal(currencyCodeForCountry('美國'), 'USD');
});

test('Japan current tax-free rule applies through 2026-10-31', () => {
  const rule = resolveCountryPricingRule('日本', '2026-10-31');
  assert.equal(rule.id, 'jp-tax-free-current');
  assert.equal(rule.currencyCode, 'JPY');
  assert.equal(taxModeById(rule, 'tax_free_10')?.taxRate, 0.10);
  assert.equal(taxModeById(rule, 'tax_free_8')?.taxRate, 0.08);
  assert.match(rule.notice, /5,000/);
});

test('Japan Refund Method wording starts exactly on 2026-11-01', () => {
  const rule = resolveCountryPricingRule('日本', '2026-11-01');
  assert.equal(rule.id, 'jp-refund-method');
  assert.match(rule.notice, /先付|出境|退款|退稅/);
  assert.ok(rule.taxModes.some((mode) => mode.id === 'refund_10'));
});

test('unsupported custom countries never inherit Japan tax modes', () => {
  const rule = resolveCountryPricingRule('火星', '2026-09-15');
  assert.equal(rule.currencyCode, '');
  assert.deepEqual(rule.taxModes, []);
  assert.equal(taxModeById(rule, 'tax_free_10'), null);
});
