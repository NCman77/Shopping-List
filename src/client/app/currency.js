const CURRENCIES = Object.freeze({
  TWD: { code: 'TWD', label: '新台幣', symbol: 'NT$', digits: 0 },
  JPY: { code: 'JPY', label: '日圓', symbol: '¥', digits: 0 },
  CAD: { code: 'CAD', label: '加幣', symbol: 'CA$', digits: 2 },
  USD: { code: 'USD', label: '美元', symbol: 'US$', digits: 2 },
  EUR: { code: 'EUR', label: '歐元', symbol: '€', digits: 2 },
  GBP: { code: 'GBP', label: '英鎊', symbol: '£', digits: 2 },
  KRW: { code: 'KRW', label: '韓元', symbol: '₩', digits: 0 },
  THB: { code: 'THB', label: '泰銖', symbol: '฿', digits: 2 },
  CHF: { code: 'CHF', label: '瑞士法郎', symbol: 'CHF ', digits: 2 },
  AUD: { code: 'AUD', label: '澳幣', symbol: 'A$', digits: 2 },
  NZD: { code: 'NZD', label: '紐幣', symbol: 'NZ$', digits: 2 },
  SGD: { code: 'SGD', label: '新加坡幣', symbol: 'S$', digits: 2 },
  HKD: { code: 'HKD', label: '港幣', symbol: 'HK$', digits: 2 },
  CNY: { code: 'CNY', label: '人民幣', symbol: 'CN¥', digits: 2 }
});

const COUNTRY_CURRENCY = new Map([
  ['日本', 'JPY'], ['japan', 'JPY'],
  ['加拿大', 'CAD'], ['canada', 'CAD'],
  ['美國', 'USD'], ['美国', 'USD'], ['united states', 'USD'], ['usa', 'USD'], ['u.s.', 'USD'],
  ['英國', 'GBP'], ['英国', 'GBP'], ['united kingdom', 'GBP'], ['uk', 'GBP'],
  ['韓國', 'KRW'], ['韩国', 'KRW'], ['south korea', 'KRW'], ['korea', 'KRW'],
  ['泰國', 'THB'], ['泰国', 'THB'], ['thailand', 'THB'],
  ['瑞士', 'CHF'], ['switzerland', 'CHF'],
  ['澳洲', 'AUD'], ['澳大利亞', 'AUD'], ['australia', 'AUD'],
  ['紐西蘭', 'NZD'], ['新西兰', 'NZD'], ['new zealand', 'NZD'],
  ['新加坡', 'SGD'], ['singapore', 'SGD'],
  ['香港', 'HKD'], ['hong kong', 'HKD'],
  ['中國', 'CNY'], ['中国', 'CNY'], ['china', 'CNY'],
  ['歐洲', 'EUR'], ['欧洲', 'EUR'], ['europe', 'EUR'],
  ['法國', 'EUR'], ['法国', 'EUR'], ['france', 'EUR'],
  ['德國', 'EUR'], ['德国', 'EUR'], ['germany', 'EUR'],
  ['義大利', 'EUR'], ['意大利', 'EUR'], ['italy', 'EUR'],
  ['西班牙', 'EUR'], ['spain', 'EUR'],
  ['荷蘭', 'EUR'], ['荷兰', 'EUR'], ['netherlands', 'EUR'],
  ['比利時', 'EUR'], ['比利时', 'EUR'], ['belgium', 'EUR'],
  ['奧地利', 'EUR'], ['奥地利', 'EUR'], ['austria', 'EUR'],
  ['葡萄牙', 'EUR'], ['portugal', 'EUR'],
  ['愛爾蘭', 'EUR'], ['爱尔兰', 'EUR'], ['ireland', 'EUR'],
  ['芬蘭', 'EUR'], ['芬兰', 'EUR'], ['finland', 'EUR'],
  ['希臘', 'EUR'], ['希腊', 'EUR'], ['greece', 'EUR']
]);

function clean(value) {
  return String(value ?? '').trim();
}

export function currencyForCountry(country) {
  const value = clean(country);
  if (!value) return '';
  return COUNTRY_CURRENCY.get(value) || COUNTRY_CURRENCY.get(value.toLowerCase()) || '';
}

export function currencyMeta(code) {
  const normalized = clean(code).toUpperCase();
  return CURRENCIES[normalized] ? { ...CURRENCIES[normalized] } : null;
}

export function supportedCurrencies() {
  return Object.values(CURRENCIES).map((entry) => ({ ...entry }));
}

export function formatMoney(amount, code) {
  const meta = currencyMeta(code);
  const value = Number(amount);
  if (!meta || !Number.isFinite(value)) return '';
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: meta.digits,
    maximumFractionDigits: meta.digits
  });
  return `${meta.symbol}${formatted}`;
}

function hasFiniteMoney(value) {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  return Number.isFinite(Number(value));
}

export function tripHasLocalMoney(items = [], tripId = '') {
  const id = clean(tripId);
  if (!id) return false;
  return (Array.isArray(items) ? items : []).some((item) => (
    clean(item?.tripId) === id && (
      hasFiniteMoney(item?.priceLocalMin)
      || hasFiniteMoney(item?.priceLocalMax)
      || hasFiniteMoney(item?.onsitePriceLocal)
    )
  ));
}
