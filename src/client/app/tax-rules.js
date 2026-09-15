const JAPAN_REFUND_START = '2026-11-01';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value) {
  return String(value ?? '').trim();
}

function validDate(value) {
  const date = clean(value);
  if (!ISO_DATE_RE.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isJapan(country, currencyCode) {
  const normalizedCountry = clean(country).toLowerCase();
  const code = clean(currencyCode).toUpperCase();
  return code === 'JPY' && ['日本', 'japan'].includes(normalizedCountry);
}

const NONE_OPTION = Object.freeze({
  id: 'none',
  label: '不套用免稅',
  rate: 0,
  calculation: 'none'
});

export function resolveRuleDate(trip = {}, today = todayIso()) {
  const start = clean(trip?.startDate);
  const end = clean(trip?.endDate);
  const current = validDate(today) ? clean(today) : todayIso();
  if (!validDate(start) || !validDate(end)) return current;
  if (start <= current && current <= end) return current;
  if (current < start) return start;
  return end;
}

export function rulesFor({ country = '', currencyCode = '', purchaseDate = todayIso() } = {}) {
  const date = validDate(purchaseDate) ? clean(purchaseDate) : todayIso();
  if (!isJapan(country, currencyCode)) {
    return {
      mode: 'none',
      purchaseDate: date,
      options: [{ ...NONE_OPTION }],
      notices: []
    };
  }

  if (date < JAPAN_REFUND_START) {
    return {
      mode: 'jp-pre-refund',
      purchaseDate: date,
      options: [
        { ...NONE_OPTION },
        { id: 'jp-pre-std-10', label: '免稅 · 10% 標準稅率', rate: 0.10, calculation: 'remove-included-tax' },
        { id: 'jp-pre-reduced-8', label: '免稅 · 8% 輕減稅率', rate: 0.08, calculation: 'remove-included-tax' }
      ],
      notices: [
        '免稅試算僅供估算，商品與旅客仍須符合日本免稅資格。',
        '現行制度通常要求同一免稅店同日稅前合計至少 ¥5,000。',
        '2026-10-31 前的消耗品制度另有 ¥500,000 上限；實際分類與店家作業為準。',
        '請依商品實際適用稅率選擇 10% 標準稅率或 8% 輕減稅率。'
      ]
    };
  }

  return {
    mode: 'jp-refund',
    purchaseDate: date,
    options: [
      { ...NONE_OPTION },
      { id: 'jp-refund-std-10', label: '退稅估算 · 10% 標準稅率', rate: 0.10, calculation: 'remove-included-tax' },
      { id: 'jp-refund-reduced-8', label: '退稅估算 · 8% 輕減稅率', rate: 0.08, calculation: 'remove-included-tax' }
    ],
    notices: [
      '2026-11-01 起採 Refund Method：先支付含稅價；符合資格並完成出境確認後，再退還相當於消費稅的金額。',
      '商品需在購買後 90 日內出境並完成所需確認；實際退款流程與時間依免稅店／退款業者為準。',
      '新版制度的免稅購買最低門檻仍以同一店家同日稅前 ¥5,000 為基準，實際資格以官方與店家規定為準。',
      '請依商品實際適用稅率選擇 10% 標準稅率或 8% 輕減稅率。'
    ]
  };
}
