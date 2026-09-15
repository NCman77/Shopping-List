const COUNTRY_CURRENCY = new Map([
  ['日本', 'JPY'], ['Japan', 'JPY'], ['JP', 'JPY'],
  ['台灣', 'TWD'], ['臺灣', 'TWD'], ['Taiwan', 'TWD'], ['TW', 'TWD'],
  ['美國', 'USD'], ['United States', 'USD'], ['USA', 'USD'], ['US', 'USD'],
  ['加拿大', 'CAD'], ['Canada', 'CAD'], ['CA', 'CAD'],
  ['英國', 'GBP'], ['United Kingdom', 'GBP'], ['UK', 'GBP'], ['GB', 'GBP'],
  ['韓國', 'KRW'], ['南韓', 'KRW'], ['South Korea', 'KRW'], ['KR', 'KRW'],
  ['泰國', 'THB'], ['Thailand', 'THB'], ['TH', 'THB'],
  ['澳洲', 'AUD'], ['澳大利亞', 'AUD'], ['Australia', 'AUD'], ['AU', 'AUD'],
  ['新加坡', 'SGD'], ['Singapore', 'SGD'], ['SG', 'SGD'],
  ['香港', 'HKD'], ['Hong Kong', 'HKD'], ['HK', 'HKD'],
  ['法國', 'EUR'], ['德國', 'EUR'], ['義大利', 'EUR'], ['西班牙', 'EUR'], ['荷蘭', 'EUR'],
  ['France', 'EUR'], ['Germany', 'EUR'], ['Italy', 'EUR'], ['Spain', 'EUR'], ['Netherlands', 'EUR']
]);

function clean(value) {
  return String(value ?? '').trim();
}

function dateKey(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const text = clean(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text || Date.now());
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

const CURRENT_JAPAN_MODES = [
  { id: 'none', label: '不套用免稅', taxRate: null },
  { id: 'tax_free_10', label: '免稅 · 10% 標準', taxRate: 0.10 },
  { id: 'tax_free_8', label: '免稅 · 8% 輕減', taxRate: 0.08 }
];

const REFUND_JAPAN_MODES = [
  { id: 'none', label: '不估算退稅', taxRate: null },
  { id: 'refund_10', label: '退稅估算 · 10% 標準', taxRate: 0.10 },
  { id: 'refund_8', label: '退稅估算 · 8% 輕減', taxRate: 0.08 }
];

export function currencyCodeForCountry(country) {
  const name = clean(country);
  if (!name) return '';
  const direct = COUNTRY_CURRENCY.get(name);
  if (direct) return direct;
  if (/^[A-Za-z]{3}$/.test(name)) return name.toUpperCase();
  return '';
}

export function resolveCountryPricingRule(country, effectiveDate = new Date()) {
  const name = clean(country);
  const currencyCode = currencyCodeForCountry(name);
  if (currencyCode !== 'JPY' || !['日本', 'Japan', 'JP'].includes(name)) {
    return {
      id: currencyCode ? 'currency-only' : 'unsupported',
      country: name,
      currencyCode,
      taxModes: [],
      effectiveFrom: null,
      effectiveUntil: null,
      notice: ''
    };
  }

  const key = dateKey(effectiveDate);
  if (key >= '2026-11-01') {
    return {
      id: 'jp-refund-method',
      country: name,
      currencyCode: 'JPY',
      taxModes: REFUND_JAPAN_MODES.map((mode) => ({ ...mode })),
      effectiveFrom: '2026-11-01',
      effectiveUntil: null,
      notice: '2026/11/01 起採 Refund Method：先付含稅價格，出境時完成海關確認後，再依店家流程辦理退款／退稅。此處僅估算可退的稅額。'
    };
  }

  return {
    id: 'jp-tax-free-current',
    country: name,
    currencyCode: 'JPY',
    taxModes: CURRENT_JAPAN_MODES.map((mode) => ({ ...mode })),
    effectiveFrom: null,
    effectiveUntil: '2026-10-31',
    notice: '現行免稅制度通常需同一免稅店、同一天稅前合計至少 ¥5,000；消耗品另有現行規則與上限。單件價格不足 ¥5,000 不代表整筆購物一定不符合資格。'
  };
}

export function taxModeById(rule, id) {
  const target = clean(id);
  if (!target) return null;
  return (Array.isArray(rule?.taxModes) ? rule.taxModes : []).find((mode) => mode.id === target) || null;
}
